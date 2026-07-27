import { Sprout } from 'lucide-react'

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <div className="brand-mark" aria-hidden="true"><Sprout size={22} /></div>
      <div>
        <strong>Fazenda Pântano</strong>
        {!compact && <span>Controle do rebanho</span>}
      </div>
    </div>
  )
}
