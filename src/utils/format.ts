import { formatarData, hoje, mesesCompletos } from '../domain/regras'

export { hoje }

/** 10/03/2025 */
export const data = (value?: string | null) => (value ? formatarData(value) : '')

/** 10 mar */
export function dataCurta(value?: string | null) {
  if (!value) return ''
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '')
}

/** "hoje", "ontem", "há 5 dias", ou a data. */
export function relativo(value?: string | null) {
  if (!value) return ''
  const days = Math.round((new Date(`${hoje()}T12:00:00`).getTime() - new Date(`${value.slice(0, 10)}T12:00:00`).getTime()) / 86400000)
  if (days === 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days > 1 && days < 31) return `há ${days} dias`
  return data(value)
}

export function idade(nascimento?: string | null) {
  if (!nascimento) return ''
  const months = mesesCompletos(nascimento)
  if (months < 1) return 'menos de 1 mês'
  if (months < 24) return `${months} ${months === 1 ? 'mês' : 'meses'}`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return `${years} anos${rest ? ` e ${rest} ${rest === 1 ? 'mês' : 'meses'}` : ''}`
}

export const sexoRotulo = (sexo?: string | null) => (sexo === 'M' ? 'Macho' : sexo === 'F' ? 'Fêmea' : 'Sem sexo')

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export const numero = (value?: number | null, digits = 0) =>
  value == null ? '' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)
