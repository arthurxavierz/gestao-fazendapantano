import type { Animal, AnimalSex, AnimalStatus } from '../types'
import { formatCoat } from './format'

/** Campos do cadastro que a planilha pode alimentar. */
export type ImportField =
  | 'number' | 'breed' | 'coat' | 'sex' | 'birth_date'
  | 'weight' | 'lot' | 'origin' | 'status' | 'notes'

export const importFieldLabel: Record<ImportField, string> = {
  number: 'Número do animal',
  breed: 'Raça',
  coat: 'Pelagem',
  sex: 'Sexo',
  birth_date: 'Data de nascimento',
  weight: 'Peso em kg',
  lot: 'Local ou lote',
  origin: 'Origem',
  status: 'Situação',
  notes: 'Observações'
}

/**
 * Palavras que costumam aparecer no cabeçalho de cada campo. Como as planilhas
 * do produtor variam muito, a detecção usa comparação sem acento e por trecho.
 */
const fieldHints: Record<ImportField, string[]> = {
  number: ['numero', 'num', 'no', 'n', 'brinco', 'identificacao', 'id', 'codigo', 'cod', 'chip'],
  breed: ['raca', 'racas', 'breed'],
  coat: ['pelagem', 'pelo', 'cor', 'pelagens'],
  sex: ['sexo', 'genero', 'macho femea', 'm f'],
  birth_date: ['nascimento', 'data nascimento', 'dt nascimento', 'nasc', 'data', 'idade'],
  weight: ['peso', 'kg', 'arroba', 'peso kg', 'peso atual'],
  lot: ['lote', 'local', 'curral', 'pasto', 'piquete', 'invernada', 'retiro'],
  origin: ['origem', 'procedencia', 'aquisicao', 'comprado'],
  status: ['situacao', 'status', 'condicao', 'estado'],
  notes: ['observacao', 'observacoes', 'obs', 'anotacao', 'comentario', 'nota']
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Adivinha qual coluna corresponde a qual campo. Prioriza igualdade exata sobre
 * correspondência parcial, e nunca usa a mesma coluna em dois campos.
 */
export function guessMapping(headers: string[]): Record<ImportField, number | null> {
  const mapping = Object.fromEntries(
    (Object.keys(importFieldLabel) as ImportField[]).map((field) => [field, null])
  ) as Record<ImportField, number | null>

  const normalized = headers.map(normalize)
  const used = new Set<number>()

  const claim = (field: ImportField, matcher: (header: string, hint: string) => boolean) => {
    if (mapping[field] !== null) return
    for (const hint of fieldHints[field]) {
      const index = normalized.findIndex((header, i) => !used.has(i) && header && matcher(header, hint))
      if (index >= 0) {
        mapping[field] = index
        used.add(index)
        return
      }
    }
  }

  const fields = Object.keys(importFieldLabel) as ImportField[]
  // Primeira passada exige título idêntico, para evitar que "data" roube "data de nascimento".
  for (const field of fields) claim(field, (header, hint) => header === hint)
  for (const field of fields) claim(field, (header, hint) => header.includes(hint))

  return mapping
}

/* ------------------------------------------------------------------ */
/* Conversão de valores                                                */
/* ------------------------------------------------------------------ */

function parseSex(value: string): AnimalSex {
  const v = normalize(value)
  if (!v) return 'nao_informado'
  if (/^(m|macho|masculino|touro|boi|garrote|bezerro)/.test(v)) return 'macho'
  if (/^(f|femea|feminino|vaca|novilha|bezerra|matriz)/.test(v)) return 'femea'
  return 'nao_informado'
}

function parseStatus(value: string): AnimalStatus {
  const v = normalize(value)
  if (/(doente|enfermo|tratamento)/.test(v)) return 'doente'
  if (/(observa|atencao|suspeita)/.test(v)) return 'observacao'
  if (/(morto|obito|morte|baixa)/.test(v)) return 'morto'
  if (/(vendido|venda|abatido|abate)/.test(v)) return 'vendido'
  return 'normal'
}

/** Aceita "412", "412,5", "412.5", "412 kg" e arrobas ("14 @" vira 420 kg). */
function parseWeight(value: string): number | null {
  const raw = value.trim()
  if (!raw) return null

  const isArroba = /@|arroba/i.test(raw)
  const cleaned = raw.replace(/[^0-9,.-]/g, '')
  if (!cleaned) return null

  // Se tem vírgula e ponto, o último separador é o decimal.
  let normalized = cleaned
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '')
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.')
  }

  const number = Number(normalized)
  if (!Number.isFinite(number) || number <= 0) return null
  return isArroba ? Math.round(number * 30 * 100) / 100 : number
}

