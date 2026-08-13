import { AlertOctagon, Baby, FileDown, Filter, HeartHandshake, Plus, Search, Upload } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { useAuth } from '../AuthContext'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { ReviewedRow, SheetImportModal } from '../components/SheetImportModal'
import type { Animal, ConfirmationResult } from '../types'
import { DEFAULT_MAX_ATTEMPTS, summarizeMatriz } from '../utils/breeding'
import { exportBreedingSheetPdf } from '../utils/exporters'
import { confirmationLabel } from '../utils/format'

/** Aceita 10/03/2025, 10-03-2025 ou 2025-03-10 e devolve no formato do banco. */
function parseLooseDate(value: string): string | null {
  const raw = value.trim()
  if (!raw) return null
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return raw
  const br = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (br) {
    const [, d, m, y] = br
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

export function Reproduction() {
  const { animals, breedingAttempts, upsertBreedingAttempt, upsertAnimal, loading } = useAppData()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'todas' | 'pendentes' | 'prenhas' | 'descarte'>('todas')
  const [maxAttempts, setMaxAttempts] = useState(DEFAULT_MAX_ATTEMPTS)
  const [importing, setImporting] = useState(false)
  const [formAnimal, setFormAnimal] = useState<Animal | null>(null)

  const attemptsByAnimal = useMemo(() => {
    const map = new Map<string, typeof breedingAttempts>()
    for (const attempt of breedingAttempts) {
      const list = map.get(attempt.animal_id) ?? []
      list.push(attempt)
      map.set(attempt.animal_id, list)
    }
    return map
  }, [breedingAttempts])

  const matrizes = useMemo(
    () => animals.filter((animal) => animal.sex === 'femea' && animal.status !== 'morto' && animal.status !== 'vendido'),
    [animals]
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return matrizes
      .map((animal) => ({ animal, status: summarizeMatriz(attemptsByAnimal.get(animal.id) ?? [], maxAttempts) }))
      .filter(({ animal, status }) => {
        const matchesQuery = !q || [animal.number, animal.breed, animal.lot].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
        const matchesFilter =
          filter === 'todas'
          || (filter === 'pendentes' && (status.pending || (!status.pregnant && !status.shouldCull && status.attempts.length > 0)))
          || (filter === 'prenhas' && status.pregnant)
          || (filter === 'descarte' && status.shouldCull)
        return matchesQuery && matchesFilter
      })
      .sort((a, b) => a.animal.number.localeCompare(b.animal.number, 'pt-BR', { numeric: true }))
  }, [matrizes, attemptsByAnimal, query, filter, maxAttempts])

  const selection = useMemo(() => rows.map((row) => row.animal), [rows])

  async function handleImport(reviewed: ReviewedRow[]) {
    for (const row of reviewed) {
      if (!row.animal) continue
      const existing = attemptsByAnimal.get(row.animal.id) ?? []
      const next = summarizeMatriz(existing, maxAttempts).nextAttemptNumber
      const result: ConfirmationResult = row.marcado ? 'prenha' : 'vazia'
      await upsertBreedingAttempt({
        animal_id: row.animal.id,
        animal_number: row.animal.number,
        attempt_number: next,
        protocol_date: parseLooseDate(row.valor) ?? new Date().toISOString().slice(0, 10),
        result,
        confirmation_date: new Date().toISOString().slice(0, 10),
        notes: row.observacao || null
      })
    }
  }

  async function markForCull(animal: Animal) {
    if (!window.confirm(`Marcar a matriz ${animal.number} para descarte (abate)?`)) return
    await upsertAnimal({ ...animal, status: 'descarte' })
  }

  if (loading) return <Loading />

  const pregnantCount = rows.filter((row) => row.status.pregnant).length
  const cullCount = matrizes.filter((animal) => summarizeMatriz(attemptsByAnimal.get(animal.id) ?? [], maxAttempts).shouldCull).length

  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">Estação de monta e protocolos</span><h1>Reprodução</h1><p>Acompanhe os protocolos das matrizes e o diagnóstico de gestação.</p></div>
        <div className="heading-actions">
          <button className="button button-secondary" onClick={() => void exportBreedingSheetPdf(selection)} disabled={!selection.length}><FileDown size={18} /> Folha de protocolo</button>
          <button className="button button-secondary" onClick={() => setImporting(true)} disabled={!selection.length}><Upload size={18} /> Importar folha</button>
          <button className="button button-primary" onClick={() => setFormAnimal(matrizes[0] ?? null)} disabled={!matrizes.length}><Plus size={18} /> Registrar tentativa</button>
        </div>
      </div>

      <section className="occurrence-summary">
        <article><HeartHandshake /><div><strong>{matrizes.length}</strong><span>matrizes acompanhadas</span></div></article>
        <article><Baby /><div><strong>{pregnantCount}</strong><span>confirmadas prenhas</span></div></article>
        <article><AlertOctagon /><div><strong>{cullCount}</strong><span>sinalizadas para descarte</span></div></article>
      </section>

      <div className="filters-panel triple">
        <label className="search-box"><Search size={20} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Número, raça ou lote" /></label>
        <label className="select-box"><Filter size={18} /><select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="todas">Todas as matrizes</option>
          <option value="pendentes">Em protocolo / aguardando</option>
          <option value="prenhas">Prenhas</option>
          <option value="descarte">Para descarte</option>
        </select></label>
        <label className="select-box"><span className="select-inline-label">Descarte após</span><select value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value))}>
          <option value={2}>2 tentativas</option>
          <option value={3}>3 tentativas</option>
          <option value={4}>4 tentativas</option>
        </select></label>
      </div>

      {rows.length ? (
        <div className="breeding-list">
          {rows.map(({ animal, status }) => (
            <article key={animal.id} className={`breeding-row ${status.shouldCull ? 'is-cull' : ''}`}>
              <button className="animal-number-mini" onClick={() => navigate(`/animais/${animal.id}`)}>{animal.number}</button>
              <div className="breeding-main">
                <strong>Matriz {animal.number}</strong>
                <span>{animal.breed || 'Raça não informada'}{animal.lot ? ` · ${animal.lot}` : ''}</span>
                <div className="attempt-dots">
                  {Array.from({ length: Math.max(maxAttempts, status.attempts.length) }, (_, i) => {
                    const attempt = status.attempts.find((a) => a.attempt_number === i + 1)
                    const cls = attempt ? `dot-${attempt.result}` : 'dot-empty'
                    return <span key={i} className={`attempt-dot ${cls}`} title={attempt ? `Tentativa ${i + 1}: ${confirmationLabel[attempt.result]}` : `Tentativa ${i + 1}`}>{i + 1}</span>
                  })}
                </div>
              </div>
              <div className="breeding-status">
                {status.pregnant && <span className="status status-normal">Prenha</span>}
                {!status.pregnant && status.pending && <span className="status status-observacao">Aguardando diagnóstico</span>}
                {status.shouldCull && <span className="status status-descarte">Para descarte</span>}
                {!status.pregnant && !status.pending && !status.shouldCull && status.attempts.length > 0 && <span className="status status-doente">{status.emptyCount} vazia(s)</span>}
                {status.attempts.length === 0 && <span className="muted">Sem tentativas</span>}
              </div>
              <div className="breeding-actions">
                <button className="button button-secondary" onClick={() => setFormAnimal(animal)}>Nova tentativa</button>
                {status.shouldCull && isAdmin && animal.status !== 'descarte' && (
                  <button className="button button-ghost danger" onClick={() => void markForCull(animal)}><AlertOctagon size={16} /> Marcar descarte</button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={HeartHandshake} title="Nenhuma matriz encontrada" text="Cadastre fêmeas ou ajuste o filtro para acompanhar a reprodução." />
      )}

      {formAnimal && (
        <AttemptForm
          animal={formAnimal}
          animals={matrizes}
          nextNumber={summarizeMatriz(attemptsByAnimal.get(formAnimal.id) ?? [], maxAttempts).nextAttemptNumber}
          onPickAnimal={(a) => setFormAnimal(a)}
          onClose={() => setFormAnimal(null)}
          onSave={async (data) => {
            await upsertBreedingAttempt(data)
            setFormAnimal(null)
          }}
        />
      )}

      {importing && (
        <SheetImportModal
          kind="reproducao"
          animals={selection}
          onConfirm={handleImport}
          onClose={() => setImporting(false)}
        />
      )}
    </>
  )
}

interface AttemptFormProps {
  animal: Animal
  animals: Animal[]
  nextNumber: number
  onPickAnimal: (animal: Animal) => void
  onClose: () => void
  onSave: (data: {
    animal_id: string
    animal_number: string
    attempt_number: number
    protocol_date: string
    protocol_type: string | null
    semen: string | null
    result: ConfirmationResult
    confirmation_date: string | null
    notes: string | null
  }) => Promise<void>
}

function AttemptForm({ animal, animals, nextNumber, onPickAnimal, onClose, onSave }: AttemptFormProps) {
  const today = new Date().toISOString().slice(0, 10)
  const [protocolDate, setProtocolDate] = useState(today)
  const [protocolType, setProtocolType] = useState('IATF')
  const [semen, setSemen] = useState('')
  const [result, setResult] = useState<ConfirmationResult>('pendente')
  const [confirmationDate, setConfirmationDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await onSave({
        animal_id: animal.id,
        animal_number: animal.number,
        attempt_number: nextNumber,
        protocol_date: protocolDate,
        protocol_type: protocolType.trim() || null,
        semen: semen.trim() || null,
        result,
        confirmation_date: result === 'pendente' ? null : (confirmationDate || today),
        notes: notes.trim() || null
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal modal-wide" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><div><span className="eyebrow">Tentativa {nextNumber}</span><h2>Registrar protocolo</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div>
        <label className="field"><span>Matriz</span><select value={animal.id} onChange={(e) => onPickAnimal(animals.find((a) => a.id === e.target.value) ?? animal)}>{animals.map((a) => <option key={a.id} value={a.id}>{a.number}{a.breed ? ` — ${a.breed}` : ''}</option>)}</select></label>
        <div className="form-grid">
          <label className="field required"><span>Data do protocolo</span><input type="date" value={protocolDate} onChange={(e) => setProtocolDate(e.target.value)} /></label>
          <label className="field"><span>Tipo de protocolo</span><input value={protocolType} onChange={(e) => setProtocolType(e.target.value)} placeholder="Exemplo: IATF" /></label>
          <label className="field"><span>Sêmen ou touro</span><input value={semen} onChange={(e) => setSemen(e.target.value)} placeholder="Opcional" /></label>
          <label className="field"><span>Diagnóstico de gestação</span><select value={result} onChange={(e) => setResult(e.target.value as ConfirmationResult)}><option value="pendente">Aguardando</option><option value="prenha">Prenha</option><option value="vazia">Vazia</option></select></label>
          {result !== 'pendente' && <label className="field"><span>Data do diagnóstico</span><input type="date" value={confirmationDate} onChange={(e) => setConfirmationDate(e.target.value)} /></label>}
        </div>
        <label className="field"><span>Observações</span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></label>
        <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? 'Salvando' : 'Salvar tentativa'}</button></div>
      </form>
    </div>
  )
}
