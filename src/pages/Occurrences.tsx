import { AlertTriangle, CheckCircle2, HeartPulse, Plus, Search } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { useAuth } from '../AuthContext'
import { useResponsibleName } from '../hooks/useResponsibleName'
import { EmptyState } from '../components/EmptyState'
import type { OccurrenceType } from '../types'
import { formatDateTime, occurrenceLabel } from '../utils/format'

export function Occurrences() {
  const { animals, occurrences, addOccurrence } = useAppData()
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
  const [animalSearch, setAnimalSearch] = useState('')
  const [selectedAnimalId, setSelectedAnimalId] = useState('')
  const [type, setType] = useState<OccurrenceType>('observacao')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const filteredAnimals = useMemo(() => {
    const q = animalSearch.trim().toLowerCase()
    if (!q) return animals.slice(0, 12)
    return animals.filter((item) => [item.number, item.breed, item.lot].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))).slice(0, 12)
  }, [animals, animalSearch])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const animal = animals.find((item) => item.id === selectedAnimalId)
    if (!animal || !note.trim()) return
    setSaving(true)
    try {
      await addOccurrence({ animal_id: animal.id, animal_number: animal.number, type, note: note.trim() })
      setNote('')
      setAnimalSearch('')
      setSelectedAnimalId('')
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">Acompanhamento do dia a dia</span><h1>Ocorrências</h1><p>Registre somente o que precisa chamar a atenção do responsável.</p></div>
        <button className="button button-primary" onClick={() => setShowForm(true)}><Plus size={18} /> Registrar ocorrência</button>
      </div>

      <section className="occurrence-summary">
        <article><HeartPulse /><div><strong>{animals.filter((item) => item.status === 'doente').length}</strong><span>animais doentes</span></div></article>
        <article><AlertTriangle /><div><strong>{animals.filter((item) => item.status === 'observacao').length}</strong><span>em observação</span></div></article>
        <article><CheckCircle2 /><div><strong>{occurrences.filter((item) => item.type === 'recuperado').length}</strong><span>recuperações registradas</span></div></article>
      </section>

      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">Histórico recente</span><h2>Registros enviados</h2></div></div>
        {occurrences.length ? <div className="occurrence-table">
          {occurrences.map((item) => (
            <article key={item.id}>
              <div className={`occurrence-symbol occurrence-${item.type}`}><HeartPulse size={19} /></div>
              <div className="occurrence-main"><div><strong>Animal {item.animal_number || 'não identificado'}</strong><span>{occurrenceLabel[item.type]}</span></div><p>{item.note}</p><small>{formatDateTime(item.created_at)}</small>{isAdmin && <span className="responsible-line">Responsavel: {responsibleName(item.created_by)}</span>}</div>
            </article>
          ))}
        </div> : <EmptyState icon={HeartPulse} title="Nenhuma ocorrência" text="Os registros enviados pela equipe aparecerão aqui." />}
      </section>

      {showForm && (
        <div className="modal-backdrop" onMouseDown={() => setShowForm(false)}>
          <form className="modal modal-wide" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Registro rápido</span><h2>Nova ocorrência</h2></div><button type="button" className="icon-button" onClick={() => setShowForm(false)}>×</button></div>
            <label className="field"><span>Localize o animal</span><div className="search-box bordered"><Search size={19} /><input value={animalSearch} onChange={(e) => setAnimalSearch(e.target.value)} placeholder="Digite o número do animal" /></div></label>
            <div className="animal-picker">
              {filteredAnimals.map((animal) => <button type="button" className={selectedAnimalId === animal.id ? 'selected' : ''} onClick={() => setSelectedAnimalId(animal.id)} key={animal.id}><strong>{animal.number}</strong><span>{animal.breed || 'Raça não informada'}</span></button>)}
            </div>
            <label className="field"><span>Tipo do registro</span><select value={type} onChange={(e) => setType(e.target.value as OccurrenceType)}><option value="observacao">Em observação</option><option value="doenca">Doente</option><option value="recuperado">Recuperado</option><option value="descarte">Descarte (separar para abate)</option><option value="morte">Morte</option><option value="outro">Outro registro</option></select></label>
            <label className="field"><span>Observação</span><textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Exemplo: animal sem comer e afastado do restante." /></label>
            <div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setShowForm(false)}>Cancelar</button><button className="button button-primary" disabled={saving || !selectedAnimalId || !note.trim()}>{saving ? 'Salvando' : 'Registrar ocorrência'}</button></div>
          </form>
        </div>
      )}
    </>
  )
}
