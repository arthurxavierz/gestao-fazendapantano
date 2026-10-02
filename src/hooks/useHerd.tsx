import { createContext, useContext, useMemo } from 'react'
import { useAppData } from '../AppContext'
import { animalCategory, isActive } from '../domain/herd'
import { attemptsOf, failedStreak, isBreedingFemale, reproState, type ReproState } from '../domain/reproduction'
import type { Animal, AnimalCategory, BreedingAttempt } from '../types'

export interface HerdInfo {
  animal: Animal
  category: AnimalCategory | null
  attempts: BreedingAttempt[]
  state: ReproState
  /** Tentativas seguidas sem prenhez. */
  streak: number
  breeding: boolean
}

interface HerdValue {
  info: Map<string, HerdInfo>
  active: Animal[]
  /** Matrizes ativas: aptas à reprodução, com histórico ou em descarte. */
  females: HerdInfo[]
  get: (id: string) => HerdInfo | undefined
}

const HerdContext = createContext<HerdValue | null>(null)

/**
 * Visão calculada do rebanho, montada uma vez por atualização dos dados.
 * Cada tela usa a mesma conta para categoria e situação reprodutiva, então o
 * painel, o quadro de reprodução e a ficha do animal nunca discordam.
 */
export function HerdProvider({ children }: { children: React.ReactNode }) {
  const { animals, attempts, settings } = useAppData()

  const value = useMemo<HerdValue>(() => {
    const byAnimal = new Map<string, BreedingAttempt[]>()
    for (const attempt of attempts) {
      const list = byAnimal.get(attempt.animal_id) ?? []
      list.push(attempt)
      byAnimal.set(attempt.animal_id, list)
    }

    const info = new Map<string, HerdInfo>()
    for (const animal of animals) {
      const own = attemptsOf(animal.id, byAnimal.get(animal.id) ?? [])
      info.set(animal.id, {
        animal,
        category: animalCategory(animal),
        attempts: own,
        state: reproState(animal, own, settings),
        streak: failedStreak(own),
        breeding: isBreedingFemale(animal, settings)
      })
    }

    const active = animals.filter(isActive)
    const females = [...info.values()]
      .filter((item) => isActive(item.animal) && item.animal.sex === 'femea')
      .filter((item) => item.breeding || item.state === 'descarte' || item.attempts.length > 0)

    return { info, active, females, get: (id: string) => info.get(id) }
  }, [animals, attempts, settings])

  return <HerdContext.Provider value={value}>{children}</HerdContext.Provider>
}

export function useHerd() {
  const context = useContext(HerdContext)
  if (!context) throw new Error('useHerd deve ser usado dentro de HerdProvider')
  return context
}
