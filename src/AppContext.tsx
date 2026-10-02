import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Animal,
  BreedingAttempt,
  BreedingMethod,
  CountSession,
  FarmSettings,
  HealthEvent,
  Occurrence,
  ProtocolStep,
  PurchaseBatch,
  ReproProtocol,
  Weighing
} from './types'
import {
  createAnimals,
  isAnimalsSchemaOutdated,
  listAnimals,
  listCounts,
  listOccurrences,
  loadSettings,
  patchAnimal,
  removeAnimal,
  saveAnimal,
  saveCount,
  saveOccurrence,
  saveSettings
} from './services/repository'
import { deleteRow, getMissingTables, insertRows, listRows, updateRow } from './services/store'
import { demoAttempts, demoBatches, demoHealthEvents, demoProtocols, demoWeighings } from './services/demoData'
import { defaultProtocols, defaultSettings, expectedCalving } from './domain/reproduction'
import { suggestCategory } from './domain/herd'
import { todayISO } from './utils/format'

type NewAnimal = Partial<Animal> & Pick<Animal, 'number'>

export interface StartProtocolInput {
  animalIds: string[]
  protocol: ReproProtocol
  startDate: string
  sire?: string
  technician?: string
}

export interface DirectBreedingInput {
  animalIds: string[]
  method: BreedingMethod
  date: string
  sire?: string
  technician?: string
}

export interface DiagnosisInput {
  date: string
  entries: { attemptId: string; result: 'prenhe' | 'vazia' }[]
  /** Matrizes que atingiram o limite e a pessoa confirmou o descarte. */
  discardAnimalIds: string[]
}

export interface CalvingInput {
  attemptId: string
  date: string
  outcome: 'parto' | 'aborto'
  calf?: { number: string; sex: Animal['sex']; weight?: number | null; notes?: string }
  discard?: boolean
}

export interface HealthInput {
  animalIds: string[]
  kind: HealthEvent['kind']
  product: string
  dose?: string
  applied_at: string
  next_due_date?: string
  withdrawal_until?: string
  product_batch?: string
  notes?: string
}

