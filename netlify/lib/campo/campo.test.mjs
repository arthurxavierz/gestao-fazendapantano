import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { emptyMemoryState, memoryStore } from './armazem.mjs'
import { parseBatchText, processPhone, runRoutine, storeIncoming } from './fluxo.mjs'
import { prepare } from './lancamentos.mjs'
import { queryReproduction, resolveNumbers } from './rebanho.mjs'
import { addDaysISO, isoDate } from './tempo.mjs'
import { captureTransport, normPhone, parseWebhook, phoneVariants, verifySignature } from './whatsapp.mjs'

const TODAY = isoDate()
const days = (n) => addDaysISO(TODAY, n)
const PHONE = '5534999990001'

const protocol = {
  id: 'p1', name: 'IATF 3 manejos (D0 · D8 · D10)', method: 'iatf', active: true,
  steps: [
    { day: 0, kind: 'aplicacao', title: 'Implante + BE' },
    { day: 8, kind: 'retirada', title: 'Retirada do implante' },
    { day: 10, kind: 'inseminacao', title: 'IATF' },
    { day: 40, kind: 'diagnostico', title: 'Diagnóstico' }
  ]
}

function cow(number, extra = {}) {
  return { id: `a-${number}`, number, sex: 'femea', category: 'vaca', status: 'normal', lot: 'Matrizes', birth_date: '2020-01-01', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z', ...extra }
}

function attempt(animalId, extra = {}) {
  return {
    id: `t-${animalId}-${Math.random().toString(36).slice(2, 6)}`, animal_id: animalId, method: 'iatf', protocol_id: 'p1', protocol_name: protocol.name,
    steps: protocol.steps, steps_done: [{ index: 0, done_at: `${days(-12)}T12:00:00` }], start_date: days(-12), insemination_date: null, sire: null,
    result: 'pendente', created_at: `${days(-12)}T12:00:00Z`, ...extra
  }
}

function herd() {
  const animals = [
    cow('401'), cow('402'), cow('403'), cow('404'), cow('405'), cow('406', { lot: 'Novilhas', category: 'novilha', birth_date: '2024-06-01' }),
    { ...cow('500'), sex: 'macho', category: 'boi' },
    cow('407', { status: 'vendido' })
  ]
  const attempts = [
    // 403: em protocolo iniciado há 12 dias, com retirada pendente desde o D8.
    attempt('a-403'),
    // 404: inseminada há 35 dias, aguardando diagnóstico. Já tem 3 falhas antes.
    ...[-400, -300, -200].map((d) => attempt('a-404', { start_date: days(d), result: 'vazia', insemination_date: days(d + 10), created_at: `${days(d)}T12:00:00Z` })),
    attempt('a-404', { start_date: days(-45), insemination_date: days(-35), steps_done: [0, 1, 2].map((index) => ({ index, done_at: `${days(-45)}T12:00:00` })), created_at: `${days(-45)}T12:00:00Z` }),
    // 405: prenhe com parto previsto.
    attempt('a-405', { start_date: days(-300), insemination_date: days(-290), result: 'prenhe', expected_calving_date: days(0), created_at: `${days(-300)}T12:00:00Z` })
  ]
  return { animals, attempts, health: [], weighings: [], occurrences: [], protocols: [protocol], settings: { max_breeding_attempts: 4, gestation_days: 290, diagnosis_days: 30, min_breeding_age_months: 14 } }
}

function setup({ assistant, permission = 'lancamento' } = {}) {
  const state = emptyMemoryState(herd())
  state.contacts.push({ id: 'c1', phone: PHONE, name: 'João', permission, active: true, profile_id: 'prof-joao' })
  const store = memoryStore(state)
  const transport = captureTransport({ 'media-1': { bytes: Buffer.from('audio'), mime: 'audio/ogg; codecs=opus' } })
  const deps = { store, transport, farmName: 'Fazenda Teste', transcribe: async () => ({ text: 'vacinei a 401 e a 402 com aftosa', confidence: 'alta', doubts: [], model: 'fake' }), assistant }
  let n = 0
  const send = async (message, { sentAt = new Date().toISOString(), phone = PHONE } = {}) => {
    const wamid = message.wamid ?? `wamid.${n++}`
    const phones = await storeIncoming(store, { messages: [{ wamid, phone, sentAt, kind: 'text', ...message }], statuses: [] })
    for (const p of phones) await processPhone({ ...deps, snapshot: undefined }, p)
    return wamid
  }
  return { state, store, transport, deps, send }
}

const lastSent = (transport) => transport.sent[transport.sent.length - 1]
const cards = (transport) => transport.sent.filter((s) => s.type === 'buttons')

/** Assistente falso: chama ferramentas conforme o roteiro, como o Claude faria. */
function scripted(script) {
  return async ({ text, handlers, ctx }) => {
    const step = script(text, ctx)
    if (!step) return { text: 'Não entendi.', trace: {} }
    const outputs = []
    for (const call of [].concat(step.calls ?? [])) {
      if (call.propose) outputs.push(await handlers.propose(call.propose, call.input))
      if (call.session) outputs.push(await handlers.session(call.session, call.input ?? {}))
      if (call.undo) outputs.push(await handlers.undo(call.undo))
    }
    return { text: step.text ?? '', trace: { outputs } }
  }
}

// ------------------------------------------------------------------

describe('WhatsApp Cloud API', () => {
  it('lê texto, áudio, botão e status de entrega', () => {
    const body = {
      entry: [{ changes: [{ value: {
        contacts: [{ wa_id: PHONE, profile: { name: 'João' } }],
        messages: [
          { id: 'w1', from: PHONE, timestamp: '1763740000', type: 'text', text: { body: 'oi' } },
          { id: 'w2', from: PHONE, timestamp: '1763740001', type: 'audio', audio: { id: 'media-1', mime_type: 'audio/ogg; codecs=opus', voice: true } },
          { id: 'w3', from: PHONE, timestamp: '1763740002', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'ok:abc', title: 'Confirmar' } } }
        ],
        statuses: [{ id: 'out1', status: 'delivered', timestamp: '1763740003', recipient_id: PHONE }]
      } }] }]
    }
    const parsed = parseWebhook(body)
    expect(parsed.messages.map((m) => m.kind)).toEqual(['text', 'audio', 'button'])
    expect(parsed.messages[0].sentAt).toBe(new Date(1763740000 * 1000).toISOString())
    expect(parsed.messages[0].profileName).toBe('João')
    expect(parsed.messages[2].buttonId).toBe('ok:abc')
    expect(parsed.statuses[0]).toMatchObject({ wamid: 'out1', status: 'delivered' })
  })

  it('confere a assinatura da Meta', () => {
    const raw = '{"a":1}'
    const sig = `sha256=${createHmac('sha256', 'segredo').update(raw).digest('hex')}`
    expect(verifySignature(raw, sig, 'segredo')).toBe(true)
    expect(verifySignature(raw, sig, 'outro')).toBe(false)
    expect(verifySignature('{"a":2}', sig, 'segredo')).toBe(false)
    expect(verifySignature(raw, '', 'segredo')).toBe(false)
  })

  it('acha o celular com e sem o 9', () => {
    expect(normPhone('+55 (34) 99999-0001')).toBe('5534999990001')
    expect(phoneVariants('553499990001')).toContain('5534999990001')
    expect(phoneVariants('5534999990001')).toContain('553499990001')
  })
})

