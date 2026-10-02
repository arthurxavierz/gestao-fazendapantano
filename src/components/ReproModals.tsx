import { AlertTriangle, Baby, CalendarCheck, Check, HeartCrack, Skull, Dna } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAnimalIndex, useAppData } from '../AppContext'
import { byNumber } from '../domain/herd'
import {
  diagnosisDue,
  gestationDays,
  isLastChance,
  reachesDiscard,
  stepDueDate
} from '../domain/reproduction'
import { useHerd, type HerdInfo } from '../hooks/useHerd'
import type { AnimalSex, BreedingAttempt, BreedingMethod, ReproProtocol } from '../types'
import { addDays, daysBetween, formatDate, formatShortDate, methodLabel, relativeDay, todayISO } from '../utils/format'
import { AnimalMultiPicker } from './AnimalPicker'
import { ReproBadge } from './StatusBadge'
import { Alert, AttemptDots, Field, Modal } from './ui'

/** Dias mínimos depois do parto antes de um novo protocolo (puerpério). */
export const MIN_POSTPARTUM_DAYS = 30

/**
 * Matrizes que podem começar uma nova tentativa agora: vazias, ou paridas que
 * já passaram do puerpério. Vaca recém-parida ainda não responde ao protocolo.
 */
export function eligibleForBreeding(info: HerdInfo) {
  if (!info.breeding) return false
  if (info.state === 'vazia') return true
  if (info.state !== 'parida') return false
  const last = info.attempts[info.attempts.length - 1]
  return !last?.calving_date || daysBetween(last.calving_date, todayISO()) >= MIN_POSTPARTUM_DAYS
}

