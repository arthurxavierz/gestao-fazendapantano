import type { HealthEvent, HealthKind } from '../types'
import { addDays } from '../utils/format'

export interface HealthPreset {
  product: string
  kind: HealthKind
  /** Dias até a próxima dose. Vazio para dose única. */
  repeatDays?: number
  /** Dias de carência para abate. */
  withdrawalDays?: number
  hint: string
}

/**
 * Atalhos para as aplicações mais comuns. O intervalo preenche a próxima dose
 * automaticamente, mas o campo continua editável: quem manda é o calendário
 * sanitário do veterinário.
 */
export const healthPresets: HealthPreset[] = [
  { product: 'Brucelose (B19 / RB51)', kind: 'vacina', hint: 'Fêmeas de 3 a 8 meses. Dose única, obrigatória.' },
  { product: 'Raiva', kind: 'vacina', repeatDays: 365, hint: 'Reforço anual.' },
  { product: 'Clostridioses', kind: 'vacina', repeatDays: 365, hint: 'Primeira dose com reforço em 30 dias, depois anual.' },
  { product: 'Leptospirose', kind: 'vacina', repeatDays: 180, hint: 'Reforço semestral nas matrizes.' },
  { product: 'IBR / BVD', kind: 'vacina', repeatDays: 365, hint: 'Antes da estação de monta.' },
  { product: 'Ivermectina', kind: 'vermifugo', repeatDays: 90, withdrawalDays: 35, hint: 'Vermifugação estratégica.' },
  { product: 'Carrapaticida pour-on', kind: 'carrapaticida', repeatDays: 21, withdrawalDays: 30, hint: 'Repetir conforme infestação.' },
  { product: 'Oxitetraciclina', kind: 'medicamento', withdrawalDays: 28, hint: 'Tratamento. Respeite a carência para abate.' }
]

/**
 * Última aplicação de cada produto em cada animal. É ela que define a próxima
 * dose: uma aplicação mais nova do mesmo produto substitui a pendência anterior.
 */
export function latestByProduct(events: HealthEvent[]) {
  const map = new Map<string, HealthEvent>()
  for (const event of events) {
    const key = `${event.animal_id}::${event.product.trim().toLowerCase()}`
    const current = map.get(key)
    if (!current || event.applied_at > current.applied_at) map.set(key, event)
  }
  return [...map.values()]
}

/** Doses previstas: a última aplicação de cada produto que tem próxima dose marcada. */
export function pendingDoses(events: HealthEvent[]) {
  return latestByProduct(events).filter((event) => event.next_due_date)
}

/** O animal está em carência (não pode ir para abate) nesta data. */
export function inWithdrawal(animalId: string, events: HealthEvent[], date: string) {
  return events.some((event) => event.animal_id === animalId && event.withdrawal_until && event.withdrawal_until >= date)
}

export function presetDates(preset: HealthPreset | undefined, appliedAt: string) {
  return {
    next: preset?.repeatDays ? addDays(appliedAt, preset.repeatDays) : '',
    withdrawal: preset?.withdrawalDays ? addDays(appliedAt, preset.withdrawalDays) : ''
  }
}
