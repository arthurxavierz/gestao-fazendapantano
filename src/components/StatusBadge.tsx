import type { AnimalStatus } from '../types'
import type { ReproState } from '../domain/reproduction'
import { reproStateLabel } from '../domain/reproduction'
import { statusLabel } from '../utils/format'

export function StatusBadge({ status }: { status: AnimalStatus }) {
  return <span className={`status status-${status}`}>{statusLabel[status]}</span>
}

export function ReproBadge({ state }: { state: ReproState }) {
  if (state === 'nao_apta') return null
  return <span className={`status repro-${state}`}>{reproStateLabel[state]}</span>
}
