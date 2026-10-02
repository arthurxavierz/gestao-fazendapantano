import {
  Baby,
  CalendarCheck,
  ClipboardList,
  History,
  KanbanSquare,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Skull,
  Trash2,
  Dna
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { useAuth } from '../AuthContext'
import { Ring } from '../components/charts'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { AttemptModal, CalvingModal, CompleteStepModal, DiagnosisModal, StartBreedingModal } from '../components/ReproModals'
import { ReproBadge } from '../components/StatusBadge'
import { Alert, AttemptDots, Field, Kpi, Modal, PageHeading, Tabs } from '../components/ui'
import { agendaKindLabel, buildAgenda } from '../domain/agenda'
import { byNumber } from '../domain/herd'
import {
  diagnosisDue,
  gestationDays,
  nextStep,
  pendingAttempt,
  reproFlow,
  reproIndicators,
  reproStateLabel,
  type ReproState
} from '../domain/reproduction'
import { useHerd, type HerdInfo } from '../hooks/useHerd'
import type { BreedingAttempt, BreedingMethod, ProtocolStep, ProtocolStepKind, ReproProtocol } from '../types'
import { categoryLabel, daysBetween, formatDate, formatShortDate, methodLabel, relativeDay, resultLabel, todayISO } from '../utils/format'

type Tab = 'quadro' | 'manejos' | 'protocolos' | 'historico'

type Dialog =
  | { kind: 'start'; preselected?: string[] }
  | { kind: 'step'; attemptIds: string[]; stepIndex: number }
  | { kind: 'diagnosis'; attemptIds: string[] }
  | { kind: 'calving'; attemptId: string }
  | { kind: 'attempt'; attempt: BreedingAttempt }
  | { kind: 'protocol'; protocol?: ReproProtocol }
  | null

export function Reproduction() {
  const { animals, attempts, healthEvents, protocols, settings, loading, deleteProtocol } = useAppData()
  const { isAdmin } = useAuth()
  const herd = useHerd()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>((params.get('aba') as Tab) || 'quadro')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [query, setQuery] = useState('')
  const [lot, setLot] = useState('todos')
  const [historyFilter, setHistoryFilter] = useState('todos')

  // Atalho "Iniciar protocolo" do menu de novo registro.
  useEffect(() => {
    if (params.get('acao') === 'protocolo') {
      setDialog({ kind: 'start' })
      params.delete('acao')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const indicators = useMemo(() => reproIndicators(animals, attempts, settings), [animals, attempts, settings])
  const tasks = useMemo(
    () => buildAgenda(animals, attempts, healthEvents, settings, 45).filter((item) => ['protocolo', 'inseminacao', 'diagnostico', 'parto'].includes(item.kind)),
    [animals, attempts, healthEvents, settings]
  )

  const lots = useMemo(() => [...new Set(herd.females.map((item) => item.animal.lot).filter(Boolean) as string[])].sort(), [herd])

  const board = useMemo(() => {
    const q = query.trim().toLowerCase()
    const visible = herd.females
      .filter((item) => (lot === 'todos' || item.animal.lot === lot) && (!q || item.animal.number.toLowerCase().includes(q)))
      .sort((a, b) => byNumber(a.animal, b.animal))
    const columns = [...reproFlow, 'descarte'] as ReproState[]
    return columns.map((state) => ({ state, items: visible.filter((item) => item.state === state) }))
  }, [herd, query, lot])

  if (loading) return <Loading />

  const history = [...attempts]
    .filter((item) => historyFilter === 'todos' || item.result === historyFilter)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))

  function openAction(attempt: BreedingAttempt, action: 'step' | 'diagnosis' | 'calving', stepIndex?: number) {
    if (action === 'step' && stepIndex != null) setDialog({ kind: 'step', attemptIds: [attempt.id], stepIndex })
    else if (action === 'diagnosis') setDialog({ kind: 'diagnosis', attemptIds: [attempt.id] })
    else if (action === 'calving') setDialog({ kind: 'calving', attemptId: attempt.id })
  }

  return (
    <>
      <PageHeading
        eyebrow="Manejo reprodutivo"
        title="Reprodução"
        text={`Limite de ${settings.max_breeding_attempts} tentativas seguidas sem prenhez antes do descarte · gestação de ${settings.gestation_days} dias.`}
        actions={<button className="button button-primary" onClick={() => setDialog({ kind: 'start' })}><Plus size={18} /> Iniciar protocolo</button>}
      />

      <section className="kpi-grid kpi-grid-6">
        <Kpi label="Matrizes aptas" value={indicators.females} icon={Dna} tone="slate" />
        <Kpi label="Em protocolo" value={indicators.inProtocol} icon={ClipboardList} tone="blue" />
        <Kpi label="Aguardando diagnóstico" value={indicators.awaitingDiagnosis} icon={CalendarCheck} tone="violet" />
        <Kpi label="Prenhes" value={indicators.pregnant} icon={Baby} tone="emerald" />
        <Kpi label="Taxa de prenhez" value={indicators.pregnancyRate == null ? '—' : `${Math.round(indicators.pregnancyRate * 100)}%`} hint="últimos 12 meses" icon={Dna} tone="teal">
          <div className="kpi-ring"><Ring value={indicators.pregnancyRate} size={52} thickness={6} /></div>
        </Kpi>
        <Kpi label="Descarte" value={indicators.discard} hint="separadas para abate" icon={Skull} tone="red" />
      </section>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'quadro', label: 'Quadro', icon: KanbanSquare },
          { value: 'manejos', label: 'Manejos pendentes', icon: ListChecks, count: tasks.filter((t) => t.kind !== 'parto').length },
          { value: 'protocolos', label: 'Protocolos', icon: ClipboardList },
          { value: 'historico', label: 'Histórico', icon: History }
        ]}
      />

      {tab === 'quadro' && (
        <>
          <div className="board-toolbar">
            <label className="search-box compact"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Brinco da matriz" /></label>
            {lots.length > 1 && (
              <select className="select-compact" value={lot} onChange={(e) => setLot(e.target.value)}>
                <option value="todos">Todos os lotes</option>
                {lots.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            )}
          </div>
          <div className="board">
            {board.map(({ state, items }) => (
              <section key={state} className={`board-column col-${state}`}>
                <header>
                  <span className={`board-dot repro-dot-${state}`} />
                  <strong>{reproStateLabel[state]}</strong>
                  <em>{items.length}</em>
                </header>
                <div className="board-cards">
                  {items.map((info) => (
                    <BoardCard
                      key={info.animal.id}
                      info={info}
                      max={settings.max_breeding_attempts}
                      onOpen={(attempt) => setDialog({ kind: 'attempt', attempt })}
                      onStart={() => setDialog({ kind: 'start', preselected: [info.animal.id] })}
                      onCalving={(attempt) => setDialog({ kind: 'calving', attemptId: attempt.id })}
                    />
                  ))}
                  {!items.length && <p className="board-empty">Nenhuma matriz</p>}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {tab === 'manejos' && (
        <section className="task-list">
          {tasks.map((task) => {
            const late = task.date < todayISO()
            return (
              <article key={task.id} className={`task-card kind-${task.kind} ${late ? 'is-late' : ''}`}>
                <div className="task-date">
                  <strong>{formatShortDate(task.date)}</strong>
                  <span>{relativeDay(task.date)}</span>
                </div>
                <div className="task-main">
                  <span className="agenda-kind">{agendaKindLabel[task.kind]}{late ? ' · atrasado' : ''}</span>
                  <strong>{task.title}</strong>
                  <small>{task.detail}</small>
                  <div className="task-animals">
                    {task.animalIds.slice(0, 14).map((id) => <Link key={id} to={`/animais/${id}`}>{herd.get(id)?.animal.number}</Link>)}
                    {task.animalIds.length > 14 && <span>+{task.animalIds.length - 14}</span>}
                  </div>
                </div>
                <div className="task-action">
                  {(task.kind === 'protocolo' || task.kind === 'inseminacao') && task.stepIndex != null && (
                    <button className="button button-primary" onClick={() => setDialog({ kind: 'step', attemptIds: task.attemptIds, stepIndex: task.stepIndex! })}>
                      Concluir ({task.attemptIds.length})
                    </button>
                  )}
                  {task.kind === 'diagnostico' && (
                    <button className="button button-primary" onClick={() => setDialog({ kind: 'diagnosis', attemptIds: task.attemptIds })}>Lançar diagnóstico</button>
                  )}
                  {task.kind === 'parto' && (
                    <button className="button button-secondary" onClick={() => setDialog({ kind: 'calving', attemptId: task.attemptIds[0] })}><Baby size={16} /> Registrar parto</button>
                  )}
                </div>
              </article>
            )
          })}
          {!tasks.length && <EmptyState icon={ListChecks} title="Nenhum manejo pendente" text="Quando um protocolo for iniciado, as etapas aparecem aqui agrupadas por dia." />}
        </section>
      )}

      {tab === 'protocolos' && (
        <section className="protocol-grid">
          {protocols.map((protocol) => (
            <article key={protocol.id} className={`protocol-card ${protocol.active ? '' : 'is-inactive'}`}>
              <header>
                <div>
                  <span className="eyebrow">{methodLabel[protocol.method]}{protocol.active ? '' : ' · inativo'}</span>
                  <h3>{protocol.name}</h3>
                </div>
                <div className="protocol-actions">
                  <button className="icon-button" onClick={() => setDialog({ kind: 'protocol', protocol })} aria-label="Editar"><Pencil size={16} /></button>
                  {isAdmin && !protocol.id.startsWith('default-') && (
                    <button className="icon-button danger" onClick={() => { if (window.confirm(`Excluir o protocolo "${protocol.name}"? As tentativas já iniciadas mantêm a cópia das etapas.`)) void deleteProtocol(protocol.id) }} aria-label="Excluir"><Trash2 size={16} /></button>
                  )}
                </div>
              </header>
              {protocol.description && <p>{protocol.description}</p>}
              <ol className="step-preview compact">
                {protocol.steps.map((step, index) => (
                  <li key={index} className={`kind-${step.kind}`}><span className="step-day">D{step.day}</span><div><strong>{step.title}</strong></div></li>
                ))}
              </ol>
            </article>
          ))}
          <button className="protocol-card protocol-new" onClick={() => setDialog({ kind: 'protocol' })}>
            <Plus size={24} />
            <strong>Novo protocolo</strong>
            <span>Monte as etapas do jeito que o veterinário recomenda</span>
          </button>
        </section>
      )}

      {tab === 'historico' && (
        <section className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Todas as tentativas</span><h2>Histórico reprodutivo</h2></div>
            <select className="select-compact" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)}>
              <option value="todos">Todos os resultados</option>
              {Object.entries(resultLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Matriz</th><th>Protocolo</th><th>Início</th><th>Inseminação</th><th>Touro / sêmen</th><th>Diagnóstico</th><th>Resultado</th></tr></thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} onClick={() => setDialog({ kind: 'attempt', attempt: item })}>
                    <td><strong>{herd.get(item.animal_id)?.animal.number ?? '—'}</strong></td>
                    <td>{item.protocol_name ?? methodLabel[item.method]}</td>
                    <td>{formatDate(item.start_date)}</td>
                    <td>{item.insemination_date ? formatDate(item.insemination_date) : '—'}</td>
                    <td>{item.sire || '—'}</td>
                    <td>{item.diagnosis_date ? formatDate(item.diagnosis_date) : '—'}</td>
                    <td><span className={`status result-${item.result}`}>{resultLabel[item.result]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!history.length && <EmptyState icon={History} title="Sem registros" text="As tentativas de prenhez aparecerão aqui." />}
          </div>
        </section>
      )}

      {dialog?.kind === 'start' && <StartBreedingModal preselected={dialog.preselected} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'step' && <CompleteStepModal attemptIds={dialog.attemptIds} stepIndex={dialog.stepIndex} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'diagnosis' && <DiagnosisModal attemptIds={dialog.attemptIds} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'calving' && <CalvingModal attemptId={dialog.attemptId} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'attempt' && (
        <AttemptModal attempt={dialog.attempt} onClose={() => setDialog(null)} onAction={(action, stepIndex) => openAction(dialog.attempt, action, stepIndex)} />
      )}
      {dialog?.kind === 'protocol' && <ProtocolEditor protocol={dialog.protocol} onClose={() => setDialog(null)} />}
    </>
  )
}

function BoardCard({ info, max, onOpen, onStart, onCalving }: {
  info: HerdInfo
  max: number
  onOpen: (attempt: BreedingAttempt) => void
  onStart: () => void
  onCalving: (attempt: BreedingAttempt) => void
}) {
  const { settings } = useAppData()
  const last = info.attempts[info.attempts.length - 1]
  const pending = pendingAttempt(info.attempts)
  let line = ''
  let sub = ''

  switch (info.state) {
    case 'em_protocolo': {
      const next = pending ? nextStep(pending) : null
      line = next ? `D${next.step.day} · ${next.step.title}` : 'Protocolo em andamento'
      sub = next ? `${formatShortDate(next.due)} · ${relativeDay(next.due)}` : ''
      break
    }
    case 'inseminada': {
      const due = pending ? diagnosisDue(pending, settings) : null
      line = `IA há ${pending ? gestationDays(pending) : '?'} dias`
      sub = due ? `Diagnóstico ${relativeDay(due)}` : ''
      break
    }
    case 'prenhe':
      line = last?.expected_calving_date ? `Parto ${formatShortDate(last.expected_calving_date)}` : 'Prenhe'
      sub = last?.expected_calving_date ? relativeDay(last.expected_calving_date) : ''
      break
    case 'parida':
      line = last?.calving_date ? `Pariu ${relativeDay(last.calving_date)}` : 'Pós-parto'
      sub = 'Pronta para nova estação após o puerpério'
      break
    case 'vazia':
      line = last ? `Último resultado: ${resultLabel[last.result].toLowerCase()}` : 'Sem histórico reprodutivo'
      sub = last?.diagnosis_date ? `há ${daysBetween(last.diagnosis_date, todayISO())} dias` : ''
      break
    case 'descarte':
      line = 'Separada para abate'
      sub = `${info.streak} tentativas sem prenhez`
      break
  }

  const overdue = info.state === 'prenhe' && last?.expected_calving_date && last.expected_calving_date < todayISO()
  const lastChance = info.state !== 'descarte' && info.state !== 'prenhe' && info.streak >= max - 1

  return (
    <article className={`board-card ${lastChance ? 'is-last-chance' : ''}`} onClick={() => last && onOpen(last)} role={last ? 'button' : undefined}>
      <div className="board-card-top">
        <Link to={`/animais/${info.animal.id}`} onClick={(e) => e.stopPropagation()} className="board-number">{info.animal.number}</Link>
        <AttemptDots used={info.streak} max={max} />
      </div>
      <small className="board-meta">{[info.category ? categoryLabel[info.category] : null, info.animal.lot].filter(Boolean).join(' · ')}</small>
      <p className={`board-line ${overdue ? 'is-late' : ''}`}>{line}</p>
      {sub && <small className="board-sub">{sub}</small>}
      {lastChance && <span className="board-flag">Última tentativa</span>}
      {(info.state === 'vazia' || info.state === 'parida') && (
        <button className="button button-secondary button-sm board-cta" onClick={(e) => { e.stopPropagation(); onStart() }}>Iniciar protocolo</button>
      )}
      {info.state === 'prenhe' && last && (
        <button className="button button-secondary button-sm board-cta" onClick={(e) => { e.stopPropagation(); onCalving(last) }}><Baby size={14} /> Parto</button>
      )}
    </article>
  )
}

const stepKinds: { value: ProtocolStepKind; label: string }[] = [
  { value: 'aplicacao', label: 'Aplicação' },
  { value: 'retirada', label: 'Retirada' },
  { value: 'inseminacao', label: 'Inseminação / cobertura' },
  { value: 'diagnostico', label: 'Diagnóstico' },
  { value: 'outro', label: 'Outro' }
]

function ProtocolEditor({ protocol, onClose }: { protocol?: ReproProtocol; onClose: () => void }) {
  const { saveProtocol } = useAppData()
  const [name, setName] = useState(protocol?.name ?? '')
  const [description, setDescription] = useState(protocol?.description ?? '')
  const [method, setMethod] = useState<BreedingMethod>(protocol?.method ?? 'iatf')
  const [active, setActive] = useState(protocol?.active ?? true)
  const [steps, setSteps] = useState<ProtocolStep[]>(protocol?.steps ?? [
    { day: 0, kind: 'aplicacao', title: '' },
    { day: 10, kind: 'inseminacao', title: 'Inseminação' },
    { day: 40, kind: 'diagnostico', title: 'Diagnóstico de gestação' }
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = (index: number, patch: Partial<ProtocolStep>) => setSteps(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)))

  async function submit(event: FormEvent) {
    event.preventDefault()
    const clean = steps.filter((step) => step.title.trim()).map((step) => ({ ...step, title: step.title.trim(), day: Number(step.day) || 0 }))
    if (!name.trim() || !clean.length) {
      setError('Dê um nome ao protocolo e preencha pelo menos uma etapa.')
      return
    }
    if (!clean.some((step) => step.kind === 'inseminacao')) {
      setError('Inclua uma etapa de inseminação ou cobertura, para o sistema saber quando prever o parto.')
      return
    }
    setSaving(true)
    try {
      // Editar um modelo padrão cria uma cópia própria da fazenda.
      await saveProtocol({ id: protocol?.id, name: name.trim(), description, method, active, steps: clean })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={protocol ? 'Editar protocolo' : 'Novo protocolo'}
      eyebrow="Modelo de etapas"
      onClose={onClose}
      onSubmit={submit}
      size="lg"
      footer={<>
        <button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button>
        <button className="button button-primary" disabled={saving}>{saving ? 'Salvando' : 'Salvar protocolo'}</button>
      </>}
    >
      <div className="form-grid two">
        <Field label="Nome" required><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: IATF novilhas" /></Field>
        <Field label="Método">
          <select value={method} onChange={(e) => setMethod(e.target.value as BreedingMethod)}>
            {Object.entries(methodLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Descrição"><input value={description ?? ''} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" /></Field>

      <span className="field-label">Etapas</span>
      <div className="step-editor">
        {steps.map((step, index) => (
          <div key={index} className="step-editor-row">
            <label className="step-editor-day"><span>D</span><input type="number" min="0" value={step.day} onChange={(e) => update(index, { day: Number(e.target.value) })} /></label>
            <input className="step-editor-title" value={step.title} onChange={(e) => update(index, { title: e.target.value })} placeholder="O que é feito neste dia" />
            <select value={step.kind} onChange={(e) => update(index, { kind: e.target.value as ProtocolStepKind })}>
              {stepKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
            </select>
            <button type="button" className="icon-button danger" onClick={() => setSteps(steps.filter((_, i) => i !== index))} aria-label="Remover etapa"><Trash2 size={16} /></button>
          </div>
        ))}
        <button type="button" className="text-button" onClick={() => setSteps([...steps, { day: (steps[steps.length - 1]?.day ?? 0) + 1, kind: 'outro', title: '' }])}><Plus size={16} /> Adicionar etapa</button>
      </div>
      <label className="switch-row">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span>Disponível para novos lotes</span>
      </label>
      {protocol?.id.startsWith('default-') && <Alert tone="info">Este é um modelo padrão. Ao salvar, ele vira um protocolo da fazenda.</Alert>}
      {error && <Alert>{error}</Alert>}
    </Modal>
  )
}
