// Fluxo de cada mensagem recebida no WhatsApp.
//
//   1. Guarda a mensagem (antes de qualquer coisa: nada se perde)
//   2. Marca como lida e mostra "digitando..."
//   3. Áudio: baixa, guarda o original e transcreve
//   4. Atalhos sem IA: botões, "sim"/"não", números no modo lote, "fechar"
//   5. O resto vai para o assistente (Claude), que consulta ou propõe lançamentos
//   6. Responde, registrando cada envio e o status de entrega
//
// Falhou no meio (sem internet no servidor da IA, Meta fora do ar)? A mensagem
// fica com status "erro", o peão é avisado que ela está guardada e a rotina
// agendada tenta de novo sozinha.

import { applyAction, undoAction } from './aplicar.mjs'
import { runAssistant as defaultAssistant } from './assistente.mjs'
import { KIND_LABEL, confirmationText, numbersText, prepare } from './lancamentos.mjs'
import { findAnimal, normNumber, resolveNumbers, suggestNumbers } from './rebanho.mjs'
import { addDaysISO, br, brDateTime, humanDelay, isoDate, weekday } from './tempo.mjs'

const DELAY_NOTICE_MS = 20 * 60 * 1000
const MAX_ATTEMPTS = 4

const YES = /^(sim|s|ok|okay|pode|pode sim|pode gravar|grava|confirm[ao]|confirmar|confirmad[oa]|isso|isso mesmo|certo|correto|t[aá] certo|beleza|blz|positivo|manda|👍|✅)[\s.!]*$/iu
const NO = /^(n[aã]o|n|cancela|cancelar|cancelad[oa]|errado|t[aá] errado|apaga|esquece|deixa|❌|👎)[\s.!]*$/iu
const CODE_CMD = /^(sim|ok|confirm[ao]|confirmar|cancela|cancelar|n[aã]o)\s+([A-Za-z0-9]{4})[\s.!]*$/iu
const ALL_CMD = /^(confirm[ao]|sim|ok|cancela|cancelar)\s+tud[oa]s?[\s.!]*$/iu
const CLOSE = /^(fecha(r)?( o)?( lote)?|encerra(r)?( o)?( lote)?|acabou|terminou|terminamos|pronto,? acabou|finaliza(r)?)[\s.!]*$/iu

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------

function now(deps) {
  return deps.now ? new Date(deps.now()) : new Date()
}

function messageContext(deps, row, contact) {
  const sent = new Date(row.sent_at ?? row.received_at)
  const received = new Date(row.received_at ?? now(deps))
  const delay = received - sent
  const today = isoDate(now(deps))
  return {
    contact,
    today,
    todayWeekday: weekday(today),
    eventDate: isoDate(sent),
    sentAtText: brDateTime(sent),
    delayMs: delay,
    delayText: delay > DELAY_NOTICE_MS ? humanDelay(delay) : null
  }
}

async function send(deps, row, payload) {
  const { store, transport } = deps
  const to = row.phone
  let result
  if (payload.type === 'buttons') result = await transport.sendButtons(to, payload.text, payload.buttons, { replyTo: row.wamid })
  else result = await transport.sendText(to, payload.text, { replyTo: payload.quote ? row.wamid : undefined })
  if (!result.ok && result.outsideWindow) result = await transport.sendTemplate(to, payload.text)
  await store.insertMessage({
    wamid: result.wamid ?? null,
    direction: 'out',
    phone: to,
    contact_id: row.contact_id ?? null,
    kind: payload.type === 'buttons' ? 'interactive' : 'text',
    body: payload.type === 'buttons' ? `${payload.text}\n[${payload.buttons.map((b) => b.title).join('] [')}]` : payload.text,
    sent_at: now(deps).toISOString(),
    status: deps.simulated ? 'simulado' : result.ok ? 'enviado' : 'falhou',
    error: result.ok ? null : result.error,
    reply_to: row.id ?? null,
    action_id: payload.actionId ?? null,
    simulated: Boolean(deps.simulated)
  })
  return result
}

const reply = (deps, row, text, extra = {}) => send(deps, row, { type: 'text', text, ...extra })

function cardButtons(action) {
  return [
    { id: `ok:${action.id}`, title: '✅ Confirmar' },
    { id: `no:${action.id}`, title: '❌ Cancelar' }
  ]
}

async function sendCard(deps, row, action, prefix = '') {
  return send(deps, row, { type: 'buttons', text: `${prefix}${confirmationText({ summary: action.summary, warnings: action.warnings }, action.code)}`, buttons: cardButtons(action), actionId: action.id })
}

function firstLine(summary) {
  return summary.split('\n')[0].replace(/\*/g, '')
}

// ------------------------------------------------------------------
// Confirmar, cancelar, desfazer
// ------------------------------------------------------------------

