/** Marca da fazenda: cabeça de boi geométrica, legível até em 16px. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M3 7.5c0 4.6 3.4 6.4 8.2 5.6M29 7.5c0 4.6-3.4 6.4-8.2 5.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M10.4 11.6h11.2l-1.7 11.2c-.5 3-2.3 4.7-3.9 4.7s-3.4-1.7-3.9-4.7l-1.7-11.2Z" fill="currentColor" />
      <circle cx="13.6" cy="16.4" r="1.15" fill="var(--brand-eye, #0a1f3a)" />
      <circle cx="18.4" cy="16.4" r="1.15" fill="var(--brand-eye, #0a1f3a)" />
    </svg>
  )
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <div className="brand-mark"><BrandMark /></div>
      <div className="brand-text">
        <strong>Fazenda Pântano</strong>
        {!compact && <span>Gestão pecuária</span>}
      </div>
    </div>
  )
}