type AppContextValue = {
  animals: Animal[]
  occurrences: Occurrence[]
  counts: CountSession[]
  batches: PurchaseBatch[]
  protocols: ReproProtocol[]
  attempts: BreedingAttempt[]
  healthEvents: HealthEvent[]
  weighings: Weighing[]
  settings: FarmSettings
  loading: boolean
  error: string | null
  /** Tabelas novas que ainda não existem no banco. */
  missingTables: string[]
  schemaOutdated: boolean
  refresh: () => Promise<void>
  upsertAnimal: (animal: NewAnimal) => Promise<Animal>
  createAnimalsBulk: (animals: NewAnimal[]) => Promise<Animal[]>
  deleteAnimal: (id: string) => Promise<void>
  updateAnimal: (id: string, patch: Partial<Animal>) => Promise<void>
  /** Mesma alteração em vários animais (mudança de lote, saída em lote). */
  updateAnimals: (ids: string[], patch: Partial<Animal>, note?: { type: Occurrence['type']; text: string }) => Promise<void>
  addOccurrence: (occurrence: Omit<Occurrence, 'id' | 'created_at'>) => Promise<Occurrence>
  addCount: (count: Omit<CountSession, 'id' | 'created_at'>) => Promise<CountSession>
  saveBatch: (batch: Partial<PurchaseBatch> & Pick<PurchaseBatch, 'code' | 'purchase_date'>) => Promise<PurchaseBatch>
  deleteBatch: (id: string) => Promise<void>
  saveProtocol: (protocol: Partial<ReproProtocol> & Pick<ReproProtocol, 'name' | 'steps' | 'method'>) => Promise<void>
  deleteProtocol: (id: string) => Promise<void>
  startProtocol: (input: StartProtocolInput) => Promise<void>
  startDirectBreeding: (input: DirectBreedingInput) => Promise<void>
  completeStep: (attemptIds: string[], stepIndex: number, date: string, sire?: string) => Promise<void>
  registerDiagnosis: (input: DiagnosisInput) => Promise<void>
  registerCalving: (input: CalvingInput) => Promise<Animal | null>
  cancelAttempt: (attemptId: string) => Promise<void>
  addHealthEvents: (input: HealthInput) => Promise<void>
  deleteHealthEvent: (id: string) => Promise<void>
  addWeighings: (entries: { animalId: string; weight: number }[], date: string, notes?: string) => Promise<void>
  deleteWeighing: (id: string) => Promise<void>
  updateSettings: (settings: FarmSettings) => Promise<void>
  discardAnimal: (animalId: string, reason: string) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [animals, setAnimals] = useState<Animal[]>([])
  const [occurrences, setOccurrences] = useState<Occurrence[]>([])
  const [counts, setCounts] = useState<CountSession[]>([])
  const [batches, setBatches] = useState<PurchaseBatch[]>([])
  const [protocols, setProtocols] = useState<ReproProtocol[]>([])
  const [attempts, setAttempts] = useState<BreedingAttempt[]>([])
  const [healthEvents, setHealthEvents] = useState<HealthEvent[]>([])
  const [weighings, setWeighings] = useState<Weighing[]>([])
  const [settings, setSettings] = useState<FarmSettings>(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [missingTables, setMissingTables] = useState<string[]>([])
  const [schemaOutdated, setSchemaOutdated] = useState(false)
  const loadedOnce = useRef(false)

  // Depois da primeira carga, a atualização é silenciosa: a tela não pisca a
  // cada registro salvo.
  const refresh = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true)
    setError(null)
    try {
      const [a, o, c, b, p, r, h, w, s] = await Promise.all([
        listAnimals(),
        listOccurrences(),
        listCounts(),
        listRows<PurchaseBatch>('purchase_batches', demoBatches),
        listRows<ReproProtocol>('repro_protocols', demoProtocols),
        listRows<BreedingAttempt>('breeding_attempts', demoAttempts),
        listRows<HealthEvent>('health_events', demoHealthEvents),
        listRows<Weighing>('weighings', demoWeighings),
        loadSettings()
      ])
      setAnimals(a)
      setOccurrences(o)
      setCounts(c)
      setBatches(b)
      // Banco novo, sem protocolos: mostra os modelos padrão até alguém salvar um.
      setProtocols(p.length ? p : defaultProtocols.map((item, index) => ({ ...item, id: `default-${index}`, created_at: new Date(0).toISOString() })))
      setAttempts(r.map((item) => ({ ...item, steps: item.steps ?? [], steps_done: item.steps_done ?? [] })))
      setHealthEvents(h)
      setWeighings(w)
      setSettings(s)
      setMissingTables(getMissingTables())
      setSchemaOutdated(isAnimalsSchemaOutdated())
      loadedOnce.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** Executa uma gravação e recarrega os dados, mesmo se der erro no meio. */
  async function mutate<T>(task: () => Promise<T>): Promise<T> {
    try {
      return await task()
    } finally {
      await refresh()
    }
  }

  const attemptById = (id: string) => attempts.find((item) => item.id === id)

  const value: AppContextValue = {
    animals,
    occurrences,
    counts,
    batches,
    protocols,
    attempts,
    healthEvents,
    weighings,
    settings,
    loading,
    error,
    missingTables,
    schemaOutdated,
    refresh,

    upsertAnimal: (animal) => mutate(() => saveAnimal(animal)),
    createAnimalsBulk: (items) => mutate(() => createAnimals(items)),
    deleteAnimal: (id) => mutate(() => removeAnimal(id)),
    updateAnimal: (id, patch) => mutate(() => patchAnimal(id, patch)),
    updateAnimals: (ids, patch, note) =>
      mutate(async () => {
        for (const id of ids) {
          await patchAnimal(id, patch)
          // A ocorrência deixa a saída no histórico do animal e na linha do tempo da administração.
          if (note) await saveOccurrence({ animal_id: id, type: note.type, note: note.text })
        }
      }),
    addOccurrence: (occurrence) => mutate(() => saveOccurrence(occurrence)),
    addCount: (count) => mutate(() => saveCount(count)),

    saveBatch: (batch) =>
      mutate(async () => {
        const { id, created_at: _c, created_by: _b, ...rest } = batch as PurchaseBatch
        if (id) {
          await updateRow<PurchaseBatch>('purchase_batches', id, rest)
          return { ...(batch as PurchaseBatch) }
        }
        const [saved] = await insertRows<PurchaseBatch>('purchase_batches', [rest])
        return saved
      }),
    deleteBatch: (id) => mutate(() => deleteRow('purchase_batches', id)),

    saveProtocol: (protocol) =>
      mutate(async () => {
        const body = {
          name: protocol.name,
          description: protocol.description ?? null,
          method: protocol.method,
          steps: [...protocol.steps].sort((a, b) => a.day - b.day),
          active: protocol.active ?? true
        }
        if (protocol.id && !protocol.id.startsWith('default-')) await updateRow<ReproProtocol>('repro_protocols', protocol.id, body)
        else await insertRows<ReproProtocol>('repro_protocols', [body])
      }),
    deleteProtocol: (id) => mutate(async () => {
      if (!id.startsWith('default-')) await deleteRow('repro_protocols', id)
    }),

    startProtocol: ({ animalIds, protocol, startDate, sire, technician }) =>
      mutate(async () => {
        const steps: ProtocolStep[] = [...protocol.steps].sort((a, b) => a.day - b.day)
        // O D0 é feito no próprio dia do início, então já nasce concluído quando a data é hoje ou passou.
        const doneNow = steps
          .map((step, index) => ({ step, index }))
          .filter(({ step }) => step.day === 0 && step.kind !== 'inseminacao' && startDate <= todayISO())
          .map(({ index }) => ({ index, done_at: `${startDate}T12:00:00` }))
        await insertRows<BreedingAttempt>('breeding_attempts', animalIds.map((animal_id) => ({
          animal_id,
          method: protocol.method,
          protocol_id: protocol.id.startsWith('default-') ? null : protocol.id,
          protocol_name: protocol.name,
          steps,
          steps_done: doneNow,
          start_date: startDate,
          insemination_date: null,
          sire: sire || null,
          technician: technician || null,
          diagnosis_date: null,
          result: 'pendente' as const,
          expected_calving_date: null,
          calving_date: null,
          calf_id: null,
          notes: null
        })))
      }),

    startDirectBreeding: ({ animalIds, method, date, sire, technician }) =>
      mutate(async () => {
        await insertRows<BreedingAttempt>('breeding_attempts', animalIds.map((animal_id) => ({
          animal_id,
          method,
          protocol_id: null,
          protocol_name: method === 'monta' ? 'Monta natural' : method === 'te' ? 'Transferência de embrião' : 'Inseminação no cio',
          steps: [],
          steps_done: [],
          start_date: date,
          insemination_date: date,
          sire: sire || null,
          technician: technician || null,
          diagnosis_date: null,
          result: 'pendente' as const,
          expected_calving_date: null,
          calving_date: null,
          calf_id: null,
          notes: null
        })))
      }),

    completeStep: (attemptIds, stepIndex, date, sire) =>
      mutate(async () => {
        for (const id of attemptIds) {
          const attempt = attemptById(id)
          if (!attempt) continue
          const step = attempt.steps[stepIndex]
          const steps_done = [...attempt.steps_done.filter((item) => item.index !== stepIndex), { index: stepIndex, done_at: `${date}T12:00:00` }]
          const patch: Partial<BreedingAttempt> = { steps_done }
          if (step?.kind === 'inseminacao') {
            patch.insemination_date = date
            if (sire) patch.sire = sire
          }
          await updateRow<BreedingAttempt>('breeding_attempts', id, patch)
        }
      }),

    registerDiagnosis: ({ date, entries, discardAnimalIds }) =>
      mutate(async () => {
        for (const entry of entries) {
          const attempt = attemptById(entry.attemptId)
          if (!attempt) continue
          const diagnosisIndex = attempt.steps.findIndex((step) => step.kind === 'diagnostico')
          const steps_done = diagnosisIndex >= 0 && !attempt.steps_done.some((item) => item.index === diagnosisIndex)
            ? [...attempt.steps_done, { index: diagnosisIndex, done_at: `${date}T12:00:00` }]
            : attempt.steps_done
          const insemination = attempt.insemination_date ?? attempt.start_date
          await updateRow<BreedingAttempt>('breeding_attempts', attempt.id, {
            result: entry.result,
            diagnosis_date: date,
            insemination_date: insemination,
            steps_done,
            expected_calving_date: entry.result === 'prenhe' ? expectedCalving(insemination, settings) : null
          })
        }
        for (const animalId of discardAnimalIds) {
          await saveOccurrence({
            animal_id: animalId,
            type: 'descarte',
            note: `Descarte reprodutivo: ${settings.max_breeding_attempts} tentativas seguidas sem prenhez. Separada para abate.`
          })
        }
      }),

    registerCalving: ({ attemptId, date, outcome, calf, discard }) =>
      mutate(async () => {
        const attempt = attemptById(attemptId)
        if (!attempt) throw new Error('Gestação não encontrada.')
        const mother = animals.find((item) => item.id === attempt.animal_id)
        if (outcome === 'aborto') {
          await updateRow<BreedingAttempt>('breeding_attempts', attemptId, { result: 'aborto', calving_date: date })
          if (discard) {
            await saveOccurrence({
              animal_id: attempt.animal_id,
              type: 'descarte',
              note: `Descarte reprodutivo após aborto: ${settings.max_breeding_attempts} tentativas sem gestação concluída.`
            })
          }
          return null
        }
        let created: Animal | null = null
        if (calf?.number) {
          const [saved] = await createAnimals([{
            number: calf.number,
            sex: calf.sex,
            category: calf.sex === 'femea' ? 'bezerra' : 'bezerro',
            breed: mother?.breed ?? null,
            birth_date: date,
            weight: calf.weight ?? null,
            lot: mother?.lot ?? null,
            origin: 'Nascido na fazenda',
            origin_type: 'nascido',
            mother_id: attempt.animal_id,
            sire: attempt.sire ?? null,
            entry_date: date,
            status: 'normal',
            notes: calf.notes || null
          }])
          created = saved
          if (saved && calf.weight) {
            await insertRows<Weighing>('weighings', [{ animal_id: saved.id, weighed_at: date, weight: calf.weight, notes: 'Peso ao nascer' }])
          }
        }
        await updateRow<BreedingAttempt>('breeding_attempts', attemptId, {
          result: 'parida',
          calving_date: date,
          calf_id: created?.id ?? null
        })
        // Novilha que pariu passa a ser vaca.
        if (mother && (mother.category === 'novilha' || (!mother.category && suggestCategory(mother.sex, mother.birth_date) === 'novilha'))) {
          await patchAnimal(mother.id, { category: 'vaca' })
        }
        return created
      }),

    cancelAttempt: (attemptId) => mutate(() => deleteRow('breeding_attempts', attemptId)),

    addHealthEvents: (input) =>
      mutate(async () => {
        await insertRows<HealthEvent>('health_events', input.animalIds.map((animal_id) => ({
          animal_id,
          kind: input.kind,
          product: input.product.trim(),
          dose: input.dose || null,
          applied_at: input.applied_at,
          next_due_date: input.next_due_date || null,
          withdrawal_until: input.withdrawal_until || null,
          product_batch: input.product_batch || null,
          notes: input.notes || null
        })))
      }),
    deleteHealthEvent: (id) => mutate(() => deleteRow('health_events', id)),

    addWeighings: (entries, date, notes) =>
      mutate(async () => {
        await insertRows<Weighing>('weighings', entries.map((entry) => ({
          animal_id: entry.animalId,
          weighed_at: date,
          weight: entry.weight,
          notes: notes || null
        })))
        // O peso do cadastro acompanha a pesagem mais recente. Uma pesagem
        // antiga lançada depois não sobrescreve o peso atual.
        for (const entry of entries) {
          const newer = weighings.some((item) => item.animal_id === entry.animalId && item.weighed_at > date)
          if (!newer) await patchAnimal(entry.animalId, { weight: entry.weight })
        }
      }),
    deleteWeighing: (id) => mutate(() => deleteRow('weighings', id)),

    updateSettings: (next) => mutate(() => saveSettings(next)),

    discardAnimal: (animalId, reason) =>
      mutate(() => saveOccurrence({ animal_id: animalId, type: 'descarte', note: reason }).then(() => undefined))
  }

  const memo = useMemo(() => value, [animals, occurrences, counts, batches, protocols, attempts, healthEvents, weighings, settings, loading, error, missingTables, schemaOutdated])

  return <AppContext.Provider value={memo}>{children}</AppContext.Provider>
}

export function useAppData() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useAppData deve ser usado dentro de AppProvider')
  return context
}

/** Busca rápida de animal por id, usada em várias telas. */
export function useAnimalIndex() {
  const { animals } = useAppData()
  return useMemo(() => new Map(animals.map((animal) => [animal.id, animal])), [animals])
}