async function confirmAction(deps, row, contact, actionId) {
  const { store } = deps
  const current = await store.getAction(actionId)
  if (!current) return reply(deps, row, 'Não achei esse lançamento.')
  if (current.contact_id && contact.id && current.contact_id !== contact.id) return reply(deps, row, `O lançamento ${current.code} é de outra pessoa da equipe.`)

  const action = await store.claimAction(actionId, 'pendente', { status: 'confirmada', confirmed_at: now(deps).toISOString(), confirmed_by_message: row.id ?? null })
  if (!action) {
    // Duplo toque ou botão antigo: responde sem gravar de novo.
    const word = { aplicada: 'já estava gravado ✅', confirmada: 'já está sendo gravado', cancelada: 'foi cancelado', expirada: 'expirou e não foi gravado. Mande de novo se ainda vale', desfeita: 'foi desfeito', erro: 'deu erro ao gravar. Mande de novo' }[current.status] ?? current.status
    return reply(deps, row, `O lançamento ${current.code} ${word}.`)
  }

  if (action.kind === 'desfazer') {
    const target = await store.getAction(action.payload.target_id)
    if (!target || target.status !== 'aplicada') {
      await store.updateAction(action.id, { status: 'erro', error: 'alvo não está mais gravado' })
      return reply(deps, row, `O lançamento ${action.payload.target_code} não está mais gravado.`)
    }
    await undoAction(store, target)
    await store.updateAction(target.id, { status: 'desfeita', undone_at: now(deps).toISOString() })
    await store.updateAction(action.id, { status: 'aplicada', applied_at: now(deps).toISOString() })
    return reply(deps, row, `↩️ Desfeito. O lançamento ${target.code} (${firstLine(target.summary)}) foi apagado do sistema.`)
  }

  // Confere de novo contra o rebanho de agora: alguém pode ter mudado algo.
  const snapshot = await store.loadSnapshot()
  const fresh = prepare(action.kind, snapshot, action.payload.input, { ...action.payload.ctx, today: isoDate(now(deps)) })
  if (!fresh.ok) {
    await store.updateAction(action.id, { status: 'erro', error: fresh.problems.join(' ') })
    return reply(deps, row, `⚠ Não gravei o ${action.code}. O rebanho mudou desde o resumo:\n${fresh.problems.join('\n')}`)
  }
  let refs
  try {
    refs = await applyAction(store, { ...action, payload: { ...action.payload, prepared: fresh.payload } }, snapshot, contact)
  } catch (error) {
    console.error('Falha ao gravar', action.code, error)
    // Desfaz o que chegou a gravar, para não ficar pela metade.
    if (error.refs?.length) await undoAction(store, { result_refs: error.refs }).catch((e) => console.error('Falha ao desfazer parcial', e))
    await store.updateAction(action.id, { status: 'erro', error: String(error.message ?? error).slice(0, 500) })
    return reply(deps, row, `⚠ Não consegui gravar o ${action.code} agora (${String(error.message ?? 'erro').slice(0, 80)}). Nada ficou pela metade. Tente confirmar de novo em instantes ou avise o escritório.`)
  }
  await store.updateAction(action.id, { status: 'aplicada', applied_at: now(deps).toISOString(), result_refs: refs })
  const changed = fresh.animalCount !== action.payload.animalCount ? ` (agora ${fresh.animalCount} animais)` : ''
  return reply(deps, row, `✅ *Gravado* · ${firstLine(action.summary)}${changed}\nCódigo ${action.code}. Para desfazer, mande "desfazer ${action.code}".${nextHint(action.kind, fresh.payload)}`)
}

function nextHint(kind, p) {
  if (kind === 'protocolo_inicio') {
    const next = p.protocol.steps.find((s) => s.day > 0)
    return next ? `\n📅 Próxima etapa: ${next.title}, D${next.day} em ${br(addDaysISO(p.start_date, next.day))}.` : ''
  }
  if (kind === 'diagnostico' && p.discard?.length) return `\n🔴 Separe para descarte: ${numbersText(p.discard.map((d) => d.number))}.`
  if (kind === 'sanitario' && p.next_due_date) return `\n📅 Reforço marcado para ${br(p.next_due_date)}.`
  return ''
}

async function cancelAction(deps, row, contact, actionId, { silent = false } = {}) {
  const { store } = deps
  const current = await store.getAction(actionId)
  if (!current) return silent ? { ok: false } : reply(deps, row, 'Não achei esse lançamento.')
  if (current.contact_id && contact.id && current.contact_id !== contact.id) return silent ? { ok: false } : reply(deps, row, `O ${current.code} é de outra pessoa da equipe.`)
  const done = await store.claimAction(actionId, 'pendente', { status: 'cancelada' })
  if (silent) return { ok: Boolean(done), code: current.code, status: current.status }
  if (!done) return reply(deps, row, `O ${current.code} não estava mais pendente (${current.status}).`)
  if (current.session_id) await store.updateSession(current.session_id, { status: 'cancelada' })
  return reply(deps, row, `❌ Cancelado. O ${current.code} não foi gravado.`)
}

async function pendingOf(deps, contact) {
  const since = new Date(now(deps) - 24 * 3600 * 1000).toISOString()
  return deps.store.listActions({ contactId: contact.id, status: 'pendente', since, limit: 10 })
}

/** Respostas curtas de confirmação, sem passar pela IA. */
async function quickConfirm(deps, row, contact, text) {
  const t = text.trim()
  const code = t.match(CODE_CMD)
  if (code) {
    const action = await deps.store.getActionByCode(code[2])
    if (!action) return false
    const yes = !/^(cancela|cancelar|n[aã]o)/i.test(code[1])
    await (yes ? confirmAction(deps, row, contact, action.id) : cancelAction(deps, row, contact, action.id))
    return true
  }
  const all = t.match(ALL_CMD)
  const yes = YES.test(t)
  const no = NO.test(t)
  if (!all && !yes && !no) return false
  const pending = await pendingOf(deps, contact)
  if (!pending.length) return false
  if (all) {
    const confirm = !/^cancela/i.test(all[1])
    for (const a of pending.reverse()) await (confirm ? confirmAction(deps, row, contact, a.id) : cancelAction(deps, row, contact, a.id))
    return true
  }
  if (pending.length > 1) {
    await reply(deps, row, `Tem ${pending.length} lançamentos esperando: ${pending.map((a) => `${a.code} (${firstLine(a.summary)})`).join(', ')}.\nToque no botão do cartão certo, ou mande "sim ${pending[0].code}" ou "confirma tudo".`)
    return true
  }
  await (yes ? confirmAction(deps, row, contact, pending[0].id) : cancelAction(deps, row, contact, pending[0].id))
  return true
}