/** Aceita dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd e o serial já convertido do Excel. */
function parseDate(value: string): string | null {
  const raw = value.trim()
  if (!raw) return null

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const br = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (br) {
    const day = br[1].padStart(2, '0')
    const month = br[2].padStart(2, '0')
    let year = br[3]
    if (year.length === 2) year = Number(year) > 50 ? `19${year}` : `20${year}`
    if (Number(month) > 12) return null
    return `${year}-${month}-${day}`
  }
  return null
}

/* ------------------------------------------------------------------ */

export interface ImportRow {
  line: number
  animal: Partial<Animal> & { number: string }
  problems: string[]
  duplicated: boolean
}

export interface ImportPreview {
  valid: ImportRow[]
  invalid: ImportRow[]
  duplicatedInFile: number
  existingInBase: number
}

/** Aplica o mapeamento às linhas e devolve o que entra, o que sai e por quê. */
export function buildPreview(
  rows: string[][],
  mapping: Record<ImportField, number | null>,
  existingNumbers: Set<string>
): ImportPreview {
  const valid: ImportRow[] = []
  const invalid: ImportRow[] = []
  const seen = new Set<string>()
  let duplicatedInFile = 0
  let existingInBase = 0

  const cell = (row: string[], field: ImportField) => {
    const index = mapping[field]
    return index === null ? '' : (row[index] ?? '').trim()
  }

  rows.forEach((row, position) => {
    const problems: string[] = []
    const number = cell(row, 'number')

    if (!number) problems.push('Sem número de identificação')

    const rawWeight = cell(row, 'weight')
    const weight = parseWeight(rawWeight)
    if (rawWeight && weight === null) problems.push(`Peso não reconhecido: "${rawWeight}"`)

    const rawDate = cell(row, 'birth_date')
    const birthDate = parseDate(rawDate)
    if (rawDate && birthDate === null) problems.push(`Data não reconhecida: "${rawDate}"`)

    const duplicatedHere = Boolean(number) && seen.has(number)
    if (duplicatedHere) { problems.push('Número repetido na própria planilha'); duplicatedInFile += 1 }
    if (number) seen.add(number)

    const alreadyExists = Boolean(number) && existingNumbers.has(number)
    if (alreadyExists) existingInBase += 1

    const entry: ImportRow = {
      line: position + 2, // +2: a linha 1 é o cabeçalho e a contagem começa em 1.
      animal: {
        number,
        breed: cell(row, 'breed') || null,
        coat: formatCoat(cell(row, 'coat')) || null,
        sex: parseSex(cell(row, 'sex')),
        birth_date: birthDate,
        weight,
        lot: cell(row, 'lot') || null,
        origin: cell(row, 'origin') || null,
        status: cell(row, 'status') ? parseStatus(cell(row, 'status')) : 'normal',
        notes: cell(row, 'notes') || null
      },
      problems,
      duplicated: alreadyExists
    }

    if (problems.length) invalid.push(entry)
    else valid.push(entry)
  })

  return { valid, invalid, duplicatedInFile, existingInBase }
}
