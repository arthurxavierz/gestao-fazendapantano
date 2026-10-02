import { Check, Scale, Syringe, Trash2 } from 'lucide-react'
import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from 'react'
import { useAppData } from '../AppContext'
import { byNumber, formatGain, isActive, weighingsOf } from '../domain/herd'
import { healthPresets, presetDates } from '../domain/health'
import type { HealthKind } from '../types'
import { daysBetween, formatArroba, formatShortDate, healthKindLabel, todayISO } from '../utils/format'
import { AnimalMultiPicker } from './AnimalPicker'
import { Alert, Field, Modal } from './ui'

// ============================================================
// Aplicação sanitária (vacina, vermífugo, medicamento...)
// ============================================================
export function HealthModal({ onClose, preselected = [], product: initialProduct = '' }: { onClose: () => void; preselected?: string[]; product?: string }) {
  const { animals, addHealthEvents } = useAppData()
  const initialPreset = healthPresets.find((item) => item.product === initialProduct)
  const [product, setProduct] = useState(initialProduct)
  const [kind, setKind] = useState<HealthKind>(initialPreset?.kind ?? 'vacina')
  const [date, setDate] = useState(todayISO())
  const [dose, setDose] = useState('')
  const [next, setNext] = useState(presetDates(initialPreset, todayISO()).next)
  const [withdrawal, setWithdrawal] = useState(presetDates(initialPreset, todayISO()).withdrawal)
  const [productBatch, setProductBatch] = useState('')
  const [notes, setNotes] = useState('')
  const [selected, setSelected] = useState<string[]>(preselected)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const candidates = useMemo(() => animals.filter(isActive), [animals])
  const preset = healthPresets.find((item) => item.product === product)

  function pickPreset(name: string) {
    const found = healthPresets.find((item) => item.product === name)
    setProduct(name)
    if (!found) return
    setKind(found.kind)
    const dates = presetDates(found, date)
    setNext(dates.next)
    setWithdrawal(dates.withdrawal)
  }

  function changeDate(value: string) {
    setDate(value)
    if (preset && value) {
      const dates = presetDates(preset, value)
      setNext(dates.next)
      setWithdrawal(dates.withdrawal)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!product.trim() || !selected.length) return
    setSaving(true)
    setError(null)
    try {
      await addHealthEvents({
        animalIds: selected,
        kind,
        product,
        dose,
        applied_at: date,
        next_due_date: next,
        withdrawal_until: withdrawal,
        product_batch: productBatch,
        notes
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Aplicação sanitária"
      eyebrow="Vacina, vermífugo ou medicamento"
      onClose={onClose}
      onSubmit={submit}
      size="xl"
      footer={<>
        <button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button>
        <button className="button button-primary" disabled={saving || !product.trim() || !selected.length}>
          <Syringe size={18} /> {saving ? 'Salvando' : `Registrar em ${selected.length} ${selected.length === 1 ? 'animal' : 'animais'}`}
        </button>
      </>}
    >
      <div className="modal-split">
        <div>
          <span className="field-label">Atalhos</span>
          <div className="chip-row">
            {healthPresets.map((item) => (
              <button type="button" key={item.product} className={`chip ${product === item.product ? 'selected' : ''}`} onClick={() => pickPreset(item.product)}>{item.product}</button>
            ))}
          </div>
          {preset && <p className="field-hint">{preset.hint}</p>}
          <div className="form-grid two">
            <Field label="Produto" required><input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Nome do produto" list="health-products" /></Field>
            <Field label="Tipo">
              <select value={kind} onChange={(e) => setKind(e.target.value as HealthKind)}>
                {Object.entries(healthKindLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </Field>
            <Field label="Data da aplicação" required><input type="date" value={date} onChange={(e) => changeDate(e.target.value)} /></Field>
            <Field label="Dose"><input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Ex.: 5 ml" /></Field>
            <Field label="Próxima dose" hint="Entra na agenda automaticamente."><input type="date" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
            <Field label="Fim da carência" hint="Bloqueia o envio para abate até a data."><input type="date" value={withdrawal} onChange={(e) => setWithdrawal(e.target.value)} /></Field>
            <Field label="Partida do produto"><input value={productBatch} onChange={(e) => setProductBatch(e.target.value)} placeholder="Lote do frasco" /></Field>
            <Field label="Observação"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></Field>
          </div>
          <datalist id="health-products">{healthPresets.map((item) => <option key={item.product} value={item.product} />)}</datalist>
        </div>
        <div>
          <span className="field-label">Animais</span>
          <AnimalMultiPicker animals={candidates} selected={selected} onChange={setSelected} />
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
    </Modal>
  )
}

// ============================================================
// Pesagem em modo curral
// ============================================================
interface Row {
  animalId: string
  weight: string
}

export function WeighingModal({ onClose, preselected = [] }: { onClose: () => void; preselected?: string[] }) {
  const { animals, weighings, addWeighings } = useAppData()
  const active = useMemo(() => animals.filter(isActive).sort(byNumber), [animals])
  const [date, setDate] = useState(todayISO())
  const [rows, setRows] = useState<Row[]>(preselected.map((animalId) => ({ animalId, weight: '' })))
  const [number, setNumber] = useState('')
  const [weight, setWeight] = useState('')
  const [lot, setLot] = useState('')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const numberRef = useRef<HTMLInputElement>(null)
  const weightRef = useRef<HTMLInputElement>(null)

  const lots = useMemo(() => [...new Set(active.map((item) => item.lot).filter(Boolean) as string[])].sort(), [active])
  const byId = useMemo(() => new Map(active.map((item) => [item.id, item])), [active])

  /** Última pesagem antes da data informada, para calcular o ganho. */
  function previous(animalId: string) {
    const list = weighingsOf(animalId, weighings).filter((item) => item.weighed_at < date)
    return list[list.length - 1]
  }

  function addByNumber() {
    const value = number.trim()
    if (!value) return
    const animal = active.find((item) => item.number === value) ?? active.find((item) => item.number.replace(/^0+/, '') === value.replace(/^0+/, ''))
    if (!animal) {
      setMessage(`Brinco ${value} não encontrado entre os animais ativos.`)
      return
    }
    const typed = weight.trim().replace(',', '.')
    setRows((current) => {
      const exists = current.some((row) => row.animalId === animal.id)
      return exists
        ? current.map((row) => (row.animalId === animal.id ? { ...row, weight: typed || row.weight } : row))
        : [{ animalId: animal.id, weight: typed }, ...current]
    })
    setMessage(typed ? `${animal.number}: ${typed} kg lançado.` : `${animal.number} adicionado. Informe o peso na lista.`)
    setNumber('')
    setWeight('')
    numberRef.current?.focus()
  }

  function onNumberKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      weightRef.current?.focus()
    }
  }

  function onWeightKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      addByNumber()
    }
  }

  function loadLot(value: string) {
    setLot(value)
    if (!value) return
    const ids = active.filter((item) => item.lot === value).map((item) => item.id)
    setRows((current) => [...current, ...ids.filter((id) => !current.some((row) => row.animalId === id)).map((animalId) => ({ animalId, weight: '' }))])
  }

  const filled = rows.filter((row) => Number(row.weight) > 0)
  const average = filled.length ? filled.reduce((sum, row) => sum + Number(row.weight), 0) / filled.length : null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!filled.length) return
    setSaving(true)
    setError(null)
    try {
      await addWeighings(filled.map((row) => ({ animalId: row.animalId, weight: Number(row.weight) })), date, notes)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar as pesagens.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Pesagem"
      eyebrow="Modo curral"
      onClose={onClose}
      onSubmit={submit}
      size="lg"
      footer={<>
        <span className="modal-summary">{filled.length} pesado{filled.length === 1 ? '' : 's'}{average ? ` · média ${Math.round(average)} kg (${formatArroba(average)})` : ''}</span>
        <button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button>
        <button className="button button-primary" disabled={saving || !filled.length}><Check size={18} /> {saving ? 'Salvando' : 'Salvar pesagens'}</button>
      </>}
    >
      <div className="form-grid three">
        <Field label="Data da pesagem" required><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Carregar um lote inteiro">
          <select value={lot} onChange={(e) => loadLot(e.target.value)}>
            <option value="">Escolha um lote</option>
            {lots.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Observação"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: balança do curral 2" /></Field>
      </div>

      <div className="scale-entry">
        <Scale size={22} />
        <input ref={numberRef} value={number} onChange={(e) => { setNumber(e.target.value); setMessage(null) }} onKeyDown={onNumberKey} placeholder="Brinco" inputMode="numeric" autoFocus aria-label="Brinco" />
        <input ref={weightRef} value={weight} onChange={(e) => setWeight(e.target.value)} onKeyDown={onWeightKey} placeholder="Peso (kg)" inputMode="decimal" aria-label="Peso em kg" />
        <button type="button" className="button button-primary" onClick={addByNumber} disabled={!number.trim()}>Lançar</button>
      </div>
      <p className="field-hint">Digite o brinco, Enter, o peso, Enter. O próximo animal já fica pronto para digitar.</p>
      {message && <p className="scale-message">{message}</p>}

      {rows.length > 0 && (
        <div className="weigh-table">
          <div className="weigh-head"><span>Brinco</span><span>Anterior</span><span>Peso hoje</span><span>Ganho</span><span /></div>
          {rows.map((row, index) => {
            const animal = byId.get(row.animalId)
            const prev = previous(row.animalId)
            const current = Number(row.weight)
            const days = prev ? daysBetween(prev.weighed_at, date) : 0
            const gain = prev && current > 0 && days > 0 ? (current - Number(prev.weight)) / days : null
            return (
              <div key={row.animalId} className="weigh-row">
                <strong>{animal?.number}</strong>
                <span className="weigh-prev">{prev ? `${Number(prev.weight)} kg · ${formatShortDate(prev.weighed_at)}` : '—'}</span>
                <input
                  value={row.weight}
                  inputMode="decimal"
                  placeholder="kg"
                  onChange={(e) => setRows(rows.map((item, i) => (i === index ? { ...item, weight: e.target.value.replace(',', '.') } : item)))}
                />
                <span className={`weigh-gain ${gain != null && gain < 0 ? 'is-neg' : ''}`}>{gain == null ? '—' : formatGain(gain)}</span>
                <button type="button" className="icon-button" onClick={() => setRows(rows.filter((_, i) => i !== index))} aria-label="Remover"><Trash2 size={15} /></button>
              </div>
            )
          })}
        </div>
      )}
      {error && <Alert>{error}</Alert>}
    </Modal>
  )
}
