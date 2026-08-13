import type {
  Animal,
  BreedingAttempt,
  CountSession,
  ManagementEvent,
  Occurrence,
  Profile,
  UserRole
} from '../types'
import {
  demoAnimals,
  demoBreedingAttempts,
  demoCounts,
  demoManagementEvents,
  demoOccurrences,
  demoProfiles
} from './demoData'
import { isSupabaseConfigured, supabase } from './supabase'

const KEYS = {
  animals: 'pantano.animals',
  occurrences: 'pantano.occurrences',
  counts: 'pantano.counts',
  breeding: 'pantano.breeding',
  management: 'pantano.management'
}

function readLocal<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key)
  if (!raw) {
    localStorage.setItem(key, JSON.stringify(fallback))
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeLocal<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

export async function listAnimals(): Promise<Animal[]> {
  if (!isSupabaseConfigured || !supabase) return readLocal(KEYS.animals, demoAnimals)
  const { data, error } = await supabase.from('animals').select('*').order('number')
  if (error) throw error
  return data as Animal[]
}

export async function saveAnimal(input: Partial<Animal> & Pick<Animal, 'number'>): Promise<Animal> {
  const now = new Date().toISOString()
  if (!isSupabaseConfigured || !supabase) {
    const animals = readLocal<Animal[]>(KEYS.animals, demoAnimals)
    const existing = input.id ? animals.find((item) => item.id === input.id) : undefined
    const animal: Animal = {
      id: existing?.id ?? crypto.randomUUID(),
      number: input.number.trim(),
      name: input.name ?? null,
      photo_url: input.photo_url ?? existing?.photo_url ?? null,
      sex: input.sex ?? existing?.sex ?? 'nao_informado',
      breed: input.breed ?? null,
      coat: input.coat ?? null,
      birth_date: input.birth_date ?? null,
      birth_date_approximate: input.birth_date_approximate ?? false,
      weight: input.weight ?? null,
      lot: input.lot ?? null,
      origin: input.origin ?? null,
      status: input.status ?? existing?.status ?? 'normal',
      notes: input.notes ?? null,
      mother_id: input.mother_id ?? existing?.mother_id ?? null,
      ai_analysis: input.ai_analysis ?? existing?.ai_analysis ?? null,
      created_at: existing?.created_at ?? now,
      updated_at: now
    }
    const next = existing
      ? animals.map((item) => (item.id === animal.id ? animal : item))
      : [...animals, animal]
    writeLocal(KEYS.animals, next)
    return animal
  }

  const payload = {
    number: input.number.trim(),
    name: input.name ?? null,
    photo_url: input.photo_url ?? null,
    sex: input.sex ?? 'nao_informado',
    breed: input.breed ?? null,
    coat: input.coat ?? null,
    birth_date: input.birth_date || null,
    birth_date_approximate: input.birth_date_approximate ?? false,
    weight: input.weight ?? null,
    lot: input.lot ?? null,
    origin: input.origin ?? null,
    status: input.status ?? 'normal',
    notes: input.notes ?? null,
    mother_id: input.mother_id ?? null,
    ai_analysis: input.ai_analysis ?? null,
    updated_at: now
  }
  const query = input.id
    ? supabase.from('animals').update(payload).eq('id', input.id).select().single()
    : supabase.from('animals').insert(payload).select().single()
  const { data, error } = await query
  if (error) throw error
  return data as Animal
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

export async function saveOccurrence(input: Omit<Occurrence, 'id' | 'created_at'>): Promise<Occurrence> {
  const occurrence: Occurrence = {
    ...input,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString()
  }

  if (!isSupabaseConfigured || !supabase) {
    const items = readLocal<Occurrence[]>(KEYS.occurrences, demoOccurrences)
    writeLocal(KEYS.occurrences, [occurrence, ...items])
    const animals = readLocal<Animal[]>(KEYS.animals, demoAnimals)
    const statusMap: Record<Occurrence['type'], Animal['status'] | undefined> = {
      observacao: 'observacao',
      doenca: 'doente',
      morte: 'morto',
      recuperado: 'normal',
      outro: undefined
    }
    const nextStatus = statusMap[input.type]
    if (nextStatus) {
      writeLocal(
        KEYS.animals,
        animals.map((item) =>
          item.id === input.animal_id
            ? { ...item, status: nextStatus, updated_at: occurrence.created_at }
            : item
        )
      )
    }
    return occurrence
  }

  const { data, error } = await supabase
    .from('occurrences')
    .insert({
      animal_id: input.animal_id,
      type: input.type,
      note: input.note,
      photo_url: input.photo_url ?? null
      // created_by é preenchido por gatilho no banco, a partir da sessão.
    })
    .select()
    .single()
  if (error) throw error

  const statusMap: Record<Occurrence['type'], Animal['status'] | undefined> = {
    observacao: 'observacao',
    doenca: 'doente',
    morte: 'morto',
    recuperado: 'normal',
    outro: undefined
  }
  const nextStatus = statusMap[input.type]
  if (nextStatus) {
    await supabase.from('animals').update({ status: nextStatus }).eq('id', input.animal_id)
  }
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

// ============================================================
// Reprodução
// ============================================================
export async function listBreedingAttempts(): Promise<BreedingAttempt[]> {
  if (!isSupabaseConfigured || !supabase) return readLocal(KEYS.breeding, demoBreedingAttempts)
  const { data, error } = await supabase
    .from('breeding_attempts')
    .select('*, animals(number)')
    .order('protocol_date', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row: any) => ({ ...row, animal_number: row.animals?.number })) as BreedingAttempt[]
}

export async function saveBreedingAttempt(
  input: Partial<BreedingAttempt> & Pick<BreedingAttempt, 'animal_id' | 'attempt_number' | 'protocol_date' | 'result'>
): Promise<BreedingAttempt> {
  const now = new Date().toISOString()
  if (!isSupabaseConfigured || !supabase) {
    const items = readLocal<BreedingAttempt[]>(KEYS.breeding, demoBreedingAttempts)
    const existing = input.id ? items.find((item) => item.id === input.id) : undefined
    const attempt: BreedingAttempt = {
      id: existing?.id ?? crypto.randomUUID(),
      animal_id: input.animal_id,
      animal_number: input.animal_number ?? existing?.animal_number,
      attempt_number: input.attempt_number,
      protocol_date: input.protocol_date,
      protocol_type: input.protocol_type ?? existing?.protocol_type ?? null,
      semen: input.semen ?? existing?.semen ?? null,
      confirmation_date: input.confirmation_date ?? existing?.confirmation_date ?? null,
      result: input.result,
      notes: input.notes ?? existing?.notes ?? null,
      created_by: existing?.created_by ?? null,
      created_at: existing?.created_at ?? now
    }
    const next = existing ? items.map((item) => (item.id === attempt.id ? attempt : item)) : [attempt, ...items]
    writeLocal(KEYS.breeding, next)
    return attempt
  }

  const payload = {
    animal_id: input.animal_id,
    attempt_number: input.attempt_number,
    protocol_date: input.protocol_date,
    protocol_type: input.protocol_type ?? null,
    semen: input.semen ?? null,
    confirmation_date: input.confirmation_date || null,
    result: input.result,
    notes: input.notes ?? null
  }
  const query = input.id
    ? supabase.from('breeding_attempts').update(payload).eq('id', input.id).select('*, animals(number)').single()
    : supabase.from('breeding_attempts').insert(payload).select('*, animals(number)').single()
  const { data, error } = await query
  if (error) throw error
  const row = data as any
  return { ...row, animal_number: row.animals?.number } as BreedingAttempt
}

export async function removeBreedingAttempt(id: string) {
  if (!isSupabaseConfigured || !supabase) {
    const items = readLocal<BreedingAttempt[]>(KEYS.breeding, demoBreedingAttempts)
    writeLocal(KEYS.breeding, items.filter((item) => item.id !== id))
    return
  }
  const { error } = await supabase.from('breeding_attempts').delete().eq('id', id)
  if (error) throw error
}

// ============================================================
// Manejos
// ============================================================
export async function listManagementEvents(): Promise<ManagementEvent[]> {
  if (!isSupabaseConfigured || !supabase) return readLocal(KEYS.management, demoManagementEvents)
  const { data, error } = await supabase
    .from('management_events')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    ...row,
    products: row.products ?? [],
    participants: row.participants ?? []
  })) as ManagementEvent[]
}

