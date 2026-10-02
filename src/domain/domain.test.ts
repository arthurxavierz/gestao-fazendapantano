import { describe, expect, it } from 'vitest'
import type { Animal, BreedingAttempt, HealthEvent } from '../types'
import { addDays, todayISO } from '../utils/format'
import { buildAgenda } from './agenda'
import { animalCategory, dailyGain, expandNumberRange, originType } from './herd'
import { pendingDoses } from './health'
import {
  currentAttemptNumber,
  defaultProtocols,
  defaultSettings,
  diagnosisDue,
  failedStreak,
  isBreedingFemale,
  isLastChance,
  nextStep,
  reachesDiscard,
  reproState
} from './reproduction'

const today = todayISO()

function cow(extra: Partial<Animal> = {}): Animal {
  return {
    id: 'a-1',
    number: '087',
    sex: 'femea',
    status: 'normal',
    birth_date: addDays(today, -365 * 4),
    created_at: today,
    updated_at: today,
    ...extra
  }
}

let seq = 0
function attempt(result: BreedingAttempt['result'], startDaysAgo: number, extra: Partial<BreedingAttempt> = {}): BreedingAttempt {
  seq += 1
  return {
    id: `r-${seq}`,
    animal_id: 'a-1',
    method: 'iatf',
    steps: defaultProtocols[0].steps,
    steps_done: [],
    start_date: addDays(today, -startDaysAgo),
    result,
    created_at: addDays(today, -startDaysAgo),
    ...extra
  }
}

describe('regra de descarte reprodutivo', () => {
  it('conta vazias e abortos seguidos e zera na prenhez', () => {
    expect(failedStreak([attempt('vazia', 300), attempt('aborto', 200)])).toBe(2)
    expect(failedStreak([attempt('vazia', 300), attempt('prenhe', 200), attempt('vazia', 10)])).toBe(1)
    expect(failedStreak([attempt('vazia', 300), attempt('parida', 200)])).toBe(0)
  })

  it('não conta a tentativa em andamento', () => {
    expect(failedStreak([attempt('vazia', 100), attempt('pendente', 5)])).toBe(1)
    expect(currentAttemptNumber([attempt('vazia', 100), attempt('pendente', 5)])).toBe(2)
  })

  it('a quarta vazia seguida leva ao descarte com o limite padrão de 4', () => {
    const own = [attempt('vazia', 300), attempt('vazia', 220), attempt('vazia', 150)]
    const fourth = attempt('pendente', 40)
    const list = [...own, fourth]
    expect(isLastChance(list, defaultSettings)).toBe(true)
    expect(reachesDiscard(list, fourth.id, 'vazia', defaultSettings)).toBe(true)
    expect(reachesDiscard(list, fourth.id, 'prenhe', defaultSettings)).toBe(false)
  })

  it('a terceira vazia ainda não descarta', () => {
    const list = [attempt('vazia', 300), attempt('vazia', 220), attempt('pendente', 40)]
    expect(reachesDiscard(list, list[2].id, 'vazia', defaultSettings)).toBe(false)
  })

  it('respeita o limite configurado pela fazenda', () => {
    const settings = { ...defaultSettings, max_breeding_attempts: 2 }
    const list = [attempt('vazia', 100), attempt('pendente', 40)]
    expect(reachesDiscard(list, list[1].id, 'vazia', settings)).toBe(true)
  })
})

