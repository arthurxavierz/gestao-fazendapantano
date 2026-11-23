// Painel do WhatsApp no sistema (só administrador).
//
//   { action: "status" }   -> o que já está configurado
//   { action: "simular" }  -> roda o fluxo completo sem passar pela Meta:
//       modo "ensaio": nada é gravado (o estado da conversa fica no navegador)
//       modo "real":   grava no banco de verdade, como se viesse do WhatsApp
//
// É o mesmo código que atende o peão, então o que funciona aqui funciona lá.

import { authorize, databaseMode, json, rateLimited } from '../lib/shared.mjs'
import { emptyMemoryState, memoryStore, serviceClient, supabaseReady, supabaseStore } from '../lib/campo/armazem.mjs'
import { claudeReady } from '../lib/campo/assistente.mjs'
import { processPhone, storeIncoming } from '../lib/campo/fluxo.mjs'
import { configStatus, FARM_NAME } from '../lib/campo/servidor.mjs'
import { transcribeAudio } from '../lib/campo/transcrever.mjs'
import { captureTransport } from '../lib/campo/whatsapp.mjs'

const SIM_PHONE = '5500000000000'

async function requireAdmin(request) {
  const auth = await authorize(request)
  if (!auth.ok) return { response: auth.response }
  if (!databaseMode) return { user: null }
  const db = serviceClient()
  if (!db) return { response: json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada no Netlify.', code: 'not_configured' }, 503) }
  const { data } = await db.from('profiles').select('id,full_name,role').eq('id', auth.user.id).maybeSingle()
  if (data?.role !== 'administrador') return { response: json({ error: 'Apenas administradores.' }, 403) }
  return { user: data }
}

export default async (request) => {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  const auth = await requireAdmin(request)
  if (auth.response) return auth.response
  let body
  try { body = await request.json() } catch { return json({ error: 'Não foi possível ler os dados enviados.' }, 400) }

  if (body.action === 'status') return json({ ...configStatus(), demonstracao: !databaseMode })
  if (body.action !== 'simular') return json({ error: 'Ação desconhecida.' }, 400)

  if (!claudeReady) return json({ error: 'A IA ainda não foi configurada (ANTHROPIC_API_KEY).', code: 'not_configured' }, 503)
  if (rateLimited(request, 40)) return json({ error: 'Muitas simulações seguidas. Aguarde alguns minutos.' }, 429)

  const real = body.mode === 'real' && supabaseReady
  const m = body.message ?? {}
  const media = {}
  const wamid = `sim.in.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
  if (m.kind === 'audio' || m.kind === 'image') {
    const base64 = String(m.base64 ?? '')
    if (!base64 || base64.length * 0.75 > 12 * 1024 * 1024) return json({ error: 'Arquivo ausente ou grande demais.' }, 413)
    media[wamid] = { bytes: Buffer.from(base64, 'base64'), mime: m.mime || (m.kind === 'audio' ? 'audio/webm' : 'image/jpeg') }
  }

  let store
  let phone = SIM_PHONE
  if (real) {
    store = supabaseStore()
    const contact = body.contactId ? await store.getContact(body.contactId) : null
    if (!contact) return json({ error: 'Escolha um contato cadastrado para simular no modo real.' }, 400)
    phone = contact.phone
  } else {
    const state = body.state?.contacts ? body.state : emptyMemoryState(databaseMode ? await supabaseStore().loadSnapshot() : body.herd ?? {})
    if (!state.contacts.length) {
      state.contacts.push({ id: 'sim-contato', phone: SIM_PHONE, name: body.name || auth.user?.full_name || 'Teste', permission: body.permission === 'consulta' ? 'consulta' : 'lancamento', active: true, profile_id: auth.user?.id ?? null })
    } else {
      state.contacts[0].permission = body.permission === 'consulta' ? 'consulta' : 'lancamento'
      if (body.name) state.contacts[0].name = body.name
    }
    store = memoryStore(state)
  }

  const transport = captureTransport(media)
  const sentAt = m.sentAt ? new Date(m.sentAt).toISOString() : new Date().toISOString()
  const parsed = {
    messages: [{
      wamid, phone, sentAt, kind: m.kind || 'text', text: m.text ?? '', buttonId: m.buttonId, mediaId: media[wamid] ? wamid : undefined, mime: media[wamid]?.mime
    }],
    statuses: []
  }
  const started = Date.now()
  await storeIncoming(store, parsed, { simulated: true })
  await processPhone({ store, transport, transcribe: transcribeAudio, farmName: FARM_NAME, simulated: true }, phone)

  const inbound = store.kind === 'memory'
    ? store.state.messages.find((x) => x.wamid === wamid)
    : (await store.db.from('whatsapp_messages').select('*').eq('wamid', wamid).maybeSingle()).data
  return json({
    replies: transport.sent,
    inbound,
    elapsed_ms: Date.now() - started,
    mode: real ? 'real' : 'ensaio',
    // No ensaio o navegador guarda a conversa e devolve na próxima mensagem.
    state: store.kind === 'memory' ? store.state : null
  })
}
