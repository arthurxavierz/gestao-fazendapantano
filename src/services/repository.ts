import type { Animal, CountSession, FarmSettings, Occurrence, Profile, UserRole } from '../types'
import { defaultSettings } from '../domain/reproduction'
import { demoAnimals, demoCounts, demoOccurrences, demoProfiles } from './demoData'
import { isSchemaError, localKey, readLocal, writeLocal } from './store'
import { isSupabaseConfigured, supabase } from './supabase'

const KEYS = {
  animals: localKey('animals'),
  occurrences: localKey('occurrences'),
  counts: localKey('counts'),
  settings: localKey('settings')
}

/** Colunas que existem desde a primeira versão do banco. */
const LEGACY_ANIMAL_COLUMNS = [
  'number', 'name', 'photo_url', 'sex', 'breed', 'coat', 'birth_date', 'birth_date_approximate',
  'weight', 'lot', 'origin', 'status', 'notes', 'ai_analysis', 'updated_at'
]
const LEGACY_STATUSES = ['normal', 'observacao', 'doente', 'morto', 'vendido']

/** Indica que o banco ainda está na versão anterior e os campos novos não foram gravados. */
let animalsSchemaOutdated = false
export function isAnimalsSchemaOutdated() {
  return animalsSchemaOutdated
}

function legacyPayload(payload: Record<string, unknown>) {
  const legacy = Object.fromEntries(Object.entries(payload).filter(([key]) => LEGACY_ANIMAL_COLUMNS.includes(key)))
  if ('status' in legacy && !LEGACY_STATUSES.includes(String(legacy.status))) legacy.status = 'observacao'
  return legacy
}

export async function listAnimals(): Promise<Animal[]> {
  if (!isSupabaseConfigured || !supabase) return readLocal(KEYS.animals, demoAnimals)
  const { data, error } = await supabase.from('animals').select('*').order('number')
  if (error) throw error
  const rows = (data ?? []) as Animal[]
  animalsSchemaOutdated = rows.length > 0 && !('origin_type' in rows[0])
  return rows
}

function animalPayload(input: Partial<Animal> & Pick<Animal, 'number'>) {
  return {
    number: input.number.trim(),
    name: input.name ?? null,
    photo_url: input.photo_url ?? null,
    sex: input.sex ?? 'nao_informado',
    category: input.category || null,
    breed: input.breed || null,
    coat: input.coat || null,
    birth_date: input.birth_date || null,
    birth_date_approximate: input.birth_date_approximate ?? false,
    weight: input.weight ?? null,
    lot: input.lot || null,
    origin: input.origin || null,
    origin_type: input.origin_type ?? 'nao_informado',
    mother_id: input.mother_id || null,
    sire: input.sire || null,
    purchase_batch_id: input.purchase_batch_id || null,
    entry_date: input.entry_date || null,
    exit_date: input.exit_date || null,
    exit_reason: input.exit_reason || null,
    status: input.status ?? 'normal',
    notes: input.notes || null,
    ai_analysis: input.ai_analysis ?? null,
    updated_at: new Date().toISOString()
  }
}

export async function saveAnimal(input: Partial<Animal> & Pick<Animal, 'number'>): Promise<Animal> {
  const now = new Date().toISOString()
  const payload = animalPayload(input)

  if (!isSupabaseConfigured || !supabase) {
    const animals = readLocal<Animal[]>(KEYS.animals, demoAnimals)
    const existing = input.id ? animals.find((item) => item.id === input.id) : undefined
    if (animals.some((item) => item.number === payload.number && item.id !== existing?.id)) {
      throw new Error(`Já existe um animal com o número ${payload.number}.`)
    }
    const animal = {
      ...existing,
      ...payload,
      photo_url: input.photo_url ?? existing?.photo_url ?? null,
      ai_analysis: input.ai_analysis ?? existing?.ai_analysis ?? null,
      id: existing?.id ?? crypto.randomUUID(),
      created_at: existing?.created_at ?? now,
      updated_at: now
    } as Animal
    const next = existing ? animals.map((item) => (item.id === animal.id ? animal : item)) : [...animals, animal]
    writeLocal(KEYS.animals, next)
    return animal
  }

  const run = (body: Record<string, unknown>) =>
    input.id
      ? supabase!.from('animals').update(body).eq('id', input.id).select().single()
      : supabase!.from('animals').insert(body).select().single()

  let { data, error } = await run(payload)
  if (error && (isSchemaError(error) || error.code === '23514')) {
    // Banco ainda sem as colunas novas: grava o que é possível e sinaliza.
    animalsSchemaOutdated = true
    ;({ data, error } = await run(legacyPayload(payload)))
  }
  if (error) {
    if (error.code === '23505') throw new Error(`Já existe um animal com o número ${payload.number}.`)
    throw error
  }
  return data as Animal
}

