import { ArrowLeft, Camera, Edit3, FileDown, Maximize2, Printer, Scale, Stethoscope, Trash2 } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { EmptyState } from '../components/EmptyState'
import { PhotoViewer } from '../components/PhotoViewer'
import { StatusBadge } from '../components/StatusBadge'
import type { OccurrenceType } from '../types'
import { exportAnimalPdf, exportAnimalWord, printAnimal } from '../utils/exporters'
import { formatCoat, formatDate, formatDateTime, formatWeight, occurrenceLabel, sexLabel } from '../utils/format'

export function AnimalDetail() {
  const { id } = useParams()
  const { animals, occurrences, addOccurrence, deleteAnimal } = useAppData()
  const navigate = useNavigate()
  const animal = animals.find((item) => item.id === id)
  const [showOccurrence, setShowOccurrence] = useState(false)
  const [type, setType] = useState<OccurrenceType>('observacao')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState<'pdf' | 'word' | 'print' | null>(null)
  const [viewingPhoto, setViewingPhoto] = useState(false)

  const animalOccurrences = useMemo(
    () => occurrences.filter((item) => item.animal_id === id),
    [occurrences, id]
  )

  if (!animal) return <EmptyState icon={Stethoscope} title="Animal não encontrado" text="O cadastro pode ter sido removido ou ainda não foi carregado." />

  const submitOccurrence = async (event: FormEvent) => {
    event.preventDefault()
    if (!note.trim()) return
    setSaving(true)
    try {
      await addOccurrence({ animal_id: animal.id, animal_number: animal.number, type, note: note.trim() })
      setNote('')
      setShowOccurrence(false)
    } finally {
      setSaving(false)
    }
  }

  // A foto é baixada e convertida antes de montar o documento, por isso a espera.
  const generate = async (kind: 'pdf' | 'word' | 'print') => {
    if (generating) return
    setGenerating(kind)
    try {
      if (kind === 'pdf') await exportAnimalPdf(animal)
      else if (kind === 'word') await exportAnimalWord(animal)
      else await printAnimal(animal)
    } finally {
      setGenerating(null)
    }
  }

  const confirmDelete = async () => {
    const confirmed = window.confirm(`Deseja realmente excluir o animal ${animal.number}?`)
    if (!confirmed) return
    await deleteAnimal(animal.id)
    navigate('/animais')
  }

  return (
    <>
      <button className="back-button" onClick={() => navigate('/animais')}><ArrowLeft size={18} /> Voltar para animais</button>
      <section className="animal-profile panel">
        {animal.photo_url ? (
          <button type="button" className="animal-profile-photo is-clickable" onClick={() => setViewingPhoto(true)} title="Clique para ver em tela cheia">
            <img src={animal.photo_url} alt={`Animal ${animal.number}`} />
            <span className="photo-preview-hint"><Maximize2 size={16} /></span>
          </button>
        ) : (
          <div className="animal-profile-photo"><Camera size={42} /></div>
        )}
        <div className="animal-profile-main">
          <span className="eyebrow">Ficha individual</span>
          <div className="animal-profile-title"><h1>Animal {animal.number}</h1><StatusBadge status={animal.status} /></div>
          <p>{animal.breed || 'Raça não informada'}{animal.lot ? `, atualmente em ${animal.lot}` : ''}</p>
        </div>
        <div className="animal-profile-actions">
          <button className="button button-primary" onClick={() => setShowOccurrence(true)}><Stethoscope size={18} /> Registrar situação</button>
          <button className="button button-secondary" onClick={() => navigate(`/animais/${animal.id}/editar`)}><Edit3 size={18} /> Editar</button>
        </div>
      </section>

      <div className="detail-grid">
        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Informações</span><h2>Dados do animal</h2></div></div>
          <dl className="detail-list">
            <div><dt>Número</dt><dd>{animal.number}</dd></div>
            <div><dt>Sexo</dt><dd>{sexLabel[animal.sex]}</dd></div>
            <div><dt>Raça</dt><dd>{animal.breed || 'Não informado'}</dd></div>
            <div><dt>Pelagem</dt><dd>{formatCoat(animal.coat) || 'Não informado'}</dd></div>
            <div><dt>Nascimento</dt><dd>{formatDate(animal.birth_date)}{animal.birth_date_approximate ? ' (aproximada)' : ''}</dd></div>
            <div><dt>Peso atual</dt><dd><Scale size={16} /> {formatWeight(animal.weight)}</dd></div>
            <div><dt>Local ou lote</dt><dd>{animal.lot || 'Não informado'}</dd></div>
            <div><dt>Origem</dt><dd>{animal.origin || 'Não informado'}</dd></div>
            <div className="detail-notes"><dt>Observações</dt><dd>{animal.notes || 'Sem observações cadastradas.'}</dd></div>
          </dl>
        </section>

        <section className="panel document-card">
          <div><span className="eyebrow">Papel e arquivo</span><h2>Ficha deste animal</h2><p>Gere um documento pronto para guardar, enviar ou imprimir.</p></div>
          <div className="document-actions">
            <button disabled={Boolean(generating)} onClick={() => void generate('pdf')}><FileDown size={19} /><span><strong>{generating === 'pdf' ? 'Gerando PDF' : 'Baixar em PDF'}</strong><small>Formato fixo para impressão, com a foto</small></span></button>
            <button disabled={Boolean(generating)} onClick={() => void generate('word')}><FileDown size={19} /><span><strong>{generating === 'word' ? 'Gerando Word' : 'Baixar em Word'}</strong><small>Documento que pode ser editado</small></span></button>
            <button disabled={Boolean(generating)} onClick={() => void generate('print')}><Printer size={19} /><span><strong>{generating === 'print' ? 'Preparando' : 'Imprimir agora'}</strong><small>Abre a tela de impressão</small></span></button>
          </div>
        </section>
      </div>

      <section className="panel occurrence-history">
        <div className="panel-head"><div><span className="eyebrow">Acompanhamento</span><h2>Registros deste animal</h2></div><button className="button button-secondary" onClick={() => setShowOccurrence(true)}>Novo registro</button></div>
        {animalOccurrences.length ? (
          <div className="history-list">
            {animalOccurrences.map((item) => (
              <article key={item.id}><div className="history-dot" /><div><strong>{occurrenceLabel[item.type]}</strong><p>{item.note}</p><small>{formatDateTime(item.created_at)}</small></div></article>
            ))}
          </div>
        ) : <p className="muted">Este animal ainda não possui ocorrências registradas.</p>}
      </section>

      <div className="danger-zone"><button className="text-button danger" onClick={confirmDelete}><Trash2 size={17} /> Excluir cadastro do animal</button></div>

      {viewingPhoto && animal.photo_url && (
        <PhotoViewer
          src={animal.photo_url}
          alt={`Foto do animal ${animal.number}`}
          caption={`Animal ${animal.number}`}
          onClose={() => setViewingPhoto(false)}
        />
      )}

      {showOccurrence && (
        <div className="modal-backdrop" onMouseDown={() => setShowOccurrence(false)}>
          <form className="modal" onSubmit={submitOccurrence} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Animal {animal.number}</span><h2>Registrar situação</h2></div><button type="button" className="icon-button" onClick={() => setShowOccurrence(false)}>×</button></div>
            <label className="field"><span>Tipo do registro</span><select value={type} onChange={(e) => setType(e.target.value as OccurrenceType)}><option value="observacao">Em observação</option><option value="doenca">Doente</option><option value="recuperado">Recuperado</option><option value="morte">Morte</option><option value="outro">Outro registro</option></select></label>
            <label className="field"><span>O que aconteceu?</span><textarea rows={5} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Escreva uma observação curta e objetiva." autoFocus /></label>
            <div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setShowOccurrence(false)}>Cancelar</button><button className="button button-primary" disabled={saving || !note.trim()}>{saving ? 'Salvando' : 'Registrar'}</button></div>
          </form>
        </div>
      )}
    </>
  )
}
