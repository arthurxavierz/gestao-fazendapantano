import seed from '../data/rebanho-planilha.json'
import type { Op, Tabela } from '../domain/operacoes'
import type { Fazenda } from '../domain/regras'
import type { Animal, LancamentoQuadro, RelatorioIma } from '../types'
import { isSupabaseConfigured, supabase } from './supabase'

/**
 * Onde os dados moram. Com Supabase configurado, nas tabelas rebanho_*; sem
 * ele (demonstração), no navegador, já com os 402 animais e fotos da planilha.
 * As duas formas ficam atrás das mesmas funções: carregar() e gravar().
 */

export const TABELAS: Record<Tabela | 'ima' | 'quadro', string> = {
  animais: 'rebanho_animais',
  protocolos: 'rebanho_protocolos',
  ciclos: 'rebanho_ciclos',
  bezerros: 'rebanho_bezerros',
  manejos: 'rebanho_manejos',
  numeros: 'rebanho_numeros',
  revisoes: 'rebanho_revisoes',
  fichas: 'rebanho_fichas',
  ima: 'rebanho_ima',
  quadro: 'rebanho_quadro'
}

const PREFIX = 'pantano.v3.'
const ORDEM: (keyof Fazenda)[] = ['animais', 'protocolos', 'ciclos', 'bezerros', 'manejos', 'numeros', 'revisoes', 'fichas']

export interface Extras {
  ima: RelatorioIma[]
  quadro: LancamentoQuadro[]
}

export type Dados = Fazenda & Extras

/** Os 402 animais da aba Geral da planilha v11, com foto e conferência. */
export function rebanhoDaPlanilha(): Animal[] {
  const created = '2026-10-05T12:00:00.000Z'
  return (seed as { ordem: number; brinco: string; foto: string | null; conferencia: string | null; hash: string | null }[]).map((row) => ({
    id: `planilha-${row.ordem}`,
    brinco: row.brinco,
    sexo: null,
    nascimento: null,
    faixa: null,
    raca: null,
    cor: null,
    no_ima: null,
    observacoes: null,
    conferencia: row.conferencia,
    foto_url: row.foto,
    foto_hash: row.hash,
    ordem: row.ordem,
    ciclo: 1,
    avaliacao: null,
    data_avaliacao: null,
    peso: null,
    saida: null,
    data_saida: null,
    bezerro_id: null,
    created_at: created
  }))
}

// ---------------------------------------------------------------- navegador

function readLocal<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw) return JSON.parse(raw) as T
  } catch { /* armazenamento indisponível */ }
  const value = fallback()
  writeLocal(key, value)
  return value
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Cheio ou bloqueado: a demonstração continua na memória.
  }
}

export function reiniciarDemonstracao() {
  try {
    Object.keys(localStorage).filter((key) => key.startsWith(PREFIX)).forEach((key) => localStorage.removeItem(key))
  } catch { /* nada a limpar */ }
}

// ---------------------------------------------------------------- banco

/** Erro do PostgREST quando a tabela ainda não existe (schema.sql não executado). */
const faltaTabela = (error: { code?: string; message?: string }) =>
  ['42P01', 'PGRST205'].includes(error.code ?? '') || /does not exist|could not find the table/i.test(error.message ?? '')

export class BancoDesatualizado extends Error {
  constructor() {
    super('O banco ainda não tem as tabelas do rebanho. Execute o arquivo supabase/schema.sql no SQL Editor do Supabase.')
  }
}

async function listar<T>(table: string): Promise<T[]> {
  const client = supabase!
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select('*').order('created_at').order('id').range(from, from + 999)
    if (error) {
      if (faltaTabela(error)) throw new BancoDesatualizado()
      throw new Error(error.message)
    }
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return rows
  }
}

export async function carregar(): Promise<Dados> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      animais: readLocal('animais', rebanhoDaPlanilha),
      protocolos: readLocal('protocolos', () => []),
      ciclos: readLocal('ciclos', () => []),
      bezerros: readLocal('bezerros', () => []),
      manejos: readLocal('manejos', () => []),
      numeros: readLocal('numeros', () => []),
      revisoes: readLocal('revisoes', () => []),
      fichas: readLocal('fichas', () => []),
      ima: readLocal('ima', () => []),
      quadro: readLocal('quadro', () => [])
    }
  }
  const [animais, protocolos, ciclos, bezerros, manejos, numeros, revisoes, fichas, ima, quadro] = await Promise.all([
    ...ORDEM.map((key) => listar(TABELAS[key])),
    listar<RelatorioIma>(TABELAS.ima),
    listar<LancamentoQuadro>(TABELAS.quadro)
  ])
  return { animais, protocolos, ciclos, bezerros, manejos, numeros, revisoes, fichas, ima, quadro } as Dados
}

