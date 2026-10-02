import { isSupabaseConfigured, supabase } from './supabase'

/**
 * Acesso genérico às tabelas dos módulos de reprodução, manejo e compras.
 *
 * Segue a mesma regra do restante do app: com Supabase configurado, grava no
 * banco; sem ele, grava no localStorage, atrás da mesma interface. A autoria
 * (created_by) continua sendo preenchida por gatilho no banco.
 */

export type TableName = 'purchase_batches' | 'repro_protocols' | 'breeding_attempts' | 'health_events' | 'weighings'

type Row = { id: string; created_at: string }

const PREFIX = 'pantano.v2.'

/** Tabelas que o banco ainda não tem. Acontece até o schema.sql novo ser executado. */
const missingTables = new Set<string>()

export function getMissingTables() {
  return [...missingTables]
}

/** Erros do PostgREST quando a tabela ou a coluna ainda não existe. */
export function isSchemaError(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(error.code ?? '')
    || /does not exist|could not find the/i.test(error.message ?? '')
}

export function localKey(table: string) {
  return PREFIX + table
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(fallback))
      return fallback
    }
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeLocal<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Armazenamento cheio ou bloqueado: o modo demonstração segue em memória.
  }
}

/** Tamanho da página. O Supabase devolve no máximo 1000 linhas por consulta. */
const PAGE = 1000

/**
 * Busca todas as linhas, página por página. Sem isso, o histórico de vacinas
 * e pesagens pararia de crescer em silêncio ao passar de mil registros.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { code?: string; message?: string } | null }>
): Promise<{ rows: T[]; error: { code?: string; message?: string } | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) return { rows, error }
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) return { rows, error: null }
  }
}

export async function listRows<T extends Row>(table: TableName, fallback: T[], orderBy = 'created_at'): Promise<T[]> {
  if (!isSupabaseConfigured || !supabase) return readLocal<T[]>(localKey(table), fallback)
  const client = supabase
  const { rows, error } = await fetchAll<T>((from, to) =>
    client.from(table).select('*').order(orderBy, { ascending: false }).order('id').range(from, to))
  if (error) {
    if (isSchemaError(error)) {
      missingTables.add(table)
      return []
    }
    throw error
  }
  missingTables.delete(table)
  return rows
}

/** Insere várias linhas de uma vez. Campos de autoria e data são do banco. */
export async function insertRows<T extends Row>(table: TableName, rows: Omit<T, 'id' | 'created_at' | 'created_by'>[]): Promise<T[]> {
  if (!rows.length) return []
  if (!isSupabaseConfigured || !supabase) {
    const now = new Date().toISOString()
    const created = rows.map((row) => ({ ...row, id: crypto.randomUUID(), created_at: now }) as unknown as T)
    const current = readLocal<T[]>(localKey(table), [])
    writeLocal(localKey(table), [...created, ...current])
    return created
  }
  const saved: T[] = []
  const chunkSize = 200
  for (let start = 0; start < rows.length; start += chunkSize) {
    const { data, error } = await supabase.from(table).insert(rows.slice(start, start + chunkSize) as never).select()
    if (error) throw friendly(error, table)
    saved.push(...((data ?? []) as T[]))
  }
  return saved
}

export async function updateRow<T extends Row>(table: TableName, id: string, patch: Partial<T>): Promise<void> {
  const clean = { ...patch } as Record<string, unknown>
  delete clean.id
  delete clean.created_at
  delete clean.created_by
  if (!isSupabaseConfigured || !supabase) {
    const current = readLocal<T[]>(localKey(table), [])
    writeLocal(localKey(table), current.map((row) => (row.id === id ? { ...row, ...clean } : row)))
    return
  }
  const { error } = await supabase.from(table).update(clean).eq('id', id)
  if (error) throw friendly(error, table)
}

export async function deleteRow(table: TableName, id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const current = readLocal<Row[]>(localKey(table), [])
    writeLocal(localKey(table), current.filter((row) => row.id !== id))
    return
  }
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw friendly(error, table)
}

function friendly(error: { code?: string; message?: string }, table: string) {
  if (isSchemaError(error)) {
    missingTables.add(table)
    return new Error('O banco ainda não tem as tabelas novas. Peça ao administrador para executar o schema.sql atualizado no Supabase.')
  }
  return new Error(error.message || 'Não foi possível salvar.')
}
