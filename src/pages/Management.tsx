import { CalendarDays, FileDown, Filter, Plus, Search, Syringe, Trash2, Upload } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { useAppData } from '../AppContext'
import { useAuth } from '../AuthContext'
import { useResponsibleName } from '../hooks/useResponsibleName'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { ReviewedRow, SheetImportModal } from '../components/SheetImportModal'
import type { ManagementParticipant, ManagementProduct, ManagementType } from '../types'
import { exportManagementSheetPdf } from '../utils/exporters'
import { formatDate, managementTypeLabel } from '../utils/format'

export function Management() {
  const { animals, managementEvents, upsertManagementEvent, deleteManagementEvent, loading } = useAppData()
  const { isAdmin } = useAuth()
  const responsibleName = useResponsibleName(isAdmin)
  const [query, setQuery] = useState('')
  const [lot, setLot] = useState('todos')
  const [importing, setImporting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [pendingParticipants, setPendingParticipants] = useState<ManagementParticipant[] | null>(null)

  const lots = useMemo(() => Array.from(new Set(animals.map((a) => a.lot).filter(Boolean))) as string[], [animals])

  const selection = useMemo(() => {
    const q = query.trim().toLowerCase()
    return animals
      .filter((animal) => animal.status !== 'morto' && animal.status !== 'vendido')
      .filter((animal) => (lot === 'todos' ? true : animal.lot === lot))
      .filter((animal) => !q || [animal.number, animal.breed, animal.lot].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .sort((a, b) => a.number.localeCompare(b.number, 'pt-BR', { numeric: true }))
  }, [animals, query, lot])

  function handleImport(reviewed: ReviewedRow[]) {
    // Só entra quem foi marcado como "Feito" na folha.
    const participants: ManagementParticipant[] = reviewed
      .filter((row) => row.animal && row.marcado)
      .map((row) => ({
        animal_id: row.animal!.id,
        number: row.animal!.number,
        present: true,
        done: true,
        weight: row.valor ? Number(row.valor.replace(',', '.')) || null : null,
        note: row.observacao || null
      }))
    setPendingParticipants(participants)
    setImporting(false)
    setShowForm(true)
  }

  if (loading) return <Loading />

  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">Rotinas do rebanho</span><h1>Manejos</h1><p>Registre vacinações, vermifugações, pesagens e demais manejos.</p></div>
        <button className="button button-primary" onClick={() => { setPendingParticipants(null); setShowForm(true) }}><Plus size={18} /> Novo manejo</button>
      </div>

      <section className="panel report-filter-panel">
        <div className="panel-head"><div><span className="eyebrow">Folha de campo</span><h2>Preparar folha para o curral</h2></div><strong className="selection-count">{selection.length} animais</strong></div>
        <p className="panel-note">Imprima a folha com os números já preenchidos, marque à caneta no curral e depois importe a foto para registrar automaticamente.</p>
        <div className="filters-panel embedded">
          <label className="search-box"><Search size={20} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar por número, raça ou lote" /></label>
          <label className="select-box"><Filter size={18} /><select value={lot} onChange={(e) => setLot(e.target.value)}>
            <option value="todos">Todos os lotes</option>
            {lots.map((item) => <option key={item} value={item}>{item}</option>)}
          </select></label>
        </div>
        <div className="report-actions">
          <button className="button button-secondary" onClick={() => void exportManagementSheetPdf(selection)} disabled={!selection.length}><FileDown size={18} /> Exportar folha de manejo</button>
          <button className="button button-light" onClick={() => setImporting(true)} disabled={!selection.length}><Upload size={18} /> Importar folha preenchida</button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">Histórico</span><h2>Manejos registrados</h2></div></div>
        {managementEvents.length ? (
          <div className="management-list">
            {managementEvents.map((event) => (
              <article key={event.id}>
                <div className="management-icon"><Syringe /></div>
                <div className="management-main">
                  <strong>{event.title}</strong>
                  <span>{managementTypeLabel[event.type]}{event.lot ? ` · ${event.lot}` : ''}</span>
                  {event.products.length > 0 && <small className="management-products">{event.products.map((p) => p.dose ? `${p.name} (${p.dose})` : p.name).join(', ')}</small>}
                  <small><CalendarDays size={13} /> {formatDate(event.date)}</small>
                  {isAdmin && <span className="responsible-line">Responsável: {responsibleName(event.created_by)}</span>}
                </div>
                <div className="management-count"><strong>{event.animal_count}</strong><span>cabeças</span>{event.participants.length > 0 && <small>{event.participants.length} detalhadas</small>}</div>
                {isAdmin && <button className="icon-button" title="Excluir manejo" onClick={() => { if (window.confirm('Excluir este manejo?')) void deleteManagementEvent(event.id) }}><Trash2 size={17} /></button>}
              </article>
            ))}
          </div>
        ) : <EmptyState icon={Syringe} title="Nenhum manejo registrado" text="Os manejos realizados no rebanho aparecerão aqui." />}
      </section>

      {showForm && (
        <ManagementForm
          participants={pendingParticipants}
          defaultLot={lot !== 'todos' ? lot : ''}
          onClose={() => { setShowForm(false); setPendingParticipants(null) }}
          onSave={async (data) => {
            await upsertManagementEvent(data)
            setShowForm(false)
            setPendingParticipants(null)
          }}
        />
      )}

      {importing && (
        <SheetImportModal kind="manejo" animals={selection} onConfirm={handleImport} onClose={() => setImporting(false)} />
      )}
    </>
  )
}

interface ManagementFormProps {
  participants: ManagementParticipant[] | null
  defaultLot: string
  onClose: () => void
  onSave: (data: {
    date: string
    type: ManagementType
    title: string
    products: ManagementProduct[]
    lot: string | null
    animal_count: number
    participants: ManagementParticipant[]
    notes: string | null
  }) => Promise<void>
}

function ManagementForm({ participants, defaultLot, onClose, onSave }: ManagementFormProps) {
  const detailed = Boolean(participants && participants.length)
  const today = new Date().toISOString().slice(0, 10)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ManagementType>('vacinacao')
  const [date, setDate] = useState(today)
  const [lot, setLot] = useState(defaultLot)
  const [products, setProducts] = useState<ManagementProduct[]>([{ name: '', dose: '' }])
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  function updateProduct(index: number, patch: Partial<ManagementProduct>) {
    setProducts((current) => current.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    const cleanProducts = products.map((p) => ({ name: p.name.trim(), dose: (p.dose ?? '').trim() || null })).filter((p) => p.name)
    const count = detailed ? participants!.length : Number(quantity) || 0
    setSaving(true)
    try {
      await onSave({
        date,
        type,
        title: title.trim(),
        products: cleanProducts,
        lot: lot.trim() || null,
        animal_count: count,
        participants: detailed ? participants! : [],
        notes: notes.trim() || null
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal modal-wide" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><div><span className="eyebrow">{detailed ? 'Manejo detalhado (da folha)' : 'Novo manejo'}</span><h2>Registrar manejo</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div>
        <label className="field required"><span>Nome do manejo</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Exemplo: Vacinação contra aftosa" autoFocus /></label>
        <div className="form-grid">
          <label className="field"><span>Tipo</span><select value={type} onChange={(e) => setType(e.target.value as ManagementType)}>{(Object.keys(managementTypeLabel) as ManagementType[]).map((key) => <option key={key} value={key}>{managementTypeLabel[key]}</option>)}</select></label>
          <label className="field"><span>Data</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field"><span>Lote ou local</span><input value={lot} onChange={(e) => setLot(e.target.value)} placeholder="Opcional" /></label>
          {detailed
            ? <label className="field"><span>Cabeças</span><input value={`${participants!.length} (da folha)`} disabled /></label>
            : <label className="field"><span>Quantidade de cabeças</span><input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Total manejado" /></label>}
        </div>

        <div className="products-editor">
          <span className="field-label">Produtos utilizados</span>
          {products.map((product, index) => (
            <div className="product-row" key={index}>
              <input value={product.name} onChange={(e) => updateProduct(index, { name: e.target.value })} placeholder="Produto" />
              <input value={product.dose ?? ''} onChange={(e) => updateProduct(index, { dose: e.target.value })} placeholder="Dose" />
              {products.length > 1 && <button type="button" className="icon-button" onClick={() => setProducts((c) => c.filter((_, i) => i !== index))}>×</button>}
            </div>
          ))}
          <button type="button" className="text-button" onClick={() => setProducts((c) => [...c, { name: '', dose: '' }])}><Plus size={16} /> Adicionar produto</button>
        </div>

        {detailed && (
          <div className="participants-preview">
            {participants!.map((p) => <span key={p.animal_id} className="participant-chip">{p.number}{p.weight != null ? ` · ${p.weight}kg` : ''}</span>)}
          </div>
        )}

        <label className="field"><span>Observações</span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></label>
        <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving || !title.trim()}>{saving ? 'Salvando' : 'Salvar manejo'}</button></div>
      </form>
    </div>
  )
}
