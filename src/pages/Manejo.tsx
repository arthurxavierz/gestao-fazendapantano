import { AlertTriangle, CalendarClock, Plus, Scale, ShieldAlert, Syringe, Trash2, TrendingUp, Weight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { useAuth } from '../AuthContext'
import { BarList } from '../components/charts'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { HealthModal, WeighingModal } from '../components/ManejoModals'
import { Kpi, PageHeading, PanelHead, Pill, Tabs } from '../components/ui'
import { dailyGain, formatGain, isActive, weighingsOf } from '../domain/herd'
import { inWithdrawal, pendingDoses } from '../domain/health'
import { addDays, formatArroba, formatDate, formatShortDate, healthKindLabel, relativeDay, todayISO } from '../utils/format'

type Tab = 'sanitario' | 'pesagem'

type Dialog = { kind: 'health'; product?: string; animalIds?: string[] } | { kind: 'weigh' } | null

export function Manejo() {
  const { animals, healthEvents, weighings, loading, deleteHealthEvent, deleteWeighing } = useAppData()
  const { isAdmin } = useAuth()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(params.get('aba') === 'pesagem' || params.get('acao') === 'pesagem' ? 'pesagem' : 'sanitario')
  const [dialog, setDialog] = useState<Dialog>(null)

  useEffect(() => {
    const action = params.get('acao')
    if (action === 'pesagem') setDialog({ kind: 'weigh' })
    if (action === 'vacina') setDialog({ kind: 'health' })
    if (action) {
      params.delete('acao')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const today = todayISO()
  const activeIds = useMemo(() => new Set(animals.filter(isActive).map((item) => item.id)), [animals])
  const numberOf = useMemo(() => new Map(animals.map((item) => [item.id, item.number])), [animals])

  // Calendário: doses previstas agrupadas por produto e data.
  const schedule = useMemo(() => {
    const groups = new Map<string, { product: string; date: string; animalIds: string[] }>()
    for (const dose of pendingDoses(healthEvents)) {
      if (!activeIds.has(dose.animal_id) || !dose.next_due_date) continue
      const key = `${dose.next_due_date}|${dose.product}`
      const group = groups.get(key) ?? { product: dose.product, date: dose.next_due_date, animalIds: [] }
      group.animalIds.push(dose.animal_id)
      groups.set(key, group)
    }
    return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [healthEvents, activeIds])

  // Histórico: aplicações agrupadas por dia e produto (uma aplicação em lote vira uma linha).
  const healthHistory = useMemo(() => {
    const groups = new Map<string, { product: string; kind: string; date: string; ids: string[]; eventIds: string[]; withdrawal?: string | null }>()
    for (const event of healthEvents) {
      const key = `${event.applied_at}|${event.product}`
      const group = groups.get(key) ?? { product: event.product, kind: event.kind, date: event.applied_at, ids: [], eventIds: [], withdrawal: event.withdrawal_until }
      group.ids.push(event.animal_id)
      group.eventIds.push(event.id)
      groups.set(key, group)
    }
    return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date))
  }, [healthEvents])

  const weighSessions = useMemo(() => {
    const groups = new Map<string, { date: string; items: typeof weighings }>()
    for (const item of weighings) {
      const group = groups.get(item.weighed_at) ?? { date: item.weighed_at, items: [] }
      group.items.push(item)
      groups.set(item.weighed_at, group)
    }
    return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date))
  }, [weighings])

  const lotStats = useMemo(() => {
    const byLot = new Map<string, { weights: number[]; gains: number[] }>()
    for (const animal of animals.filter(isActive)) {
      const lot = animal.lot || 'Sem lote'
      const stat = byLot.get(lot) ?? { weights: [], gains: [] }
      if (animal.weight) stat.weights.push(Number(animal.weight))
      const gain = dailyGain(weighingsOf(animal.id, weighings).slice(-2).map((w) => ({ ...w, weight: Number(w.weight) })))
      if (gain != null) stat.gains.push(gain)
      byLot.set(lot, stat)
    }
    return [...byLot.entries()]
      .map(([lot, stat]) => ({
        lot,
        count: stat.weights.length,
        avg: stat.weights.length ? stat.weights.reduce((s, v) => s + v, 0) / stat.weights.length : null,
        gain: stat.gains.length ? stat.gains.reduce((s, v) => s + v, 0) / stat.gains.length : null
      }))
      .filter((item) => item.avg != null)
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))
  }, [animals, weighings])

  if (loading) return <Loading />

  const overdueDoses = schedule.filter((item) => item.date < today)
  const soonDoses = schedule.filter((item) => item.date >= today && item.date <= addDays(today, 15))
  const monthApplications = healthEvents.filter((item) => item.applied_at >= addDays(today, -30)).length
  const withdrawalAnimals = animals.filter((item) => isActive(item) && inWithdrawal(item.id, healthEvents, today))
  const weighedRecently = new Set(weighings.filter((item) => item.weighed_at >= addDays(today, -30)).map((item) => item.animal_id)).size
  const allGains = lotStats.map((item) => item.gain).filter((v): v is number => v != null)
  const withWeight = animals.filter((item) => isActive(item) && item.weight)
  const herdAvg = withWeight.length ? withWeight.reduce((s, a) => s + Number(a.weight), 0) / withWeight.length : null

  return (
    <>
      <PageHeading
        eyebrow="Rotina do curral"
        title="Sanitário e pesagem"
        text="Vacinas com reforço automático na agenda, controle de carência e pesagens com ganho diário."
        actions={<>
          <button className="button button-secondary" onClick={() => setDialog({ kind: 'weigh' })}><Scale size={18} /> Nova pesagem</button>
          <button className="button button-primary" onClick={() => setDialog({ kind: 'health' })}><Syringe size={18} /> Aplicar vacina ou remédio</button>
        </>}
      />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'sanitario', label: 'Sanitário', icon: Syringe, count: overdueDoses.length || undefined },
          { value: 'pesagem', label: 'Pesagem', icon: Scale }
        ]}
      />

      {tab === 'sanitario' && (
        <>
          <section className="kpi-grid">
            <Kpi label="Doses atrasadas" value={overdueDoses.reduce((s, g) => s + g.animalIds.length, 0)} hint={`${overdueDoses.length} produto(s)`} icon={AlertTriangle} tone="red" />
            <Kpi label="Vencem em 15 dias" value={soonDoses.reduce((s, g) => s + g.animalIds.length, 0)} hint="animais com reforço próximo" icon={CalendarClock} tone="amber" />
            <Kpi label="Aplicações em 30 dias" value={monthApplications} icon={Syringe} tone="blue" />
            <Kpi label="Em carência" value={withdrawalAnimals.length} hint="não enviar para abate" icon={ShieldAlert} tone="slate" />
          </section>

          <div className="dash-columns two">
            <article className="panel">
              <PanelHead eyebrow="Calendário sanitário" title="Próximas doses" />
              <div className="dose-list">
                {schedule.slice(0, 12).map((group) => {
                  const late = group.date < today
                  return (
                    <div key={`${group.date}-${group.product}`} className={`dose-row ${late ? 'is-late' : ''}`}>
                      <div className="agenda-date"><strong>{formatShortDate(group.date).split(' ')[0]}</strong><span>{formatShortDate(group.date).split(' ')[1]}</span></div>
                      <div className="dose-main">
                        <strong>{group.product}</strong>
                        <small>{group.animalIds.length} animais · {relativeDay(group.date)}</small>
                      </div>
                      <button className="button button-secondary button-sm" onClick={() => setDialog({ kind: 'health', product: group.product, animalIds: group.animalIds })}>Aplicar</button>
                    </div>
                  )
                })}
                {!schedule.length && <p className="muted">Nenhuma dose de reforço prevista. Ao registrar uma vacina com próxima dose, ela aparece aqui.</p>}
              </div>
            </article>

            <article className="panel">
              <PanelHead eyebrow="Carência" title="Não enviar para abate" />
              <div className="withdrawal-list">
                {withdrawalAnimals.slice(0, 12).map((animal) => {
                  const until = healthEvents
                    .filter((e) => e.animal_id === animal.id && e.withdrawal_until && e.withdrawal_until >= today)
                    .sort((a, b) => (b.withdrawal_until ?? '').localeCompare(a.withdrawal_until ?? ''))[0]
                  return (
                    <Link key={animal.id} to={`/animais/${animal.id}`} className="withdrawal-row">
                      <strong>{animal.number}</strong>
                      <span>{until?.product}</span>
                      <Pill tone="slate">até {formatShortDate(until?.withdrawal_until)}</Pill>
                    </Link>
                  )
                })}
                {!withdrawalAnimals.length && <p className="muted">Nenhum animal em período de carência.</p>}
              </div>
            </article>
          </div>

          <section className="panel">
            <PanelHead eyebrow="Histórico" title="Aplicações registradas" />
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Animais</th><th>Carência até</th>{isAdmin && <th />}</tr></thead>
                <tbody>
                  {healthHistory.slice(0, 60).map((group) => (
                    <tr key={`${group.date}-${group.product}`}>
                      <td>{formatDate(group.date)}</td>
                      <td><strong>{group.product}</strong></td>
                      <td>{healthKindLabel[group.kind as keyof typeof healthKindLabel]}</td>
                      <td className="cell-numbers">
                        <span className="count-chip">{group.ids.length}</span>
                        {group.ids.slice(0, 6).map((id) => numberOf.get(id)).join(', ')}{group.ids.length > 6 ? '…' : ''}
                      </td>
                      <td>{group.withdrawal ? formatDate(group.withdrawal) : '—'}</td>
                      {isAdmin && (
                        <td>
                          <button className="icon-button danger" title="Excluir este lançamento" onClick={() => {
                            if (window.confirm(`Excluir a aplicação de ${group.product} em ${group.ids.length} animal(is)?`)) {
                              void Promise.all(group.eventIds.map((id) => deleteHealthEvent(id)))
                            }
                          }}><Trash2 size={15} /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!healthHistory.length && <EmptyState icon={Syringe} title="Nenhuma aplicação" text="Registre vacinas e medicamentos para montar o histórico sanitário." action={<button className="button button-primary" onClick={() => setDialog({ kind: 'health' })}><Plus size={17} /> Primeira aplicação</button>} />}
            </div>
          </section>
        </>
      )}

      {tab === 'pesagem' && (
        <>
          <section className="kpi-grid">
            <Kpi label="Peso médio do rebanho" value={herdAvg ? `${Math.round(herdAvg)} kg` : '—'} hint={herdAvg ? formatArroba(herdAvg) : 'sem pesos'} icon={Weight} tone="blue" />
            <Kpi label="GMD médio" value={allGains.length ? formatGain(allGains.reduce((s, v) => s + v, 0) / allGains.length) : '—'} hint="entre as duas últimas pesagens" icon={TrendingUp} tone="emerald" />
            <Kpi label="Pesados em 30 dias" value={weighedRecently} icon={Scale} tone="violet" />
            <Kpi label="Última pesagem" value={weighSessions[0] ? formatShortDate(weighSessions[0].date) : '—'} hint={weighSessions[0] ? relativeDay(weighSessions[0].date) : 'nenhuma ainda'} icon={CalendarClock} tone="slate" />
          </section>

          <div className="dash-columns two">
            <article className="panel">
              <PanelHead eyebrow="Por lote" title="Peso médio atual" />
              {lotStats.length ? (
                <>
                  <BarList data={lotStats.map((item) => ({ label: item.lot, value: Math.round(item.avg ?? 0), color: 'var(--blue)' }))} format={(v) => `${v} kg`} />
                  <div className="table-wrap compact">
                    <table className="data-table">
                      <thead><tr><th>Lote</th><th>Pesados</th><th>Média</th><th>@ estimada</th><th>GMD</th></tr></thead>
                      <tbody>
                        {lotStats.map((item) => (
                          <tr key={item.lot}><td><strong>{item.lot}</strong></td><td>{item.count}</td><td>{Math.round(item.avg ?? 0)} kg</td><td>{formatArroba(item.avg)}</td><td>{formatGain(item.gain)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : <p className="muted">Sem pesos cadastrados.</p>}
            </article>

            <article className="panel">
              <PanelHead eyebrow="Sessões" title="Pesagens realizadas" action={<button className="button button-primary button-sm" onClick={() => setDialog({ kind: 'weigh' })}><Plus size={15} /> Nova</button>} />
              <div className="session-list">
                {weighSessions.slice(0, 14).map((session) => {
                  const avg = session.items.reduce((s, w) => s + Number(w.weight), 0) / session.items.length
                  return (
                    <details key={session.date} className="session-row">
                      <summary>
                        <div className="agenda-date"><strong>{formatShortDate(session.date).split(' ')[0]}</strong><span>{formatShortDate(session.date).split(' ')[1]}</span></div>
                        <div><strong>{session.items.length} animais</strong><small>média {Math.round(avg)} kg · {formatArroba(avg)}</small></div>
                      </summary>
                      <ul>
                        {session.items.map((item) => (
                          <li key={item.id}>
                            <Link to={`/animais/${item.animal_id}`}>{numberOf.get(item.animal_id)}</Link>
                            <span>{Number(item.weight)} kg</span>
                            {isAdmin && <button className="icon-button danger" onClick={() => { if (window.confirm('Excluir esta pesagem?')) void deleteWeighing(item.id) }} aria-label="Excluir"><Trash2 size={14} /></button>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )
                })}
                {!weighSessions.length && <EmptyState icon={Scale} title="Nenhuma pesagem" text="Use o modo curral para lançar o lote inteiro em sequência." />}
              </div>
            </article>
          </div>
        </>
      )}

      {dialog?.kind === 'health' && <HealthModal product={dialog.product} preselected={dialog.animalIds} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'weigh' && <WeighingModal onClose={() => setDialog(null)} />}
    </>
  )
}
