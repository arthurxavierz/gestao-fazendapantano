import type { Animal, BreedingAttempt, FarmSettings, ProtocolStep, ReproProtocol } from '../types'
import { addDays, ageInMonths, daysBetween, todayISO } from '../utils/format'
import { animalCategory, isActive } from './herd'

export const defaultSettings: FarmSettings = {
  max_breeding_attempts: 4,
  gestation_days: 290,
  diagnosis_days: 30,
  min_breeding_age_months: 14
}

/**
 * Onde a matriz está no ciclo reprodutivo. É sempre calculado a partir das
 * tentativas registradas, nunca gravado à parte, para não haver duas versões
 * da verdade.
 */
export type ReproState = 'nao_apta' | 'vazia' | 'em_protocolo' | 'inseminada' | 'prenhe' | 'parida' | 'descarte'

export const reproStateLabel: Record<ReproState, string> = {
  nao_apta: 'Fora da idade',
  vazia: 'Vazia',
  em_protocolo: 'Em protocolo',
  inseminada: 'Aguardando diagnóstico',
  prenhe: 'Prenhe',
  parida: 'Pós-parto',
  descarte: 'Descarte'
}

/** Ordem das colunas no quadro de reprodução. */
export const reproFlow: ReproState[] = ['vazia', 'em_protocolo', 'inseminada', 'prenhe', 'parida']

/** Dias depois do parto em que a vaca é mostrada como "pós-parto" antes de voltar a "vazia". */
const POSTPARTUM_DAYS = 45

export function attemptsOf(animalId: string, attempts: BreedingAttempt[]) {
  return attempts
    .filter((item) => item.animal_id === animalId)
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.created_at.localeCompare(b.created_at))
}

/** Fêmea que pode participar da reprodução: ativa, fêmea e com idade mínima. */
export function isBreedingFemale(animal: Animal, settings: FarmSettings) {
  if (animal.sex !== 'femea' || !isActive(animal)) return false
  const category = animalCategory(animal)
  if (category === 'bezerra') return false
  const months = ageInMonths(animal.birth_date)
  return months == null || months >= settings.min_breeding_age_months
}

export function reproState(animal: Animal, own: BreedingAttempt[], settings: FarmSettings): ReproState {
  if (animal.status === 'descarte') return 'descarte'
  const last = own[own.length - 1]
  if (!last) return isBreedingFemale(animal, settings) ? 'vazia' : 'nao_apta'
  switch (last.result) {
    case 'pendente':
      return last.insemination_date ? 'inseminada' : 'em_protocolo'
    case 'prenhe':
      return 'prenhe'
    case 'parida':
      return last.calving_date && daysBetween(last.calving_date, todayISO()) <= POSTPARTUM_DAYS ? 'parida' : 'vazia'
    default:
      return 'vazia'
  }
}

/**
 * Tentativas seguidas sem prenhez desde a última gestação. Vazia e aborto
 * contam; prenhez ou parto zeram a sequência. Tentativas em andamento não
 * entram, porque ainda não têm resultado.
 */
export function failedStreak(own: BreedingAttempt[]) {
  let streak = 0
  for (const item of own) {
    if (item.result === 'prenhe' || item.result === 'parida') streak = 0
    else if (item.result === 'vazia' || item.result === 'aborto') streak += 1
  }
  return streak
}

/** Número da tentativa atual ou da próxima, para exibir "tentativa 2 de 4". */
export function currentAttemptNumber(own: BreedingAttempt[]) {
  return failedStreak(own) + 1
}

/** A tentativa em andamento é a última antes do descarte. */
export function isLastChance(own: BreedingAttempt[], settings: FarmSettings) {
  return currentAttemptNumber(own) >= settings.max_breeding_attempts
}

/** Ao registrar este resultado, a matriz atinge o limite e deve ir para descarte. */
export function reachesDiscard(own: BreedingAttempt[], attemptId: string, result: BreedingAttempt['result'], settings: FarmSettings) {
  if (result !== 'vazia' && result !== 'aborto') return false
  const simulated = own.map((item) => (item.id === attemptId ? { ...item, result } : item))
  return failedStreak(simulated) >= settings.max_breeding_attempts
}

export function pendingAttempt(own: BreedingAttempt[]) {
  const last = own[own.length - 1]
  return last && last.result === 'pendente' ? last : null
}

export function activePregnancy(own: BreedingAttempt[]) {
  const last = own[own.length - 1]
  return last && last.result === 'prenhe' ? last : null
}

export function stepDueDate(attempt: BreedingAttempt, step: ProtocolStep) {
  return addDays(attempt.start_date, step.day)
}

/** Próximo passo do protocolo que ainda não foi feito. */
export function nextStep(attempt: BreedingAttempt) {
  const done = new Set(attempt.steps_done.map((item) => item.index))
  const index = attempt.steps.findIndex((_, i) => !done.has(i))
  if (index < 0) return null
  return { index, step: attempt.steps[index], due: stepDueDate(attempt, attempt.steps[index]) }
}

