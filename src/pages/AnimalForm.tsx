import { ArrowLeft, Camera, Check, ImagePlus, Maximize2, Save, Sparkles } from 'lucide-react'
import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { AiSuggestionPanel } from '../components/AiSuggestionPanel'
import { PhotoViewer } from '../components/PhotoViewer'
import { analyzeAnimalPhoto, isAiVisionConfigured } from '../services/aiVision'
import { uploadAnimalPhoto } from '../services/repository'
import type { AiPhotoAnalysis, Animal, AnimalSex, AnimalStatus } from '../types'
import { formatCoat } from '../utils/format'

const emptyForm: Partial<Animal> & Pick<Animal, 'number'> = {
  number: '',
  sex: 'nao_informado',
  status: 'normal',
  birth_date_approximate: false,
  breed: '',
  coat: '',
  birth_date: '',
  weight: null,
  lot: '',
  origin: '',
  notes: '',
  photo_url: null
}

/** Campos que a IA pode preencher. Usado para marcar o que veio da leitura automática. */
type AiField = 'number' | 'coat' | 'breed'

export function AnimalForm() {
  const { id } = useParams()
  const { animals, upsertAnimal } = useAppData()
  const navigate = useNavigate()
  const [form, setForm] = useState(emptyForm)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [analysis, setAnalysis] = useState<AiPhotoAnalysis | null>(null)
  const [analysisModel, setAnalysisModel] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  // Campos atualmente preenchidos pela IA e ainda não revisados manualmente.
  const [aiFields, setAiFields] = useState<AiField[]>([])
  const [viewingPhoto, setViewingPhoto] = useState(false)

  useEffect(() => {
    if (!id) return
    const animal = animals.find((item) => item.id === id)
    if (animal) setForm(animal)
  }, [id, animals])

  function update<K extends keyof Animal>(key: K, value: Animal[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    // Digitar por cima de uma sugestão significa que o usuário assumiu o campo.
    setAiFields((current) => current.filter((field) => field !== key))
  }

  function applySuggestion(key: AiField, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
    setAiFields((current) => (current.includes(key) ? current : [...current, key]))
  }

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    update('photo_url', URL.createObjectURL(file))
    // Foto nova invalida a leitura anterior.
    setAnalysis(null)
    setAiError(null)
    setAiFields([])
  }

  async function analyzePhoto() {
    if (!form.photo_url || analyzing) return
    setAnalyzing(true)
    setAiError(null)
    try {
      const result = await analyzeAnimalPhoto(form.photo_url)
      setAnalysis(result.analysis)
      setAnalysisModel(result.modelo)
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Não foi possível analisar a foto.')
    } finally {
      setAnalyzing(false)
    }
  }

  function applyAll() {
    if (!analysis) return
    if (analysis.numero && analysis.numero_confianca !== 'ilegivel') applySuggestion('number', analysis.numero)
    if (analysis.pelagem) applySuggestion('coat', formatCoat(analysis.pelagem))
    if (analysis.raca_sugerida && analysis.raca_confianca !== 'ilegivel') applySuggestion('breed', analysis.raca_sugerida)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage(null)
    if (!form.number.trim()) {
      setMessage('Informe o número do animal.')
      return
    }
    setSaving(true)
    try {
      let photoUrl = form.photo_url
      if (photoFile) photoUrl = await uploadAnimalPhoto(photoFile, form.number)
      const saved = await upsertAnimal({
        ...form,
        id,
        number: form.number,
        photo_url: photoUrl,
        coat: formatCoat(form.coat) || null,
        weight: form.weight ? Number(form.weight) : null,
        // Guarda o que a IA sugeriu e o que sobreviveu à revisão, para medir o acerto depois.
        ai_analysis: analysis
          ? {
              analisado_em: new Date().toISOString(),
              modelo: analysisModel,
              sugestao: analysis,
              campos_aceitos: aiFields
            }
          : form.ai_analysis ?? null
      })
      navigate(`/animais/${saved.id}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar o animal.')
    } finally {
      setSaving(false)
    }
  }

  const aiBadge = (field: AiField) =>
    aiFields.includes(field) ? <span className="ai-inline-badge"><Sparkles size={12} /> Interpretado pela IA</span> : null

  return (
    <>
      <button className="back-button" onClick={() => navigate(-1)}><ArrowLeft size={18} /> Voltar</button>
      <div className="page-heading compact-heading">
        <div><span className="eyebrow">{id ? 'Atualização de cadastro' : 'Novo cadastro'}</span><h1>{id ? `Editar animal ${form.number}` : 'Cadastrar animal'}</h1><p>O número é o único campo obrigatório.</p></div>
      </div>

      <form className="form-layout" onSubmit={submit}>
        <section className="panel form-panel">
          <div className="form-section-title"><span>1</span><div><h2>Identificação</h2><p>Informações usadas para localizar o animal rapidamente.</p></div></div>
          <div className="photo-field">
            {form.photo_url ? (
              <button type="button" className="photo-preview is-clickable" onClick={() => setViewingPhoto(true)} title="Clique para ver em tela cheia">
                <img src={form.photo_url} alt="Prévia do animal" />
                <span className="photo-preview-hint"><Maximize2 size={16} /></span>
              </button>
            ) : (
              <div className="photo-preview"><Camera size={36} /></div>
            )}
            <div>
              <strong>Foto do animal</strong>
              <p>Use a câmera do celular ou selecione uma imagem da galeria.</p>
              <div className="photo-buttons">
                <label className="button button-secondary file-button"><ImagePlus size={18} /> Escolher foto<input type="file" accept="image/*" onChange={selectPhoto} /></label>
                {isAiVisionConfigured && form.photo_url && (
                  <button type="button" className="button button-secondary" onClick={() => void analyzePhoto()} disabled={analyzing}>
                    <Sparkles size={18} /> {analyzing ? 'Analisando foto' : 'Ler brinco com IA'}
                  </button>
                )}
              </div>
              {isAiVisionConfigured && form.photo_url && !analysis && !analyzing && !aiError && (
                <small className="ai-hint">Enquadre o brinco da orelha para melhorar a leitura.</small>
              )}
            </div>
          </div>

          {aiError && <div className="alert alert-error">{aiError}</div>}

          {analysis && (
            <AiSuggestionPanel
              analysis={analysis}
              onApplyAll={applyAll}
              onDismiss={() => setAnalysis(null)}
              rows={[
                {
                  key: 'numero',
                  label: 'Número do brinco',
                  value: analysis.numero,
                  confidence: analysis.numero_confianca,
                  applied: form.number === analysis.numero && aiFields.includes('number'),
                  onApply: () => applySuggestion('number', analysis.numero)
                },
                {
                  key: 'pelagem',
                  label: 'Pelagem',
                  value: formatCoat(analysis.pelagem),
                  confidence: analysis.pelagem ? 'alta' : 'ilegivel',
                  applied: form.coat === formatCoat(analysis.pelagem) && aiFields.includes('coat'),
                  onApply: () => applySuggestion('coat', formatCoat(analysis.pelagem))
                },
                {
                  key: 'raca',
                  label: 'Raça provável',
                  value: analysis.raca_sugerida,
                  confidence: analysis.raca_confianca,
                  applied: form.breed === analysis.raca_sugerida && aiFields.includes('breed'),
                  onApply: () => applySuggestion('breed', analysis.raca_sugerida)
                }
              ]}
            />
          )}

          <div className="form-grid">
            <label className={`field required ${aiFields.includes('number') ? 'field-ai' : ''}`}>
              <span>Número do animal {aiBadge('number')}</span>
              <input autoFocus value={form.number} onChange={(e) => update('number', e.target.value)} placeholder="Exemplo: 142" />
            </label>
            <label className="field"><span>Sexo</span><select value={form.sex} onChange={(e) => update('sex', e.target.value as AnimalSex)}><option value="nao_informado">Não informado</option><option value="macho">Macho</option><option value="femea">Fêmea</option></select></label>
            <label className={`field ${aiFields.includes('coat') ? 'field-ai' : ''}`}>
              <span>Pelagem {aiBadge('coat')}</span>
              <input value={form.coat || ''} onChange={(e) => update('coat', e.target.value)} placeholder="Exemplo: branco" />
            </label>
            <label className={`field ${aiFields.includes('breed') ? 'field-ai' : ''}`}>
              <span>Raça {aiBadge('breed')}</span>
              <input value={form.breed || ''} onChange={(e) => update('breed', e.target.value)} placeholder="Exemplo: Nelore" />
            </label>
            <label className="field"><span>Situação atual</span><select value={form.status} onChange={(e) => update('status', e.target.value as AnimalStatus)}><option value="normal">Normal</option><option value="observacao">Em observação</option><option value="doente">Doente</option><option value="morto">Morto</option><option value="vendido">Vendido</option></select></label>
          </div>
        </section>

        <section className="panel form-panel">
          <div className="form-section-title"><span>2</span><div><h2>Informações complementares</h2><p>Preencha apenas o que for útil para a fazenda.</p></div></div>
          <div className="form-grid">
            <label className="field"><span>Data de nascimento</span><input type="date" value={form.birth_date || ''} onChange={(e) => update('birth_date', e.target.value)} /></label>
            <label className="field"><span>Peso atual em kg</span><input type="number" min="0" step="0.1" value={form.weight ?? ''} onChange={(e) => update('weight', e.target.value ? Number(e.target.value) : null)} placeholder="Exemplo: 412" /></label>
            <label className="field"><span>Local ou lote atual</span><input value={form.lot || ''} onChange={(e) => update('lot', e.target.value)} placeholder="Exemplo: Curral 2" /></label>
            <label className="field"><span>Origem</span><input value={form.origin || ''} onChange={(e) => update('origin', e.target.value)} placeholder="Nascido na fazenda ou comprado" /></label>
            <label className="checkbox-field"><input type="checkbox" checked={Boolean(form.birth_date_approximate)} onChange={(e) => update('birth_date_approximate', e.target.checked)} /><span><Check size={16} /> Data de nascimento aproximada</span></label>
          </div>
          <label className="field"><span>Observações</span><textarea rows={4} value={form.notes || ''} onChange={(e) => update('notes', e.target.value)} placeholder="Anote somente o que precisa ficar registrado." /></label>
        </section>

        {message && <div className="alert alert-error">{message}</div>}
        <div className="form-actions"><button type="button" className="button button-ghost" onClick={() => navigate(-1)}>Cancelar</button><button className="button button-primary" disabled={saving}><Save size={18} /> {saving ? 'Salvando' : 'Salvar animal'}</button></div>
      </form>

      {viewingPhoto && form.photo_url && (
        <PhotoViewer
          src={form.photo_url}
          alt={`Foto do animal ${form.number || 'sem número'}`}
          caption="Confira o brinco e compare com o que a IA interpretou."
          onClose={() => setViewingPhoto(false)}
        />
      )}
    </>
  )
}
