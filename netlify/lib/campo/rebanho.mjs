// Leitura do rebanho para o assistente.
//
// Tudo aqui trabalha sobre uma "fotografia" do banco carregada uma vez por
// mensagem. As regras de reprodução são as mesmas das telas (src/domain), para
// o WhatsApp e o sistema nunca darem respostas diferentes.

import './tempo.mjs'
import { animalCategory, isActive } from '../../../src/domain/herd.ts'
import {
  attemptsOf, defaultSettings, diagnosisDue, failedStreak, isBreedingFemale, nextStep, pendingAttempt, reproState, reproStateLabel
} from '../../../src/domain/reproduction.ts'
import { addDaysISO, br, diffDays, isoDate } from './tempo.mjs'

export const STATUS_LABEL = {
  normal: 'normal', observacao: 'em observação', doente: 'doente', descarte: 'descarte (abate)',
  morto: 'morto', vendido: 'vendido', abatido: 'abatido'
}
export const RESULT_LABEL = { pendente: 'em andamento', prenhe: 'prenhe', vazia: 'vazia', aborto: 'aborto', parida: 'parida' }
export { reproStateLabel }

export function emptySnapshot() {
  return { animals: [], attempts: [], health: [], weighings: [], occurrences: [], protocols: [], counts: [], settings: { ...defaultSettings } }
}

export function normNumber(value) {
  return String(value ?? '').trim().replace(/^n[ºo°]?\s*/i, '').replace(/[\s.\-_/]+/g, '').toUpperCase()
}
const stripZeros = (value) => value.replace(/^0+(?=\d)/, '')

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1)
    }
  }
  return dp[a.length][b.length]
}

/** Índice por número do brinco, com e sem zeros à esquerda. */
export function indexAnimals(snapshot) {
  if (snapshot._index) return snapshot._index
  const byNumber = new Map()
  for (const animal of snapshot.animals) {
    const key = normNumber(animal.number)
    // Animal ativo tem prioridade sobre um antigo com o mesmo número.
    const prev = byNumber.get(key)
    if (!prev || (!isActive(prev) && isActive(animal))) byNumber.set(key, animal)
    const loose = stripZeros(key)
    if (loose !== key && !byNumber.has(loose)) byNumber.set(loose, animal)
  }
  const byId = new Map(snapshot.animals.map((a) => [a.id, a]))
  Object.defineProperty(snapshot, '_index', { value: { byNumber, byId }, enumerable: false, configurable: true })
  return snapshot._index
}

export function findAnimal(snapshot, number) {
  const { byNumber } = indexAnimals(snapshot)
  const key = normNumber(number)
  return byNumber.get(key) ?? byNumber.get(stripZeros(key)) ?? null
}

/** Brincos parecidos, para perguntar "seria a 401?" em vez de errar. */
export function suggestNumbers(snapshot, number, limit = 3) {
  const key = stripZeros(normNumber(number))
  return snapshot.animals
    .filter(isActive)
    .map((a) => ({ number: a.number, d: distance(key, stripZeros(normNumber(a.number))) }))
    .filter((x) => x.d === 1)
    .slice(0, limit)
    .map((x) => x.number)
}

/** Resolve uma lista de números: encontrados, inexistentes (com sugestões) e repetidos. */
export function resolveNumbers(snapshot, numbers) {
  const found = []
  const missing = []
  const repeated = []
  const seen = new Set()
  for (const raw of numbers ?? []) {
    const key = normNumber(raw)
    if (!key) continue
    const animal = findAnimal(snapshot, key)
    if (!animal) {
      if (!missing.some((m) => m.number === key)) missing.push({ number: key, suggestions: suggestNumbers(snapshot, key) })
      continue
    }
    if (seen.has(animal.id)) {
      repeated.push(animal.number)
      continue
    }
    seen.add(animal.id)
    found.push(animal)
  }
  return { found, missing, repeated }
}

export function settingsOf(snapshot) {
  return { ...defaultSettings, ...(snapshot.settings ?? {}) }
}

export function ownAttempts(snapshot, animalId) {
  return attemptsOf(animalId, snapshot.attempts)
}

export function stateOf(snapshot, animal) {
  if (animal.sex !== 'femea') return null
  return reproState(animal, ownAttempts(snapshot, animal.id), settingsOf(snapshot))
}

export { animalCategory, isActive, isBreedingFemale, failedStreak, nextStep, pendingAttempt, diagnosisDue }

const CATEGORY_LABEL = { bezerro: 'bezerro', bezerra: 'bezerra', garrote: 'garrote', novilha: 'novilha', vaca: 'vaca', touro: 'touro', boi: 'boi' }

