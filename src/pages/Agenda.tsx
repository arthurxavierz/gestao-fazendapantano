import { Baby, CalendarCheck, CalendarDays, Syringe, Dna } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { HealthModal } from '../components/ManejoModals'
import { CalvingModal, CompleteStepModal, DiagnosisModal } from '../components/ReproModals'
import { PageHeading, Tabs } from '../components/ui'
import { agendaBucket, agendaKindLabel, bucketLabel, buildAgenda, type AgendaBucket, type AgendaItem, type AgendaKind } from '../domain/agenda'
import { formatDate, relativeDay, todayISO } from '../utils/format'

const kindIcon: Record<AgendaKind, typeof Dna> = {
  protocolo: Dna,
  inseminacao: Dna,
  diagnostico: CalendarCheck,
  parto: Baby,
  sanitario: Syringe
}

type Filter = 'todos' | 'reproducao' | 'sanitario' | 'parto'

export function Agenda() {
  const { animals, attempts, healthEvents, settings, loading } = useAppData()
  const [filter, setFilter] = useState<Filter>('todos')
  const [dialog, setDialog] = useState<AgendaItem | null>(null)
  const numberOf = useMemo(() => new Map(animals.map((item) => [item.id, item.number])), [animals])

  const agenda = useMemo(() => buildAgenda(animals, attempts, healthEvents, settings, 180), [animals, attempts, healthEvents, settings])

  if (loading) return <Loading />

  const visible = agenda.filter((item) =>
    filter === 'todos'
    || (filter === 'reproducao' && ['protocolo', 'inseminacao', 'diagnostico'].includes(item.kind))
    || (filter === 'sanitario' && item.kind === 'sanitario')
    || (filter === 'parto' && item.kind === 'parto'))

  const buckets: AgendaBucket[] = ['atrasado', 'hoje', 'semana', 'mes', 'depois']
  const grouped = buckets.map((bucket) => ({ bucket, items: visible.filter((item) => agendaBucket(item.date) === bucket) }))

  return (
    <>
      <PageHeading
        eyebrow="Planejamento"
        title="Agenda da fazenda"
        text="Tudo aqui é calculado a partir dos registros: etapas de protocolo, diagnósticos, partos previstos e reforços de vacina."
      />

      <Tabs
        value={filter}
        onChange={setFilter}
        items={[
          { value: 'todos', label: 'Tudo', icon: CalendarDays, count: agenda.length },
          { value: 'reproducao', label: 'Reprodução', icon: Dna },
          { value: 'parto', label: 'Partos', icon: Baby },
          { value: 'sanitario', label: 'Sanitário', icon: Syringe }
        ]}
      />

      {!visible.length && <EmptyState icon={CalendarDays} title="Agenda livre" text="Inicie um protocolo ou registre uma vacina com próxima dose para preencher a agenda." />}

      <div className="agenda">
        {grouped.filter((group) => group.items.length).map(({ bucket, items }) => (
          <section key={bucket} className={`agenda-bucket bucket-${bucket}`}>
            <header><strong>{bucketLabel[bucket]}</strong><span>{items.length}</span></header>
            <div className="agenda-items">
              {items.map((item) => {
                const Icon = kindIcon[item.kind]
                return (
                  <article key={item.id} className={`agenda-item kind-${item.kind}`}>
                    <span className="agenda-icon"><Icon size={18} /></span>
                    <div className="agenda-item-main">
                      <span className="agenda-kind">{agendaKindLabel[item.kind]} · {formatDate(item.date)} · {relativeDay(item.date)}</span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                      <div className="task-animals">
                        {item.animalIds.slice(0, 16).map((id) => <Link key={id} to={`/animais/${id}`}>{numberOf.get(id)}</Link>)}
                        {item.animalIds.length > 16 && <span>+{item.animalIds.length - 16}</span>}
                      </div>
                    </div>
                    <button className={`button ${item.date <= todayISO() ? 'button-primary' : 'button-secondary'} button-sm`} onClick={() => setDialog(item)}>
                      {item.kind === 'diagnostico' ? 'Lançar' : item.kind === 'parto' ? 'Registrar parto' : item.kind === 'sanitario' ? 'Aplicar' : 'Concluir'}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      {dialog && (dialog.kind === 'protocolo' || dialog.kind === 'inseminacao') && dialog.stepIndex != null && (
        <CompleteStepModal attemptIds={dialog.attemptIds} stepIndex={dialog.stepIndex} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'diagnostico' && <DiagnosisModal attemptIds={dialog.attemptIds} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'parto' && <CalvingModal attemptId={dialog.attemptIds[0]} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'sanitario' && (
        <HealthModal product={dialog.title.replace('Reforço · ', '')} preselected={dialog.animalIds} onClose={() => setDialog(null)} />
      )}
    </>
  )
}
