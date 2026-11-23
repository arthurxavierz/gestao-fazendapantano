// Manutenção do canal do WhatsApp: confere o número e liga a conta do
// WhatsApp (WABA) ao app, para a Meta passar a entregar as mensagens no webhook.
//
// Protegida pela mesma senha do webhook (WHATSAPP_VERIFY_TOKEN), enviada no
// cabeçalho x-campo-senha. Usa o token que está no Netlify; nada sai daqui.
//
//   GET  ?waba=ID   -> dados do número e apps inscritos na WABA
//   POST ?waba=ID   -> inscreve o app na WABA (subscribed_apps)

import { json } from '../lib/shared.mjs'

const VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'
const TOKEN = process.env.WHATSAPP_TOKEN || ''
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || ''
const SENHA = process.env.WHATSAPP_VERIFY_TOKEN || ''

async function graph(path, method = 'GET') {
  const response = await fetch(`https://graph.facebook.com/${VERSION}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(15000)
  })
  const data = await response.json().catch(() => ({}))
  return { status: response.status, data }
}

export default async (request) => {
  if (!SENHA || request.headers.get('x-campo-senha') !== SENHA) return json({ error: 'Proibido.' }, 403)
  if (!TOKEN) return json({ error: 'WHATSAPP_TOKEN não configurado.' }, 503)
  const params = new URL(request.url).searchParams
  if (params.get('token') === '1') {
    // Quais WABAs e permissões o token enxerga (granular_scopes.target_ids).
    const info = await graph(`debug_token?input_token=${encodeURIComponent(TOKEN)}`)
    const d = info.data?.data || {}
    return json({ status: info.status, app_id: d.app_id, tipo: d.type, valido: d.is_valid, expira: d.expires_at, escopos: d.granular_scopes, erro: info.data?.error })
  }
  const waba = params.get('waba') || ''
  if (!/^\d{5,20}$/.test(waba)) return json({ error: 'Informe ?waba=ID numérico.' }, 400)

  if (request.method === 'POST') {
    const subscribe = await graph(`${waba}/subscribed_apps`, 'POST')
    const list = await graph(`${waba}/subscribed_apps`)
    return json({ inscricao: subscribe, apps_inscritos: list })
  }
  const [numero, apps] = await Promise.all([
    graph(`${PHONE_ID}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput`),
    graph(`${waba}/subscribed_apps`)
  ])
  return json({ numero, apps_inscritos: apps })
}
