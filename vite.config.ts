import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Marca do build (brand.config.json, sobreposto por VITE_BRAND / VITE_FARM_NAME).
 * Define título da aba, ícones e o aplicativo instalável de cada repositório.
 */
function resolveBrand(mode: string) {
  const env = loadEnv(mode, process.cwd(), '')
  const file = JSON.parse(readFileSync(new URL('./brand.config.json', import.meta.url), 'utf8')) as { brand?: string; farmName?: string }
  const brand = (env.VITE_BRAND || file.brand || 'achilles').toLowerCase()
  const farmName = env.VITE_FARM_NAME || file.farmName || 'Fazenda Pântano'
  if (brand === 'fazenda') {
    return {
      title: farmName,
      short: farmName.replace(/^Fazenda\s+/i, ''),
      description: `Gestão do rebanho da ${farmName}: animais, IATF, bezerros, manejos e IMA`,
      themeColor: '#12301f',
      background: '#f4f1e9',
      favicon: '/icons/fazenda-favicon.svg',
      icons: [
        { src: '/icons/fazenda-pwa-192.svg', sizes: '192x192', type: 'image/svg+xml' },
        { src: '/icons/fazenda-pwa-512.svg', sizes: '512x512', type: 'image/svg+xml' }
      ],
      fonts: 'family=Newsreader:opsz,wght@6..72,600;6..72,700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800'
    }
  }
  return {
    title: 'Gestão Agropecuária · Achilles',
    short: 'Agropecuária',
    description: 'Gestão agropecuária: rebanho, reprodução, sanitário e pesagens',
    themeColor: '#0a1f3a',
    background: '#f2f5f9',
    favicon: '/icons/achilles-64.png',
    icons: [
      { src: '/icons/achilles-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/achilles-512.png', sizes: '512x512', type: 'image/png' }
    ],
    fonts: 'family=Plus+Jakarta+Sans:wght@400;500;600;700;800'
  }
}

export default defineConfig(({ mode }) => {
  const b = resolveBrand(mode)
  return {
    plugins: [
      react(),
      {
        name: 'marca-no-html',
        transformIndexHtml: (html: string) => html
          .replace(/<title>.*<\/title>/, `<title>${b.title}</title>`)
          .replace(/(<meta name="theme-color" content=")[^"]*(")/, `$1${b.themeColor}$2`)
          .replace(/(<meta name="description" content=")[^"]*(")/, `$1${b.description}$2`)
          .replace(/(<link rel="icon" href=")[^"]*(")/, `$1${b.favicon}$2`)
          .replace(/family=[^"]*&display=swap/, `${b.fonts}&display=swap`)
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/*', 'brand/*'],
        manifest: {
          name: b.title,
          short_name: b.short,
          description: b.description,
          theme_color: b.themeColor,
          background_color: b.background,
          display: 'standalone',
          start_url: '/',
          icons: b.icons
        },
        workbox: {
          navigateFallback: '/index.html',
          // As chamadas às funções de servidor nunca podem cair no app em cache.
          navigateFallbackDenylist: [/^\/api\//, /^\/\.netlify\//],
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          // Fotos do rebanho: guardadas no aparelho depois da primeira vez, para a
          // lista abrir rápido no curral, mesmo com sinal fraco.
          runtimeCaching: [{
            urlPattern: ({ url }) => url.pathname.startsWith('/rebanho/') || url.pathname.includes('/storage/v1/object/public/animal-photos/'),
            handler: 'CacheFirst',
            options: { cacheName: 'fotos-rebanho', expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 90 } }
          }]
        }
      })
    ]
  }
})
