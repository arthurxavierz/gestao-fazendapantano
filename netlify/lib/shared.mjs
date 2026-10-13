// Utilidades comuns às funções do Netlify.
//
// As funções rodam no servidor do Netlify, então as chaves (Gemini e, quando o
// banco estiver ligado, a service_role do Supabase) nunca chegam ao navegador.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
// Modelos do Gemini saem de circulação com frequência. Troque pela variável
// GEMINI_MODEL no Netlify, sem mexer no código.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash'

/** Com o Supabase configurado, só usuários autenticados podem usar as funções. */
export const databaseMode = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  })
}

/**
 * Com banco ligado: confere o token da sessão direto no Supabase.
 * Em modo demonstração não há login real, então a função fica aberta, mas com
 * limite de uso por endereço (abaixo) para ninguém esgotar a cota do Gemini.
 */
export async function authorize(request) {
  if (!databaseMode) return { ok: true, user: null }
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, response: json({ error: 'Entre no sistema para usar a leitura por IA.' }, 401) }
  try {
    const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY }
    })
    if (!response.ok) return { ok: false, response: json({ error: 'Sessão inválida ou expirada. Entre novamente.' }, 401) }
    return { ok: true, user: await response.json() }
  } catch {
    return { ok: false, response: json({ error: 'Não foi possível validar a sessão agora.' }, 500) }
  }
}

// Limite simples por endereço. Cada instância da função guarda o próprio
// contador; não é infalível, mas segura abuso casual na demonstração aberta.
const hits = new Map()
export function rateLimited(request, max = 20, windowMs = 10 * 60 * 1000) {
  if (databaseMode) return false
  const ip = request.headers.get('x-nf-client-connection-ip') || request.headers.get('x-forwarded-for') || 'anon'
  const now = Date.now()
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs)
  list.push(now)
  hits.set(ip, list)
  return list.length > max
}

/**
 * Envia imagem e instruções ao Gemini e devolve o JSON estruturado.
 * Erros viram mensagens em português para a tela.
 */
export async function askGemini({ imageBase64, mimeType, prompt, schema }) {
  // Modelo sobrecarregado (503/429/500) costuma passar em segundos: tenta de
  // novo e, se houver GEMINI_FALLBACK_MODEL, usa ele na última tentativa.
  const models = [GEMINI_MODEL, GEMINI_MODEL, process.env.GEMINI_FALLBACK_MODEL || GEMINI_MODEL]
  let response
  for (let attempt = 0; attempt < models.length; attempt += 1) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${models[attempt]}:generateContent`
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema }
        })
      })
    } catch {
      return { error: json({ error: 'Não foi possível falar com o serviço de análise. Verifique a internet.' }, 500) }
    }
    if (![429, 500, 503].includes(response.status) || attempt === models.length - 1) break
    await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)))
  }

  if (response.status === 429 || response.status === 503) {
    return { error: json({ error: 'O serviço de IA está sobrecarregado agora. Tente de novo em alguns instantes.' }, 429) }
  }
  if (!response.ok) {
    const raw = await response.text()
    console.error('Erro do Gemini:', response.status, raw)
    let reason = ''
    try { reason = String(JSON.parse(raw)?.error?.message ?? '') } catch { reason = '' }
    return { error: json({ error: 'O serviço de análise recusou a solicitação.', detail: reason.slice(0, 300) || `HTTP ${response.status}` }, 500) }
  }

  const payload = await response.json()
  if (payload?.promptFeedback?.blockReason) {
    return { error: json({ error: 'A imagem foi bloqueada pelo filtro de conteúdo do serviço.' }, 422) }
  }
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) return { error: json({ error: 'O serviço não devolveu uma leitura para esta imagem.' }, 500) }
  try {
    return { data: JSON.parse(text) }
  } catch {
    console.error('Resposta não era JSON válido:', text)
    return { error: json({ error: 'A resposta do serviço veio em formato inesperado.' }, 500) }
  }
}

/** Lê e valida o corpo com a imagem. */
export async function readImageBody(request, maxBytes) {
  let body
  try { body = await request.json() } catch { return { error: json({ error: 'Não foi possível ler os dados enviados.' }, 400) } }
  const imageBase64 = String(body?.imageBase64 ?? '')
  if (!imageBase64) return { error: json({ error: 'Nenhuma imagem foi enviada.' }, 400) }
  if (imageBase64.length * 0.75 > maxBytes) return { error: json({ error: 'A imagem é grande demais. Reduza a foto e tente novamente.' }, 413) }
  return { body, imageBase64, mimeType: String(body?.mimeType ?? 'image/jpeg') }
}

/** Resposta padronizada para "IA não configurada": o app cai na leitura simulada da demonstração. */
export const notConfigured = () => json({ error: 'A leitura por IA ainda não foi configurada neste site.', code: 'not_configured' }, 503)
