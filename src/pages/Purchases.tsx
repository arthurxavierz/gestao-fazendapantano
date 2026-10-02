import { ArrowLeft, Edit3, FileText, Plus, ShoppingCart, Trash2, Truck, Users } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { useAuth } from '../AuthContext'
import { AnimalCard } from '../components/AnimalCard'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { Alert, Field, Kpi, Modal, PageHeading, PanelHead } from '../components/ui'
import { byNumber, isActive } from '../domain/herd'
import type { PurchaseBatch } from '../types'
import { daysBetween, formatArroba, formatCurrency, formatDate, todayISO } from '../utils/format'

function batchStats(batch: PurchaseBatch, animals: ReturnType<typeof useAppData>['animals']) {
  const members = animals.filter((item) => item.purchase_batch_id === batch.id)
  const active = members.filter(isActive)
  const weights = active.map((item) => Number(item.weight)).filter((value) => value > 0)
  const currentAvg = weights.length ? weights.reduce((s, v) => s + v, 0) / weights.length : null
  const perHead = batch.total_value && (batch.quantity || members.length) ? batch.total_value / (batch.quantity || members.length) : null
  const gain = currentAvg != null && batch.avg_weight ? currentAvg - Number(batch.avg_weight) : null
  const days = daysBetween(batch.purchase_date, todayISO())
  return { members, active, currentAvg, perHead, gain, days }
}