// ------------------------------------------------------------------
// Modo lote
// ------------------------------------------------------------------

const SESSION_LABEL = {
  sanitario: 'Sanitário', protocolo_inicio: 'Início de protocolo', protocolo_etapa: 'Etapa de protocolo',
  pesagem: 'Pesagem', diagnostico: 'Diagnóstico', contagem: 'Contagem'
}
const FILLER = new Set(['e', 'a', 'o', 'as', 'os', 'vaca', 'vacas', 'boi', 'bois', 'novilha', 'novilhas', 'bezerro', 'bezerra', 'garrote', 'brinco', 'brincos', 'numero', 'número', 'n', 'no', 'nº', 'mais', 'tambem', 'também', 'passou', 'passaram', 'agora', 'kg', 'kilos', 'quilos', 'quilo', 'com', 'pesou', 'pesando', 'de'])
const DIAG = { p: 'prenhe', prenhe: 'prenhe', prenha: 'prenhe', cheia: 'prenhe', positivo: 'prenhe', positiva: 'prenhe', v: 'vazia', vazia: 'vazia', vazio: 'vazia', negativo: 'vazia', negativa: 'vazia', falhada: 'vazia' }

/**
 * Lê mensagens do curral sem IA: "401 402 403", "401 380, 402 395", "401 P 402 V".
 * Devolve null quando a mensagem tem outras palavras (aí vai para a IA).
 */
export function parseBatchText(kind, text) {
  const tokens = String(text ?? '').toLowerCase().replace(/(\d),(\d)/g, '$1.$2').split(/[\s,;:/\n+]+|\.(?!\d)/).map((t) => t.trim()).filter(Boolean)
  if (!tokens.length) return null
  const items = []
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i].replace(/[!?]+$/, '')
    if (!tok || FILLER.has(tok)) continue
    const isNumber = /^[a-z]{0,2}\d[\d-]*$/i.test(tok)
    if (kind === 'diagnostico' && DIAG[tok] && items.length && !items[items.length - 1].resultado) {
      items[items.length - 1].resultado = DIAG[tok]
      continue
    }
    if (kind === 'pesagem' && /^\d+(\.\d+)?(kg)?$/.test(tok) && items.length && items[items.length - 1].peso == null) {
      items[items.length - 1].peso = Number(tok.replace('kg', ''))
      continue
    }
    if (!isNumber) return null
    items.push({ numero: tok.toUpperCase() })
  }
  if (!items.length) return null
  if (kind === 'pesagem' && items.some((i) => i.peso == null)) return null
  if (kind === 'diagnostico' && items.some((i) => !i.resultado)) return null
  return items
}

function sessionDescription(session) {
  const p = session.params ?? {}
  const detail = [p.produto, p.protocolo, p.etapa && p.etapa !== 'proxima' ? p.etapa : null, p.lote ? `lote ${p.lote}` : null].filter(Boolean).join(' · ')
  return `${SESSION_LABEL[session.kind]}${detail ? ` · ${detail}` : ''}`
}

function sessionInput(session) {
  const p = session.params ?? {}
  const nums = session.entries.map((e) => e.number)
  switch (session.kind) {
    case 'sanitario': return { numeros: nums, produto: p.produto, tipo: p.tipo_sanitario, dose: p.dose, data: p.data }
    case 'protocolo_inicio': return { numeros: nums, protocolo: p.protocolo, touro: p.touro, data: p.data }
    case 'protocolo_etapa': return { numeros: nums, etapa: p.etapa || 'proxima', touro: p.touro, data: p.data }
    case 'pesagem': return { itens: session.entries.map((e) => ({ numero: e.number, peso: e.value })), data: p.data }
    case 'diagnostico': return { itens: session.entries.map((e) => ({ numero: e.number, resultado: e.value })), data: p.data }
    case 'contagem': return { numeros: nums, lote: p.lote, titulo: p.titulo }
    default: return {}
  }
}

