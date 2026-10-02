import { ArrowLeft, Layers, Plus, Save } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { Alert, Field, PageHeading } from '../components/ui'
import { expandNumberRange } from '../domain/herd'
import type { AnimalCategory, AnimalSex } from '../types'
import { categoryLabel, formatDate, todayISO } from '../utils/format'
import { BatchModal } from './Purchases'

/**
 * Cadastro de vários animais de uma vez. O caso típico é a chegada de uma
 * compra: 40 garrotes com brincos 401 a 440, mesma raça, mesmo lote, mesma
 * data de entrada. Digitar um por um seria o motivo para voltar ao Excel.
 */
export function BulkAnimals() {
  const { animals, batches, createAnimalsBulk, addWeighings } = useAppData()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [batchId, setBatchId] = useState(params.get('compra') ?? '')
  const [showBatch, setShowBatch] = useState(false)
  const [range, setRange] = useState('')
  const [sex, setSex] = useState<AnimalSex>('macho')
  const [category, setCategory] = useState<AnimalCategory | ''>('garrote')
  const [breed, setBreed] = useState('Nelore')
  const [birth, setBirth] = useState('')
  const [lot, setLot] = useState('')
  const [entryDate, setEntryDate] = useState(todayISO())
  const [defaultWeight, setDefaultWeight] = useState('')
  const [weights, setWeights] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const batch = batches.find((item) => item.id === batchId)

  useEffect(() => {
    if (batch) {
      setEntryDate(batch.purchase_date)
      if (batch.avg_weight && !defaultWeight) setDefaultWeight(String(batch.avg_weight))
    }
    // Só quando a compra escolhida muda.
  }, [batchId, batch?.purchase_date])

  const numbers = useMemo(() => expandNumberRange(range), [range])
  const taken = useMemo(() => new Set(animals.map((item) => item.number)), [animals])
  const duplicates = numbers.filter((number) => taken.has(number))
  const fresh = numbers.filter((number) => !taken.has(number))
  const lots = useMemo(() => [...new Set(animals.map((item) => item.lot).filter(Boolean) as string[])].sort(), [animals])
  const alreadyInBatch = batch ? animals.filter((item) => item.purchase_batch_id === batch.id).length : 0

  function changeSex(value: AnimalSex) {
    setSex(value)
    if (value === 'femea' && ['garrote', 'boi', 'bezerro', 'touro'].includes(category)) setCategory('novilha')
    if (value === 'macho' && ['novilha', 'vaca', 'bezerra'].includes(category)) setCategory('garrote')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!fresh.length) return
    setSaving(true)
    setError(null)
    try {
      const created = await createAnimalsBulk(fresh.map((number) => {
        const w = weights[number] || defaultWeight
        return {
          number,
          sex,
          category: category || null,
          breed: breed || null,
          birth_date: birth || null,
          birth_date_approximate: Boolean(birth),
          weight: w ? Number(w.replace(',', '.')) : null,
          lot: lot || null,
          origin: batch ? 'Comprado' : null,
          origin_type: batch ? 'comprado' : 'nao_informado',
          purchase_batch_id: batch?.id ?? null,
          entry_date: entryDate || null,
          status: 'normal'
        }
      }))
      // O peso de chegada vira a primeira pesagem: o ganho diário passa a contar desde a entrada.
      const weighed = created.filter((item) => Number(item.weight) > 0)
      if (weighed.length) await addWeighings(weighed.map((item) => ({ animalId: item.id, weight: Number(item.weight) })), entryDate || todayISO(), 'Peso de entrada')
      navigate(batch ? `/compras/${batch.id}` : '/animais')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cadastrar os animais.')
    } finally {
      setSaving(false)
    }
  }

  const femaleCats: AnimalCategory[] = ['bezerra', 'novilha', 'vaca']
  const maleCats: AnimalCategory[] = ['bezerro', 'garrote', 'boi', 'touro']

  return (
    <>
      <button className="back-button" onClick={() => navigate(-1)}><ArrowLeft size={18} /> Voltar</button>
      <PageHeading eyebrow="Cadastro rápido" title="Cadastrar vários animais" text="Informe a faixa de brincos e os dados em comum. Depois é só ajustar o que for diferente." />

      <form className="form-layout" onSubmit={submit}>
        <section className="panel form-panel">
          <div className="form-section-title"><span>1</span><div><h2>Origem</h2><p>Animais comprados ficam vinculados ao lote de compra.</p></div></div>
          <div className="form-grid two">
            <Field label="Lote de compra">
              <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                <option value="">Sem vínculo com compra</option>
                {[...batches].sort((a, b) => b.purchase_date.localeCompare(a.purchase_date)).map((item) => (
                  <option key={item.id} value={item.id}>{item.code} · {item.supplier || 'sem fornecedor'} · {formatDate(item.purchase_date)}</option>
                ))}
              </select>
            </Field>
            <div className="field">
              <span>&nbsp;</span>
              <button type="button" className="button button-secondary" onClick={() => setShowBatch(true)}><Plus size={17} /> Registrar nova compra</button>
            </div>
          </div>
          {batch && (
            <p className="field-hint">
              {batch.quantity ? `Compra de ${batch.quantity} cabeças, ${alreadyInBatch} já cadastradas.` : `${alreadyInBatch} animais já cadastrados nesta compra.`}
            </p>
          )}
        </section>

        <section className="panel form-panel">
          <div className="form-section-title"><span>2</span><div><h2>Brincos</h2><p>Use traço para faixas e vírgula para separar. Zeros à esquerda são mantidos.</p></div></div>
          <Field label="Números dos brincos" required>
            <input value={range} onChange={(e) => setRange(e.target.value)} placeholder="Ex.: 401-440, 445, 450-452" autoFocus />
          </Field>
          {numbers.length > 0 && (
            <div className="range-preview">
              <span><Layers size={16} /> {fresh.length} novo{fresh.length === 1 ? '' : 's'}</span>
              {duplicates.length > 0 && <span className="is-bad">{duplicates.length} já cadastrado{duplicates.length === 1 ? '' : 's'} (serão ignorados): {duplicates.slice(0, 10).join(', ')}{duplicates.length > 10 ? '…' : ''}</span>}
            </div>
          )}
        </section>

        <section className="panel form-panel">
          <div className="form-section-title"><span>3</span><div><h2>Dados em comum</h2><p>Valem para todos os animais da faixa.</p></div></div>
          <div className="form-grid three">
            <Field label="Sexo">
              <select value={sex} onChange={(e) => changeSex(e.target.value as AnimalSex)}>
                <option value="macho">Macho</option>
                <option value="femea">Fêmea</option>
              </select>
            </Field>
            <Field label="Categoria">
              <select value={category} onChange={(e) => setCategory(e.target.value as AnimalCategory)}>
                {(sex === 'femea' ? femaleCats : maleCats).map((item) => <option key={item} value={item}>{categoryLabel[item]}</option>)}
              </select>
            </Field>
            <Field label="Raça"><input value={breed} onChange={(e) => setBreed(e.target.value)} /></Field>
            <Field label="Nascimento aproximado"><input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} /></Field>
            <Field label="Lote / local"><input value={lot} onChange={(e) => setLot(e.target.value)} list="bulk-lots" placeholder="Ex.: Confinamento Baia 3" /></Field>
            <Field label="Data de entrada"><input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></Field>
            <Field label="Peso padrão (kg)" hint="Usado quando o peso individual ficar vazio."><input inputMode="decimal" value={defaultWeight} onChange={(e) => setDefaultWeight(e.target.value)} /></Field>
          </div>
          <datalist id="bulk-lots">{lots.map((item) => <option key={item} value={item} />)}</datalist>
        </section>

        {fresh.length > 0 && fresh.length <= 200 && (
          <section className="panel form-panel">
            <div className="form-section-title"><span>4</span><div><h2>Peso individual</h2><p>Opcional. Se pesou na chegada, informe aqui.</p></div></div>
            <div className="weight-grid">
              {fresh.map((number) => (
                <label key={number} className="weight-cell">
                  <strong>{number}</strong>
                  <input inputMode="decimal" value={weights[number] ?? ''} onChange={(e) => setWeights({ ...weights, [number]: e.target.value })} placeholder={defaultWeight || 'kg'} />
                </label>
              ))}
            </div>
          </section>
        )}

        {error && <Alert>{error}</Alert>}
        <div className="form-actions">
          <button type="button" className="button button-ghost" onClick={() => navigate(-1)}>Cancelar</button>
          <button className="button button-primary" disabled={saving || !fresh.length}><Save size={18} /> {saving ? 'Cadastrando' : `Cadastrar ${fresh.length} ${fresh.length === 1 ? 'animal' : 'animais'}`}</button>
        </div>
      </form>

      {showBatch && <BatchModal onClose={() => setShowBatch(false)} onSaved={(saved) => saved?.id && setBatchId(saved.id)} />}
    </>
  )
}