/** Cria vários animais de uma vez (cadastro em lote e partos). */
export async function createAnimals(inputs: (Partial<Animal> & Pick<Animal, 'number'>)[]): Promise<Animal[]> {
  if (!inputs.length) return []
  const payloads = inputs.map(animalPayload)

  if (!isSupabaseConfigured || !supabase) {
    const animals = readLocal<Animal[]>(KEYS.animals, demoAnimals)
    const taken = new Set(animals.map((item) => item.number))
    const duplicated = payloads.filter((item) => taken.has(item.number)).map((item) => item.number)
    if (duplicated.length) throw new Error(`Números já cadastrados: ${duplicated.slice(0, 8).join(', ')}${duplicated.length > 8 ? '…' : ''}`)
    const now = new Date().toISOString()
    const created = payloads.map((item) => ({ ...item, id: crypto.randomUUID(), created_at: now }) as Animal)
    writeLocal(KEYS.animals, [...animals, ...created])
    return created
  }

  const { data, error } = await supabase.from('animals').insert(payloads).select()
  if (error) {
    if (error.code === '23505') throw new Error('Algum dos números informados já está cadastrado.')
    if (isSchemaError(error)) throw new Error('O banco ainda não tem os campos novos. Execute o schema.sql atualizado no Supabase.')
    throw error
  }
  return (data ?? []) as Animal[]
}

/**
 * Altera alguns campos de um animal sem reenviar o cadastro inteiro.
 * Usado pelos manejos: pesagem atualiza o peso, descarte muda a situação.
 */
export async function patchAnimal(id: string, patch: Partial<Animal>): Promise<void> {
  const clean = { ...patch, updated_at: new Date().toISOString() } as Record<string, unknown>
  delete clean.id
  if (!isSupabaseConfigured || !supabase) {
    const animals = readLocal<Animal[]>(KEYS.animals, demoAnimals)
    writeLocal(KEYS.animals, animals.map((item) => (item.id === id ? { ...item, ...clean } : item)))
    return
  }
  let { error } = await supabase.from('animals').update(clean).eq('id', id)
  if (error && (isSchemaError(error) || error.code === '23514')) {
    animalsSchemaOutdated = true
    ;({ error } = await supabase.from('animals').update(legacyPayload(clean)).eq('id', id))
  }
  if (error) throw error
}

/**
 * Grava vários animais de uma vez, vindos da planilha importada.
 * Usa upsert pelo número, que é único, então reimportar a mesma planilha
 * atualiza em vez de duplicar. Vai em blocos para não estourar o limite da API.
 */
export async function saveAnimalsBatch(
  input: (Partial<Animal> & Pick<Animal, 'number'>)[]
): Promise<{ saved: number; failed: number }> {
  if (!input.length) return { saved: 0, failed: 0 }

  if (!isSupabaseConfigured || !supabase) {
    const animals = readLocal<Animal[]>(KEYS.animals, demoAnimals)
    const byNumber = new Map(animals.map((item) => [item.number, item]))
    const now = new Date().toISOString()

    for (const item of input) {
      const existing = byNumber.get(item.number)
      byNumber.set(item.number, {
        ...(existing ?? {
          id: crypto.randomUUID(),
          number: item.number,
          status: 'normal' as const,
          sex: 'nao_informado' as const,
          created_at: now
        }),
        ...item,
        updated_at: now
      } as Animal)
    }
    writeLocal(KEYS.animals, [...byNumber.values()])
    return { saved: input.length, failed: 0 }
  }

  const rows = input.map((item) => ({
    number: item.number.trim(),
    breed: item.breed ?? null,
    coat: item.coat ?? null,
    sex: item.sex ?? 'nao_informado',
    birth_date: item.birth_date || null,
    weight: item.weight ?? null,
    lot: item.lot ?? null,
    origin: item.origin ?? null,
    status: item.status ?? 'normal',
    notes: item.notes ?? null,
    updated_at: new Date().toISOString()
  }))

  let saved = 0
  let failed = 0
  const chunkSize = 200

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize)
    const { error } = await supabase.from('animals').upsert(chunk, { onConflict: 'number' })
    if (error) failed += chunk.length
    else saved += chunk.length
  }

  return { saved, failed }
}

export async function removeAnimal(id: string) {
  if (!isSupabaseConfigured || !supabase) {
    const animals = readLocal<Animal[]>(KEYS.animals, demoAnimals)
    writeLocal(KEYS.animals, animals.filter((item) => item.id !== id))
    return
  }
  const { error } = await supabase.from('animals').delete().eq('id', id)
  if (error) throw error
}

