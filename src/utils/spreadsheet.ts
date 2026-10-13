import { unzipSync, strFromU8 } from 'fflate'

export interface SheetData {
  headers: string[]
  rows: string[][]
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/** Excel brasileiro exporta com ponto e vírgula. Detecta o separador pela 1ª linha. */
function detectDelimiter(sample: string) {
  const line = sample.split(/\r?\n/)[0] ?? ''
  const counts = [';', ',', '\t'].map((sep) => ({
    sep,
    // Ignora separadores dentro de aspas.
    count: line.split('"').filter((_, index) => index % 2 === 0).join('').split(sep).length - 1
  }))
  return counts.sort((a, b) => b.count - a.count)[0].count > 0
    ? counts.sort((a, b) => b.count - a.count)[0].sep
    : ';'
}

function parseCsv(text: string): SheetData {
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1 }
        else inQuotes = false
      } else field += char
      continue
    }

    if (char === '"') { inQuotes = true; continue }
    if (char === delimiter) { row.push(field); field = ''; continue }
    if (char === '\r') continue
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += char
  }
  if (field || row.length) { row.push(field); rows.push(row) }

  const clean = rows.filter((item) => item.some((cell) => cell.trim() !== ''))
  const [headers = [], ...body] = clean
  return { headers: headers.map((h) => h.trim()), rows: body }
}

/**
 * Lê o texto respeitando a codificação. Excel no Windows costuma salvar em
 * Windows-1252, o que transformaria "Raça" em "Ra?a" se lido como UTF-8.
 */
async function readTextFile(file: File) {
  const buffer = new Uint8Array(await file.arrayBuffer())
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  // O caractere de substituição indica que o arquivo não era UTF-8.
  if (utf8.includes('�')) {
    return new TextDecoder('windows-1252').decode(buffer)
  }
  return utf8.replace(/^﻿/, '')
}

/* ------------------------------------------------------------------ */
/* XLSX                                                                */
/* ------------------------------------------------------------------ */

const xml = (content: string) => new DOMParser().parseFromString(content, 'application/xml')

/** Converte a referência da célula (ex.: "BC12") para índice de coluna base zero. */
function columnIndex(ref: string) {
  const letters = ref.replace(/[0-9]/g, '')
  let index = 0
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64)
  return index - 1
}

/** Formatos nativos de data do Excel, mais os personalizados que contenham d/m/a. */
function buildDateFormatSet(styles: Document) {
  const builtIn = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57, 58])
  const custom = new Set<number>()
  for (const node of Array.from(styles.getElementsByTagName('numFmt'))) {
    const code = (node.getAttribute('formatCode') ?? '').toLowerCase()
    // Remove trechos entre aspas e cores antes de procurar marcadores de data.
    const stripped = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '')
    if (/[dmy]/.test(stripped) && !/^[#0.,%\s]*$/.test(stripped)) {
      custom.add(Number(node.getAttribute('numFmtId')))
    }
  }

  const dateStyles = new Set<number>()
  const cellXfs = styles.getElementsByTagName('cellXfs')[0]
  if (cellXfs) {
    Array.from(cellXfs.getElementsByTagName('xf')).forEach((xf, index) => {
      const id = Number(xf.getAttribute('numFmtId') ?? 0)
      if (builtIn.has(id) || custom.has(id)) dateStyles.add(index)
    })
  }
  return dateStyles
}

/** Serial do Excel para ISO. O ano-base é 1899-12-30 por causa do bug do ano 1900. */
function excelSerialToIso(serial: number) {
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return String(serial)
  return date.toISOString().slice(0, 10)
}

/** Abas do arquivo na ordem do Excel, com o caminho do XML de cada uma. */
function listSheets(zip: Record<string, Uint8Array>) {
  const workbook = zip['xl/workbook.xml'] ? xml(strFromU8(zip['xl/workbook.xml'])) : null
  const rels = zip['xl/_rels/workbook.xml.rels'] ? xml(strFromU8(zip['xl/_rels/workbook.xml.rels'])) : null
  const targets = new Map<string, string>()
  for (const rel of Array.from(rels?.getElementsByTagName('Relationship') ?? [])) {
    const target = (rel.getAttribute('Target') ?? '').replace(/^\/?(xl\/)?/, '')
    targets.set(rel.getAttribute('Id') ?? '', `xl/${target}`)
  }
  const sheets = Array.from(workbook?.getElementsByTagName('sheet') ?? []).map((node) => ({
    name: node.getAttribute('name') ?? '',
    path: targets.get(node.getAttribute('r:id') ?? node.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? '') ?? ''
  })).filter((item) => zip[item.path])
  if (sheets.length) return sheets
  return Object.keys(zip).filter((name) => /^xl\/worksheets\/.+\.xml$/i.test(name)).sort().map((path) => ({ name: path, path }))
}

