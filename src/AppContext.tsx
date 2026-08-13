import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Animal, BreedingAttempt, CountSession, ManagementEvent, Occurrence } from './types'
import {
  listAnimals,
  listBreedingAttempts,
  listCounts,
  listManagementEvents,
  listOccurrences,
  removeAnimal,
  removeBreedingAttempt,
  removeManagementEvent,
  saveAnimal,
  saveBreedingAttempt,
  saveCount,
  saveManagementEvent,
  saveOccurrence
} from './services/repository'

type AppContextValue = {
  animals: Animal[]
  occurrences: Occurrence[]
  counts: CountSession[]
  breedingAttempts: BreedingAttempt[]
  managementEvents: ManagementEvent[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  upsertAnimal: (animal: Partial<Animal> & Pick<Animal, 'number'>) => Promise<Animal>
  deleteAnimal: (id: string) => Promise<void>
  addOccurrence: (occurrence: Omit<Occurrence, 'id' | 'created_at'>) => Promise<Occurrence>
  addCount: (count: Omit<CountSession, 'id' | 'created_at'>) => Promise<CountSession>
  upsertBreedingAttempt: (
    attempt: Partial<BreedingAttempt> & Pick<BreedingAttempt, 'animal_id' | 'attempt_number' | 'protocol_date' | 'result'>
  ) => Promise<BreedingAttempt>
  deleteBreedingAttempt: (id: string) => Promise<void>
  upsertManagementEvent: (
    event: Partial<ManagementEvent> & Pick<ManagementEvent, 'date' | 'type' | 'title'>
  ) => Promise<ManagementEvent>
  deleteManagementEvent: (id: string) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [animals, setAnimals] = useState<Animal[]>([])
  const [occurrences, setOccurrences] = useState<Occurrence[]>([])
  const [counts, setCounts] = useState<CountSession[]>([])
  const [breedingAttempts, setBreedingAttempts] = useState<BreedingAttempt[]>([])
  const [managementEvents, setManagementEvents] = useState<ManagementEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [animalsData, occurrencesData, countsData, breedingData, managementData] = await Promise.all([
        listAnimals(),
        listOccurrences(),
        listCounts(),
        listBreedingAttempts(),
        listManagementEvents()
      ])
      setAnimals(animalsData)
      setOccurrences(occurrencesData)
      setCounts(countsData)
      setBreedingAttempts(breedingData)
      setManagementEvents(managementData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const upsertAnimal = async (animal: Partial<Animal> & Pick<Animal, 'number'>) => {
    const saved = await saveAnimal(animal)
    await refresh()
    return saved
  }

  const deleteAnimal = async (id: string) => {
    await removeAnimal(id)
    await refresh()
  }

  const addOccurrence = async (occurrence: Omit<Occurrence, 'id' | 'created_at'>) => {
    const saved = await saveOccurrence(occurrence)
    await refresh()
    return saved
  }

  const addCount = async (count: Omit<CountSession, 'id' | 'created_at'>) => {
    const saved = await saveCount(count)
    await refresh()
    return saved
  }

  const upsertBreedingAttempt = async (
    attempt: Partial<BreedingAttempt> & Pick<BreedingAttempt, 'animal_id' | 'attempt_number' | 'protocol_date' | 'result'>
  ) => {
    const saved = await saveBreedingAttempt(attempt)
    await refresh()
    return saved
  }

  const deleteBreedingAttempt = async (id: string) => {
    await removeBreedingAttempt(id)
    await refresh()
  }

  const upsertManagementEvent = async (
    event: Partial<ManagementEvent> & Pick<ManagementEvent, 'date' | 'type' | 'title'>
  ) => {
    const saved = await saveManagementEvent(event)
    await refresh()
    return saved
  }

  const deleteManagementEvent = async (id: string) => {
    await removeManagementEvent(id)
    await refresh()
  }

  const value = useMemo(
    () => ({
      animals,
      occurrences,
      counts,
      breedingAttempts,
      managementEvents,
      loading,
      error,
      refresh,
      upsertAnimal,
      deleteAnimal,
      addOccurrence,
      addCount,
      upsertBreedingAttempt,
      deleteBreedingAttempt,
      upsertManagementEvent,
      deleteManagementEvent
    }),
    [animals, occurrences, counts, breedingAttempts, managementEvents, loading, error, refresh]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useAppData() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useAppData deve ser usado dentro de AppProvider')
  return context
}