export async function listOccurrences(): Promise<Occurrence[]> {
  if (!isSupabaseConfigured || !supabase) return readLocal(KEYS.occurrences, demoOccurrences)
  const { data, error } = await supabase
    .from('occurrences')
    .select('*, animals(number)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    ...row,
    animal_number: row.animals?.number
  })) as Occurrence[]
}

/** A ocorrência muda a situação do animal. 'outro' só registra. */
const occurrenceStatus: Record<Occurrence['type'], Animal['status'] | undefined> = {
  observacao: 'observacao',
  doenca: 'doente',
  morte: 'morto',
  recuperado: 'normal',
  descarte: 'descarte',
  outro: undefined
}

export async function saveOccurrence(input: Omit<Occurrence, 'id' | 'created_at'>): Promise<Occurrence> {
  const occurrence: Occurrence = {
    ...input,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString()
  }
  const nextStatus = occurrenceStatus[input.type]

  if (!isSupabaseConfigured || !supabase) {
    const items = readLocal<Occurrence[]>(KEYS.occurrences, demoOccurrences)
    writeLocal(KEYS.occurrences, [occurrence, ...items])
    if (nextStatus) await patchAnimal(input.animal_id, { status: nextStatus })
    return occurrence
  }

  // Bancos antigos não aceitam o tipo 'descarte' na ocorrência: registra como 'outro'.
  const insert = (type: string) =>
    supabase!
      .from('occurrences')
      .insert({
        animal_id: input.animal_id,
        type,
        note: input.note,
        photo_url: input.photo_url ?? null
        // created_by é preenchido por gatilho no banco, a partir da sessão.
      })
      .select()
      .single()

  let { data, error } = await insert(input.type)
  if (error && error.code === '23514' && input.type === 'descarte') ({ data, error } = await insert('outro'))
  if (error) throw error

  if (nextStatus) await patchAnimal(input.animal_id, { status: nextStatus })
  return data as Occurrence
}

export async function listCounts(): Promise<CountSession[]> {
  if (!isSupabaseConfigured || !supabase) return readLocal(KEYS.counts, demoCounts)
  const { data, error } = await supabase.from('counts').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row: any) => ({ ...row, animal_numbers: row.animal_numbers ?? [] })) as CountSession[]
}

export async function saveCount(input: Omit<CountSession, 'id' | 'created_at'>): Promise<CountSession> {
  const count: CountSession = {
    ...input,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString()
  }
  if (!isSupabaseConfigured || !supabase) {
    const items = readLocal<CountSession[]>(KEYS.counts, demoCounts)
    writeLocal(KEYS.counts, [count, ...items])
    return count
  }
  const { data, error } = await supabase.from('counts').insert({
    title: input.title,
    mode: input.mode,
    expected_total: input.expected_total ?? null,
    total_counted: input.total_counted,
    animal_numbers: input.animal_numbers,
    notes: input.notes ?? null
  }).select().single()
  if (error) throw error
  return data as CountSession
}

/** Regras da fazenda. Sem a tabela no banco, valem os padrões do sistema. */
export async function loadSettings(): Promise<FarmSettings> {
  if (!isSupabaseConfigured || !supabase) return { ...defaultSettings, ...readLocal<Partial<FarmSettings>>(KEYS.settings, {}) }
  const { data, error } = await supabase.from('farm_settings').select('*').eq('id', 1).maybeSingle()
  if (error || !data) return defaultSettings
  const { id: _id, updated_at: _updated, ...rest } = data as Record<string, unknown>
  return { ...defaultSettings, ...(rest as Partial<FarmSettings>) }
}

export async function saveSettings(settings: FarmSettings): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    writeLocal(KEYS.settings, settings)
    return
  }
  const { error } = await supabase.from('farm_settings').upsert({ id: 1, ...settings })
  if (error) {
    if (isSchemaError(error)) throw new Error('Execute o schema.sql atualizado no Supabase para salvar as regras.')
    throw error
  }
}

/**
 * Lista as contas de acesso. Somente administradores conseguem ver mais que a
 * própria conta: a política de segurança do banco bloqueia o restante.
 */
export async function listProfiles(): Promise<Profile[]> {
  if (!isSupabaseConfigured || !supabase) return demoProfiles
  const { data, error } = await supabase.from('profiles').select('*').order('full_name')
  if (error) throw error
  return (data ?? []) as Profile[]
}

export async function updateProfileRole(id: string, role: UserRole): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
  if (error) throw error
}

export async function uploadAnimalPhoto(file: File, animalNumber: string): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
      reader.readAsDataURL(file)
    })
  }
  const extension = file.name.split('.').pop() || 'jpg'
  const path = `${animalNumber}/${Date.now()}.${extension}`
  const { error } = await supabase.storage.from('animal-photos').upload(path, file, { upsert: true })
  if (error) throw error
  return supabase.storage.from('animal-photos').getPublicUrl(path).data.publicUrl
}