/** Linha de cabeçalho: a primeira (entre as 40 primeiras) que tem uma coluna de brinco. */
const isIdHeader = (cell: string) => /^(brinco|n[uú]mero|numero|n[ºo°]?|animal|identifica[cç][aã]o|c[oó]digo)$/i.test(cell.trim())

async function parseXlsx(file: File): Promise<SheetData> {
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const sheets = listSheets(zip)
  if (!sheets.length) throw new Error('A planilha não contém nenhuma aba legível.')

  const sharedStrings: string[] = []
  if (zip['xl/sharedStrings.xml']) {
    const doc = xml(strFromU8(zip['xl/sharedStrings.xml']))
    for (const si of Array.from(doc.getElementsByTagName('si'))) {
      // Um texto pode estar quebrado em vários <t> quando tem formatação mista.
      sharedStrings.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join(''))
    }
  }

  const dateStyles = zip['xl/styles.xml']
    ? buildDateFormatSet(xml(strFromU8(zip['xl/styles.xml'])))
    : new Set<number>()

  const readMatrix = (path: string) => {
    const sheet = xml(strFromU8(zip[path]))
    const matrix: string[][] = []
    for (const rowNode of Array.from(sheet.getElementsByTagName('row'))) {
      const cells: string[] = []
      for (const cell of Array.from(rowNode.getElementsByTagName('c'))) {
        const index = columnIndex(cell.getAttribute('r') ?? '')
        const type = cell.getAttribute('t')
        const styleIndex = Number(cell.getAttribute('s') ?? -1)
        let value = ''
        if (type === 'inlineStr') {
          value = Array.from(cell.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('')
        } else {
          const raw = cell.getElementsByTagName('v')[0]?.textContent ?? ''
          if (type === 's') value = sharedStrings[Number(raw)] ?? ''
          else if (type === 'b') value = raw === '1' ? 'sim' : 'nao'
          else if (raw !== '' && dateStyles.has(styleIndex) && Number.isFinite(Number(raw))) value = excelSerialToIso(Number(raw))
          else value = raw
        }
        while (cells.length < index) cells.push('')
        cells[index] = value.trim()
      }
      matrix.push(cells)
    }
    return matrix.filter((row) => row.some((cell) => cell !== ''))
  }

  // Planilhas com várias abas (como a Gado_Rebanho_Fazenda): usa a aba "Geral"
  // ou a primeira que tenha uma coluna de brinco, a partir dessa linha.
  const ordered = [...sheets].sort((a, b) => Number(/^geral$/i.test(b.name)) - Number(/^geral$/i.test(a.name)))
  let fallback: SheetData | null = null
  for (const sheet of ordered) {
    const matrix = readMatrix(sheet.path)
    if (!matrix.length) continue
    const headerIndex = matrix.slice(0, 40).findIndex((row) => row.some(isIdHeader))
    if (headerIndex >= 0) {
      return { headers: matrix[headerIndex].map((h) => h.trim()), rows: matrix.slice(headerIndex + 1) }
    }
    if (!fallback) fallback = { headers: matrix[0].map((h) => h.trim()), rows: matrix.slice(1) }
  }
  if (!fallback) throw new Error('A planilha está vazia.')
  return fallback
}

/* ------------------------------------------------------------------ */

/** Lê CSV ou XLSX e devolve cabeçalhos e linhas como texto. */
export async function readSpreadsheet(file: File): Promise<SheetData> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return parseXlsx(file)
  if (name.endsWith('.xls')) {
    throw new Error('O formato .xls é antigo. Abra no Excel e salve como .xlsx ou .csv.')
  }
  return parseCsv(await readTextFile(file))
}