function ageText(birth) {
  if (!birth) return null
  const months = Math.floor(diffDays(birth, isoDate()) / 30.44)
  if (months < 24) return `${months} meses`
  return `${Math.floor(months / 12)} anos`
}

/** Ficha curta de um animal, no formato que a IA lê. */
export function animalCard(snapshot, animal) {
  const own = ownAttempts(snapshot, animal.id)
  const last = own[own.length - 1]
  const settings = settingsOf(snapshot)
  const card = {
    numero: animal.number,
    nome: animal.name || undefined,
    sexo: animal.sex,
    categoria: CATEGORY_LABEL[animalCategory(animal)] ?? null,
    situacao: STATUS_LABEL[animal.status] ?? animal.status,
    ativo: isActive(animal),
    lote: animal.lot || null,
    raca: animal.breed || null,
    idade: ageText(animal.birth_date),
    peso_kg: animal.weight ?? null
  }
  if (animal.sex === 'femea') {
    card.reproducao = reproStateLabel[stateOf(snapshot, animal)]
    card.tentativas_sem_prenhez = failedStreak(own)
    card.limite_tentativas = settings.max_breeding_attempts
    if (last) {
      const next = last.result === 'pendente' ? nextStep(last) : null
      card.ultima_tentativa = {
        protocolo: last.protocol_name,
        inicio: last.start_date,
        inseminacao: last.insemination_date,
        touro: last.sire,
        resultado: RESULT_LABEL[last.result],
        diagnostico: last.diagnosis_date,
        parto_previsto: last.expected_calving_date,
        parto: last.calving_date,
        proxima_etapa: next ? `${next.step.title} (D${next.step.day}, ${br(next.due)})` : null
      }
    }
  }
  const mother = animal.mother_id ? indexAnimals(snapshot).byId.get(animal.mother_id) : null
  if (mother) card.mae = mother.number
  const calves = snapshot.animals.filter((a) => a.mother_id === animal.id)
  if (calves.length) card.crias = calves.map((c) => c.number)
  const health = snapshot.health.filter((h) => h.animal_id === animal.id).sort((a, b) => b.applied_at.localeCompare(a.applied_at)).slice(0, 4)
  if (health.length) card.sanitario_recente = health.map((h) => `${br(h.applied_at)} ${h.product}${h.withdrawal_until && h.withdrawal_until >= isoDate() ? ` (carência até ${br(h.withdrawal_until)})` : ''}`)
  const occ = snapshot.occurrences.filter((o) => o.animal_id === animal.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3)
  if (occ.length) card.ocorrencias_recentes = occ.map((o) => `${br(o.created_at.slice(0, 10))} ${o.type}: ${o.note}`)
  const w = snapshot.weighings.filter((x) => x.animal_id === animal.id).sort((a, b) => a.weighed_at.localeCompare(b.weighed_at))
  if (w.length) card.ultima_pesagem = `${w[w.length - 1].weight} kg em ${br(w[w.length - 1].weighed_at)}`
  return card
}

// ------------------------------------------------------------------
// Consultas. Cada uma devolve números prontos e, quando cabe, a lista de
// brincos (limitada) para a IA citar.
// ------------------------------------------------------------------

const MAX_LIST = 60
const listNumbers = (animals) => {
  const numbers = animals.map((a) => a.number).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
  return numbers.length > MAX_LIST ? [...numbers.slice(0, MAX_LIST), `... e mais ${numbers.length - MAX_LIST}`] : numbers
}

const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to)
const matches = (text, filter) => !filter || String(text ?? '').toLowerCase().includes(String(filter).toLowerCase())

export function queryHerd(snapshot, f = {}) {
  let list = snapshot.animals.filter((a) => (f.incluir_saidas ? true : isActive(a)))
  if (f.lote) list = list.filter((a) => matches(a.lot, f.lote))
  if (f.sexo) list = list.filter((a) => a.sex === f.sexo)
  if (f.categoria) list = list.filter((a) => animalCategory(a) === f.categoria)
  if (f.situacao) list = list.filter((a) => a.status === f.situacao)
  if (f.reproducao) list = list.filter((a) => a.sex === 'femea' && stateOf(snapshot, a) === f.reproducao)
  const group = (key) => list.reduce((acc, a) => {
    const k = key(a) || 'sem informação'
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})
  return {
    total: list.length,
    por_categoria: group((a) => animalCategory(a)),
    por_lote: group((a) => a.lot),
    por_situacao: group((a) => STATUS_LABEL[a.status]),
    ...(f.listar ? { brincos: listNumbers(list) } : {})
  }
}