describe('Rebanho', () => {
  it('resolve brincos com zeros, repetidos e sugere parecidos', () => {
    const snap = herd()
    const r = resolveNumbers(snap, ['0401', '401', '410', '402'])
    expect(r.found.map((a) => a.number)).toEqual(['401', '402'])
    expect(r.repeated).toEqual(['401'])
    expect(r.missing[0].number).toBe('410')
    expect(r.missing[0].suggestions).toContain('401')
  })

  it('agrupa a reprodução por início de protocolo', () => {
    const r = queryReproduction(herd(), { inicio_de: days(-60) })
    expect(r.grupos.map((g) => g.total).reduce((a, b) => a + b, 0)).toBe(2)
    expect(r.grupos.find((g) => g.inicio === days(-12)).brincos).toEqual(['403'])
  })
})

describe('Conferência dos lançamentos', () => {
  const ctx = { eventDate: TODAY, today: TODAY }

  it('início de protocolo deixa de fora macho, vaca em protocolo e prenhe', () => {
    const r = prepare('protocolo_inicio', herd(), { numeros: ['401', '402', '403', '405', '500'], protocolo: 'iatf 3' }, ctx)
    expect(r.ok).toBe(true)
    expect(r.payload.animals.map((a) => a.number)).toEqual(['401', '402'])
    expect(r.warnings.join(' ')).toMatch(/Machos.*500/)
    expect(r.warnings.join(' ')).toMatch(/403/)
    expect(r.warnings.join(' ')).toMatch(/prenhes.*405/)
  })

  it('brinco inexistente bloqueia e pergunta', () => {
    const r = prepare('sanitario', herd(), { numeros: ['410'], produto: 'Aftosa' }, ctx)
    expect(r.ok).toBe(false)
    expect(r.problems[0]).toMatch(/Seria 401/)
  })

  it('animal vendido não recebe manejo', () => {
    const r = prepare('pesagem', herd(), { itens: [{ numero: '407', peso: 400 }] }, ctx)
    expect(r.ok).toBe(false)
    expect(r.problems[0]).toMatch(/saíram do rebanho/)
  })

  it('diagnóstico vazio na quarta tentativa manda para descarte', () => {
    const r = prepare('diagnostico', herd(), { itens: [{ numero: '404', resultado: 'vazia' }] }, ctx)
    expect(r.ok).toBe(true)
    expect(r.payload.discard.map((d) => d.number)).toEqual(['404'])
    expect(r.warnings.join(' ')).toMatch(/DESCARTE/)
  })

  it('parto sem brinco do bezerro gera brinco provisório', () => {
    const r = prepare('parto', herd(), { numero_mae: '405', resultado: 'nascido', bezerro_sexo: 'macho' }, ctx)
    expect(r.ok).toBe(true)
    expect(r.payload.calf.number).toMatch(/^BZ405-/)
    expect(r.payload.calf.provisional).toBe(true)
  })

  it('data futura é recusada', () => {
    const r = prepare('sanitario', herd(), { numeros: ['401'], produto: 'Raiva', data: days(5) }, ctx)
    expect(r.ok).toBe(false)
  })

  it('peso fora do comum é recusado', () => {
    const r = prepare('pesagem', herd(), { itens: [{ numero: '401', peso: 4 }] }, ctx)
    expect(r.ok).toBe(false)
  })

  it('etapa do protocolo pelo dia de início, sem citar brincos', () => {
    const r = prepare('protocolo_etapa', herd(), { etapa: 'retirada', inicio_protocolo: days(-12) }, { ...ctx, eventDate: days(-4) })
    expect(r.ok).toBe(true)
    expect(r.payload.items.map((i) => i.number)).toEqual(['403'])
  })
})

