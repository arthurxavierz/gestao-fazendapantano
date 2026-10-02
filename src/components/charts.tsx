import { useEffect, useId, useMemo, useRef, useState } from 'react'

/**
 * Gráficos em SVG puro. O app já evita dependências pesadas (o leitor de
 * planilha é escrito à mão pelo mesmo motivo), e estes quatro formatos cobrem
 * tudo o que o painel precisa.
 */

export interface Slice {
  label: string
  value: number
  color: string
}

/** Rosca com o total no centro. Fatias com valor zero ficam fora. */
export function Donut({ data, size = 168, thickness = 22, centerLabel }: { data: Slice[]; size?: number; thickness?: number; centerLabel?: string }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const [hover, setHover] = useState<number | null>(null)
  let offset = 0
  const visible = data.filter((item) => item.value > 0)

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut" role="img" aria-label={centerLabel}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--track)" strokeWidth={thickness} />
        {visible.map((item, index) => {
          const length = total ? (item.value / total) * circumference : 0
          // Espaço de 2px entre fatias, para separar cores parecidas.
          const gap = visible.length > 1 ? Math.min(2, length / 2) : 0
          const dash = `${Math.max(0, length - gap)} ${circumference}`
          const circle = (
            <circle
              key={item.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth={hover === index ? thickness + 4 : thickness}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
              style={{ transition: 'stroke-width .15s ease' }}
            >
              <title>{`${item.label}: ${item.value}`}</title>
            </circle>
          )
          offset += length
          return circle
        })}
        <text x="50%" y="47%" textAnchor="middle" className="donut-total">{hover != null ? visible[hover].value : total}</text>
        <text x="50%" y="61%" textAnchor="middle" className="donut-caption">{hover != null ? visible[hover].label : centerLabel}</text>
      </svg>
      <ul className="legend">
        {data.map((item) => (
          <li key={item.label} className={item.value ? '' : 'is-zero'}>
            <i style={{ background: item.color }} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Barras horizontais com rótulo e valor, boas para distribuição por categoria ou lote. */
export function BarList({ data, format = (v) => String(v) }: { data: Slice[]; format?: (value: number) => string }) {
  const max = Math.max(1, ...data.map((item) => item.value))
  return (
    <ul className="bar-list">
      {data.map((item) => (
        <li key={item.label}>
          <div className="bar-list-label"><span>{item.label}</span><strong>{format(item.value)}</strong></div>
          <div className="bar-list-track"><span style={{ width: `${(item.value / max) * 100}%`, background: item.color }} /></div>
        </li>
      ))}
    </ul>
  )
}

export interface Point {
  x: string
  y: number
}

/** Linha com área preenchida. `x` é o rótulo do eixo (mês, data curta). */
/** Largura real do contêiner, para o SVG desenhar em escala 1:1 sem deformar. */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

export function LineChart({ data, height = 190, color = 'var(--accent)', unit = '' }: { data: Point[]; height?: number; color?: string; unit?: string }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>(560)
  const pad = { top: 16, right: 12, bottom: 26, left: 40 }
  const rawId = useId()
  const [hover, setHover] = useState<number | null>(null)

  const geometry = useMemo(() => {
    if (!data.length) return null
    const values = data.map((item) => item.y)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const spread = max - min || Math.max(1, max * 0.1)
    const lo = Math.max(0, min - spread * 0.15)
    const hi = max + spread * 0.15
    const innerW = width - pad.left - pad.right
    const innerH = height - pad.top - pad.bottom
    const x = (i: number) => pad.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)
    const y = (v: number) => pad.top + innerH - ((v - lo) / (hi - lo)) * innerH
    const points = data.map((item, i) => [x(i), y(item.y)] as const)
    const line = points.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
    const area = `${line} L${points[points.length - 1][0].toFixed(1)},${pad.top + innerH} L${points[0][0].toFixed(1)},${pad.top + innerH} Z`
    const ticks = [lo, (lo + hi) / 2, hi]
    return { points, line, area, ticks, y, innerH }
  }, [data, height, width])

  if (!geometry) return <div ref={wrapRef} className="line-chart-wrap"><div className="chart-empty">Sem dados suficientes ainda.</div></div>
  const gradientId = `lg${rawId.replace(/:/g, '')}`

  return (
    <div ref={wrapRef} className="line-chart-wrap">
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="line-chart" onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {geometry.ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={geometry.y(tick)} y2={geometry.y(tick)} className="grid-line" />
          <text x={pad.left - 8} y={geometry.y(tick) + 4} textAnchor="end" className="axis-label">{Math.round(tick)}</text>
        </g>
      ))}
      <path d={geometry.area} fill={`url(#${gradientId})`} />
      <path d={geometry.line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {geometry.points.map(([px, py], i) => (
        <g key={i} onMouseEnter={() => setHover(i)}>
          <rect x={px - 18} y={pad.top} width={36} height={geometry.innerH} fill="transparent" />
          <circle cx={px} cy={py} r={hover === i ? 5 : 3.2} fill="var(--surface)" stroke={color} strokeWidth="2" />
          {(data.length <= 8 || i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) && (
            <text x={px} y={height - 6} textAnchor="middle" className="axis-label">{data[i].x}</text>
          )}
        </g>
      ))}
      {hover != null && (
        <g className="chart-tip" transform={`translate(${Math.min(width - 90, Math.max(50, geometry.points[hover][0]))}, ${Math.max(18, geometry.points[hover][1] - 16)})`}>
          <rect x={-42} y={-18} width={84} height={22} rx={6} />
          <text textAnchor="middle" y={-3}>{`${data[hover].y.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${unit}`}</text>
        </g>
      )}
    </svg>
    </div>
  )
}

/** Colunas verticais, uma por período. */
export function ColumnChart({ data, height = 170, color = 'var(--accent)' }: { data: Point[]; height?: number; color?: string }) {
  const max = Math.max(1, ...data.map((item) => item.y))
  return (
    <div className="column-chart" style={{ height }}>
      {data.map((item) => (
        <div key={item.x} className="column" title={`${item.x}: ${item.y}`}>
          <span className="column-value">{item.y || ''}</span>
          <div className="column-bar" style={{ height: `${(item.y / max) * 100}%`, background: color }} />
          <span className="column-label">{item.x}</span>
        </div>
      ))}
    </div>
  )
}

/** Minigráfico para dentro de cards. */
export function Sparkline({ values, color = 'currentColor', width = 96, height = 30 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = max - min || 1
  const path = values
    .map((value, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * width).toFixed(1)},${(height - 3 - ((value - min) / spread) * (height - 6)).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Anel de porcentagem, usado na taxa de prenhez. */
export function Ring({ value, size = 74, thickness = 8, color = 'var(--accent)', label }: { value: number | null; size?: number; thickness?: number; color?: string; label?: string }) {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--track)" strokeWidth={thickness} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeDasharray={`${pct * circumference} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="54%" textAnchor="middle" className="ring-value">{value == null ? '—' : `${Math.round(pct * 100)}%`}</text>
      {label && <title>{label}</title>}
    </svg>
  )
}