/** Soma itens ao lote aberto e devolve o recibo curto ("✓ 401, 402 · 14 no lote"). */
async function appendToSession(deps, row, session, items, snapshot) {
  const known = new Map(session.entries.map((e) => [e.number, e]))
  const fresh = []
  const missing = []
  const repeated = []
  const notes = []
  for (const item of items) {
    const animal = findAnimal(snapshot, item.numero)
    if (!animal && session.kind !== 'contagem') {
      const sug = suggestNumbers(snapshot, item.numero)
      missing.push(`${normNumber(item.numero)}${sug.length ? ` (seria ${sug.join(' ou ')}?)` : ''}`)
      continue
    }
    const number = animal?.number ?? normNumber(item.numero)
    if (known.has(number) || fresh.some((f) => f.number === number)) {
      // Na pesagem, repetir o brinco com outro peso corrige o peso.
      if (session.kind === 'pesagem' || session.kind === 'diagnostico') {
        fresh.push({ number, value: item.peso ?? item.resultado ?? null, message_id: row.id ?? null, at: now(deps).toISOString(), fix: true })
        notes.push(`${number} corrigido para ${item.peso ?? item.resultado}`)
      } else repeated.push(number)
      continue
    }
    fresh.push({ number, value: item.peso ?? item.resultado ?? null, message_id: row.id ?? null, at: now(deps).toISOString() })
  }
  // Avisos por animal na hora (macho no protocolo, vaca já protocolada...), sem esperar o fechamento.
  if (fresh.length && session.kind !== 'contagem') {
    const test = prepare(session.kind, snapshot, { ...sessionInput({ ...session, entries: fresh.filter((f) => !f.fix) }) }, { eventDate: session.params?.data ?? undefined, allowMissing: true })
    for (const w of test.warnings ?? []) if (!/^(Carência padrão|Próxima dose marcada|Data antiga)/.test(w)) notes.push(w)
    for (const p of test.problems ?? []) if (!/Nenhum/.test(p)) notes.push(p)
  }
  let updated = session
  if (fresh.length) {
    const fixes = fresh.filter((f) => f.fix)
    if (fixes.length) {
      const entries = session.entries.map((e) => fixes.find((f) => f.number === e.number) ?? e).map(({ fix, ...e }) => e)
      updated = await deps.store.updateSession(session.id, { entries })
    }
    const adds = fresh.filter((f) => !f.fix)
    if (adds.length) updated = (await deps.store.appendSessionEntries(session.id, adds)) ?? updated
  }
  const lines = []
  const added = fresh.filter((f) => !f.fix)
  if (added.length) lines.push(`✓ ${added.map((f) => (f.value != null ? `${f.number} ${session.kind === 'pesagem' ? `${f.value} kg` : f.value}` : f.number)).join(', ')}`)
  if (missing.length) lines.push(`⚠ Não existe no rebanho, não entrou: ${missing.join(', ')}`)
  if (repeated.length) lines.push(`↺ Já tinha passado: ${repeated.join(', ')}`)
  for (const n of notes) lines.push(`⚠ ${n}`)
  lines.push(`_${updated.entries.length} no lote · "fechar" para revisar e gravar_`)
  return { text: lines.join('\n'), session: updated, added: added.length, missing: missing.length }
}

async function closeSession(deps, row, contact, session, queue) {
  if (!session.entries.length) {
    await deps.store.updateSession(session.id, { status: 'cancelada', closed_at: now(deps).toISOString() })
    queue.push({ type: 'text', text: 'Lote fechado sem nenhum animal. Nada foi gravado.' })
    return { ok: true, vazio: true }
  }
  const snapshot = deps.snapshot ?? await deps.store.loadSnapshot()
  const input = sessionInput(session)
  const ctx = { eventDate: session.params?.data || isoDate(new Date(session.started_at)), today: isoDate(now(deps)), allowMissing: true }
  const prepared = prepare(session.kind, snapshot, input, ctx)
  if (!prepared.ok) {
    queue.push({ type: 'text', text: `Não deu para fechar o lote:\n${prepared.problems.join('\n')}` })
    return { ok: false, problemas: prepared.problems }
  }
  // Quem era do lote e não passou.
  if (session.params?.lote && session.kind !== 'contagem') {
    const lot = String(session.params.lote).toLowerCase()
    const seen = new Set(session.entries.map((e) => e.number))
    const absent = snapshot.animals.filter((a) => !['morto', 'vendido', 'abatido'].includes(a.status) && String(a.lot ?? '').toLowerCase() === lot && !seen.has(a.number))
    const relevant = session.kind === 'protocolo_inicio' || session.kind === 'diagnostico' ? absent.filter((a) => a.sex === 'femea') : absent
    if (relevant.length) prepared.warnings.push(`🔴 Do lote ${session.params.lote} não passaram ${relevant.length}: ${numbersText(relevant.map((a) => a.number))}.`)
  }
  const action = await deps.store.createAction({
    contact_id: contact.id ?? null, message_id: row.id ?? null, session_id: session.id, kind: session.kind,
    payload: { input, prepared: prepared.payload, ctx, animalCount: prepared.animalCount },
    summary: prepared.summary, warnings: prepared.warnings, event_date: ctx.eventDate, simulated: Boolean(deps.simulated)
  })
  await deps.store.updateSession(session.id, { status: 'fechada', closed_at: now(deps).toISOString(), action_id: action.id })
  queue.push({ type: 'card', action })
  return { ok: true, codigo: action.code, nota: 'Resumo do lote enviado para confirmação. Não repita.' }
}

// ------------------------------------------------------------------
// Assistente
// ------------------------------------------------------------------