describe('Leitura rápida do modo lote', () => {
  it('números soltos, com "e" e vírgulas', () => {
    expect(parseBatchText('sanitario', '401, 402 e 403.')).toEqual([{ numero: '401' }, { numero: '402' }, { numero: '403' }])
  })
  it('pesagem em pares', () => {
    expect(parseBatchText('pesagem', '401 380, 402 395kg')).toEqual([{ numero: '401', peso: 380 }, { numero: '402', peso: 395 }])
  })
  it('diagnóstico com P e V', () => {
    expect(parseBatchText('diagnostico', '401 P 402 vazia')).toEqual([{ numero: '401', resultado: 'prenhe' }, { numero: '402', resultado: 'vazia' }])
  })
  it('frase com outras palavras vai para a IA', () => {
    expect(parseBatchText('sanitario', 'a 401 tá mancando')).toBeNull()
  })
})

describe('Fluxo completo', () => {
  const vacinaScript = scripted((text) => (/vacinei/.test(text)
    ? { calls: { propose: 'sanitario', input: { numeros: ['401', '402'], produto: 'Aftosa', tipo: 'vacina' } } }
    : null))

  it('áudio vira cartão; o botão grava com autoria e origem; o segundo toque não duplica', async () => {
    const { send, transport, state } = setup({ assistant: vacinaScript })
    await send({ kind: 'audio', mediaId: 'media-1', mime: 'audio/ogg' })
    const inbound = state.messages.find((m) => m.direction === 'in')
    expect(inbound.transcription).toBe('vacinei a 401 e a 402 com aftosa')
    expect(inbound.media_path).toMatch(/^audio\//)
    expect(state.media).toHaveLength(1)
    const card = cards(transport)[0]
    expect(card.text).toMatch(/Aftosa/)
    const actionId = card.buttons[0].id.split(':')[1]

    await send({ kind: 'button', buttonId: `ok:${actionId}`, text: 'Confirmar' })
    expect(state.herd.health).toHaveLength(2)
    expect(state.herd.health[0]).toMatchObject({ product: 'Aftosa', created_by: 'prof-joao', origin_channel: 'whatsapp', origin_ref: actionId })
    expect(lastSent(transport).text).toMatch(/Gravado/)

    await send({ kind: 'button', buttonId: `ok:${actionId}`, text: 'Confirmar' })
    expect(state.herd.health).toHaveLength(2)
    expect(lastSent(transport).text).toMatch(/já estava gravado/)
  })

  it('a mesma mensagem reenviada pela Meta é processada uma vez só', async () => {
    const { send, transport, state } = setup({ assistant: vacinaScript })
    await send({ wamid: 'repetida', text: 'vacinei' })
    await send({ wamid: 'repetida', text: 'vacinei' })
    expect(state.messages.filter((m) => m.direction === 'in')).toHaveLength(1)
    expect(cards(transport)).toHaveLength(1)
  })

  it('"sim" confirma o único pendente; "não" cancela', async () => {
    const { send, transport, state } = setup({ assistant: vacinaScript })
    await send({ text: 'vacinei' })
    await send({ text: 'Sim.' })
    expect(state.herd.health).toHaveLength(2)
    await send({ text: 'vacinei' })
    await send({ text: 'não' })
    expect(state.herd.health).toHaveLength(2)
    expect(lastSent(transport).text).toMatch(/Cancelado/)
  })

  it('mensagem que chegou atrasada usa a data de quando foi gravada e avisa', async () => {
    const { send, transport, state } = setup({ assistant: vacinaScript })
    const gravada = new Date(Date.now() - 26 * 3600 * 1000).toISOString()
    await send({ text: 'vacinei' }, { sentAt: gravada })
    expect(transport.sent[0].text).toMatch(/chegou agora/)
    expect(state.actions[0].event_date).toBe(isoDate(new Date(gravada)))
  })

  it('número desconhecido recebe um aviso por dia e nada é lançado', async () => {
    const { send, transport, state } = setup({ assistant: vacinaScript })
    await send({ text: 'vacinei' }, { phone: '5511988887777' })
    await send({ text: 'vacinei' }, { phone: '5511988887777' })
    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0].text).toMatch(/não está autorizado/)
    expect(state.actions).toHaveLength(0)
  })

  it('contato só de consulta não lança', async () => {
    let offered = null
    const assistant = async ({ ctx }) => { offered = ctx.contact.permission; return { text: 'ok', trace: {} } }
    const { send } = setup({ assistant, permission: 'consulta' })
    await send({ text: 'quantas vacas?' })
    expect(offered).toBe('consulta')
  })

  it('falha da IA: avisa que guardou, e a rotina reprocessa', async () => {
    let fail = true
    const assistant = async (args) => {
      if (fail) throw new Error('Claude fora do ar')
      return vacinaScript(args)
    }
    const { send, transport, state, deps } = setup({ assistant })
    await send({ text: 'vacinei' })
    const msg = state.messages.find((m) => m.direction === 'in')
    expect(msg.status).toBe('erro')
    expect(transport.sent[0].text).toMatch(/ficou guardada/)

    fail = false
    msg.updated_at = new Date(Date.now() - 5 * 60000).toISOString()
    const report = await runRoutine(deps)
    expect(report.reprocessar).toEqual([PHONE])
    await processPhone(deps, PHONE)
    expect(state.messages.find((m) => m.direction === 'in').status).toBe('respondido')
    expect(cards(transport)).toHaveLength(1)
  })

  it('modo lote: abre, recebe números sem IA, avisa inexistente, fecha com quem faltou e grava', async () => {
    let agentCalls = 0
    const assistant = scripted((text) => {
      agentCalls++
      if (/vou vacinar/.test(text)) return { calls: { session: 'iniciar_lote', input: { tipo: 'sanitario', produto: 'Raiva', lote: 'Matrizes' } } }
      return null
    })
    const { send, transport, state } = setup({ assistant })
    await send({ text: 'vou vacinar as matrizes contra raiva' })
    expect(lastSent(transport).text).toMatch(/Lote aberto/)
    await send({ text: '401 402' })
    await send({ text: '403, 410' })
    expect(lastSent(transport).text).toMatch(/410/)
    expect(lastSent(transport).text).toMatch(/3 no lote/)
    await send({ text: '402' })
    expect(lastSent(transport).text).toMatch(/Já tinha passado/)
    expect(agentCalls).toBe(1)

    await send({ text: 'fechar' })
    const card = lastSent(transport)
    expect(card.type).toBe('buttons')
    expect(card.text).toMatch(/não passaram 3: 404, 405, 500/)
    await send({ text: 'sim' })
    expect(state.herd.health.map((h) => state.herd.animals.find((a) => a.id === h.animal_id).number).sort()).toEqual(['401', '402', '403'])
    expect(state.herd.health[0].next_due_date).toBe(addDaysISO(TODAY, 365))
  })

  it('desfazer apaga exatamente o que foi gravado', async () => {
    const assistant = scripted((text) => {
      if (/pariu/.test(text)) return { calls: { propose: 'parto', input: { numero_mae: '405', resultado: 'nascido', bezerro_numero: '900', bezerro_sexo: 'femea', bezerro_peso: 32 } } }
      const m = text.match(/desfazer (\w{4})/)
      if (m) return { calls: { undo: m[1] } }
      return null
    })
    const { send, state, transport } = setup({ assistant })
    const before = state.herd.animals.length
    await send({ text: 'a 405 pariu uma bezerra' })
    await send({ text: 'sim' })
    expect(state.herd.animals).toHaveLength(before + 1)
    const calf = state.herd.animals.find((a) => a.number === '900')
    expect(calf.mother_id).toBe('a-405')
    expect(state.herd.attempts.find((t) => t.animal_id === 'a-405' && t.result === 'parida').calf_id).toBe(calf.id)
    const code = state.actions[0].code

    await send({ text: `desfazer ${code}` })
    await send({ text: 'sim' })
    expect(state.herd.animals).toHaveLength(before)
    expect(state.herd.weighings).toHaveLength(0)
    expect(state.herd.attempts.find((t) => t.animal_id === 'a-405' && t.expected_calving_date === TODAY).result).toBe('prenhe')
    expect(state.actions[0].status).toBe('desfeita')
    expect(lastSent(transport).text).toMatch(/Desfeito/)
  })

  it('confirmação confere de novo: se o animal saiu nesse meio tempo, não grava', async () => {
    const { send, transport, state } = setup({ assistant: vacinaScript })
    await send({ text: 'vacinei' })
    state.herd.animals.find((a) => a.number === '401').status = 'morto'
    await send({ text: 'sim' })
    expect(state.herd.health).toHaveLength(0)
    expect(lastSent(transport).text).toMatch(/Não gravei/)
  })

  it('lembrete após 30 min e expiração em 24 h', async () => {
    const { send, transport, state, deps } = setup({ assistant: vacinaScript })
    await send({ text: 'vacinei' })
    state.actions[0].created_at = new Date(Date.now() - 40 * 60000).toISOString()
    await runRoutine(deps)
    expect(lastSent(transport).text).toMatch(/Falta confirmar/)
    state.actions[0].created_at = new Date(Date.now() - 25 * 3600000).toISOString()
    await runRoutine(deps)
    expect(state.actions[0].status).toBe('expirada')
    expect(lastSent(transport).text).toMatch(/NÃO foi gravado/)
  })
})
