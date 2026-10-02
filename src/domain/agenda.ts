import type { Animal, BreedingAttempt, FarmSettings, HealthEvent } from '../types'
import { addDays, todayISO } from '../utils/format'
import { isActive } from './herd'
import { pendingDoses } from './health'
import { diagnosisDue, nextStep } from './reproduction'

export type AgendaKind = 'protocolo' | 'inseminacao' | 'diagnostico' | 'parto' | 'sanitario'

export interface AgendaItem {
  id: string
  date: string
  kind: AgendaKind
  title: string
  detail: string
  animalIds: string[]
  /** Tentativas envolvidas, para concluir o passo direto da agenda. */
  attemptIds: string[]
  /** Índice do passo do protocolo, quando o item é um passo. */
  stepIndex?: number
  href: string
}

export const agendaKindLabel: Record<AgendaKind, string> = {
  protocolo: 'Protocolo',
  inseminacao: 'Inseminação',
  diagnostico: 'Diagnóstico',
  parto: 'Parto previsto',
  sanitario: 'Sanitário'
}

/**
 * Monta a agenda da fazenda a partir dos registros. Nada é agendado à mão:
 * passos de protocolo, diagnósticos, partos e reforços de vacina saem das
 * datas já lançadas. Itens do mesmo dia e mesmo manejo são agrupados, porque
 * no curral o trabalho é feito por lote, não animal a animal.
 */
export function buildAgenda(
  animals: Animal[],
  attempts: BreedingAttempt[],
  healthEvents: HealthEvent[],
  settings: FarmSettings,
  horizonDays = 120
): AgendaItem[] {
  const active = new Map(animals.filter(isActive).map((animal) => [animal.id, animal]))
  const limit = addDays(todayISO(), horizonDays)
  const groups = new Map<string, AgendaItem>()

  const push = (key: string, base: Omit<AgendaItem, 'animalIds' | 'attemptIds'>, animalId: string, attemptId?: string) => {
    if (base.date > limit) return
    const existing = groups.get(key)
    if (existing) {
      if (!existing.animalIds.includes(animalId)) existing.animalIds.push(animalId)
      if (attemptId) existing.attemptIds.push(attemptId)
      return
    }
    groups.set(key, { ...base, animalIds: [animalId], attemptIds: attemptId ? [attemptId] : [] })
  }

  for (const attempt of attempts) {
    if (!active.has(attempt.animal_id)) continue

    if (attempt.result === 'pendente') {
      const next = nextStep(attempt)
      // Passos antes do diagnóstico. O diagnóstico tem tratamento próprio abaixo.
      if (next && next.step.kind !== 'diagnostico') {
        const kind: AgendaKind = next.step.kind === 'inseminacao' ? 'inseminacao' : 'protocolo'
        push(
          `step|${next.due}|${attempt.protocol_name}|${next.index}|${attempt.start_date}`,
          {
            id: `step-${attempt.id}-${next.index}`,
            date: next.due,
            kind,
            title: `D${next.step.day} · ${next.step.title}`,
            detail: attempt.protocol_name || 'Protocolo reprodutivo',
            stepIndex: next.index,
            href: '/reproducao'
          },
          attempt.animal_id,
          attempt.id
        )
        continue
      }
      const due = diagnosisDue(attempt, settings)
      if (due && (attempt.insemination_date || next?.step.kind === 'diagnostico')) {
        push(
          `diag|${due}`,
          {
            id: `diag-${due}`,
            date: due,
            kind: 'diagnostico',
            title: 'Diagnóstico de gestação',
            detail: 'Confirmar prenhez por ultrassom ou toque',
            href: '/reproducao'
          },
          attempt.animal_id,
          attempt.id
        )
      }
    }

    if (attempt.result === 'prenhe' && attempt.expected_calving_date) {
      const animal = active.get(attempt.animal_id)!
      push(
        `parto|${attempt.id}`,
        {
          id: `parto-${attempt.id}`,
          date: attempt.expected_calving_date,
          kind: 'parto',
          title: `Parto previsto · matriz ${animal.number}`,
          detail: attempt.sire ? `Touro/sêmen: ${attempt.sire}` : 'Acompanhar a matriz nos dias próximos',
          href: `/animais/${animal.id}`
        },
        animal.id,
        attempt.id
      )
    }
  }

  for (const dose of pendingDoses(healthEvents)) {
    if (!active.has(dose.animal_id) || !dose.next_due_date) continue
    push(
      `dose|${dose.next_due_date}|${dose.product.toLowerCase()}`,
      {
        id: `dose-${dose.next_due_date}-${dose.product}`,
        date: dose.next_due_date,
        kind: 'sanitario',
        title: `Reforço · ${dose.product}`,
        detail: 'Próxima dose prevista no calendário sanitário',
        href: '/manejo'
      },
      dose.animal_id
    )
  }

  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}

export type AgendaBucket = 'atrasado' | 'hoje' | 'semana' | 'mes' | 'depois'

export const bucketLabel: Record<AgendaBucket, string> = {
  atrasado: 'Atrasados',
  hoje: 'Hoje',
  semana: 'Próximos 7 dias',
  mes: 'Próximos 30 dias',
  depois: 'Mais adiante'
}

export function agendaBucket(date: string): AgendaBucket {
  const today = todayISO()
  if (date < today) return 'atrasado'
  if (date === today) return 'hoje'
  if (date <= addDays(today, 7)) return 'semana'
  if (date <= addDays(today, 30)) return 'mes'
  return 'depois'
}
