// Gravação dos lançamentos confirmados.
//
// Cada linha criada leva a conta ligada ao número (created_by), o canal
// (origin_channel = 'whatsapp') e o lançamento de origem (origin_ref). Cada
// alteração guarda o valor anterior, o que permite desfazer com exatidão.

import { addDaysISO, isoDate } from './tempo.mjs'

const SOURCE = 'whatsapp'

function tracer(store, action, actor) {
  const refs = []
  const stamp = (row, table) => (table === 'counts'
    ? { ...row, created_by: actor?.profile_id ?? null }
    : { ...row, created_by: actor?.profile_id ?? null, origin_channel: SOURCE, origin_ref: action.id })
  return {
    refs,
    async insert(table, rows) {
      if (!rows.length) return []
      const saved = await store.insertRows(table, rows.map((r) => stamp(r, table)))
      for (const row of saved) refs.push({ table, id: row.id, op: 'insert' })
      return saved
    },
    async update(table, id, patch) {
      const before = await store.updateRow(table, id, table === 'animals' ? { ...patch, updated_by: actor?.profile_id ?? null } : patch)
      if (before) refs.push({ table, id, op: 'update', before })
      return before
    }
  }
}

const noon = (date) => `${date}T12:00:00`

/** Grava o lançamento já conferido. Devolve as referências de tudo o que foi tocado. */
export async function applyAction(store, action, snapshot, actor) {
  const t = tracer(store, action, actor)
  const p = action.payload.prepared
  const attemptById = new Map(snapshot.attempts.map((a) => [a.id, a]))
  const via = `Lançado pelo WhatsApp (${action.code})`
  try {
    await write(t, action, p, snapshot, attemptById, via)
  } catch (error) {
    // Quem chamou desfaz o que chegou a ser gravado.
    error.refs = t.refs
    throw error
  }
  return t.refs
}