async function runAgent(deps, row, contact, text, image, mctx) {
  const { store } = deps
  const snapshot = deps.snapshot ?? await store.loadSnapshot()
  deps.snapshot = snapshot
  const queue = []
  const proposed = new Map()
  const pending = await pendingOf(deps, contact)
  const session = await store.getOpenSession(contact.id)
  const since = new Date(now(deps) - 3 * 3600 * 1000).toISOString()
  const history = (await store.recentConversation(row.phone, since, 12))
    .filter((m) => m.id !== row.id && (m.body || m.transcription))
    .map((m) => ({
      at: brDateTime(m.sent_at ?? m.received_at).split(' às ')[1],
      who: m.direction === 'in' ? contact.name : 'Assistente',
      text: (m.transcription ?? m.body ?? '').slice(0, 400)
    }))

  const ctx = {
    ...mctx,
    pending: pending.map((a) => ({ code: a.code, summary: a.summary, animals: a.payload?.animalCount ?? '?' })),
    session: session ? `${sessionDescription(session)} · ${session.entries.length} animais até agora` : null,
    history,
    kindText: row.kind === 'audio'
      ? `áudio transcrito (confiança ${row.interpretation?.transcription?.confidence ?? 'desconhecida'}${row.interpretation?.transcription?.doubts?.length ? `; dúvidas: ${row.interpretation.transcription.doubts.join('; ')}` : ''})`
      : row.kind === 'image' ? 'foto' : 'texto'
  }

  const handlers = {
    propose: async (kind, input) => {
      const key = `${kind}:${JSON.stringify(input)}`
      if (proposed.has(key)) return { ok: true, codigo: proposed.get(key), nota: 'Já preparado.' }
      const prepared = prepare(kind, snapshot, input, { eventDate: mctx.eventDate, today: mctx.today })
      if (!prepared.ok) return { ok: false, problemas: prepared.problems, avisos: prepared.warnings }
      const action = await store.createAction({
        contact_id: contact.id ?? null, message_id: row.id ?? null, kind,
        payload: { input, prepared: prepared.payload, ctx: { eventDate: mctx.eventDate }, animalCount: prepared.animalCount },
        summary: prepared.summary, warnings: prepared.warnings, event_date: prepared.payload.date ?? prepared.payload.start_date ?? mctx.eventDate,
        simulated: Boolean(deps.simulated)
      })
      proposed.set(key, action.code)
      queue.push({ type: 'card', action })
      return { ok: true, codigo: action.code, animais: prepared.animalCount, avisos: prepared.warnings, nota: 'O cartão de confirmação vai para o peão. Não repita o resumo.' }
    },
    session: async (name, input) => {
      const open = await store.getOpenSession(contact.id)
      if (name === 'iniciar_lote') {
        if (input.tipo === 'sanitario' && !input.produto) return { ok: false, problemas: ['Qual produto vai ser aplicado no lote?'] }
        if (input.tipo === 'protocolo_inicio') {
          const probe = prepare('protocolo_inicio', snapshot, { protocolo: input.protocolo, numeros: ['__teste__'] }, {})
          if (probe.problems?.some((p) => p.startsWith('Qual protocolo'))) return { ok: false, problemas: probe.problems }
        }
        const created = await store.createSession({ contact_id: contact.id ?? null, kind: input.tipo, params: input, simulated: Boolean(deps.simulated) })
        const howTo = { pesagem: 'Mande "brinco peso", pode ser vários: 401 380, 402 395', diagnostico: 'Mande "brinco P" ou "brinco V": 401 P, 402 V', contagem: 'Mande os brincos que passarem' }[input.tipo] ?? 'Mande os brincos, pode ser vários na mesma mensagem ou em áudio'
        queue.push({ type: 'text', text: `🟢 *Lote aberto: ${sessionDescription(created)}*\n${howTo}.\nEu confirmo cada um. No fim, mande *fechar* para revisar tudo antes de gravar.${open ? `\n_(O lote anterior, ${sessionDescription(open)}, foi descartado.)_` : ''}` })
        return { ok: true, nota: 'Mensagem de abertura já enviada. Não repita.' }
      }
      if (!open) return { ok: false, problemas: ['Não há lote aberto.'] }
      if (name === 'adicionar_ao_lote') {
        const r = await appendToSession(deps, row, open, input.itens ?? [], snapshot)
        queue.push({ type: 'text', text: r.text })
        return { ok: true, adicionados: r.added, total: r.session.entries.length, nota: 'Recibo já enviado.' }
      }
      if (name === 'remover_do_lote') {
        const drop = new Set(resolveNumbers(snapshot, input.numeros).found.map((a) => a.number).concat((input.numeros ?? []).map(normNumber)))
        const entries = open.entries.filter((e) => !drop.has(e.number))
        await store.updateSession(open.id, { entries })
        queue.push({ type: 'text', text: `➖ Tirei do lote: ${[...drop].filter((n) => open.entries.some((e) => e.number === n)).join(', ') || 'nenhum'}.\n_${entries.length} no lote_` })
        return { ok: true, total: entries.length }
      }
      if (name === 'fechar_lote') return closeSession(deps, row, contact, open, queue)
      if (name === 'cancelar_lote') {
        await store.updateSession(open.id, { status: 'cancelada', closed_at: now(deps).toISOString() })
        queue.push({ type: 'text', text: `Lote descartado (${open.entries.length} animais). Nada foi gravado.` })
        return { ok: true }
      }
      return { ok: false }
    },
    cancel: async (code) => {
      const action = await store.getActionByCode(code)
      if (!action) return { ok: false, problemas: [`Não existe lançamento ${code}.`] }
      const r = await cancelAction(deps, row, contact, action.id, { silent: true })
      return r.ok ? { ok: true, cancelado: action.code } : { ok: false, problemas: [`O ${action.code} não está mais pendente (${r.status}). Se já foi gravado, use desfazer.`] }
    },
    undo: async (code) => {
      const target = await store.getActionByCode(code)
      if (!target) return { ok: false, problemas: [`Não existe lançamento ${code}.`] }
      if (target.status !== 'aplicada') return { ok: false, problemas: [`O ${target.code} não está gravado (${target.status}).`] }
      if (target.contact_id && contact.id && target.contact_id !== contact.id) return { ok: false, problemas: ['Só quem lançou pode desfazer pelo WhatsApp. Peça ao escritório.'] }
      const age = now(deps) - new Date(target.applied_at ?? target.created_at)
      if (age > 7 * 24 * 3600 * 1000) return { ok: false, problemas: ['Lançamentos com mais de 7 dias só podem ser desfeitos pelo sistema.'] }
      const action = await store.createAction({
        contact_id: contact.id ?? null, message_id: row.id ?? null, kind: 'desfazer',
        payload: { target_id: target.id, target_code: target.code }, summary: `*Desfazer ${target.code}*\n${target.summary}`,
        warnings: ['Isso apaga o que esse lançamento gravou.'], event_date: mctx.today, simulated: Boolean(deps.simulated)
      })
      queue.push({ type: 'card', action })
      return { ok: true, codigo: action.code, nota: 'Cartão de confirmação enviado.' }
    },
    listActions: async (input) => {
      const list = await store.listActions({ contactId: input.todos ? undefined : contact.id, status: input.situacao, since: `${input.de ?? addDaysISO(mctx.today, -1)}T00:00:00`, limit: 30 })
      return {
        total: list.length,
        lancamentos: list.filter((a) => a.kind !== 'desfazer').map((a) => ({
          codigo: a.code, quando: brDateTime(a.created_at), tipo: KIND_LABEL[a.kind] ?? a.kind, situacao: a.status, resumo: a.summary.replace(/\*/g, '').split('\n').slice(0, 3).join(' · ')
        }))
      }
    }
  }

  const assistant = deps.assistant ?? defaultAssistant
  const result = await assistant({ snapshot, farmName: deps.farmName, ctx, text, image, handlers })
  return { ...result, queue }
}

