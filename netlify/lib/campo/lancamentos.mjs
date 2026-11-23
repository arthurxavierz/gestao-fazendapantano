// Preparação dos lançamentos.
//
// A IA diz o que entendeu; este arquivo confere tudo contra o rebanho antes de
// qualquer gravação. Cada preparo devolve:
//   problems  -> impede o lançamento (a IA pergunta de novo ao peão)
//   warnings  -> não impede, mas aparece no resumo de confirmação
//   payload   -> exatamente o que será gravado, com os ids já resolvidos
//   summary   -> o texto que o peão confirma no WhatsApp
// Nada aqui grava. A gravação só acontece em aplicar.mjs, depois do "Confirmar".

import { healthPresets } from '../../../src/domain/health.ts'
import { expectedCalving, reachesDiscard } from '../../../src/domain/reproduction.ts'
import {
  animalCategory, findAnimal, isActive, isBreedingFemale, nextStep, normNumber, ownAttempts, pendingAttempt,
  resolveNumbers, settingsOf, stateOf, STATUS_LABEL, reproStateLabel
} from './rebanho.mjs'
import { addDaysISO, br, diffDays, isoDate } from './tempo.mjs'

export const KIND_LABEL = {
  protocolo_inicio: 'Início de protocolo',
  protocolo_etapa: 'Etapa de protocolo',
  inseminacao: 'Inseminação / cobertura',
  diagnostico: 'Diagnóstico de gestação',
  parto: 'Parto',
  sanitario: 'Sanitário',
  pesagem: 'Pesagem',
  ocorrencia: 'Ocorrência',
  saida: 'Saída do rebanho',
  lote: 'Troca de lote',
  contagem: 'Contagem',
  desfazer: 'Desfazer lançamento'
}

const HEALTH_KINDS = ['vacina', 'vermifugo', 'carrapaticida', 'medicamento', 'exame', 'outro']
const sortNumbers = (list) => [...list].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }))