/** "Quantas vacas entraram no protocolo do dia 10?" */
export function queryReproduction(snapshot, f = {}) {
  const { byId } = indexAnimals(snapshot)
  let list = snapshot.attempts.filter((t) => inRange(t.start_date, f.inicio_de, f.inicio_ate))
  if (f.inseminacao_de || f.inseminacao_ate) list = list.filter((t) => t.insemination_date && inRange(t.insemination_date, f.inseminacao_de, f.inseminacao_ate))
  if (f.protocolo) list = list.filter((t) => matches(t.protocol_name, f.protocolo))
  if (f.resultado) list = list.filter((t) => t.result === f.resultado)
  if (f.touro) list = list.filter((t) => matches(t.sire, f.touro))
  if (f.lote) list = list.filter((t) => matches(byId.get(t.animal_id)?.lot, f.lote))
  if (f.numeros?.length) {
    const ids = new Set(resolveNumbers(snapshot, f.numeros).found.map((a) => a.id))
    list = list.filter((t) => ids.has(t.animal_id))
  }
  // Agrupa por início e protocolo: é assim que o curral pensa ("o protocolo do dia 10").
  const groups = new Map()
  for (const t of list) {
    const key = `${t.start_date}|${t.protocol_name ?? t.method}`
    if (!groups.has(key)) groups.set(key, { inicio: t.start_date, protocolo: t.protocol_name ?? t.method, total: 0, resultados: {}, animais: [] })
    const g = groups.get(key)
    g.total += 1
    g.resultados[RESULT_LABEL[t.result]] = (g.resultados[RESULT_LABEL[t.result]] ?? 0) + 1
    const animal = byId.get(t.animal_id)
    if (animal) g.animais.push(animal)
  }
  const grupos = [...groups.values()]
    .sort((a, b) => b.inicio.localeCompare(a.inicio))
    .slice(0, 12)
    .map((g) => {
      const diag = (g.resultados.prenhe ?? 0) + (g.resultados.parida ?? 0) + (g.resultados.vazia ?? 0) + (g.resultados.aborto ?? 0)
      const pos = (g.resultados.prenhe ?? 0) + (g.resultados.parida ?? 0)
      return {
        inicio: g.inicio, protocolo: g.protocolo, total: g.total, resultados: g.resultados,
        taxa_prenhez: diag ? `${Math.round((pos / diag) * 100)}% de ${diag} diagnosticadas` : 'sem diagnóstico ainda',
        brincos: listNumbers(g.animais)
      }
    })
  const animalsInvolved = new Set(list.map((t) => t.animal_id))
  return { tentativas: list.length, animais_distintos: animalsInvolved.size, grupos }
}

export function queryHealth(snapshot, f = {}) {
  const { byId } = indexAnimals(snapshot)
  let list = snapshot.health.filter((h) => inRange(h.applied_at, f.de, f.ate))
  if (f.produto) list = list.filter((h) => matches(h.product, f.produto))
  if (f.tipo) list = list.filter((h) => h.kind === f.tipo)
  if (f.lote) list = list.filter((h) => matches(byId.get(h.animal_id)?.lot, f.lote))
  if (f.numeros?.length) {
    const ids = new Set(resolveNumbers(snapshot, f.numeros).found.map((a) => a.id))
    list = list.filter((h) => ids.has(h.animal_id))
  }
  const groups = new Map()
  for (const h of list) {
    const key = `${h.applied_at}|${h.product}`
    if (!groups.has(key)) groups.set(key, { data: h.applied_at, produto: h.product, tipo: h.kind, animais: [] })
    const a = byId.get(h.animal_id)
    if (a) groups.get(key).animais.push(a)
  }
  const today = isoDate()
  const inWithdrawal = snapshot.health.filter((h) => h.withdrawal_until && h.withdrawal_until >= today)
  return {
    aplicacoes: list.length,
    grupos: [...groups.values()].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 12)
      .map((g) => ({ data: g.data, produto: g.produto, tipo: g.tipo, animais: g.animais.length, brincos: listNumbers(g.animais) })),
    em_carencia_hoje: listNumbers([...new Set(inWithdrawal.map((h) => byId.get(h.animal_id)).filter(Boolean))])
  }
}

export function queryWeighings(snapshot, f = {}) {
  const { byId } = indexAnimals(snapshot)
  let list = snapshot.weighings.filter((w) => inRange(w.weighed_at, f.de, f.ate))
  if (f.lote) list = list.filter((w) => matches(byId.get(w.animal_id)?.lot, f.lote))
  if (f.numeros?.length) {
    const ids = new Set(resolveNumbers(snapshot, f.numeros).found.map((a) => a.id))
    list = list.filter((w) => ids.has(w.animal_id))
  }
  const byDate = new Map()
  for (const w of list) {
    if (!byDate.has(w.weighed_at)) byDate.set(w.weighed_at, [])
    byDate.get(w.weighed_at).push(w)
  }
  return {
    pesagens: list.length,
    dias: [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10).map(([date, rows]) => ({
      data: date,
      animais: rows.length,
      media_kg: Math.round(rows.reduce((s, r) => s + Number(r.weight), 0) / rows.length),
      arrobas_media: Math.round((rows.reduce((s, r) => s + Number(r.weight), 0) / rows.length / 30) * 10) / 10,
      ...(rows.length <= 25 ? { detalhe: rows.map((r) => `${byId.get(r.animal_id)?.number ?? '?'}: ${r.weight} kg`) } : {})
    }))
  }
}

