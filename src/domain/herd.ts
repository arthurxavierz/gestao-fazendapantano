import type { Animal, AnimalCategory, OriginType, Weighing } from '../types'
import { ageInMonths, daysBetween, exitStatuses } from '../utils/format'

/** O animal ainda faz parte do rebanho (não morreu, não foi vendido nem abatido). */
export function isActive(animal: Animal) {
  return !exitStatuses.includes(animal.status)
}

/**
 * Categoria do animal. Usa a informada no cadastro; sem ela, deduz pelo sexo e
 * pela idade. Assim o rebanho que veio da planilha antiga já aparece
 * classificado sem ninguém precisar editar animal por animal.
 */
export function animalCategory(animal: Animal): AnimalCategory | null {
  if (animal.category) return animal.category
  const months = ageInMonths(animal.birth_date)
  if (animal.sex === 'femea') {
    if (months == null) return 'vaca'
    if (months < 12) return 'bezerra'
    if (months < 30) return 'novilha'
    return 'vaca'
  }
  if (animal.sex === 'macho') {
    if (months == null) return 'boi'
    if (months < 12) return 'bezerro'
    if (months < 24) return 'garrote'
    return 'boi'
  }
  return null
}

/** Categoria sugerida para um animal recém-cadastrado, a partir do sexo e do nascimento. */
export function suggestCategory(sex: Animal['sex'], birth?: string | null): AnimalCategory | null {
  return animalCategory({ sex, birth_date: birth, category: null } as Animal)
}

/** Origem estruturada. Cadastros antigos têm só o texto livre, que é interpretado aqui. */
export function originType(animal: Animal): OriginType {
  if (animal.origin_type && animal.origin_type !== 'nao_informado') return animal.origin_type
  if (animal.mother_id) return 'nascido'
  if (animal.purchase_batch_id) return 'comprado'
  const text = (animal.origin ?? '').toLowerCase()
  if (text.includes('nasc')) return 'nascido'
  if (text.includes('compr')) return 'comprado'
  return 'nao_informado'
}

/** Pesagens de um animal em ordem cronológica. */
export function weighingsOf(animalId: string, weighings: Weighing[]) {
  return weighings
    .filter((item) => item.animal_id === animalId)
    .sort((a, b) => a.weighed_at.localeCompare(b.weighed_at))
}

/**
 * Ganho médio diário (kg/dia) entre a primeira e a última pesagem informadas.
 * Precisa de pelo menos dois pontos com dias de intervalo.
 */
export function dailyGain(points: { weighed_at: string; weight: number }[]) {
  if (points.length < 2) return null
  const first = points[0]
  const last = points[points.length - 1]
  const days = daysBetween(first.weighed_at, last.weighed_at)
  if (days <= 0) return null
  return (last.weight - first.weight) / days
}

/** GMD entre as duas últimas pesagens: mostra o ritmo atual, não o histórico inteiro. */
export function recentDailyGain(points: { weighed_at: string; weight: number }[]) {
  return dailyGain(points.slice(-2))
}

export function formatGain(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg/dia`
}

/** Ordena números de brinco como pessoa: 2, 10, 101 (e não 10, 101, 2). */
export function byNumber(a: Animal, b: Animal) {
  return a.number.localeCompare(b.number, 'pt-BR', { numeric: true })
}

/**
 * Expande uma faixa de brincos digitada: "101-105, 110, 120-122".
 * Mantém zeros à esquerda ("001-003" vira 001, 002, 003).
 */
export function expandNumberRange(input: string, limit = 500): string[] {
  const result: string[] = []
  for (const part of input.split(/[,;\s]+/).map((item) => item.trim()).filter(Boolean)) {
    const match = part.match(/^(\d+)\s*[-–a]\s*(\d+)$/)
    if (match) {
      const [, startRaw, endRaw] = match
      const start = Number(startRaw)
      const end = Number(endRaw)
      const width = startRaw.length
      const step = start <= end ? 1 : -1
      for (let n = start; step > 0 ? n <= end : n >= end; n += step) {
        result.push(String(n).padStart(width, '0'))
        if (result.length >= limit) return result
      }
    } else {
      result.push(part)
    }
    if (result.length >= limit) break
  }
  return [...new Set(result)]
}