export function Purchases() {
  const { batches, animals, loading } = useAppData()
  const [editing, setEditing] = useState<PurchaseBatch | 'new' | null>(null)

  if (loading) return <Loading />

  const sorted = [...batches].sort((a, b) => b.purchase_date.localeCompare(a.purchase_date))
  const totalInvested = batches.reduce((sum, item) => sum + (Number(item.total_value) || 0), 0)
  const purchasedAnimals = animals.filter((item) => item.purchase_batch_id)

  return (
    <>
      <PageHeading
        eyebrow="Entradas no rebanho"
        title="Compras e lotes"
        text="Cada animal comprado fica ligado ao lote em que chegou: fornecedor, GTA, data de entrada e valor pago."
        actions={<button className="button button-primary" onClick={() => setEditing('new')}><Plus size={18} /> Nova compra</button>}
      />

      <section className="kpi-grid">
        <Kpi label="Compras registradas" value={batches.length} icon={ShoppingCart} tone="blue" />
        <Kpi label="Animais comprados" value={purchasedAnimals.length} hint={`${purchasedAnimals.filter(isActive).length} ainda no rebanho`} icon={Users} tone="emerald" />
        <Kpi label="Valor investido" value={formatCurrency(totalInvested)} icon={FileText} tone="violet" />
        <Kpi label="Nascidos na fazenda" value={animals.filter((item) => item.origin_type === 'nascido' || item.mother_id).length} hint="com mãe vinculada ou origem própria" icon={Truck} tone="teal" />
      </section>

      <section className="batch-grid">
        {sorted.map((batch) => {
          const stats = batchStats(batch, animals)
          return (
            <Link key={batch.id} to={`/compras/${batch.id}`} className="batch-card">
              <header>
                <span className="batch-code">{batch.code}</span>
                <span className="batch-date">{formatDate(batch.purchase_date)}</span>
              </header>
              <h3>{batch.supplier || 'Fornecedor não informado'}</h3>
              <dl>
                <div><dt>Cabeças</dt><dd>{stats.members.length}{batch.quantity ? ` / ${batch.quantity}` : ''}</dd></div>
                <div><dt>Por cabeça</dt><dd>{formatCurrency(stats.perHead)}</dd></div>
                <div><dt>Peso na compra</dt><dd>{batch.avg_weight ? `${Number(batch.avg_weight)} kg` : '—'}</dd></div>
                <div><dt>Peso hoje</dt><dd>{stats.currentAvg ? `${Math.round(stats.currentAvg)} kg` : '—'}</dd></div>
              </dl>
              {stats.gain != null && <span className={`batch-gain ${stats.gain < 0 ? 'is-neg' : ''}`}>{stats.gain >= 0 ? '+' : ''}{Math.round(stats.gain)} kg em {stats.days} dias</span>}
              {batch.quantity != null && stats.members.length < batch.quantity && (
                <span className="batch-warning">{batch.quantity - stats.members.length} animais ainda sem cadastro</span>
              )}
            </Link>
          )
        })}
        {!sorted.length && <EmptyState icon={ShoppingCart} title="Nenhuma compra registrada" text="Registre a compra e cadastre os animais de uma vez pela faixa de brincos." />}
      </section>

      {editing && <BatchModal batch={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

export function PurchaseDetail() {
  const { id } = useParams()
  const { batches, animals, loading, deleteBatch } = useAppData()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const batch = batches.find((item) => item.id === id)
  const stats = useMemo(() => (batch ? batchStats(batch, animals) : null), [batch, animals])

  if (loading) return <Loading />
  if (!batch || !stats) return <EmptyState icon={ShoppingCart} title="Compra não encontrada" text="Ela pode ter sido removida." />

  async function remove() {
    if (!batch) return
    if (!window.confirm(`Excluir a compra ${batch.code}? Os animais continuam cadastrados, apenas perdem o vínculo com o lote.`)) return
    await deleteBatch(batch.id)
    navigate('/compras')
  }

  return (
    <>
      <button className="back-button" onClick={() => navigate('/compras')}><ArrowLeft size={18} /> Compras</button>
      <PageHeading
        eyebrow={`Compra ${batch.code}`}
        title={batch.supplier || 'Fornecedor não informado'}
        text={`Entrada em ${formatDate(batch.purchase_date)}${batch.gta ? ` · GTA ${batch.gta}` : ''}`}
        actions={<>
          <button className="button button-secondary" onClick={() => setEditing(true)}><Edit3 size={17} /> Editar</button>
          <button className="button button-primary" onClick={() => navigate(`/animais/lote?compra=${batch.id}`)}><Plus size={17} /> Cadastrar animais</button>
        </>}
      />

      <section className="kpi-grid">
        <Kpi label="Cabeças cadastradas" value={`${stats.members.length}${batch.quantity ? ` / ${batch.quantity}` : ''}`} hint={`${stats.active.length} ativas`} icon={Users} tone="blue" />
        <Kpi label="Valor total" value={formatCurrency(batch.total_value)} hint={stats.perHead ? `${formatCurrency(stats.perHead)} por cabeça` : undefined} icon={FileText} tone="violet" />
        <Kpi label="Peso na compra" value={batch.avg_weight ? `${Number(batch.avg_weight)} kg` : '—'} hint={batch.avg_weight ? formatArroba(Number(batch.avg_weight)) : undefined} icon={Truck} tone="slate" />
        <Kpi label="Peso médio hoje" value={stats.currentAvg ? `${Math.round(stats.currentAvg)} kg` : '—'} hint={stats.gain != null ? `${stats.gain >= 0 ? '+' : ''}${Math.round(stats.gain)} kg em ${stats.days} dias` : undefined} icon={ShoppingCart} tone="emerald" />
      </section>

      {batch.notes && <div className="panel note-panel"><strong>Observações</strong><p>{batch.notes}</p></div>}

      <section className="panel">
        <PanelHead eyebrow="Animais deste lote" title={`${stats.members.length} animais`} />
        {stats.members.length ? (
          <div className="animal-list">{[...stats.members].sort(byNumber).map((animal) => <AnimalCard key={animal.id} animal={animal} />)}</div>
        ) : (
          <EmptyState icon={Users} title="Nenhum animal vinculado" text="Cadastre os animais desta compra pela faixa de brincos." action={<button className="button button-primary" onClick={() => navigate(`/animais/lote?compra=${batch.id}`)}><Plus size={17} /> Cadastrar animais</button>} />
        )}
      </section>

      {isAdmin && <div className="danger-zone"><button className="text-button danger" onClick={() => void remove()}><Trash2 size={17} /> Excluir esta compra</button></div>}
      {editing && <BatchModal batch={batch} onClose={() => setEditing(false)} />}
    </>
  )
}

export function BatchModal({ batch, onClose, onSaved }: { batch?: PurchaseBatch; onClose: () => void; onSaved?: (batch: PurchaseBatch) => void }) {
  const { batches, saveBatch } = useAppData()
  const navigate = useNavigate()
  const year = new Date().getFullYear()
  const suggestion = `C-${year}-${String(batches.filter((item) => item.code.startsWith(`C-${year}`)).length + 1).padStart(2, '0')}`
  const [form, setForm] = useState({
    code: batch?.code ?? suggestion,
    supplier: batch?.supplier ?? '',
    purchase_date: batch?.purchase_date ?? todayISO(),
    quantity: batch?.quantity?.toString() ?? '',
    total_value: batch?.total_value?.toString() ?? '',
    avg_weight: batch?.avg_weight?.toString() ?? '',
    gta: batch?.gta ?? '',
    notes: batch?.notes ?? ''
  })
  const [registerNow, setRegisterNow] = useState(!batch && !onSaved)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const num = (value: string) => (value.trim() ? Number(value.replace(/\./g, '').replace(',', '.')) : null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!form.code.trim() || !form.purchase_date) return
    setSaving(true)
    setError(null)
    try {
      const saved = await saveBatch({
        ...(batch ?? {}),
        code: form.code.trim(),
        supplier: form.supplier.trim() || null,
        purchase_date: form.purchase_date,
        quantity: num(form.quantity),
        total_value: num(form.total_value),
        avg_weight: form.avg_weight.trim() ? Number(form.avg_weight.replace(',', '.')) : null,
        gta: form.gta.trim() || null,
        notes: form.notes.trim() || null
      })
      onSaved?.(saved)
      onClose()
      if (registerNow && saved?.id) navigate(`/animais/lote?compra=${saved.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a compra.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={batch ? `Editar ${batch.code}` : 'Nova compra'}
      eyebrow="Lote de compra"
      onClose={onClose}
      onSubmit={submit}
      footer={<>
        <button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button>
        <button className="button button-primary" disabled={saving}>{saving ? 'Salvando' : 'Salvar compra'}</button>
      </>}
    >
      <div className="form-grid two">
        <Field label="Código do lote" required><input value={form.code} onChange={(e) => set('code', e.target.value)} /></Field>
        <Field label="Data de entrada" required><input type="date" value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} /></Field>
        <Field label="Fornecedor"><input value={form.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="Fazenda, leilão ou pessoa" /></Field>
        <Field label="Número da GTA"><input value={form.gta} onChange={(e) => set('gta', e.target.value)} /></Field>
        <Field label="Quantidade de cabeças"><input inputMode="numeric" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} /></Field>
        <Field label="Valor total (R$)"><input inputMode="decimal" value={form.total_value} onChange={(e) => set('total_value', e.target.value)} placeholder="Ex.: 39600" /></Field>
        <Field label="Peso médio na chegada (kg)"><input inputMode="decimal" value={form.avg_weight} onChange={(e) => set('avg_weight', e.target.value)} /></Field>
      </div>
      <Field label="Observações"><textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      {!batch && !onSaved && (
        <label className="switch-row">
          <input type="checkbox" checked={registerNow} onChange={(e) => setRegisterNow(e.target.checked)} />
          <span>Cadastrar os animais desta compra em seguida</span>
        </label>
      )}
      {error && <Alert>{error}</Alert>}
    </Modal>
  )
}
