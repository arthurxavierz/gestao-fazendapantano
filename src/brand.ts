import config from '../brand.config.json'

/**
 * Identidade exibida no sistema.
 *
 * Cada repositório tem o seu brand.config.json na raiz:
 *   - produto Achilles:  { "brand": "achilles" }
 *   - fazenda cliente:   { "brand": "fazenda", "farmName": "Fazenda Pântano" }
 * As variáveis VITE_BRAND e VITE_FARM_NAME, quando definidas no Netlify,
 * sobrepõem o arquivo. A marca não depende de haver banco: a Fazenda Pântano
 * aparece com a própria identidade mesmo em modo demonstração.
 */
export interface BrandConfig {
  /** Nome curto na barra lateral, no título da aba e nos documentos. */
  name: string
  /** Linha de apoio abaixo do nome. */
  tagline: string
  /** Título do painel inicial. */
  heroTitle: string
  /** Título da tela de entrada. */
  loginTitle: string
  /** Cabeçalho dos PDFs e documentos Word. */
  documentHeader: string
  /** Título da aba do navegador. */
  pageTitle: string
  /** Marca da Achilles (imagens em /brand); falso para a identidade da fazenda. */
  achilles: boolean
  /** Tema visual aplicado no <html data-theme>. */
  theme: 'achilles' | 'fazenda'
}

const file = config as { brand?: string; farmName?: string }
const mode = ((import.meta.env.VITE_BRAND as string | undefined) || file.brand || 'achilles').toLowerCase()
const farmName = (import.meta.env.VITE_FARM_NAME as string | undefined)?.trim() || file.farmName || 'Fazenda Pântano'

export const brand: BrandConfig = mode === 'fazenda'
  ? {
      name: farmName,
      tagline: 'Gestão agropecuária',
      heroTitle: `${farmName} em números`,
      loginTitle: `Entrar na ${farmName}`,
      documentHeader: farmName,
      pageTitle: farmName,
      achilles: false,
      theme: 'fazenda'
    }
  : {
      name: 'Achilles',
      tagline: 'Gestão Agropecuária',
      heroTitle: 'Seu rebanho em números',
      loginTitle: 'Entrar na Gestão Agropecuária',
      documentHeader: 'Achilles · Gestão Agropecuária',
      pageTitle: 'Gestão Agropecuária · Achilles',
      achilles: true,
      theme: 'achilles'
    }