// ------------------------------------------------------------------
// Entrada
// ------------------------------------------------------------------

async function loadInput(deps, row) {
  const { store, transport } = deps
  if (row.kind === 'audio') {
    if (row.transcription) return { text: row.transcription }
    const media = await transport.downloadMedia(row.media_id)
    let path = row.media_path
    if (!path) {
      const month = (row.sent_at ?? new Date().toISOString()).slice(0, 7)
      const ext = /mpeg|mp3/.test(media.mime ?? '') ? 'mp3' : /mp4|aac|m4a/.test(media.mime ?? '') ? 'm4a' : 'ogg'
      path = `audio/${month}/${row.phone}/${(row.wamid ?? row.id).replace(/[^\w.-]/g, '_')}.${ext}`
      try { await store.uploadMedia(path, media.bytes, media.mime ?? 'audio/ogg') } catch (e) { console.error('Falha ao guardar o áudio', e); path = null }
    }
    const transcription = await deps.transcribe(media.bytes, media.mime ?? row.media_mime)
    const interpretation = { ...(row.interpretation ?? {}), transcription: { model: transcription.model, confidence: transcription.confidence, doubts: transcription.doubts } }
    await store.updateMessage(row.id, { transcription: transcription.text, media_path: path, interpretation })
    row.transcription = transcription.text
    row.interpretation = interpretation
    return { text: transcription.text, audio: true }
  }
  if (row.kind === 'image') {
    const media = await transport.downloadMedia(row.media_id)
    if (!row.media_path) {
      const path = `foto/${(row.sent_at ?? new Date().toISOString()).slice(0, 7)}/${row.phone}/${(row.wamid ?? row.id).replace(/[^\w.-]/g, '_')}.jpg`
      try { await store.uploadMedia(path, media.bytes, media.mime ?? 'image/jpeg'); await store.updateMessage(row.id, { media_path: path }) } catch (e) { console.error('Falha ao guardar a foto', e) }
    }
    const mime = /png|webp|gif/.test(media.mime ?? '') ? String(media.mime).split(';')[0] : 'image/jpeg'
    return { text: row.body ?? '', image: { mime, base64: Buffer.from(media.bytes).toString('base64') } }
  }
  return { text: row.body ?? '' }
}

const UNSUPPORTED = 'Por enquanto eu entendo áudio, texto e foto. Pode mandar de um desses jeitos?'

