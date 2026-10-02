import type { LucideIcon } from 'lucide-react'
import { X } from 'lucide-react'
import { FormEvent, ReactNode, useEffect } from 'react'

/** Janela sobreposta. Fecha no Esc e ao clicar fora. */
export function Modal({
  title,
  eyebrow,
  onClose,
  children,
  footer,
  onSubmit,
  size = 'md'
}: {
  title: string
  eyebrow?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  onSubmit?: (event: FormEvent) => void
  size?: 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.classList.add('no-scroll')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('no-scroll')
    }
  }, [onClose])

  const content = (
    <>
      <div className="modal-head">
        <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-actions">{footer}</div>}
    </>
  )

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      {onSubmit ? (
        <form className={`modal modal-${size}`} onSubmit={onSubmit} onMouseDown={(e) => e.stopPropagation()}>{content}</form>
      ) : (
        <div className={`modal modal-${size}`} onMouseDown={(e) => e.stopPropagation()}>{content}</div>
      )}
    </div>
  )
}

export function Tabs<T extends string>({
  value,
  onChange,
  items
}: {
  value: T
  onChange: (value: T) => void
  items: { value: T; label: string; icon?: LucideIcon; count?: number }[]
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map(({ value: key, label, icon: Icon, count }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          className={value === key ? 'selected' : ''}
          onClick={() => onChange(key)}
        >
          {Icon && <Icon size={16} />}
          <span>{label}</span>
          {count != null && <em>{count}</em>}
        </button>
      ))}
    </div>
  )
}

export type Tone = 'emerald' | 'blue' | 'violet' | 'amber' | 'red' | 'slate' | 'teal' | 'pink'

export function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'emerald',
  children,
  onClick
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: LucideIcon
  tone?: Tone
  children?: ReactNode
  onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'article'
  return (
    <Tag className={`kpi tone-${tone} ${onClick ? 'is-clickable' : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      <div className="kpi-top">
        <span className="kpi-icon"><Icon size={18} /></span>
        <span className="kpi-label">{label}</span>
      </div>
      <strong className="kpi-value">{value}</strong>
      {hint && <small className="kpi-hint">{hint}</small>}
      {children}
    </Tag>
  )
}

export function PanelHead({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="panel-head">
      <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
      {action}
    </div>
  )
}

export function PageHeading({ eyebrow, title, text, actions }: { eyebrow?: string; title: string; text?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  )
}

export function Pill({ tone = 'slate', children, icon: Icon }: { tone?: Tone; children: ReactNode; icon?: LucideIcon }) {
  return <span className={`pill tone-${tone}`}>{Icon && <Icon size={12} />}{children}</span>
}

/** Barra de progresso fina, usada em tentativas e passos de protocolo. */
export function Progress({ value, max, tone = 'emerald' }: { value: number; max: number; tone?: Tone }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return <div className={`progress tone-${tone}`}><span style={{ width: `${pct}%` }} /></div>
}

/** Pontos que mostram "tentativa 2 de 4". */
export function AttemptDots({ used, max }: { used: number; max: number }) {
  return (
    <span className="attempt-dots" title={`${used} de ${max} tentativas sem prenhez`}>
      {Array.from({ length: max }, (_, index) => (
        <i key={index} className={index < used ? (used >= max ? 'is-over' : 'is-used') : ''} />
      ))}
    </span>
  )
}

export function Field({ label, children, hint, required, className = '' }: { label: string; children: ReactNode; hint?: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={`field ${required ? 'required' : ''} ${className}`}>
      <span>{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  )
}

export function Alert({ tone = 'error', children, icon: Icon }: { tone?: 'error' | 'success' | 'warning' | 'info'; children: ReactNode; icon?: LucideIcon }) {
  return <div className={`alert alert-${tone}`}>{Icon && <Icon size={18} />}<div>{children}</div></div>
}