export function queryOccurrences(snapshot, f = {}) {
  const { byId } = indexAnimals(snapshot)
  let list = snapshot.occurrences.filter((o) => inRange(o.created_at.slice(0, 10), f.de, f.ate))
  if (f.tipo) list = list.filter((o) => o.type === f.tipo)
  if (f.numeros?.length) {
    const ids = new Set(resolveNumbers(snapshot, f.numeros).found.map((a) => a.id))
    list = list.filter((o) => ids.has(o.animal_id))
  }
  return {
    total: list.length,
    itens: list.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 25)
      .map((o) => ({ data: o.created_at.slice(0, 10), brinco: byId.get(o.animal_id)?.number, tipo: o.type, nota: o.note }))
  }
}

/** O que vence nos próximos dias: etapas de protocolo, diagnósticos, partos e reforços. */
export function queryAgenda(snapshot, days = 7) {
  const settings = settingsOf(snapshot)
  const { byId } = indexAnimals(snapshot)
  const today = isoDate()
  const until = addDaysISO(today, days)
  const items = new Map()
  const push = (date, title, animal) => {
    const key = `${date}|${title}`
    if (!items.has(key)) items.set(key, { data: date, atrasado: date < today, tarefa: title, animais: [] })
    items.get(key).animais.push(animal)
  }
  for (const animal of snapshot.animals.filter(isActive)) {
    const own = ownAttempts(snapshot, animal.id)
    const last = own[own.length - 1]
    if (!last) continue
    if (last.result === 'pendente') {
      const next = nextStep(last)
      if (next && next.due <= until && next.step.kind !== 'diagnostico') push(next.due, `${next.step.title} (${last.protocol_name ?? 'protocolo'})`, animal)
      const diag = diagnosisDue(last, settings)
      if (diag && diag <= until && (last.insemination_date || !next || next.step.kind === 'diagnostico')) push(diag, 'Diagnóstico de gestação', animal)
    }
    if (last.result === 'prenhe' && last.expected_calving_date && last.expected_calving_date <= addDaysISO(today, Math.max(days, 15))) push(last.expected_calving_date, 'Parto previsto', animal)
  }
  const latest = new Map()
  for (const h of snapshot.health) {
    const key = `${h.animal_id}|${h.product.toLowerCase()}`
    if (!latest.has(key) || latest.get(key).applied_at < h.applied_at) latest.set(key, h)
  }
  for (const h of latest.values()) {
    const animal = byId.get(h.animal_id)
    if (h.next_due_date && h.next_due_date <= until && animal && isActive(animal)) push(h.next_due_date, `Reforço: ${h.product}`, animal)
  }
  return {
    de: today,
    ate: until,
    tarefas: [...items.values()].sort((a, b) => a.data.localeCompare(b.data)).slice(0, 25)
      .map((i) => ({ ...i, quantidade: i.animais.length, animais: listNumbers(i.animais) }))
  }
}

/** Contexto fixo da fazenda, enviado no início da conversa com a IA. */
export function farmContext(snapshot) {
  const active = snapshot.animals.filter(isActive)
  const lots = {}
  for (const a of active) if (a.lot) lots[a.lot] = (lots[a.lot] ?? 0) + 1
  const products = [...new Set(snapshot.health.slice(-400).map((h) => h.product))].slice(0, 30)
  const sires = [...new Set(snapshot.attempts.map((t) => t.sire).filter(Boolean))].slice(0, 20)
  const settings = settingsOf(snapshot)
  return {
    animais_ativos: active.length,
    lotes: lots,
    protocolos: snapshot.protocols.filter((p) => p.active !== false).map((p) => ({
      nome: p.name, metodo: p.method, etapas: p.steps.map((s) => `D${s.day} ${s.title}`)
    })),
    produtos_ja_usados: products,
    touros_e_semens_ja_usados: sires,
    regras: {
      tentativas_ate_descarte: settings.max_breeding_attempts,
      dias_de_gestacao: settings.gestation_days,
      dias_ate_diagnostico: settings.diagnosis_days,
      idade_minima_reproducao_meses: settings.min_breeding_age_months
    }
  }
}