async function write(t, action, p, snapshot, attemptById, via) {
  switch (action.kind) {
    case 'protocolo_inicio': {
      const steps = p.protocol.steps
      const doneNow = steps
        .map((step, index) => ({ step, index }))
        .filter(({ step }) => step.day === 0 && step.kind !== 'inseminacao' && p.start_date <= isoDate())
        .map(({ index }) => ({ index, done_at: noon(p.start_date) }))
      await t.insert('breeding_attempts', p.animals.map((a) => ({
        animal_id: a.id, method: p.protocol.method, protocol_id: p.protocol.id, protocol_name: p.protocol.name,
        steps, steps_done: doneNow, start_date: p.start_date, insemination_date: null, sire: p.sire, technician: p.technician,
        diagnosis_date: null, result: 'pendente', expected_calving_date: null, calving_date: null, calf_id: null, notes: via
      })))
      break
    }
    case 'protocolo_etapa':
    case 'inseminacao': {
      const items = action.kind === 'inseminacao' ? p.steps : p.items
      for (const item of items) {
        const attempt = attemptById.get(item.attempt_id)
        if (!attempt) continue
        const patch = {}
        if (item.step_index >= 0) {
          patch.steps_done = [...attempt.steps_done.filter((s) => s.index !== item.step_index), { index: item.step_index, done_at: noon(p.date) }]
        }
        if (item.kind === 'inseminacao') {
          patch.insemination_date = p.date
          if (p.sire) patch.sire = p.sire
          if (p.technician) patch.technician = p.technician
        }
        await t.update('breeding_attempts', attempt.id, patch)
      }
      if (action.kind === 'inseminacao' && p.news.length) {
        const names = { monta: 'Monta natural', te: 'Transferência de embrião', ia: 'Inseminação no cio', iatf: 'IATF' }
        await t.insert('breeding_attempts', p.news.map((a) => ({
          animal_id: a.id, method: p.method, protocol_id: null, protocol_name: names[p.method], steps: [], steps_done: [],
          start_date: p.date, insemination_date: p.date, sire: p.sire, technician: p.technician, diagnosis_date: null,
          result: 'pendente', expected_calving_date: null, calving_date: null, calf_id: null, notes: via
        })))
      }
      break
    }
    case 'diagnostico': {
      for (const e of p.entries) {
        const attempt = attemptById.get(e.attempt_id)
        if (!attempt) continue
        const idx = attempt.steps.findIndex((s) => s.kind === 'diagnostico')
        const steps_done = idx >= 0 && !attempt.steps_done.some((s) => s.index === idx) ? [...attempt.steps_done, { index: idx, done_at: noon(p.date) }] : attempt.steps_done
        await t.update('breeding_attempts', attempt.id, {
          result: e.result, diagnosis_date: p.date, insemination_date: e.insemination_date, steps_done, expected_calving_date: e.expected_calving_date
        })
      }
      for (const a of p.discard) await t.update('animals', a.id, { status: 'descarte' })
      if (p.discard.length) {
        const max = snapshot.settings.max_breeding_attempts
        await t.insert('occurrences', p.discard.map((a) => ({ animal_id: a.id, type: 'descarte', note: `Descarte reprodutivo: ${max} tentativas seguidas sem prenhez. ${via}.` })))
      }
      break
    }
    case 'parto': {
      let calfId = null
      if (p.outcome === 'nascido' && p.calf) {
        const [calf] = await t.insert('animals', [{
          number: p.calf.number, sex: p.calf.sex, category: p.calf.sex === 'femea' ? 'bezerra' : p.calf.sex === 'macho' ? 'bezerro' : null,
          breed: p.mother.breed, birth_date: p.date, weight: p.calf.weight, lot: p.mother.lot, origin: 'Nascido na fazenda',
          origin_type: 'nascido', mother_id: p.mother.id, sire: p.sire, entry_date: p.date, status: 'normal',
          notes: [p.calf.provisional ? 'Brinco provisório.' : null, p.calf.notes, via].filter(Boolean).join(' ')
        }])
        calfId = calf?.id ?? null
        if (calfId && p.calf.weight) await t.insert('weighings', [{ animal_id: calfId, weighed_at: p.date, weight: p.calf.weight, notes: 'Peso ao nascer' }])
      }
      const result = p.outcome === 'aborto' ? 'aborto' : 'parida'
      if (p.attempt_id) {
        await t.update('breeding_attempts', p.attempt_id, { result, calving_date: p.date, calf_id: calfId })
      } else {
        await t.insert('breeding_attempts', [{
          animal_id: p.mother.id, method: 'monta', protocol_id: null, protocol_name: 'Parto sem cobertura registrada', steps: [], steps_done: [],
          start_date: addDaysISO(p.date, -(snapshot.settings.gestation_days ?? 290)), insemination_date: null, sire: null, technician: null,
          diagnosis_date: null, result, expected_calving_date: null, calving_date: p.date, calf_id: calfId, notes: via
        }])
      }
      if (p.outcome === 'nascido' && p.mother.category === 'novilha') await t.update('animals', p.mother.id, { category: 'vaca' })
      if (p.outcome !== 'nascido' || p.note) {
        const note = p.outcome === 'aborto' ? 'Aborto' : p.outcome === 'natimorto' ? 'Parto com bezerro morto' : 'Parto'
        await t.insert('occurrences', [{ animal_id: p.mother.id, type: 'observacao', note: `${note}${p.note ? `: ${p.note}` : ''}. ${via}.` }])
      }
      break
    }
    case 'sanitario': {
      await t.insert('health_events', p.animals.map((a) => ({
        animal_id: a.id, kind: p.kind, product: p.product, dose: p.dose, applied_at: p.date, next_due_date: p.next_due_date,
        withdrawal_until: p.withdrawal_until, product_batch: p.product_batch, notes: via
      })))
      break
    }
    case 'pesagem': {
      await t.insert('weighings', p.entries.map((e) => ({ animal_id: e.animal_id, weighed_at: p.date, weight: e.weight, notes: via })))
      for (const e of p.entries) {
        const newer = snapshot.weighings.some((w) => w.animal_id === e.animal_id && w.weighed_at > p.date)
        if (!newer) await t.update('animals', e.animal_id, { weight: e.weight })
      }
      break
    }
    case 'ocorrencia': {
      await t.insert('occurrences', p.animals.map((a) => ({ animal_id: a.id, type: p.type, note: `${p.note} (${via})` })))
      if (p.next_status) for (const a of p.animals) if (a.status !== p.next_status) await t.update('animals', a.id, { status: p.next_status })
      break
    }
    case 'saida': {
      const reasonWord = { morto: 'Morte', vendido: 'Venda', abatido: 'Abate' }[p.status]
      for (const a of p.animals) await t.update('animals', a.id, { status: p.status, exit_date: p.date, exit_reason: p.reason ?? reasonWord })
      await t.insert('occurrences', p.animals.map((a) => ({
        animal_id: a.id, type: p.status === 'morto' ? 'morte' : 'outro', note: `${reasonWord} em ${p.date}${p.reason ? `: ${p.reason}` : ''}. ${via}.`
      })))
      break
    }
    case 'lote': {
      for (const a of p.animals) await t.update('animals', a.id, { lot: p.lot })
      break
    }
    case 'contagem': {
      await t.insert('counts', [{
        title: p.title, mode: 'individual', expected_total: p.expected, total_counted: p.numbers.length, animal_numbers: p.numbers,
        notes: [p.absent.length ? `Faltaram: ${p.absent.join(', ')}` : null, via].filter(Boolean).join('. ')
      }])
      break
    }
    default:
      throw new Error(`Tipo de lançamento sem gravação: ${action.kind}`)
  }
}

/** Desfaz na ordem inversa: apaga o que foi criado e devolve o valor anterior do que foi alterado. */
export async function undoAction(store, action) {
  const refs = [...(action.result_refs ?? [])].reverse()
  const inserted = new Map()
  for (const ref of refs) {
    if (ref.op === 'update') await store.updateRow(ref.table, ref.id, ref.before)
    else {
      if (!inserted.has(ref.table)) inserted.set(ref.table, [])
      inserted.get(ref.table).push(ref.id)
    }
  }
  // Pesagens e ocorrências antes dos animais, por causa das chaves estrangeiras.
  const order = ['weighings', 'health_events', 'occurrences', 'counts', 'breeding_attempts', 'animals']
  for (const table of order) if (inserted.has(table)) await store.deleteRows(table, inserted.get(table))
}
