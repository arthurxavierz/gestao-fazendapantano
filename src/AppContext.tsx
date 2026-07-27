import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Animal, CountSession, Occurrence } from './types'
import {
  listAnimals,
  listCounts,
  listOccurrences,
  removeAnimal,
  saveAnimal,
  saveCount,
  saveOccurrence
} from './services/repository'

type AppContextValue = {
  animals: Animal[]
  occurrences: Occurrence[]
  counts: CountSession[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  upsertAnimal: (animal: Partial<Animal> & Pick<Animal, 'number'>) => Promise<Animal>
  deleteAnimal: (id: string) => Promise<void>
  addOccurrence: (occurrence: Omit<Occurrence, 'id' | 'created_at'>) => Promise<Occurrence>
  addCount: (count: Omit<CountSession, 'id' | 'created_at'>) => Promise<CountSession>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [animals, setAnimals] = useState<Animal[]>([])
  const [occurrences, setOccurrences] = useState<Occurrence[]>([])
  const [counts, setCounts] = useState<CountSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [animalsData, occurrencesData, countsData] = await Promise.all([
        listAnimals(),
        listOccurrences(),
        listCounts()
      ])
      setAnimals(animalsData)
      setOccurrences(occurrencesData)
      setCounts(countsData)
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

  const value = useMemo(
    () => ({
      animals,
      occurrences,
      counts,
      loading,
      error,
      refresh,
      upsertAnimal,
      deleteAnimal,
      addOccurrence,
      addCount
    }),
    [animals, occurrences, counts, loading, error, refresh]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useAppData() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useAppData deve ser usado dentro de AppProvider')
  return context
}