/** Processa uma mensagem já guardada. Lança erro só para a rotina tentar de novo. */
export async function processMessage(deps, row, contact) {
  const { store } = deps
  const mctx = messageContext(deps, row, contact)
  const notices = []
  if (mctx.delayMs > DELAY_NOTICE_MS) notices.push(`📶 Sua mensagem de ${mctx.sentAtText} chegou agora (${mctx.delayText} depois). Registrei com a data de quando você gravou.`)

  if (row.kind === 'button') {
    const [verb, id] = String(row.interpretation?.button_id ?? '').split(':')
    if (verb === 'ok' && id) await confirmAction(deps, row, contact, id)
    else if (verb === 'no' && id) await cancelAction(deps, row, contact, id)
    else await reply(deps, row, 'Esse botão não vale mais. Mande a mensagem de novo, por favor.')
    await store.updateMessage(row.id, { status: 'respondido' })
    return
  }
  if (!['text', 'audio', 'image'].includes(row.kind)) {
    await reply(deps, row, UNSUPPORTED)
    await store.updateMessage(row.id, { status: 'respondido' })
    return
  }

  const input = await loadInput(deps, row)
  const text = (input.text ?? '').trim()

  if (input.audio && !text) {
    await reply(deps, row, '🎧 Não consegui entender o áudio (muito barulho ou ficou mudo). Pode mandar de novo, mais perto do celular?', { quote: true })
    await store.updateMessage(row.id, { status: 'respondido' })
    return
  }

  // Atalhos sem IA: são os mais usados no curral e funcionam mesmo se a IA estiver fora.
  if (text && !input.image && (await quickConfirm(deps, row, contact, text))) {
    await store.updateMessage(row.id, { status: 'respondido', interpretation: { ...(row.interpretation ?? {}), route: 'confirmacao' } })
    return
  }
  const session = text && !input.image && contact.permission !== 'consulta' ? await store.getOpenSession(contact.id) : null
  if (session) {
    if (CLOSE.test(text)) {
      const queue = []
      await closeSession(deps, row, contact, session, queue)
      for (const n of notices) await reply(deps, row, n)
      await flush(deps, row, queue)
      await store.updateMessage(row.id, { status: 'respondido', interpretation: { ...(row.interpretation ?? {}), route: 'lote_fechar' } })
      return
    }
    const items = parseBatchText(session.kind, text)
    if (items) {
      deps.snapshot = deps.snapshot ?? await store.loadSnapshot()
      const r = await appendToSession(deps, row, session, items, deps.snapshot)
      for (const n of notices) await reply(deps, row, n)
      await reply(deps, row, r.text)
      await store.updateMessage(row.id, { status: 'respondido', interpretation: { ...(row.interpretation ?? {}), route: 'lote', itens: items } })
      return
    }
  }

  const result = await runAgent(deps, row, contact, text, input.image, mctx)
  for (const n of notices) await reply(deps, row, n)
  const answer = (result.text ?? '').trim()
  const hasCards = result.queue.some((q) => q.type === 'card')
  if (answer && !(hasCards && answer.length < 4)) result.queue.unshift({ type: 'text', text: answer, quote: input.audio })
  if (!result.queue.length) result.queue.push({ type: 'text', text: 'Recebido. Não encontrei nada para registrar nessa mensagem. Pode explicar de outro jeito?' })
  await flush(deps, row, result.queue)
  await store.updateMessage(row.id, {
    status: 'respondido',
    error: null,
    interpretation: { ...(row.interpretation ?? {}), route: 'assistente', ...result.trace, actions: result.queue.filter((q) => q.type === 'card').map((q) => q.action.code) }
  })
}

async function flush(deps, row, queue) {
  for (const item of queue) {
    if (item.type === 'card') await sendCard(deps, row, item.action)
    else await reply(deps, row, item.text, { quote: item.quote })
  }
}

/** Número que não está cadastrado: responde no máximo uma vez por dia. */
async function handleUnknown(deps, row) {
  const { store } = deps
  await store.updateMessage(row.id, { status: 'ignorado', error: 'número não autorizado' })
  const last = await store.lastOutboundAt(row.phone)
  if (last && now(deps) - new Date(last) < 24 * 3600 * 1000) return
  await reply(deps, row, `Olá! Este é o número de registros da ${deps.farmName}. O seu WhatsApp ainda não está autorizado. Peça ao administrador da fazenda para cadastrar o número ${row.phone} no sistema.`)
}

/**
 * Processa todas as mensagens pendentes de um telefone, em ordem de gravação.
 * Uma trava por contato evita que duas mensagens que chegaram juntas se atropelem.
 */
export async function processPhone(deps, phone) {
  const { store } = deps
  const pending = await store.pendingInbound(phone)
  if (!pending.length) return { processed: 0 }
  const contact = await findContact(store, phone)
  if (!contact) {
    for (const row of pending) {
      const claimed = await store.claimMessage(row.id)
      if (claimed) await handleUnknown(deps, claimed)
    }
    return { processed: pending.length, unknown: true }
  }
  const leased = await store.acquireLease(contact.id)
  if (!leased) return { processed: 0, busy: true }
  let processed = 0
  try {
    await store.touchContact(contact.id)
    // Repete até esvaziar: mensagens que chegarem enquanto processamos entram na fila.
    // Uma mensagem que falhou não é repetida na mesma rodada: quem tenta de novo é a rotina.
    const seen = new Set()
    for (let round = 0; round < 5; round++) {
      const list = (round === 0 ? pending : await store.pendingInbound(phone)).filter((row) => !seen.has(row.id))
      if (!list.length) break
      for (const row of list) {
        seen.add(row.id)
        const claimed = await store.claimMessage(row.id)
        if (!claimed) continue
        await processOne(deps, claimed, contact)
        processed++
      }
    }
  } finally {
    await store.releaseLease(contact.id)
  }
  return { processed }
}