/** Campos que o banco preenche (autoria por gatilho) e não devem ir na gravação. */
function limpar(row: Record<string, unknown>) {
  const copy = { ...row }
  delete copy.created_by
  return copy
}

/**
 * Grava as operações na ordem em que foram geradas (a ordem importa: o animal
 * criado na incorporação precisa existir antes dos manejos que apontam para ele).
 * Inserções seguidas na mesma tabela vão num lote só.
 */
export async function gravar(ops: Op[], dadosAtuais: Dados): Promise<void> {
  if (!ops.length) return
  if (!isSupabaseConfigured || !supabase) {
    for (const key of ORDEM) writeLocal(key, dadosAtuais[key])
    return
  }
  let index = 0
  while (index < ops.length) {
    const op = ops[index]
    if (op.t === 'insert') {
      const batch = [op.row]
      while (index + 1 < ops.length && ops[index + 1].t === 'insert' && ops[index + 1].tabela === op.tabela) {
        index += 1
        batch.push((ops[index] as Extract<Op, { t: 'insert' }>).row)
      }
      for (let start = 0; start < batch.length; start += 300) {
        const { error } = await supabase.from(TABELAS[op.tabela]).insert(batch.slice(start, start + 300).map(limpar) as never)
        if (error) throw traduzir(error)
      }
    } else if (op.t === 'update') {
      const { error } = await supabase.from(TABELAS[op.tabela]).update(limpar(op.patch) as never).eq('id', op.id)
      if (error) throw traduzir(error)
    } else {
      const { error } = await supabase.from(TABELAS[op.tabela]).delete().eq('id', op.id)
      if (error) throw traduzir(error)
    }
    index += 1
  }
}

function traduzir(error: { code?: string; message?: string }) {
  if (faltaTabela(error)) return new BancoDesatualizado()
  if (error.code === '23505') return new Error('Esse brinco já está em uso por outro animal ativo.')
  if (error.code === '42501') return new Error('Sua conta não tem permissão para esta alteração.')
  return new Error(error.message || 'Não foi possível salvar.')
}

// ---------------------------------------------------------------- IMA e quadro

export async function salvarExtra<K extends keyof Extras>(key: K, row: Extras[K][number], todos: Extras[K]) {
  if (!isSupabaseConfigured || !supabase) {
    writeLocal(key, todos)
    return
  }
  const { error } = await supabase.from(TABELAS[key]).insert(limpar(row as never) as never)
  if (error) throw traduzir(error)
}

export async function salvarExtras<K extends keyof Extras>(key: K, rows: Extras[K], todos: Extras[K]) {
  if (!rows.length) return
  if (!isSupabaseConfigured || !supabase) {
    writeLocal(key, todos)
    return
  }
  const { error } = await supabase.from(TABELAS[key]).insert(rows.map((row) => limpar(row as never)) as never)
  if (error) throw traduzir(error)
}

// ---------------------------------------------------------------- fotos

/** Reduz a foto no próprio celular antes de enviar: o curral costuma ter sinal fraco. */
export async function reduzirFoto(file: File, maxSide = 1280): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', 0.82))
}

/**
 * dHash de 64 bits (9x8 em tons de cinza): fotos do mesmo animal tiradas do
 * mesmo jeito ficam com poucos bits diferentes. Mesmo cálculo usado na carga
 * inicial das fotos da planilha.
 */
export async function hashFoto(blob: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = 9
    canvas.height = 8
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, 9, 8)
    bitmap.close()
    const px = ctx.getImageData(0, 0, 9, 8).data
    const gray = (i: number) => px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114
    let hex = ''
    for (let y = 0; y < 8; y += 1) {
      let nibbleRow = 0
      for (let x = 0; x < 8; x += 1) nibbleRow = (nibbleRow << 1) | (gray(y * 9 + x) > gray(y * 9 + x + 1) ? 1 : 0)
      hex += nibbleRow.toString(16).padStart(2, '0')
    }
    return hex
  } catch {
    return null
  }
}

export async function enviarFotoComHash(file: File, brinco: string): Promise<{ url: string; hash: string | null }> {
  const blob = await reduzirFoto(file, isSupabaseConfigured ? 1280 : 720)
  const [url, hash] = await Promise.all([enviarBlob(blob, brinco), hashFoto(blob)])
  return { url, hash }
}

export async function enviarFoto(file: File, brinco: string): Promise<string> {
  return (await enviarFotoComHash(file, brinco)).url
}

async function enviarBlob(blob: Blob, brinco: string): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
      reader.readAsDataURL(blob)
    })
  }
  const path = `rebanho/${brinco.replace(/[^\w-]/g, '_')}-${Date.now()}.jpg`
  const { error } = await supabase.storage.from('animal-photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
  if (error) throw new Error('Não foi possível enviar a foto: ' + error.message)
  return supabase.storage.from('animal-photos').getPublicUrl(path).data.publicUrl
}
