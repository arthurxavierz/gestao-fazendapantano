import {
  AlertTriangle,
  ArrowRight,
  Baby,
  CalendarClock,
  CalendarDays,
  HeartPulse,
  PawPrint,
  Scale,
  Skull,
  Syringe,
  TrendingUp,
  Dna
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { useAuth } from '../AuthContext'
import { BarList, ColumnChart, Donut, LineChart, Ring, type Slice } from '../components/charts'
import { Loading } from '../components/Loading'
import { StatusBadge } from '../components/StatusBadge'
import { AttemptDots, Kpi, PanelHead } from '../components/ui'
import { agendaBucket, agendaKindLabel, buildAgenda } from '../domain/agenda'
import { dailyGain, formatGain, weighingsOf } from '../domain/herd'
import { inWithdrawal, pendingDoses } from '../domain/health'
import { reproIndicators, reproStateLabel, type ReproState } from '../domain/reproduction'
import { useHerd } from '../hooks/useHerd'
import type { AnimalCategory } from '../types'
import { addDays, categoryLabel, formatDateTime, formatShortDate, healthKindLabel, occurrenceLabel, relativeDay, todayISO } from '../utils/format'

export const categoryColor: Record<AnimalCategory, string> = {
  vaca: '#0f9d6c',
  novilha: '#34d399',
  bezerra: '#a7f3d0',
  touro: '#1e3a8a',
  boi: '#3b82f6',
  garrote: '#93c5fd',
  bezerro: '#c7d2fe'
}

export const reproColor: Record<ReproState, string> = {
  vazia: '#94a3b8',
  em_protocolo: '#3b82f6',
  inseminada: '#8b5cf6',
  prenhe: '#10b981',
  parida: '#14b8a6',
  descarte: '#ef4444',
  nao_apta: '#cbd5e1'
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

const monthShort = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(`${iso}-15T12:00:00`)).replace('.', '')

export function Dashboard() {
  const { animals, occurrences, attempts, healthEvents, weighings, settings, loading, error } = useAppData()
  const { displayName } = useAuth()
  const herd = useHerd()
  const navigate = useNavigate()
  const [weightGroup, setWeightGroup] = useState<'engorda' | 'matrizes' | 'todos'>('engorda')

  const today = todayISO()
  const agenda = useMemo(() => buildAgenda(animals, attempts, healthEvents, settings, 60), [animals, attempts, healthEvents, settings])
  const indicators = useMemo(() => reproIndicators(animals, attempts, settings), [animals, attempts, settings])

  const composition = useMemo<Slice[]>(() => {
    const counts = new Map<AnimalCategory, number>()
    for (const animal of herd.active) {
      const category = herd.get(animal.id)?.category
      if (category) counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    return (Object.keys(categoryColor) as AnimalCategory[])
      .map((key) => ({ label: categoryLabel[key], value: counts.get(key) ?? 0, color: categoryColor[key] }))
  }, [herd])

  const reproDistribution = useMemo<Slice[]>(() => {
    const states: ReproState[] = ['vazia', 'em_protocolo', 'inseminada', 'prenhe', 'parida', 'descarte']
    return states.map((state) => ({
      label: reproStateLabel[state],
      value: herd.females.filter((item) => item.state === state).length,
      color: reproColor[state]
    }))
  }, [herd])

  const calvingsByMonth = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const date = new Date()
      date.setDate(1)
      date.setMonth(date.getMonth() + i)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    })
    const pregnant = attempts.filter((item) => item.result === 'prenhe' && item.expected_calving_date)
    return months.map((month) => ({
      x: monthShort(month),
      y: pregnant.filter((item) => item.expected_calving_date!.startsWith(month)).length
    }))
  }, [attempts])

  const weightSeries = useMemo(() => {
    const inGroup = (animalId: string) => {
      const info = herd.get(animalId)
      if (!info) return false
      if (weightGroup === 'todos') return true
      if (weightGroup === 'matrizes') return info.category === 'vaca' || info.category === 'novilha'
      return info.category === 'garrote' || info.category === 'boi'
    }
    const byMonth = new Map<string, number[]>()
    for (const item of weighings) {
      if (!inGroup(item.animal_id)) continue
      const month = item.weighed_at.slice(0, 7)
      byMonth.set(month, [...(byMonth.get(month) ?? []), Number(item.weight)])
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([month, values]) => ({ x: monthShort(month), y: values.reduce((s, v) => s + v, 0) / values.length }))
  }, [weighings, herd, weightGroup])

  const fatteningGain = useMemo(() => {
    const gains = herd.active
      .filter((animal) => ['garrote', 'boi'].includes(herd.get(animal.id)?.category ?? ''))
      .map((animal) => dailyGain(weighingsOf(animal.id, weighings).slice(-2).map((w) => ({ ...w, weight: Number(w.weight) }))))
      .filter((value): value is number => value != null)
    return gains.length ? gains.reduce((s, v) => s + v, 0) / gains.length : null
  }, [herd, weighings])

  const doseGroups = useMemo(() => {
    const activeIds = new Set(herd.active.map((item) => item.id))
    const groups = new Map<string, { product: string; date: string; count: number }>()
    for (const dose of pendingDoses(healthEvents)) {
      if (!activeIds.has(dose.animal_id) || !dose.next_due_date) continue
      const key = `${dose.next_due_date}|${dose.product}`
      const group = groups.get(key) ?? { product: dose.product, date: dose.next_due_date, count: 0 }
      group.count += 1
      groups.set(key, group)
    }
    return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [healthEvents, herd])

  if (loading) return <Loading />

  const overdue = agenda.filter((item) => agendaBucket(item.date) === 'atrasado')
  const upcoming = agenda.filter((item) => item.date >= today && item.date <= addDays(today, 7))
  const calvingSoon = attempts.filter((item) => item.result === 'prenhe' && item.expected_calving_date && item.expected_calving_date <= addDays(today, 30))
  const dosesSoon = pendingDoses(healthEvents).filter((item) => item.next_due_date! <= addDays(today, 15) && herd.get(item.animal_id) && herd.active.some((a) => a.id === item.animal_id))
  const lastChance = herd.females.filter((item) => item.state !== 'descarte' && item.streak >= settings.max_breeding_attempts - 1 && item.state !== 'prenhe')
  const sick = herd.active.filter((item) => item.status === 'doente' || item.status === 'observacao')
  const withdrawal = herd.active.filter((item) => inWithdrawal(item.id, healthEvents, today))

  const recent = [
    ...occurrences.slice(0, 6).map((item) => ({ id: `o-${item.id}`, at: item.created_at, icon: HeartPulse, tone: 'amber', title: `${occurrenceLabel[item.type]} · animal ${item.animal_number ?? herd.get(item.animal_id)?.animal.number ?? ''}`, text: item.note })),
    ...healthEvents.slice(0, 40).map((item) => ({ id: `h-${item.id}`, at: item.created_at, icon: Syringe, tone: 'blue', title: `${healthKindLabel[item.kind]} · ${item.product}`, text: `Animal ${herd.get(item.animal_id)?.animal.number ?? ''}` })),
    ...attempts.slice(0, 20).map((item) => ({ id: `r-${item.id}`, at: item.created_at, icon: Dna, tone: 'violet', title: `${item.protocol_name ?? 'Reprodução'}`, text: `Matriz ${herd.get(item.animal_id)?.animal.number ?? ''}` }))
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6)

  const alerts = [
    overdue.length && { tone: 'red', icon: AlertTriangle, text: `${overdue.length} manejo${overdue.length > 1 ? 's' : ''} atrasado${overdue.length > 1 ? 's' : ''} na agenda`, to: '/agenda' },
    lastChance.length && { tone: 'amber', icon: Dna, text: `${lastChance.length} matriz${lastChance.length > 1 ? 'es' : ''} na última tentativa antes do descarte`, to: '/reproducao' },
    calvingSoon.length && { tone: 'emerald', icon: Baby, text: `${calvingSoon.length} parto${calvingSoon.length > 1 ? 's' : ''} previsto${calvingSoon.length > 1 ? 's' : ''} em 30 dias`, to: '/agenda' },
    dosesSoon.length && { tone: 'blue', icon: Syringe, text: `${new Set(dosesSoon.map((d) => d.animal_id)).size} animais com dose vencendo em 15 dias`, to: '/manejo' },
    withdrawal.length && { tone: 'slate', icon: Skull, text: `${withdrawal.length} em carência: não enviar para abate`, to: '/manejo' }
  ].filter(Boolean) as { tone: string; icon: typeof AlertTriangle; text: string; to: string }[]

  const firstName = displayName.split(' ')[0]

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">{greeting()}{firstName && firstName !== 'Demonstração' ? `, ${firstName}` : ''}</span>
          <h1>Fazenda Pântano em números</h1>
          <p>
            {herd.active.length} animais no rebanho, {indicators.pregnant} matrizes prenhes
            {upcoming.length ? ` e ${upcoming.length} manejo${upcoming.length > 1 ? 's' : ''} programado${upcoming.length > 1 ? 's' : ''} nesta semana.` : '.'}
          </p>
          <div className="hero-actions">
            <button className="button button-mint" onClick={() => navigate('/agenda')}><CalendarDays size={18} /> Ver agenda</button>
            <button className="button button-glass" onClick={() => navigate('/manejo?acao=pesagem')}><Scale size={18} /> Pesagem</button>
            <button className="button button-glass" onClick={() => navigate('/reproducao?acao=protocolo')}><Dna size={18} /> Protocolo</button>
          </div>
        </div>
        <div className="hero-stats">
          <div><strong>{herd.active.length}</strong><span>cabeças ativas</span></div>
          <div><strong>{indicators.females}</strong><span>matrizes</span></div>
          <div><strong>{calvingSoon.length}</strong><span>partos em 30 dias</span></div>
        </div>
        <svg className="hero-art" viewBox="0 0 400 400" aria-hidden="true">
          <circle cx="300" cy="120" r="220" />
          <circle cx="330" cy="330" r="140" />
        </svg>
      </section>

      {error && <div className="alert alert-error"><AlertTriangle size={18} /> {error}</div>}

      {alerts.length > 0 && (
        <section className="alert-strip">
          {alerts.map((item) => (
            <Link key={item.text} to={item.to} className={`alert-chip tone-${item.tone}`}>
              <item.icon size={16} /> <span>{item.text}</span> <ArrowRight size={14} />
            </Link>
          ))}
        </section>
      )}

      <section className="kpi-grid">
        <Kpi label="Rebanho ativo" value={herd.active.length} hint={`${animals.length - herd.active.length} saídas registradas`} icon={PawPrint} tone="blue" onClick={() => navigate('/animais')} />
        <Kpi label="Taxa de prenhez" value={indicators.pregnancyRate == null ? '—' : `${Math.round(indicators.pregnancyRate * 100)}%`} hint={`${indicators.diagnosed} diagnósticos em 12 meses`} icon={Dna} tone="emerald" onClick={() => navigate('/reproducao')}>
          <div className="kpi-ring"><Ring value={indicators.pregnancyRate} size={56} thickness={6} /></div>
        </Kpi>
        <Kpi label="Aguardando diagnóstico" value={indicators.awaitingDiagnosis} hint={`${indicators.inProtocol} em protocolo agora`} icon={CalendarClock} tone="violet" onClick={() => navigate('/reproducao')} />
        <Kpi label="GMD da engorda" value={fatteningGain == null ? '—' : fatteningGain.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} hint={fatteningGain == null ? 'Registre duas pesagens' : 'kg por dia, últimas pesagens'} icon={TrendingUp} tone="teal" onClick={() => navigate('/manejo?aba=pesagem')} />
      </section>

      <section className="dash-grid">
        <article className="panel">
          <PanelHead eyebrow="Composição" title="Rebanho por categoria" action={<Link to="/animais" className="panel-link">Ver animais</Link>} />
          <Donut data={composition} centerLabel="cabeças" />
        </article>

        <article className="panel">
          <PanelHead eyebrow="Reprodução" title="Situação das matrizes" action={<Link to="/reproducao" className="panel-link">Abrir quadro</Link>} />
          <BarList data={reproDistribution} />
          <div className="mini-stats">
            <div><span>Concepção</span><strong>{indicators.conceptionRate == null ? '—' : `${Math.round(indicators.conceptionRate * 100)}%`}</strong></div>
            <div><span>Vazias</span><strong>{indicators.empty}</strong></div>
            <div><span>Descarte</span><strong>{indicators.discard}</strong></div>
          </div>
        </article>

        <article className="panel">
          <PanelHead eyebrow="Sanitário" title="Próximas doses" action={<Link to="/manejo" className="panel-link">Calendário</Link>} />
          <div className="dose-list">
            {doseGroups.slice(0, 5).map((group) => (
              <Link key={`${group.date}-${group.product}`} to="/manejo" className={`dose-row ${group.date < today ? 'is-late' : ''}`}>
                <div className="agenda-date"><strong>{formatShortDate(group.date).split(' ')[0]}</strong><span>{formatShortDate(group.date).split(' ')[1]}</span></div>
                <div className="dose-main"><strong>{group.product}</strong><small>{group.count} animais · {relativeDay(group.date)}</small></div>
              </Link>
            ))}
            {!doseGroups.length && <p className="muted">Nenhum reforço previsto.</p>}
          </div>
        </article>

        <article className="panel panel-span-2">
          <PanelHead
            eyebrow="Desempenho"
            title="Evolução do peso médio"
            action={
              <select className="select-compact" value={weightGroup} onChange={(e) => setWeightGroup(e.target.value as typeof weightGroup)}>
                <option value="engorda">Engorda (garrotes e bois)</option>
                <option value="matrizes">Matrizes</option>
                <option value="todos">Todo o rebanho</option>
              </select>
            }
          />
          <LineChart data={weightSeries} unit=" kg" />
          <p className="chart-note">GMD médio atual da engorda: <strong>{formatGain(fatteningGain)}</strong></p>
        </article>

        <article className="panel">
          <PanelHead eyebrow="Próximos meses" title="Partos previstos" />
          <ColumnChart data={calvingsByMonth} color="var(--accent)" />
        </article>
      </section>

      <section className="dash-columns">
        <article className="panel">
          <PanelHead eyebrow="Agenda" title="Próximos 7 dias" action={<Link to="/agenda" className="panel-link">Agenda completa</Link>} />
          <div className="agenda-mini">
            {[...overdue.slice(0, 3), ...upcoming.slice(0, 6)].map((item) => (
              <Link key={item.id} to={item.href} className={`agenda-mini-row kind-${item.kind} ${item.date < today ? 'is-late' : ''}`}>
                <div className="agenda-date"><strong>{formatShortDate(item.date).split(' ')[0]}</strong><span>{formatShortDate(item.date).split(' ')[1]}</span></div>
                <div className="agenda-mini-main">
                  <span className="agenda-kind">{agendaKindLabel[item.kind]} · {relativeDay(item.date)}</span>
                  <strong>{item.title}</strong>
                  <small>{item.animalIds.length} {item.animalIds.length === 1 ? 'animal' : 'animais'} · {item.detail}</small>
                </div>
              </Link>
            ))}
            {!overdue.length && !upcoming.length && <p className="muted">Nada programado para os próximos dias.</p>}
          </div>
        </article>

        <article className="panel">
          <PanelHead eyebrow="Atenção" title="Precisam de acompanhamento" action={<Link to="/animais?status=atencao" className="panel-link">Ver todos</Link>} />
          <div className="attention-list">
            {lastChance.slice(0, 3).map((item) => (
              <Link to={`/animais/${item.animal.id}`} key={`lc-${item.animal.id}`} className="attention-row">
                <div className="animal-number-mini tone-amber">{item.animal.number}</div>
                <div><strong>Matriz {item.animal.number}</strong><span>{item.streak} tentativas sem prenhez · {reproStateLabel[item.state]}</span></div>
                <AttemptDots used={item.streak} max={settings.max_breeding_attempts} />
              </Link>
            ))}
            {sick.slice(0, 5).map((animal) => (
              <Link to={`/animais/${animal.id}`} key={animal.id} className="attention-row">
                <div className="animal-number-mini">{animal.number}</div>
                <div><strong>Animal {animal.number}</strong><span>{animal.notes || animal.breed || 'Sem observação informada'}</span></div>
                <StatusBadge status={animal.status} />
              </Link>
            ))}
            {!sick.length && !lastChance.length && <p className="muted">Nenhum animal exige atenção neste momento.</p>}
          </div>
        </article>

        <article className="panel">
          <PanelHead eyebrow="Movimento" title="Últimos registros" />
          <div className="timeline">
            {recent.map((item) => (
              <div className="timeline-row" key={item.id}>
                <div className={`timeline-icon tone-${item.tone}`}><item.icon size={16} /></div>
                <div><strong>{item.title}</strong><span>{item.text}</span><small>{formatDateTime(item.at)}</small></div>
              </div>
            ))}
            {!recent.length && <p className="muted">Os registros da equipe aparecerão aqui.</p>}
          </div>
        </article>
      </section>
    </>
  )
}