/** Lista de brincos legível, sem estourar a mensagem do WhatsApp. */
export function numbersText(list, max = 40) {
  const sorted = sortNumbers(list)
  if (sorted.length <= max) return sorted.join(', ')
  return `${sorted.slice(0, max).join(', ')} e mais ${sorted.length - max}`
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

function fail(...problems) {
  return { ok: false, problems: problems.flat().filter(Boolean), warnings: [] }
}

/** Data do manejo: a dita pelo peão ("ontem") ou a data em que a mensagem foi gravada. */
export function resolveDate(raw, ctx) {
  const fallback = ctx.eventDate ?? isoDate()
  if (!raw) return { date: fallback }
  const value = String(raw).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T12:00:00`).getTime())) {
    return { problem: `A data "${value}" não é válida.` }
  }
  const today = ctx.today ?? isoDate()
  if (value > addDaysISO(today, 1)) return { problem: `A data ${br(value)} está no futuro.` }
  const warning = diffDays(value, today) > 120 ? `Data antiga: ${br(value)}. Confira se é isso mesmo.` : null
  return { date: value, warning }
}

function missingProblems(missing) {
  return missing.map((m) => (m.suggestions.length
    ? `Não achei o brinco ${m.number} no rebanho. Seria ${m.suggestions.join(' ou ')}?`
    : `Não achei o brinco ${m.number} no rebanho.`))
}

/**
 * Resolve números e aplica as regras comuns. Inexistentes bloqueiam, a não ser
 * no fechamento de um lote (onde já foram avisados um a um durante a lida).
 */
function resolveList(snapshot, numbers, ctx, { allowMissing = false } = {}) {
  if (!numbers?.length) return { problems: ['Nenhum brinco foi informado.'] }
  const { found, missing, repeated } = resolveNumbers(snapshot, numbers)
  const warnings = []
  const problems = []
  if (missing.length) {
    if (allowMissing) warnings.push(`Ficaram de fora por não existirem no rebanho: ${numbersText(missing.map((m) => m.number))}.`)
    else problems.push(...missingProblems(missing))
  }
  if (repeated.length) warnings.push(`Repetidos (contados uma vez só): ${numbersText([...new Set(repeated)])}.`)
  const gone = found.filter((a) => !isActive(a))
  if (gone.length) problems.push(`Já saíram do rebanho: ${gone.map((a) => `${a.number} (${STATUS_LABEL[a.status]})`).join(', ')}.`)
  return { found: found.filter(isActive), problems, warnings }
}

function withDate(ctx, raw, warnings) {
  const d = resolveDate(raw, ctx)
  if (d.warning) warnings.push(d.warning)
  return d
}

// ------------------------------------------------------------------

function findProtocol(snapshot, name) {
  const protocols = snapshot.protocols.filter((p) => p.active !== false)
  if (!name) return { options: protocols }
  const key = String(name).toLowerCase()
  const exact = protocols.find((p) => p.name.toLowerCase() === key)
  if (exact) return { protocol: exact }
  const partial = protocols.filter((p) => p.name.toLowerCase().includes(key) || key.includes(p.name.toLowerCase()))
  if (partial.length === 1) return { protocol: partial[0] }
  // "IATF de 3 manejos" e parecidos: compara palavras-chave e números.
  const tokens = key.match(/[a-z]+|\d+/g) ?? []
  const scored = protocols.map((p) => ({ p, score: tokens.filter((t) => p.name.toLowerCase().includes(t)).length })).sort((a, b) => b.score - a.score)
  if (scored[0]?.score && scored[0].score > (scored[1]?.score ?? 0)) return { protocol: scored[0].p }
  return { options: partial.length ? partial : protocols }
}

export function prepareProtocolStart(snapshot, input, ctx) {
  const warnings = []
  const { protocol, options } = findProtocol(snapshot, input.protocolo)
  if (!protocol) {
    return fail(`Qual protocolo? Os cadastrados são: ${options.map((p) => `"${p.name}"`).join(', ')}.`)
  }
  const d = withDate(ctx, input.data, warnings)
  if (d.problem) return fail(d.problem)
  const list = resolveList(snapshot, input.numeros, ctx, ctx)
  if (list.problems?.length) return fail(list.problems)
  warnings.push(...list.warnings)
  const settings = settingsOf(snapshot)
  const keep = []
  const out = { macho: [], protocolo: [], prenhe: [], descarte: [] }
  for (const animal of list.found) {
    if (animal.sex === 'macho') { out.macho.push(animal.number); continue }
    const state = stateOf(snapshot, animal)
    const own = ownAttempts(snapshot, animal.id)
    const pending = pendingAttempt(own)
    if (pending) { out.protocolo.push(`${animal.number} (desde ${br(pending.start_date)})`); continue }
    if (state === 'prenhe') { out.prenhe.push(animal.number); continue }
    if (state === 'descarte') { out.descarte.push(animal.number); continue }
    if (!isBreedingFemale(animal, settings)) warnings.push(`${animal.number} está abaixo da idade mínima de ${settings.min_breeding_age_months} meses.`)
    keep.push(animal)
  }
  if (out.macho.length) warnings.push(`Machos ficaram de fora: ${numbersText(out.macho)}.`)
  if (out.protocolo.length) warnings.push(`Já estão em protocolo e ficaram de fora: ${out.protocolo.join(', ')}.`)
  if (out.prenhe.length) warnings.push(`Estão prenhes e ficaram de fora: ${numbersText(out.prenhe)}.`)
  if (out.descarte.length) warnings.push(`Estão marcadas para descarte e ficaram de fora: ${numbersText(out.descarte)}.`)
  if (!keep.length) return fail('Nenhum animal da lista pode entrar no protocolo.', warnings)
  const steps = [...protocol.steps].sort((a, b) => a.day - b.day)
  const firstDue = steps.find((s) => s.day > 0)
  return {
    ok: true,
    warnings,
    payload: {
      protocol: { id: protocol.id && !String(protocol.id).startsWith('default-') ? protocol.id : null, name: protocol.name, method: protocol.method, steps },
      animals: keep.map((a) => ({ id: a.id, number: a.number })),
      start_date: d.date,
      sire: input.touro || null,
      technician: input.tecnico || null
    },
    summary: [
      `*${KIND_LABEL.protocolo_inicio}*`,
      `Protocolo: ${protocol.name}`,
      `D0: ${br(d.date)}${firstDue ? ` · próxima etapa D${firstDue.day} em ${br(addDaysISO(d.date, firstDue.day))}` : ''}`,
      input.touro ? `Touro/sêmen: ${input.touro}` : null,
      `${plural(keep.length, 'fêmea', 'fêmeas')}: ${numbersText(keep.map((a) => a.number))}`
    ].filter(Boolean).join('\n'),
    animalCount: keep.length
  }
}

const STEP_KIND_WORD = { retirada: 'retirada', inseminacao: 'inseminação', aplicacao: 'aplicação', diagnostico: 'diagnóstico', outro: 'etapa' }

export function prepareProtocolStep(snapshot, input, ctx) {
  const warnings = []
  const d = withDate(ctx, input.data, warnings)
  if (d.problem) return fail(d.problem)
  let animals
  if (input.inicio_protocolo) {
    const ids = new Set(snapshot.attempts.filter((t) => t.result === 'pendente' && t.start_date === input.inicio_protocolo).map((t) => t.animal_id))
    animals = snapshot.animals.filter((a) => ids.has(a.id) && isActive(a))
    if (!animals.length) return fail(`Não há protocolo em andamento iniciado em ${br(input.inicio_protocolo)}.`)
  } else {
    const list = resolveList(snapshot, input.numeros, ctx, ctx)
    if (list.problems?.length) return fail(list.problems)
    warnings.push(...list.warnings)
    animals = list.found
  }
  const wanted = input.etapa && input.etapa !== 'proxima' ? input.etapa : null
  const items = []
  const skipped = []
  for (const animal of animals) {
    const attempt = pendingAttempt(ownAttempts(snapshot, animal.id))
    if (!attempt || !attempt.steps?.length) { skipped.push(`${animal.number} (sem protocolo em andamento)`); continue }
    const done = new Set(attempt.steps_done.map((s) => s.index))
    let index
    if (wanted) index = attempt.steps.findIndex((s, i) => s.kind === wanted && !done.has(i))
    else index = nextStep(attempt)?.index ?? -1
    if (index < 0) { skipped.push(`${animal.number} (${wanted ? `sem ${STEP_KIND_WORD[wanted]} pendente` : 'protocolo já concluído'})`); continue }
    const step = attempt.steps[index]
    if (step.kind === 'diagnostico') { skipped.push(`${animal.number} (a próxima etapa é o diagnóstico: mande prenhe ou vazia)`); continue }
    const due = addDaysISO(attempt.start_date, step.day)
    if (Math.abs(diffDays(due, d.date)) > 2) warnings.push(`${animal.number}: a etapa "${step.title}" estava prevista para ${br(due)}.`)
    items.push({ attempt_id: attempt.id, animal_id: animal.id, number: animal.number, step_index: index, step_title: step.title, kind: step.kind })
  }
  if (skipped.length) warnings.push(`Ficaram de fora: ${skipped.join(', ')}.`)
  if (!items.length) return fail('Nenhum animal tem essa etapa pendente.', warnings)
  const titles = [...new Set(items.map((i) => i.step_title))]
  const insem = items.some((i) => i.kind === 'inseminacao')
  return {
    ok: true,
    warnings: dedupe(warnings),
    payload: { items, date: d.date, sire: input.touro || null },
    summary: [
      `*${KIND_LABEL.protocolo_etapa}*`,
      `Etapa: ${titles.join(' / ')}`,
      `Data: ${br(d.date)}`,
      insem && input.touro ? `Touro/sêmen: ${input.touro}` : null,
      `${plural(items.length, 'animal', 'animais')}: ${numbersText(items.map((i) => i.number))}`
    ].filter(Boolean).join('\n'),
    animalCount: items.length
  }
}

export function prepareInsemination(snapshot, input, ctx) {
  const warnings = []
  const d = withDate(ctx, input.data, warnings)
  if (d.problem) return fail(d.problem)
  const list = resolveList(snapshot, input.numeros, ctx, ctx)
  if (list.problems?.length) return fail(list.problems)
  warnings.push(...list.warnings)
  const method = ['ia', 'monta', 'te', 'iatf'].includes(input.metodo) ? input.metodo : 'ia'
  const steps = []
  const news = []
  const out = []
  for (const animal of list.found) {
    if (animal.sex === 'macho') { out.push(`${animal.number} (macho)`); continue }
    const state = stateOf(snapshot, animal)
    if (state === 'prenhe') { out.push(`${animal.number} (prenhe)`); continue }
    const attempt = pendingAttempt(ownAttempts(snapshot, animal.id))
    if (attempt) {
      const done = new Set(attempt.steps_done.map((s) => s.index))
      const index = attempt.steps.findIndex((s, i) => s.kind === 'inseminacao' && !done.has(i))
      if (index >= 0) { steps.push({ attempt_id: attempt.id, animal_id: animal.id, number: animal.number, step_index: index, step_title: attempt.steps[index].title, kind: 'inseminacao' }); continue }
      if (attempt.insemination_date) { out.push(`${animal.number} (já inseminada em ${br(attempt.insemination_date)}, aguardando diagnóstico)`); continue }
      steps.push({ attempt_id: attempt.id, animal_id: animal.id, number: animal.number, step_index: -1, step_title: 'Inseminação', kind: 'inseminacao' })
      continue
    }
    news.push({ id: animal.id, number: animal.number })
  }
  if (out.length) warnings.push(`Ficaram de fora: ${out.join(', ')}.`)
  if (steps.length && news.length) warnings.push(`${plural(steps.length, 'estava', 'estavam')} em protocolo e a inseminação entra como etapa dele.`)
  const total = steps.length + news.length
  if (!total) return fail('Nenhum animal da lista pode ser inseminado agora.', warnings)
  const methodWord = { ia: 'Inseminação no cio', monta: 'Monta natural', te: 'Transferência de embrião', iatf: 'IATF' }[method]
  return {
    ok: true,
    warnings,
    payload: { steps, news, method, date: d.date, sire: input.touro || null, technician: input.tecnico || null },
    summary: [
      `*${KIND_LABEL.inseminacao}*`,
      `Tipo: ${methodWord}`,
      `Data: ${br(d.date)}`,
      input.touro ? `Touro/sêmen: ${input.touro}` : 'Touro/sêmen: não informado',
      `${plural(total, 'fêmea', 'fêmeas')}: ${numbersText([...steps.map((s) => s.number), ...news.map((n) => n.number)])}`
    ].join('\n'),
    animalCount: total
  }
}

export function prepareDiagnosis(snapshot, input, ctx) {
  const warnings = []
  const d = withDate(ctx, input.data, warnings)
  if (d.problem) return fail(d.problem)
  const itens = input.itens ?? []
  if (!itens.length) return fail('Nenhum diagnóstico foi informado.')
  const settings = settingsOf(snapshot)
  const list = resolveList(snapshot, itens.map((i) => i.numero), ctx, ctx)
  if (list.problems?.length) return fail(list.problems)
  warnings.push(...list.warnings)
  const entries = []
  const discard = []
  const skipped = []
  for (const item of itens) {
    const animal = findAnimal(snapshot, item.numero)
    if (!animal || !isActive(animal) || entries.some((e) => e.animal_id === animal.id)) continue
    const result = item.resultado === 'prenhe' ? 'prenhe' : item.resultado === 'vazia' ? 'vazia' : null
    if (!result) { skipped.push(`${animal.number} (resultado não entendido)`); continue }
    const own = ownAttempts(snapshot, animal.id)
    const attempt = pendingAttempt(own)
    if (!attempt) { skipped.push(`${animal.number} (sem cobertura em andamento)`); continue }
    if (!attempt.insemination_date && attempt.steps.some((s) => s.kind === 'inseminacao')) warnings.push(`${animal.number} não tinha inseminação marcada. Vou considerar a do protocolo.`)
    const insemination = attempt.insemination_date ?? attempt.start_date
    if (diffDays(insemination, d.date) < 25) warnings.push(`${animal.number}: só ${diffDays(insemination, d.date)} dias desde a inseminação.`)
    const entry = {
      attempt_id: attempt.id, animal_id: animal.id, number: animal.number, result,
      insemination_date: insemination,
      expected_calving_date: result === 'prenhe' ? expectedCalving(insemination, settings) : null
    }
    if (reachesDiscard(own, attempt.id, result, settings)) discard.push({ id: animal.id, number: animal.number })
    entries.push(entry)
  }
  if (skipped.length) warnings.push(`Ficaram de fora: ${skipped.join(', ')}.`)
  if (!entries.length) return fail('Nenhum diagnóstico pôde ser lançado.', warnings)
  if (discard.length) warnings.push(`🔴 Atingem ${settings.max_breeding_attempts} tentativas sem prenhez e vão para DESCARTE: ${numbersText(discard.map((x) => x.number))}.`)
  const pos = entries.filter((e) => e.result === 'prenhe')
  const neg = entries.filter((e) => e.result === 'vazia')
  return {
    ok: true,
    warnings,
    payload: { entries, date: d.date, discard },
    summary: [
      `*${KIND_LABEL.diagnostico}* em ${br(d.date)}`,
      pos.length ? `🟢 Prenhes (${pos.length}): ${numbersText(pos.map((e) => e.number))}` : null,
      neg.length ? `⚪ Vazias (${neg.length}): ${numbersText(neg.map((e) => e.number))}` : null,
      `Taxa de prenhez: ${Math.round((pos.length / entries.length) * 100)}%`
    ].filter(Boolean).join('\n'),
    animalCount: entries.length
  }
}

export function prepareCalving(snapshot, input, ctx) {
  const warnings = []
  const d = withDate(ctx, input.data, warnings)
  if (d.problem) return fail(d.problem)
  const mother = findAnimal(snapshot, input.numero_mae)
  if (!mother) return fail(missingProblems([{ number: normNumber(input.numero_mae), suggestions: [] }]))
  if (!isActive(mother)) return fail(`A ${mother.number} já saiu do rebanho (${STATUS_LABEL[mother.status]}).`)
  if (mother.sex !== 'femea') return fail(`O ${mother.number} está cadastrado como macho.`)
  const own = ownAttempts(snapshot, mother.id)
  const last = own[own.length - 1]
  const attempt = last && (last.result === 'prenhe' || last.result === 'pendente') ? last : null
  if (!attempt) warnings.push(`A ${mother.number} não tinha gestação registrada. Vou registrar o parto mesmo assim.`)
  else if (attempt.result === 'pendente') warnings.push(`A ${mother.number} ainda não tinha diagnóstico de prenhez.`)
  else if (attempt.expected_calving_date && Math.abs(diffDays(attempt.expected_calving_date, d.date)) > 20) {
    warnings.push(`O parto estava previsto para ${br(attempt.expected_calving_date)}.`)
  }
  const outcome = input.resultado === 'aborto' ? 'aborto' : input.resultado === 'natimorto' ? 'natimorto' : 'nascido'
  let calf = null
  if (outcome === 'nascido') {
    const sex = input.bezerro_sexo === 'macho' || input.bezerro_sexo === 'femea' ? input.bezerro_sexo : 'nao_informado'
    let number = input.bezerro_numero ? normNumber(input.bezerro_numero) : ''
    let provisional = false
    if (number && findAnimal(snapshot, number)) return fail(`Já existe um animal com o brinco ${number}. Qual é o brinco do bezerro?`)
    if (!number) {
      number = `BZ${normNumber(mother.number)}-${d.date.slice(8, 10)}${d.date.slice(5, 7)}`
      provisional = true
      warnings.push(`Bezerro sem brinco: cadastrado como ${number} (provisório). Troque quando brincar.`)
    }
    if (sex === 'nao_informado') warnings.push('Sexo do bezerro não informado.')
    const weight = input.bezerro_peso ? Number(input.bezerro_peso) : null
    if (weight && (weight < 10 || weight > 80)) warnings.push(`Peso ao nascer de ${weight} kg está fora do comum.`)
    calf = { number, sex, weight, provisional, notes: input.observacao || null }
  }
  const sexWord = calf ? { macho: 'macho', femea: 'fêmea', nao_informado: 'sexo não informado' }[calf.sex] : null
  return {
    ok: true,
    warnings,
    payload: {
      mother: { id: mother.id, number: mother.number, lot: mother.lot ?? null, breed: mother.breed ?? null, category: animalCategory(mother) },
      attempt_id: attempt?.id ?? null,
      sire: attempt?.sire ?? null,
      date: d.date,
      outcome,
      calf,
      note: input.observacao || null
    },
    summary: [
      `*${outcome === 'nascido' ? 'Parto' : outcome === 'aborto' ? 'Aborto' : 'Parto com bezerro morto'}*`,
      `Mãe: ${mother.number}${mother.lot ? ` (lote ${mother.lot})` : ''}`,
      `Data: ${br(d.date)}`,
      calf ? `Bezerro: ${calf.number}, ${sexWord}${calf.weight ? `, ${calf.weight} kg` : ''}` : null,
      input.observacao ? `Obs.: ${input.observacao}` : null
    ].filter(Boolean).join('\n'),
    animalCount: 1
  }
}

export function prepareHealth(snapshot, input, ctx) {
  const warnings = []
  const d = withDate(ctx, input.data, warnings)
  if (d.problem) return fail(d.problem)
  const product = String(input.produto ?? '').trim()
  if (!product) return fail('Qual produto foi aplicado?')
  let animals
  if (input.lote && !input.numeros?.length) {
    animals = snapshot.animals.filter((a) => isActive(a) && String(a.lot ?? '').toLowerCase() === String(input.lote).toLowerCase())
    if (!animals.length) return fail(`Não achei animais ativos no lote "${input.lote}".`)
  } else {
    const list = resolveList(snapshot, input.numeros, ctx, ctx)
    if (list.problems?.length) return fail(list.problems)
    warnings.push(...list.warnings)
    animals = list.found
  }
  const preset = healthPresets.find((p) => p.product.toLowerCase().includes(product.toLowerCase()) || product.toLowerCase().includes(p.product.toLowerCase().split(' ')[0]))
  const kind = HEALTH_KINDS.includes(input.tipo) ? input.tipo : preset?.kind ?? 'outro'
  let withdrawalDays = Number.isFinite(input.carencia_dias) ? input.carencia_dias : null
  let repeatDays = Number.isFinite(input.proxima_dose_dias) ? input.proxima_dose_dias : null
  if (withdrawalDays == null && preset?.withdrawalDays) { withdrawalDays = preset.withdrawalDays; warnings.push(`Carência padrão de ${withdrawalDays} dias para ${preset.product}.`) }
  if (repeatDays == null && preset?.repeatDays) { repeatDays = preset.repeatDays; warnings.push(`Próxima dose marcada para daqui a ${repeatDays} dias (padrão de ${preset.product}).`) }
  if (/brucel/i.test(product)) {
    const wrong = animals.filter((a) => a.sex !== 'femea')
    if (wrong.length) warnings.push(`Brucelose é para fêmeas. Machos na lista: ${numbersText(wrong.map((a) => a.number))}.`)
  }
  const already = animals.filter((a) => snapshot.health.some((h) => h.animal_id === a.id && h.applied_at === d.date && h.product.toLowerCase() === product.toLowerCase()))
  if (already.length) warnings.push(`Já tinham ${product} lançado nesse dia: ${numbersText(already.map((a) => a.number))}.`)
  const withdrawal_until = withdrawalDays ? addDaysISO(d.date, withdrawalDays) : null
  const next_due_date = repeatDays ? addDaysISO(d.date, repeatDays) : null
  return {
    ok: true,
    warnings,
    payload: {
      animals: animals.map((a) => ({ id: a.id, number: a.number })),
      kind, product, dose: input.dose || null, date: d.date, withdrawal_until, next_due_date, product_batch: input.partida || null
    },
    summary: [
      `*${KIND_LABEL.sanitario}*`,
      `Produto: ${product}${input.dose ? ` (${input.dose})` : ''}`,
      `Data: ${br(d.date)}`,
      withdrawal_until ? `Carência até ${br(withdrawal_until)}` : null,
      next_due_date ? `Próxima dose: ${br(next_due_date)}` : null,
      `${plural(animals.length, 'animal', 'animais')}${input.lote && !input.numeros?.length ? ` (lote ${input.lote} inteiro)` : ''}: ${numbersText(animals.map((a) => a.number))}`
    ].filter(Boolean).join('\n'),
    animalCount: animals.length
  }
}

export function prepareWeighing(snapshot, input, ctx) {
  const warnings = []
  const d = withDate(ctx, input.data, warnings)
  if (d.problem) return fail(d.problem)
  const itens = (input.itens ?? []).filter((i) => i && i.numero)
  if (!itens.length) return fail('Nenhuma pesagem foi informada.')
  const list = resolveList(snapshot, itens.map((i) => i.numero), ctx, ctx)
  if (list.problems?.length) return fail(list.problems)
  warnings.push(...list.warnings)
  const entries = []
  const problems = []
  for (const item of itens) {
    const animal = findAnimal(snapshot, item.numero)
    if (!animal || !isActive(animal) || entries.some((e) => e.animal_id === animal.id)) continue
    const weight = Number(item.peso)
    if (!Number.isFinite(weight) || weight < 15 || weight > 1500) { problems.push(`Peso de ${animal.number} não está claro (${item.peso}).`); continue }
    const last = snapshot.weighings.filter((w) => w.animal_id === animal.id && w.weighed_at < d.date).sort((a, b) => b.weighed_at.localeCompare(a.weighed_at))[0]
    if (last && Math.abs(weight - last.weight) / last.weight > 0.3) warnings.push(`${animal.number}: ${weight} kg, mas pesava ${last.weight} kg em ${br(last.weighed_at)}.`)
    entries.push({ animal_id: animal.id, number: animal.number, weight, previous: last ? Number(last.weight) : null })
  }
  if (problems.length) return fail(problems)
  if (!entries.length) return fail('Nenhuma pesagem pôde ser lançada.')
  const avg = Math.round(entries.reduce((s, e) => s + e.weight, 0) / entries.length)
  return {
    ok: true,
    warnings,
    payload: { entries, date: d.date },
    summary: [
      `*${KIND_LABEL.pesagem}* em ${br(d.date)}`,
      entries.length <= 12 ? entries.map((e) => `${e.number}: ${e.weight} kg`).join('\n') : `${entries.length} animais`,
      `Média: ${avg} kg (${(avg / 30).toFixed(1).replace('.', ',')} @)`
    ].join('\n'),
    animalCount: entries.length
  }
}

const OCC_TYPES = ['observacao', 'doenca', 'recuperado', 'outro']
const OCC_WORD = { observacao: 'Observação', doenca: 'Doença', recuperado: 'Recuperado', outro: 'Registro' }

export function prepareOccurrence(snapshot, input, ctx) {
  const list = resolveList(snapshot, input.numeros ?? (input.numero ? [input.numero] : []), ctx, ctx)
  if (list.problems?.length) return fail(list.problems)
  const note = String(input.nota ?? '').trim()
  if (!note) return fail('O que aconteceu com o animal?')
  const type = OCC_TYPES.includes(input.tipo) ? input.tipo : 'observacao'
  const nextStatus = { observacao: 'observacao', doenca: 'doente', recuperado: 'normal', outro: null }[type]
  return {
    ok: true,
    warnings: list.warnings,
    payload: { animals: list.found.map((a) => ({ id: a.id, number: a.number, status: a.status })), type, note, next_status: nextStatus },
    summary: [
      `*${KIND_LABEL.ocorrencia}: ${OCC_WORD[type]}*`,
      `${list.found.length === 1 ? 'Animal' : 'Animais'}: ${numbersText(list.found.map((a) => a.number))}`,
      `"${note}"`,
      nextStatus ? `Situação passa para: ${STATUS_LABEL[nextStatus]}` : null
    ].filter(Boolean).join('\n'),
    animalCount: list.found.length
  }
}

export function prepareExit(snapshot, input, ctx) {
  const warnings = []
  const d = withDate(ctx, input.data, warnings)
  if (d.problem) return fail(d.problem)
  const list = resolveList(snapshot, input.numeros ?? (input.numero ? [input.numero] : []), ctx, ctx)
  if (list.problems?.length) return fail(list.problems)
  const status = { morte: 'morto', venda: 'vendido', abate: 'abatido' }[input.motivo]
  if (!status) return fail('Foi morte, venda ou abate?')
  if (status !== 'morto') {
    const blocked = list.found.filter((a) => snapshot.health.some((h) => h.animal_id === a.id && h.withdrawal_until && h.withdrawal_until >= d.date))
    if (blocked.length) warnings.push(`⚠ Em carência de medicamento: ${numbersText(blocked.map((a) => a.number))}. Confira antes de embarcar.`)
  }
  const pregnant = list.found.filter((a) => stateOf(snapshot, a) === 'prenhe')
  if (pregnant.length) warnings.push(`Estão prenhes: ${numbersText(pregnant.map((a) => a.number))}.`)
  return {
    ok: true,
    warnings: [...list.warnings, ...warnings],
    payload: { animals: list.found.map((a) => ({ id: a.id, number: a.number, status: a.status, exit_date: a.exit_date ?? null, exit_reason: a.exit_reason ?? null })), status, date: d.date, reason: input.nota || null },
    summary: [
      `*${KIND_LABEL.saida}: ${{ morto: 'Morte', vendido: 'Venda', abatido: 'Abate' }[status]}*`,
      `Data: ${br(d.date)}`,
      `${plural(list.found.length, 'animal', 'animais')}: ${numbersText(list.found.map((a) => a.number))}`,
      input.nota ? `Motivo: ${input.nota}` : null
    ].filter(Boolean).join('\n'),
    animalCount: list.found.length
  }
}

export function prepareLotChange(snapshot, input, ctx) {
  const lot = String(input.lote ?? '').trim()
  if (!lot) return fail('Para qual lote?')
  const list = resolveList(snapshot, input.numeros, ctx, ctx)
  if (list.problems?.length) return fail(list.problems)
  const moving = list.found.filter((a) => (a.lot ?? '') !== lot)
  const same = list.found.filter((a) => (a.lot ?? '') === lot)
  const warnings = [...list.warnings]
  if (same.length) warnings.push(`Já estavam no lote ${lot}: ${numbersText(same.map((a) => a.number))}.`)
  if (!moving.length) return fail(`Todos já estão no lote ${lot}.`)
  const known = new Set(snapshot.animals.map((a) => a.lot).filter(Boolean))
  if (!known.has(lot)) warnings.push(`Lote novo: "${lot}" ainda não existia.`)
  return {
    ok: true,
    warnings,
    payload: { animals: moving.map((a) => ({ id: a.id, number: a.number, lot: a.lot ?? null })), lot },
    summary: [`*${KIND_LABEL.lote}*`, `Destino: lote ${lot}`, `${plural(moving.length, 'animal', 'animais')}: ${numbersText(moving.map((a) => a.number))}`].join('\n'),
    animalCount: moving.length
  }
}

export function prepareCount(snapshot, input, ctx) {
  const { found, missing, repeated } = resolveNumbers(snapshot, input.numeros ?? [])
  const total = found.length + missing.length
  if (!total) return fail('Nenhum número foi contado.')
  const warnings = []
  if (missing.length) warnings.push(`Não cadastrados no sistema: ${numbersText(missing.map((m) => m.number))}.`)
  if (repeated.length) warnings.push(`Repetidos: ${numbersText([...new Set(repeated)])}.`)
  let expected = null
  let absent = []
  if (input.lote) {
    const lotAnimals = snapshot.animals.filter((a) => isActive(a) && String(a.lot ?? '').toLowerCase() === String(input.lote).toLowerCase())
    expected = lotAnimals.length
    const seen = new Set(found.map((a) => a.id))
    absent = lotAnimals.filter((a) => !seen.has(a.id))
    if (absent.length) warnings.push(`🔴 Faltaram do lote ${input.lote} (${absent.length}): ${numbersText(absent.map((a) => a.number))}.`)
    const foreign = found.filter((a) => String(a.lot ?? '').toLowerCase() !== String(input.lote).toLowerCase())
    if (foreign.length) warnings.push(`São de outro lote: ${foreign.map((a) => `${a.number} (${a.lot ?? 'sem lote'})`).join(', ')}.`)
  }
  const title = input.titulo || `Contagem pelo WhatsApp${input.lote ? `: lote ${input.lote}` : ''}`
  return {
    ok: true,
    warnings,
    payload: { title, numbers: [...found.map((a) => a.number), ...missing.map((m) => m.number)], expected, lot: input.lote ?? null, absent: absent.map((a) => a.number) },
    summary: [`*${KIND_LABEL.contagem}*`, title, `Contados: ${total}${expected != null ? ` de ${expected} esperados` : ''}`].join('\n'),
    animalCount: total
  }
}

function dedupe(list) {
  return [...new Set(list)]
}

export const PREPARERS = {
  protocolo_inicio: prepareProtocolStart,
  protocolo_etapa: prepareProtocolStep,
  inseminacao: prepareInsemination,
  diagnostico: prepareDiagnosis,
  parto: prepareCalving,
  sanitario: prepareHealth,
  pesagem: prepareWeighing,
  ocorrencia: prepareOccurrence,
  saida: prepareExit,
  lote: prepareLotChange,
  contagem: prepareCount
}

export function prepare(kind, snapshot, input, ctx = {}) {
  const fn = PREPARERS[kind]
  if (!fn) return fail(`Tipo de lançamento desconhecido: ${kind}`)
  try {
    return fn(snapshot, input ?? {}, ctx)
  } catch (error) {
    console.error('Falha ao preparar lançamento', kind, error)
    return fail('Não consegui conferir esse lançamento. Tente de novo com outras palavras.')
  }
}

/** Texto do cartão de confirmação enviado ao peão. */
export function confirmationText(prepared, code) {
  const warnings = prepared.warnings?.length ? `\n\n${prepared.warnings.map((w) => (/^[🔴⚠]/u.test(w) ? w : `⚠ ${w}`)).join('\n')}` : ''
  return `${prepared.summary}${warnings}\n\n_Lançamento ${code}. Confere?_`
}

export { reproStateLabel }