describe('fase reprodutiva', () => {
  it('sem tentativas, fêmea adulta está vazia', () => {
    expect(reproState(cow(), [], defaultSettings)).toBe('vazia')
  })

  it('bezerra e fêmea jovem não estão aptas', () => {
    const young = cow({ birth_date: addDays(today, -200) })
    expect(isBreedingFemale(young, defaultSettings)).toBe(false)
    expect(reproState(young, [], defaultSettings)).toBe('nao_apta')
  })

  it('protocolo sem inseminação é "em protocolo"; com inseminação, aguarda diagnóstico', () => {
    expect(reproState(cow(), [attempt('pendente', 3)], defaultSettings)).toBe('em_protocolo')
    expect(reproState(cow(), [attempt('pendente', 20, { insemination_date: addDays(today, -10) })], defaultSettings)).toBe('inseminada')
  })

  it('pós-parto só por 45 dias, depois volta a vazia', () => {
    expect(reproState(cow(), [attempt('parida', 330, { calving_date: addDays(today, -10) })], defaultSettings)).toBe('parida')
    expect(reproState(cow(), [attempt('parida', 400, { calving_date: addDays(today, -80) })], defaultSettings)).toBe('vazia')
  })

  it('descarte prevalece sobre o histórico', () => {
    expect(reproState(cow({ status: 'descarte' }), [attempt('prenhe', 100)], defaultSettings)).toBe('descarte')
  })

  it('próxima etapa e diagnóstico seguem os dias do protocolo', () => {
    const a = attempt('pendente', 5, { steps_done: [{ index: 0, done_at: today }] })
    expect(nextStep(a)?.step.day).toBe(8)
    expect(nextStep(a)?.due).toBe(addDays(today, 3))
    expect(diagnosisDue(a, defaultSettings)).toBe(addDays(today, 35))
  })
})

describe('rebanho', () => {
  it('deduz a categoria pela idade e pelo sexo', () => {
    expect(animalCategory(cow({ birth_date: addDays(today, -100) }))).toBe('bezerra')
    expect(animalCategory(cow({ birth_date: addDays(today, -500) }))).toBe('novilha')
    expect(animalCategory(cow({ sex: 'macho', birth_date: addDays(today, -500) }))).toBe('garrote')
    expect(animalCategory(cow({ category: 'touro', sex: 'macho' }))).toBe('touro')
  })

  it('interpreta a origem antiga em texto', () => {
    expect(originType(cow({ origin: 'Comprado' }))).toBe('comprado')
    expect(originType(cow({ origin: 'Nascido na fazenda' }))).toBe('nascido')
    expect(originType(cow({ mother_id: 'a-2' }))).toBe('nascido')
  })

  it('expande faixas de brinco mantendo zeros à esquerda', () => {
    expect(expandNumberRange('001-003, 010')).toEqual(['001', '002', '003', '010'])
    expect(expandNumberRange('401-403 405')).toEqual(['401', '402', '403', '405'])
    expect(expandNumberRange('5-3')).toEqual(['5', '4', '3'])
    expect(expandNumberRange('7, 7, 8')).toEqual(['7', '8'])
  })

  it('calcula o ganho médio diário', () => {
    expect(dailyGain([{ weighed_at: '2026-01-01', weight: 300 }, { weighed_at: '2026-01-31', weight: 330 }])).toBe(1)
    expect(dailyGain([{ weighed_at: '2026-01-01', weight: 300 }])).toBeNull()
  })
})

describe('agenda e sanitário', () => {
  it('a última aplicação do produto define a próxima dose', () => {
    const events: HealthEvent[] = [
      { id: 'h1', animal_id: 'a-1', kind: 'vacina', product: 'Raiva', applied_at: '2025-01-01', next_due_date: '2026-01-01', created_at: today },
      { id: 'h2', animal_id: 'a-1', kind: 'vacina', product: 'raiva', applied_at: '2026-01-02', next_due_date: '2027-01-02', created_at: today }
    ]
    expect(pendingDoses(events).map((item) => item.id)).toEqual(['h2'])
  })

  it('agrupa a mesma etapa de várias matrizes num item só', () => {
    const animals = [cow(), cow({ id: 'a-2', number: '088' })]
    const attempts = [
      attempt('pendente', 5, { steps_done: [{ index: 0, done_at: today }] }),
      attempt('pendente', 5, { animal_id: 'a-2', steps_done: [{ index: 0, done_at: today }] })
    ]
    const agenda = buildAgenda(animals, attempts, [], defaultSettings)
    expect(agenda).toHaveLength(1)
    expect(agenda[0].animalIds).toEqual(['a-1', 'a-2'])
    expect(agenda[0].title).toContain('D8')
  })

  it('animal que saiu do rebanho não aparece na agenda', () => {
    const agenda = buildAgenda([cow({ status: 'vendido' })], [attempt('pendente', 5)], [], defaultSettings)
    expect(agenda).toHaveLength(0)
  })
})
