import type { AnimalCategory, AnimalSex, AnimalStatus, BreedingMethod, BreedingResult, HealthKind, OccurrenceType, OriginType } from '../types'

export const statusLabel: Record<AnimalStatus, string> = {
  normal: 'Normal',
  observacao: 'Em observação',
  doente: 'Doente',
  descarte: 'Descarte (abate)',
  morto: 'Morto',
  vendido: 'Vendido',
  abatido: 'Abatido'
}

/** Situações em que o animal já saiu do rebanho. */
export const exitStatuses: AnimalStatus[] = ['morto', 'vendido', 'abatido']

export const categoryLabel: Record<AnimalCategory, string> = {
  bezerro: 'Bezerro',
  bezerra: 'Bezerra',
  garrote: 'Garrote',
  novilha: 'Novilha',
  vaca: 'Vaca',
  touro: 'Touro',
  boi: 'Boi'
}

export const originLabel: Record<OriginType, string> = {
  nascido: 'Nascido na fazenda',
  comprado: 'Comprado',
  nao_informado: 'Não informado'
}

export const methodLabel: Record<BreedingMethod, string> = {
  iatf: 'IATF',
  ia: 'Inseminação no cio',
  monta: 'Monta natural',
  te: 'Transferência de embrião'
}

export const resultLabel: Record<BreedingResult, string> = {
  pendente: 'Em andamento',
  prenhe: 'Prenhe',
  vazia: 'Vazia',
  aborto: 'Aborto',
  parida: 'Parida'
}

export const healthKindLabel: Record<HealthKind, string> = {
  vacina: 'Vacina',
  vermifugo: 'Vermífugo',
  carrapaticida: 'Carrapaticida',
  medicamento: 'Medicamento',
  exame: 'Exame',
  outro: 'Outro'
}

export const sexLabel: Record<AnimalSex, string> = {
  macho: 'Macho',
  femea: 'Fêmea',
  nao_informado: 'Não informado'
}

export const occurrenceLabel: Record<OccurrenceType, string> = {
  observacao: 'Observação',
  doenca: 'Doença',
  morte: 'Morte',
  recuperado: 'Recuperado',
  descarte: 'Descarte',
  outro: 'Outro registro'
}

/**
 * Datas sem horário ("2026-05-12") são tratadas como meio-dia local. Sem isso,
 * o fuso de Brasília faria "12/05" aparecer como "11/05".
 */
export function parseDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value)
}

/** Hoje no formato do campo de data (AAAA-MM-DD), no fuso local. */
export function todayISO() {
  return toISODate(new Date())
}

export function toISODate(date: Date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function addDays(value: string, days: number) {
  const date = parseDate(value)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

/** Dias de `from` até `to`. Positivo quando `to` é depois. */
export function daysBetween(from: string, to: string) {
  const a = parseDate(from.slice(0, 10))
  const b = parseDate(to.slice(0, 10))
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/** "hoje", "amanhã", "em 5 dias", "há 3 dias". */
export function relativeDay(value: string) {
  const diff = daysBetween(todayISO(), value)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'amanhã'
  if (diff === -1) return 'ontem'
  return diff > 0 ? `em ${diff} dias` : `há ${-diff} dias`
}

export function formatShortDate(value?: string | null) {
  if (!value) return '—'
  const date = parseDate(value)
  if (Number.isNaN(date.getTime())) return value
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '')
  return `${String(date.getDate()).padStart(2, '0')} ${month}`
}

/** Idade legível a partir do nascimento: "8 meses", "2 anos e 3 meses". */
export function formatAge(birth?: string | null) {
  if (!birth) return 'Não informado'
  const months = ageInMonths(birth)
  if (months == null) return 'Não informado'
  if (months < 1) return 'Menos de 1 mês'
  if (months < 24) return `${months} ${months === 1 ? 'mês' : 'meses'}`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest ? `${years} anos e ${rest} ${rest === 1 ? 'mês' : 'meses'}` : `${years} anos`
}

export function ageInMonths(birth?: string | null) {
  if (!birth) return null
  const days = daysBetween(birth, todayISO())
  if (Number.isNaN(days)) return null
  return Math.max(0, Math.floor(days / 30.44))
}

export function formatCurrency(value?: number | null) {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Arroba de peso vivo estimada com rendimento de carcaça de 50%: 30 kg vivos por @. */
export function formatArroba(weight?: number | null) {
  if (weight == null) return '—'
  return `${(weight / 30).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} @`
}

export function formatPercent(value: number | null, digits = 0) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`
}

export function formatDate(value?: string | null) {
  if (!value) return 'Não informado'
  const date = parseDate(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR').format(date)
}

export function formatDateTime(value: string) {
  const date = new Date(value)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function formatWeight(value?: number | null) {
  return value == null ? 'Não informado' : `${value.toLocaleString('pt-BR')} kg`
}

// "Pelagem" é palavra feminina, então o correto é "pelagem branca", e não
// "pelagem branco". Como o campo é digitado à mão e também preenchido pela IA,
// a concordância é ajustada aqui, num só lugar.
const coatFeminine: Record<string, string> = {
  branco: 'branca',
  preto: 'preta',
  vermelho: 'vermelha',
  amarelo: 'amarela',
  castanho: 'castanha',
  pardo: 'parda',
  baio: 'baia',
  russo: 'russa',
  barroso: 'barrosa',
  pintado: 'pintada',
  malhado: 'malhada',
  rajado: 'rajada',
  manchado: 'manchada',
  salpicado: 'salpicada',
  listrado: 'listrada',
  mesclado: 'mesclada',
  chitado: 'chitada',
  gateado: 'gateada',
  tostado: 'tostada',
  encerado: 'encerada',
  acinzentado: 'acinzentada',
  avermelhado: 'avermelhada',
  amarelado: 'amarelada',
  escuro: 'escura',
  claro: 'clara'
}

/**
 * Normaliza a pelagem para exibição: concorda no feminino e usa inicial
 * maiúscula. "branco acinzentado" vira "Branca acinzentada".
 */
export function formatCoat(value?: string | null) {
  const raw = (value ?? '').trim().replace(/\s+/g, ' ')
  if (!raw) return ''

  const agreed = raw
    .split(' ')
    .map((word) => {
      const lower = word.toLocaleLowerCase('pt-BR')
      return coatFeminine[lower] ?? (lower in coatFeminine ? word : lower)
    })
    .join(' ')

  return agreed.charAt(0).toLocaleUpperCase('pt-BR') + agreed.slice(1)
}