// ============================================================
// Iniciar protocolo / cobertura
// ============================================================
export function StartBreedingModal({ onClose, preselected = [] }: { onClose: () => void; preselected?: string[] }) {
  const { protocols, settings, startProtocol, startDirectBreeding } = useAppData()
  const herd = useHerd()
  const activeProtocols = protocols.filter((item) => item.active)
  const [mode, setMode] = useState<'protocolo' | 'direto'>('protocolo')
  const [protocolId, setProtocolId] = useState(activeProtocols[0]?.id ?? '')
  const [method, setMethod] = useState<BreedingMethod>('ia')
  const [date, setDate] = useState(todayISO())
  const [sire, setSire] = useState('')
  const [technician, setTechnician] = useState('')
  const [selected, setSelected] = useState<string[]>(preselected)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const candidates = useMemo(() => [...herd.info.values()].filter(eligibleForBreeding).map((item) => item.animal), [herd])
  const protocol = activeProtocols.find((item) => item.id === protocolId)
  const lastChance = selected.filter((id) => {
    const info = herd.get(id)
    return info && isLastChance(info.attempts, settings)
  })

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!selected.length) return
    setSaving(true)
    setError(null)
    try {
      if (mode === 'protocolo') {
        if (!protocol) throw new Error('Escolha um protocolo.')
        await startProtocol({ animalIds: selected, protocol, startDate: date, sire, technician })
      } else {
        await startDirectBreeding({ animalIds: selected, method, date, sire, technician })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível iniciar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Iniciar reprodução"
      eyebrow="Protocolo ou cobertura"
      onClose={onClose}
      onSubmit={submit}
      size="xl"
      footer={<>
        <button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button>
        <button className="button button-primary" disabled={saving || !selected.length || (mode === 'protocolo' && !protocol)}>
          <Dna size={18} /> {saving ? 'Salvando' : `Iniciar para ${selected.length} matriz${selected.length === 1 ? '' : 'es'}`}
        </button>
      </>}
    >
      <div className="segmented-inline">
        <button type="button" className={mode === 'protocolo' ? 'selected' : ''} onClick={() => setMode('protocolo')}>Protocolo (IATF, repasse)</button>
        <button type="button" className={mode === 'direto' ? 'selected' : ''} onClick={() => setMode('direto')}>Inseminação no cio ou monta</button>
      </div>

      <div className="modal-split">
        <div>
          {mode === 'protocolo' ? (
            <>
              <span className="field-label">Protocolo</span>
              <div className="protocol-options">
                {activeProtocols.map((item) => (
                  <button type="button" key={item.id} className={protocolId === item.id ? 'selected' : ''} onClick={() => setProtocolId(item.id)}>
                    <strong>{item.name}</strong>
                    <span>{item.steps.length} etapas · {methodLabel[item.method]}</span>
                  </button>
                ))}
              </div>
              <Field label="Data do D0 (início)" required>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              {protocol && (
                <ol className="step-preview">
                  {protocol.steps.map((step, index) => (
                    <li key={index} className={`kind-${step.kind}`}>
                      <span className="step-day">D{step.day}</span>
                      <div><strong>{step.title}</strong><small>{formatDate(addDays(date, step.day))} · {relativeDay(addDays(date, step.day))}</small></div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <>
              <Field label="Tipo de cobertura">
                <select value={method} onChange={(e) => setMethod(e.target.value as BreedingMethod)}>
                  <option value="ia">Inseminação no cio</option>
                  <option value="monta">Monta natural</option>
                  <option value="te">Transferência de embrião</option>
                </select>
              </Field>
              <Field label="Data da cobertura" required>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <p className="field-hint">O diagnóstico será sugerido para {formatDate(addDays(date, settings.diagnosis_days))}.</p>
            </>
          )}
          <div className="form-grid two">
            <Field label="Touro ou sêmen"><input value={sire} onChange={(e) => setSire(e.target.value)} placeholder="Ex.: Nelore REM Usina" /></Field>
            <Field label="Responsável"><input value={technician} onChange={(e) => setTechnician(e.target.value)} placeholder="Ex.: Dr. Paulo" /></Field>
          </div>
          {lastChance.length > 0 && (
            <Alert tone="warning" icon={AlertTriangle}>
              <strong>{lastChance.length} matriz{lastChance.length > 1 ? 'es estão' : ' está'} na última tentativa</strong> ({settings.max_breeding_attempts}ª).
              Se não emprenhar{lastChance.length > 1 ? 'em' : ''}, o sistema vai sugerir o descarte para abate.
            </Alert>
          )}
        </div>

        <div>
          <span className="field-label">Matrizes aptas ({candidates.length})</span>
          <AnimalMultiPicker
            animals={candidates}
            selected={selected}
            onChange={setSelected}
            emptyText="Nenhuma matriz vazia ou pós-parto no momento."
            renderExtra={(animal) => {
              const info = herd.get(animal.id)
              if (!info) return null
              return (
                <span className="picker-extra">
                  <AttemptDots used={info.streak} max={settings.max_breeding_attempts} />
                  <ReproBadge state={info.state} />
                </span>
              )
            }}
          />
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
    </Modal>
  )
}

// ============================================================
// Concluir etapa do protocolo (para várias matrizes)
// ============================================================
export function CompleteStepModal({ attemptIds, stepIndex, onClose }: { attemptIds: string[]; stepIndex: number; onClose: () => void }) {
  const { attempts, completeStep } = useAppData()
  const index = useAnimalIndex()
  const list = attempts.filter((item) => attemptIds.includes(item.id))
  const step = list[0]?.steps[stepIndex]
  const due = list[0] && step ? stepDueDate(list[0], step) : todayISO()
  const [date, setDate] = useState(due > todayISO() ? todayISO() : due)
  const [sire, setSire] = useState(list[0]?.sire ?? '')
  const [selected, setSelected] = useState<string[]>(attemptIds)
  const [saving, setSaving] = useState(false)

  if (!step) return null
  const isInsemination = step.kind === 'inseminacao'

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await completeStep(selected, stepIndex, date, isInsemination ? sire : undefined)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={step.title}
      eyebrow={`D${step.day} · ${list[0]?.protocol_name ?? 'Protocolo'}`}
      onClose={onClose}
      onSubmit={submit}
      footer={<>
        <button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button>
        <button className="button button-primary" disabled={saving || !selected.length}><Check size={18} /> {saving ? 'Salvando' : `Concluir para ${selected.length}`}</button>
      </>}
    >
      {step.description && <p className="modal-text">{step.description}</p>}
      <div className="form-grid two">
        <Field label="Data em que foi feito" required><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {isInsemination && <Field label="Touro ou sêmen"><input value={sire} onChange={(e) => setSire(e.target.value)} /></Field>}
      </div>
      <span className="field-label">Matrizes ({selected.length} de {list.length})</span>
      <div className="check-grid">
        {list.map((attempt) => {
          const animal = index.get(attempt.animal_id)
          const on = selected.includes(attempt.id)
          return (
            <button type="button" key={attempt.id} className={on ? 'selected' : ''} onClick={() => setSelected(on ? selected.filter((id) => id !== attempt.id) : [...selected, attempt.id])}>
              <span className="picker-check">{on && <Check size={13} />}</span>{animal?.number ?? '?'}
            </button>
          )
        })}
      </div>
      <p className="field-hint">Desmarque quem não passou pelo manejo hoje. Essas continuam pendentes na agenda.</p>
    </Modal>
  )
}

// ============================================================
// Diagnóstico de gestação em lote
// ============================================================
export function DiagnosisModal({ attemptIds, onClose }: { attemptIds: string[]; onClose: () => void }) {
  const { attempts, settings, registerDiagnosis } = useAppData()
  const herd = useHerd()
  const list = useMemo(
    () => attempts.filter((item) => attemptIds.includes(item.id)).sort((a, b) => byNumber(herd.get(a.animal_id)!.animal, herd.get(b.animal_id)!.animal)),
    [attempts, attemptIds, herd]
  )
  const [date, setDate] = useState(todayISO())
  const [results, setResults] = useState<Record<string, 'prenhe' | 'vazia'>>({})
  const [discard, setDiscard] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const willDiscard = (attempt: BreedingAttempt) => {
    const info = herd.get(attempt.animal_id)
    return Boolean(info && results[attempt.id] === 'vazia' && reachesDiscard(info.attempts, attempt.id, 'vazia', settings))
  }

  const decided = Object.keys(results).length
  const pregnant = Object.values(results).filter((value) => value === 'prenhe').length

  function setAll(value: 'prenhe' | 'vazia') {
    setResults(Object.fromEntries(list.map((item) => [item.id, value])))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const entries = list.filter((item) => results[item.id]).map((item) => ({ attemptId: item.id, result: results[item.id] }))
      const discardAnimalIds = list.filter((item) => willDiscard(item) && discard[item.id] !== false).map((item) => item.animal_id)
      await registerDiagnosis({ date, entries, discardAnimalIds })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o diagnóstico.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Diagnóstico de gestação"
      eyebrow={`${list.length} matriz${list.length === 1 ? '' : 'es'}`}
      onClose={onClose}
      onSubmit={submit}
      size="lg"
      footer={<>
        <span className="modal-summary">{decided} de {list.length} lançadas · {pregnant} prenhe{pregnant === 1 ? '' : 's'}</span>
        <button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button>
        <button className="button button-primary" disabled={saving || !decided}><CalendarCheck size={18} /> {saving ? 'Salvando' : 'Salvar diagnóstico'}</button>
      </>}
    >
      <div className="form-grid two">
        <Field label="Data do diagnóstico" required><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="field">
          <span>Atalho</span>
          <div className="inline-buttons">
            <button type="button" className="button button-secondary" onClick={() => setAll('prenhe')}>Todas prenhes</button>
            <button type="button" className="button button-secondary" onClick={() => setResults({})}>Limpar</button>
          </div>
        </div>
      </div>

      <div className="diagnosis-list">
        {list.map((attempt) => {
          const info = herd.get(attempt.animal_id)!
          const days = gestationDays(attempt)
          const discardRow = willDiscard(attempt)
          return (
            <div key={attempt.id} className={`diagnosis-row ${discardRow ? 'is-discard' : ''}`}>
              <div className="diagnosis-animal">
                <strong>{info.animal.number}</strong>
                <small>
                  {attempt.insemination_date ? `IA em ${formatShortDate(attempt.insemination_date)} · ${days} dias` : `Início ${formatShortDate(attempt.start_date)}`}
                </small>
              </div>
              <AttemptDots used={info.streak + (results[attempt.id] === 'vazia' ? 1 : 0)} max={settings.max_breeding_attempts} />
              <div className="result-toggle">
                <button type="button" className={results[attempt.id] === 'prenhe' ? 'is-pos' : ''} onClick={() => setResults({ ...results, [attempt.id]: 'prenhe' })}>Prenhe</button>
                <button type="button" className={results[attempt.id] === 'vazia' ? 'is-neg' : ''} onClick={() => setResults({ ...results, [attempt.id]: 'vazia' })}>Vazia</button>
              </div>
              {discardRow && (
                <label className="discard-confirm">
                  <input type="checkbox" checked={discard[attempt.id] !== false} onChange={(e) => setDiscard({ ...discard, [attempt.id]: e.target.checked })} />
                  <span><Skull size={14} /> {settings.max_breeding_attempts}ª tentativa sem prenhez. Enviar para descarte (abate)</span>
                </label>
              )}
            </div>
          )
        })}
      </div>
      {error && <Alert>{error}</Alert>}
    </Modal>
  )
}

// ============================================================
// Parto ou aborto
// ============================================================
export function CalvingModal({ attemptId, onClose }: { attemptId: string; onClose: () => void }) {
  const { attempts, animals, settings, registerCalving } = useAppData()
  const herd = useHerd()
  const attempt = attempts.find((item) => item.id === attemptId)
  const info = attempt ? herd.get(attempt.animal_id) : undefined
  const [outcome, setOutcome] = useState<'parto' | 'aborto'>('parto')
  const [date, setDate] = useState(todayISO())
  const [number, setNumber] = useState('')
  const [sex, setSex] = useState<AnimalSex>('macho')
  const [weight, setWeight] = useState('')
  const [notes, setNotes] = useState('')
  const [discard, setDiscard] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!attempt || !info) return null
  const abortDiscards = reachesDiscard(info.attempts, attempt.id, 'aborto', settings)
  const numberTaken = number.trim() && animals.some((item) => item.number === number.trim())

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await registerCalving({
        attemptId,
        date,
        outcome,
        calf: outcome === 'parto' && number.trim() ? { number: number.trim(), sex, weight: weight ? Number(weight) : null, notes } : undefined,
        discard: outcome === 'aborto' && abortDiscards && discard
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Parto da matriz ${info.animal.number}`}
      eyebrow={attempt.expected_calving_date ? `Previsto para ${formatDate(attempt.expected_calving_date)}` : 'Gestação confirmada'}
      onClose={onClose}
      onSubmit={submit}
      footer={<>
        <button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button>
        <button className="button button-primary" disabled={saving || Boolean(numberTaken)}>
          {outcome === 'parto' ? <Baby size={18} /> : <HeartCrack size={18} />} {saving ? 'Salvando' : outcome === 'parto' ? 'Registrar parto' : 'Registrar aborto'}
        </button>
      </>}
    >
      <div className="segmented-inline">
        <button type="button" className={outcome === 'parto' ? 'selected' : ''} onClick={() => setOutcome('parto')}><Baby size={16} /> Nasceu</button>
        <button type="button" className={outcome === 'aborto' ? 'selected' : ''} onClick={() => setOutcome('aborto')}><HeartCrack size={16} /> Aborto / perda</button>
      </div>
      <Field label={outcome === 'parto' ? 'Data do nascimento' : 'Data da perda'} required>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {outcome === 'parto' ? (
        <>
          <div className="calf-card">
            <span className="eyebrow">Bezerro</span>
            <p>O bezerro já entra no rebanho com a mãe ({info.animal.number}){attempt.sire ? `, o pai (${attempt.sire})` : ''} e a data de nascimento vinculados.</p>
            <div className="form-grid two">
              <Field label="Brinco do bezerro" hint={numberTaken ? 'Este número já está cadastrado.' : 'Deixe vazio se ainda não foi brincado.'}>
                <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Ex.: 507" />
              </Field>
              <Field label="Sexo">
                <select value={sex} onChange={(e) => setSex(e.target.value as AnimalSex)}>
                  <option value="macho">Macho</option>
                  <option value="femea">Fêmea</option>
                </select>
              </Field>
              <Field label="Peso ao nascer (kg)"><input type="number" min="0" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Ex.: 34" /></Field>
              <Field label="Observação"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></Field>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="modal-text">A perda conta como tentativa sem sucesso ({info.streak + 1} de {settings.max_breeding_attempts}).</p>
          {abortDiscards && (
            <label className="discard-confirm">
              <input type="checkbox" checked={discard} onChange={(e) => setDiscard(e.target.checked)} />
              <span><Skull size={14} /> Limite de tentativas atingido. Enviar para descarte (abate)</span>
            </label>
          )}
        </>
      )}
      {error && <Alert>{error}</Alert>}
    </Modal>
  )
}

// ============================================================
// Detalhe de uma tentativa
// ============================================================
export function AttemptModal({ attempt, onClose, onAction }: {
  attempt: BreedingAttempt
  onClose: () => void
  onAction: (action: 'step' | 'diagnosis' | 'calving', stepIndex?: number) => void
}) {
  const { settings, cancelAttempt } = useAppData()
  const herd = useHerd()
  const info = herd.get(attempt.animal_id)
  const done = new Map(attempt.steps_done.map((item) => [item.index, item.done_at]))
  const diagDue = diagnosisDue(attempt, settings)

  async function cancel() {
    if (!window.confirm('Remover esta tentativa? Use apenas para corrigir um lançamento errado.')) return
    await cancelAttempt(attempt.id)
    onClose()
  }

  return (
    <Modal title={`Matriz ${info?.animal.number ?? ''}`} eyebrow={attempt.protocol_name ?? methodLabel[attempt.method]} onClose={onClose} size="lg">
      <div className="attempt-summary">
        <div><span>Início</span><strong>{formatDate(attempt.start_date)}</strong></div>
        <div><span>Inseminação</span><strong>{attempt.insemination_date ? formatDate(attempt.insemination_date) : 'Pendente'}</strong></div>
        <div><span>Touro / sêmen</span><strong>{attempt.sire || '—'}</strong></div>
        <div><span>Tentativa</span><strong>{(info?.streak ?? 0) + (attempt.result === 'pendente' ? 1 : 0)} de {settings.max_breeding_attempts}</strong></div>
      </div>

      {attempt.steps.length > 0 && (
        <ol className="step-timeline">
          {attempt.steps.map((step, index) => {
            const doneAt = done.get(index)
            const due = stepDueDate(attempt, step)
            const late = !doneAt && due < todayISO()
            return (
              <li key={index} className={`${doneAt ? 'is-done' : ''} ${late ? 'is-late' : ''}`}>
                <span className="step-dot">{doneAt ? <Check size={13} /> : `D${step.day}`}</span>
                <div>
                  <strong>{step.title}</strong>
                  <small>{doneAt ? `Feito em ${formatDate(doneAt.slice(0, 10))}` : `Previsto ${formatDate(due)} · ${relativeDay(due)}`}</small>
                </div>
                {!doneAt && attempt.result === 'pendente' && step.kind !== 'diagnostico' && (
                  <button type="button" className="button button-secondary button-sm" onClick={() => onAction('step', index)}>Concluir</button>
                )}
                {!doneAt && attempt.result === 'pendente' && step.kind === 'diagnostico' && (
                  <button type="button" className="button button-primary button-sm" onClick={() => onAction('diagnosis')}>Lançar</button>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {attempt.result === 'pendente' && !attempt.steps.some((step) => step.kind === 'diagnostico') && (
        <div className="attempt-cta">
          <span>Diagnóstico sugerido {diagDue ? `para ${formatDate(diagDue)}` : ''}</span>
          <button type="button" className="button button-primary" onClick={() => onAction('diagnosis')}><CalendarCheck size={17} /> Lançar diagnóstico</button>
        </div>
      )}
      {attempt.result === 'prenhe' && (
        <div className="attempt-cta">
          <span>Prenhe · parto previsto {attempt.expected_calving_date ? `${formatDate(attempt.expected_calving_date)} (${relativeDay(attempt.expected_calving_date)})` : ''}</span>
          <button type="button" className="button button-primary" onClick={() => onAction('calving')}><Baby size={17} /> Registrar parto</button>
        </div>
      )}

      <div className="modal-footer-links">
        {info && <Link to={`/animais/${info.animal.id}`} className="text-button">Abrir ficha do animal</Link>}
        <button type="button" className="text-button danger" onClick={() => void cancel()}>Remover lançamento</button>
      </div>
    </Modal>
  )
}

export type { ReproProtocol }