async function processOne(deps, row, contact) {
  const { store, transport } = deps
  if (row.wamid && !deps.simulated) transport.markRead(row.wamid).catch(() => {})
  try {
    await processMessage(deps, { ...row, contact_id: contact.id }, contact)
  } catch (error) {
    console.error('Falha ao processar mensagem', row.id, error)
    const attempts = row.attempts ?? 1
    const finalFailure = attempts >= MAX_ATTEMPTS || error.permanent
    await store.updateMessage(row.id, { status: 'erro', error: String(error?.message ?? error).slice(0, 500) })
    // Avisa o peão uma vez que a mensagem está guardada, e de novo só se desistirmos.
    const sent = new Date(row.sent_at ?? row.received_at)
    if (attempts === 1 && !finalFailure) {
      await reply(deps, { ...row, contact_id: contact.id }, `📥 Recebi sua ${row.kind === 'audio' ? 'mensagem de voz' : 'mensagem'} de ${brDateTime(sent).split(', ')[1]}. O sistema está lento agora, mas ela ficou guardada: respondo assim que processar. Não precisa mandar de novo.`).catch(() => {})
    } else if (finalFailure) {
      await reply(deps, { ...row, contact_id: contact.id }, `⚠ Não consegui processar sua mensagem de ${brDateTime(sent)}. Ela está guardada no sistema e o escritório vai conferir. Se for urgente, mande de novo por texto.`).catch(() => {})
      await store.updateMessage(row.id, { attempts: MAX_ATTEMPTS })
    }
  }
}

export async function findContact(store, phone) {
  const { phoneVariants } = await import('./whatsapp.mjs')
  for (const variant of phoneVariants(phone)) {
    const contact = await store.getContactByPhone(variant)
    if (contact) return contact
  }
  return null
}

/** Guarda as mensagens do aviso da Meta. Devolve os telefones com algo novo. */
export async function storeIncoming(store, parsed, { simulated = false } = {}) {
  const phones = new Set()
  for (const m of parsed.messages) {
    const contact = await findContact(store, m.phone)
    const { duplicate } = await store.insertMessage({
      wamid: m.wamid,
      direction: 'in',
      phone: m.phone,
      contact_id: contact?.id ?? null,
      kind: m.kind,
      body: m.kind === 'button' ? m.text : m.text ?? null,
      media_id: m.mediaId ?? null,
      media_mime: m.mime ?? null,
      sent_at: m.sentAt,
      status: 'recebido',
      interpretation: m.kind === 'button' ? { button_id: m.buttonId } : m.profileName ? { profile_name: m.profileName } : null,
      simulated
    })
    if (!duplicate) phones.add(m.phone)
  }
  for (const s of parsed.statuses) {
    const status = { sent: 'enviado', delivered: 'entregue', read: 'lido', failed: 'falhou' }[s.status]
    if (status) await store.updateDelivery(s.wamid, status, s.error)
  }
  return [...phones]
}

export { SESSION_LABEL, sessionDescription }

// ------------------------------------------------------------------
// Rotina agendada (a cada 10 minutos)
// ------------------------------------------------------------------

const REMIND_AFTER_MS = 30 * 60 * 1000
const EXPIRE_AFTER_MS = 24 * 3600 * 1000
const SESSION_IDLE_MS = 2 * 3600 * 1000

/**
 * Rede de segurança: reprocessa o que ficou para trás, lembra o peão do que
 * falta confirmar e expira o que ninguém confirmou em 24 h.
 * Devolve os telefones que precisam ser reprocessados (a função de fundo faz isso).
 */
export async function runRoutine(deps) {
  const { store } = deps
  const t = now(deps)
  const report = { reprocessar: [], lembretes: 0, expirados: 0, lotes: 0 }

  // 1. Mensagens paradas: travadas no meio ("processando" há mais de 2 min) ou com erro.
  for (const m of await store.staleInbound()) {
    if (m.status === 'processando') await store.updateMessage(m.id, { status: 'erro', error: 'processamento interrompido' })
    if (!report.reprocessar.includes(m.phone)) report.reprocessar.push(m.phone)
  }

  // 2. Lançamentos sem confirmação.
  for (const action of await store.pendingActions()) {
    const contact = action.contact_id ? await store.getContact(action.contact_id) : null
    if (!contact) continue
    const target = { phone: contact.phone, contact_id: contact.id, id: null, wamid: null }
    const age = t - new Date(action.created_at)
    if (age > EXPIRE_AFTER_MS) {
      await store.claimAction(action.id, 'pendente', { status: 'expirada' })
      await reply(deps, target, `⌛ O lançamento ${action.code} (${firstLine(action.summary)}) ficou 24 h sem confirmação e NÃO foi gravado. Se ainda vale, mande de novo.`).catch(() => {})
      report.expirados++
    } else if (age > REMIND_AFTER_MS && !action.reminder_sent_at) {
      await store.updateAction(action.id, { reminder_sent_at: t.toISOString() })
      await sendCard(deps, target, action, '⏰ *Falta confirmar*\n').catch(() => {})
      report.lembretes++
    }
  }

  // 3. Lote aberto e parado.
  for (const session of await store.openSessions()) {
    const last = session.entries.length ? session.entries[session.entries.length - 1].at : session.started_at
    if (t - new Date(last) < SESSION_IDLE_MS || session.params?.lembrado_em) continue
    const contact = session.contact_id ? await store.getContact(session.contact_id) : null
    if (!contact) continue
    await store.updateSession(session.id, { params: { ...session.params, lembrado_em: t.toISOString() } })
    await reply(deps, { phone: contact.phone, contact_id: contact.id, id: null, wamid: null },
      `⏰ O lote *${sessionDescription(session)}* continua aberto com ${session.entries.length} animais. Mande *fechar* para revisar e gravar, ou "cancelar lote".`).catch(() => {})
    report.lotes++
  }
  return report
}