export async function saveManagementEvent(
  input: Partial<ManagementEvent> & Pick<ManagementEvent, 'date' | 'type' | 'title'>
): Promise<ManagementEvent> {
  const now = new Date().toISOString()
  const participants = input.participants ?? []
  const animalCount = input.animal_count ?? (participants.length || 0)

  if (!isSupabaseConfigured || !supabase) {
    const items = readLocal<ManagementEvent[]>(KEYS.management, demoManagementEvents)
    const existing = input.id ? items.find((item) => item.id === input.id) : undefined
    const event: ManagementEvent = {
      id: existing?.id ?? crypto.randomUUID(),
      date: input.date,
      type: input.type,
      title: input.title,
      products: input.products ?? existing?.products ?? [],
      lot: input.lot ?? existing?.lot ?? null,
      animal_count: animalCount,
      participants,
      notes: input.notes ?? existing?.notes ?? null,
      created_by: existing?.created_by ?? null,
      created_at: existing?.created_at ?? now
    }
    const next = existing ? items.map((item) => (item.id === event.id ? event : item)) : [event, ...items]
    writeLocal(KEYS.management, next)
    return event
  }

  const payload = {
    date: input.date,
    type: input.type,
    title: input.title,
    products: input.products ?? [],
    lot: input.lot ?? null,
    animal_count: animalCount,
    participants,
    notes: input.notes ?? null
  }
  const query = input.id
    ? supabase.from('management_events').update(payload).eq('id', input.id).select().single()
    : supabase.from('management_events').insert(payload).select().single()
  const { data, error } = await query
  if (error) throw error
  const row = data as any
  return { ...row, products: row.products ?? [], participants: row.participants ?? [] } as ManagementEvent
}

export async function removeManagementEvent(id: string) {
  if (!isSupabaseConfigured || !supabase) {
    const items = readLocal<ManagementEvent[]>(KEYS.management, demoManagementEvents)
    writeLocal(KEYS.management, items.filter((item) => item.id !== id))
    return
  }
  const { error } = await supabase.from('management_events').delete().eq('id', id)
  if (error) throw error
}