/** Data prevista para o diagnóstico de gestação. */
export function diagnosisDue(attempt: BreedingAttempt, settings: FarmSettings) {
  const diagnosisStep = attempt.steps.find((step) => step.kind === 'diagnostico')
  if (diagnosisStep) return stepDueDate(attempt, diagnosisStep)
  if (attempt.insemination_date) return addDays(attempt.insemination_date, settings.diagnosis_days)
  return null
}

/** Data prevista para a inseminação, pelo passo do protocolo. */
export function inseminationDue(attempt: BreedingAttempt) {
  const step = attempt.steps.find((item) => item.kind === 'inseminacao')
  return step ? stepDueDate(attempt, step) : attempt.start_date
}

export function expectedCalving(inseminationDate: string, settings: FarmSettings) {
  return addDays(inseminationDate, settings.gestation_days)
}

/** Dias de gestação a partir da inseminação. */
export function gestationDays(attempt: BreedingAttempt) {
  if (!attempt.insemination_date) return null
  return daysBetween(attempt.insemination_date, todayISO())
}

export interface ReproIndicators {
  females: number
  diagnosed: number
  pregnant: number
  empty: number
  pregnancyRate: number | null
  /** Prenhezes por inseminação realizada (taxa de concepção). */
  conceptionRate: number | null
  inProtocol: number
  awaitingDiagnosis: number
  discard: number
}

/** Indicadores do período (por padrão, os últimos 365 dias). */
export function reproIndicators(
  animals: Animal[],
  attempts: BreedingAttempt[],
  settings: FarmSettings,
  sinceDays = 365
): ReproIndicators {
  const since = addDays(todayISO(), -sinceDays)
  const recent = attempts.filter((item) => item.start_date >= since)
  const diagnosedAttempts = recent.filter((item) => item.result !== 'pendente')
  const positive = diagnosedAttempts.filter((item) => ['prenhe', 'parida'].includes(item.result))
  const inseminated = diagnosedAttempts.filter((item) => item.insemination_date || item.method === 'monta')

  const females = animals.filter((animal) => isBreedingFemale(animal, settings) || animal.status === 'descarte')
  const states = females.map((animal) => reproState(animal, attemptsOf(animal.id, attempts), settings))

  return {
    females: females.filter((animal) => animal.status !== 'descarte').length,
    diagnosed: diagnosedAttempts.length,
    pregnant: states.filter((state) => state === 'prenhe').length,
    empty: states.filter((state) => state === 'vazia').length,
    pregnancyRate: diagnosedAttempts.length ? positive.length / diagnosedAttempts.length : null,
    conceptionRate: inseminated.length ? positive.length / inseminated.length : null,
    inProtocol: states.filter((state) => state === 'em_protocolo').length,
    awaitingDiagnosis: states.filter((state) => state === 'inseminada').length,
    discard: states.filter((state) => state === 'descarte').length
  }
}

/**
 * Protocolos que acompanham o sistema. São pontos de partida comuns em gado de
 * corte; doses e dias devem ser ajustados com o veterinário da fazenda.
 */
export const defaultProtocols: Omit<ReproProtocol, 'id' | 'created_at'>[] = [
  {
    name: 'IATF 3 manejos (D0 · D8 · D10)',
    description: 'Protocolo padrão com implante de progesterona. Ajuste produtos e doses com o veterinário.',
    method: 'iatf',
    active: true,
    steps: [
      { day: 0, kind: 'aplicacao', title: 'Implante de progesterona + Benzoato de estradiol', description: 'Inserir o dispositivo intravaginal e aplicar 2 mg de BE.' },
      { day: 8, kind: 'retirada', title: 'Retirada do implante + PGF2α + eCG + Cipionato', description: 'Remover o dispositivo. Aplicar prostaglandina, eCG e cipionato de estradiol.' },
      { day: 10, kind: 'inseminacao', title: 'Inseminação em tempo fixo', description: 'Inseminar entre 48 e 52 horas após a retirada.' },
      { day: 40, kind: 'diagnostico', title: 'Diagnóstico de gestação', description: 'Ultrassonografia cerca de 30 dias após a IATF.' }
    ]
  },
  {
    name: 'IATF 4 manejos (D0 · D7 · D9 · D11)',
    description: 'Variação com prostaglandina antecipada, comum em novilhas.',
    method: 'iatf',
    active: true,
    steps: [
      { day: 0, kind: 'aplicacao', title: 'Implante de progesterona + Benzoato de estradiol' },
      { day: 7, kind: 'aplicacao', title: 'Aplicação de PGF2α' },
      { day: 9, kind: 'retirada', title: 'Retirada do implante + eCG + Cipionato de estradiol' },
      { day: 11, kind: 'inseminacao', title: 'Inseminação em tempo fixo' },
      { day: 41, kind: 'diagnostico', title: 'Diagnóstico de gestação' }
    ]
  },
  {
    name: 'Repasse com touro',
    description: 'Monta natural para as vazias depois da IATF.',
    method: 'monta',
    active: true,
    steps: [
      { day: 0, kind: 'inseminacao', title: 'Entrada do touro no lote' },
      { day: 60, kind: 'retirada', title: 'Retirada do touro' },
      { day: 90, kind: 'diagnostico', title: 'Diagnóstico de gestação' }
    ]
  }
]
