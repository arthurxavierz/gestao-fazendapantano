import { Check, ClipboardCheck, Hash, Plus, Users } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { useAuth } from '../AuthContext'
import { useResponsibleName } from '../hooks/useResponsibleName'
import { EmptyState } from '../components/EmptyState'
import type { CountSession } from '../types'
import { formatDateTime } from '../utils/format'

export function Counts() {
  const { animals, counts, addCount } = useAppData()
  const { isAdmin } = useAuth()
  const responsibleName = useResponsibleName(isAdmin)
  const [params, setParams] = useSearchParams()
  const [showForm, setShowForm] = useState(params.get('nova') === '1')

  // Atalho do menu "Novo registro": abre o formulário e limpa o endereço.
  useEffect(() => {
    if (params.get('nova')) {
      params.delete('nova')
      setParams(params, { replace: true })
    }
  }, [params, setParams])
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<CountSession['mode']>('quantity')
  const [expected, setExpected] = useState('')
  const [quantity, setQuantity] = useState('')
  const [typedNumber, setTypedNumber] = useState('')
  const [numbers, setNumbers] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const missing = useMemo(() => {
    if (mode !== 'individual' || !expected) return []
    return []
  }, [mode, expected])

  function addNumber() {
    const value = typedNumber.trim()
    if (!value || numbers.includes(value)) return
    setNumbers((current) => [...current, value])
    setTypedNumber('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const total = mode === 'quantity' ? Number(quantity) : numbers.length
    if (!title.trim() || !Number.isFinite(total) || total < 0) return
    setSaving(true)
    try {
      await addCount({
        title: title.trim(),
        mode,
        expected_total: expected ? Number(expected) : null,
        total_counted: total,
        animal_numbers: numbers,
        notes: notes.trim() || null
      })
      setTitle('')
      setExpected('')
      setQuantity('')
      setNumbers([])
      setNotes('')
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">Manejo e conferência</span><h1>Contagens</h1><p>Registre apenas o total ou informe os números encontrados.</p></div>
        <button className="button button-primary" onClick={() => setShowForm(true)}><Plus size={18} /> Nova contagem</button>
      </div>

      <section className="count-explainer">
        <article><Hash /><div><strong>Contagem rápida</strong><span>Informe somente a quantidade final do curral ou lote.</span></div></article>
        <article><Users /><div><strong>Contagem por animal</strong><span>Digite os números dos brincos conforme eles passam.</span></div></article>
      </section>

      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">Registros anteriores</span><h2>Últimas contagens</h2></div></div>
        {counts.length ? <div className="count-list">
          {counts.map((item) => (
            <article key={item.id}>
              <div className="count-icon"><ClipboardCheck /></div>
              <div className="count-main"><strong>{item.title}</strong><span>{item.mode === 'quantity' ? 'Contagem rápida' : 'Contagem por animal'}</span><small>{formatDateTime(item.created_at)}</small>{isAdmin && <span className="responsible-line">Responsavel: {responsibleName(item.created_by)}</span>}</div>
              <div className="count-result"><strong>{item.total_counted}</strong><span>contados</span>{item.expected_total != null && <small>{item.expected_total - item.total_counted === 0 ? 'Quantidade conferida' : `${Math.abs(item.expected_total - item.total_counted)} de diferença`}</small>}</div>
            </article>
          ))}
        </div> : <EmptyState icon={ClipboardCheck} title="Nenhuma contagem registrada" text="As conferências realizadas durante o manejo aparecerão aqui." />}
      </section>

      {showForm && (
        <div className="modal-backdrop" onMouseDown={() => setShowForm(false)}>
          <form className="modal modal-wide" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Conferência do rebanho</span><h2>Nova contagem</h2></div><button type="button" className="icon-button" onClick={() => setShowForm(false)}>×</button></div>
            <label className="field"><span>Nome da contagem</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Exemplo: Contagem do Curral 2" autoFocus /></label>
            <div className="mode-selector">
              <button type="button" className={mode === 'quantity' ? 'selected' : ''} onClick={() => setMode('quantity')}><Hash /><strong>Somente quantidade</strong><span>Mais simples e rápido</span></button>
              <button type="button" className={mode === 'individual' ? 'selected' : ''} onClick={() => setMode('individual')}><Users /><strong>Números dos animais</strong><span>Conferência individual</span></button>
            </div>
            <div className="form-grid">
              <label className="field"><span>Quantidade esperada</span><input type="number" min="0" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="Opcional" /></label>
              {mode === 'quantity' && <label className="field required"><span>Quantidade contada</span><input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Total encontrado" /></label>}
            </div>
            {mode === 'individual' && <div className="individual-counter">
              <label className="field"><span>Digite o número do animal</span><div className="inline-input"><input value={typedNumber} onChange={(e) => setTypedNumber(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNumber() } }} placeholder="Número do brinco" /><button type="button" className="button button-secondary" onClick={addNumber}><Plus size={17} /> Adicionar</button></div></label>
              <div className="counter-total"><strong>{numbers.length}</strong><span>animais contados</span></div>
              <div className="number-chips">{numbers.map((number) => <button type="button" title="Clique para remover" onClick={() => setNumbers((current) => current.filter((item) => item !== number))} key={number}>{number} ×</button>)}</div>
              {missing.length > 0 && <p>{missing.length}</p>}
              <small>{numbers.filter((number) => !animals.some((animal) => animal.number === number)).length > 0 ? 'Existem números que ainda não possuem cadastro no sistema.' : 'Todos os números digitados foram reconhecidos.'}</small>
            </div>}
            <label className="field"><span>Observações</span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></label>
            <div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setShowForm(false)}>Cancelar</button><button className="button button-primary" disabled={saving || !title.trim()}><Check size={18} /> {saving ? 'Salvando' : 'Finalizar contagem'}</button></div>
          </form>
        </div>
      )}
    </>
  )
}
