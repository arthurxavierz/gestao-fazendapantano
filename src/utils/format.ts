import type { AnimalStatus, AnimalSex, OccurrenceType } from '../types'

export const statusLabel: Record<AnimalStatus, string> = {
  normal: 'Normal',
  observacao: 'Em observação',
  doente: 'Doente',
  morto: 'Morto',
  vendido: 'Vendido'
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
  outro: 'Outro registro'
}

export function formatDate(value?: string | null) {
  if (!value) return 'Não informado'
  const date = new Date(value)
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
