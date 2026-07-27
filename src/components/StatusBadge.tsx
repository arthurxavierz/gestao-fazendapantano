import type { AnimalStatus } from '../types'
import { statusLabel } from '../utils/format'

export function StatusBadge({ status }: { status: AnimalStatus }) {
  return <span className={`status status-${status}`}>{statusLabel[status]}</span>
}
