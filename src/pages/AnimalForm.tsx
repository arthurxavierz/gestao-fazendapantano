import { ArrowLeft, Baby, Camera, Check, ImagePlus, Maximize2, Plus, Save, ShoppingCart, Sparkles } from 'lucide-react'
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { AiSuggestionPanel } from '../components/AiSuggestionPanel'
import { AnimalSearchSelect } from '../components/AnimalPicker'
import { PhotoViewer } from '../components/PhotoViewer'
import { suggestCategory } from '../domain/herd'
import { analyzeAnimalPhoto, isAiVisionConfigured } from '../services/aiVision'
import { uploadAnimalPhoto } from '../services/repository'
import type { AiPhotoAnalysis, Animal, AnimalCategory, AnimalSex, AnimalStatus, OriginType } from '../types'
import { categoryLabel, exitStatuses, formatCoat, formatDate, originLabel, statusLabel, todayISO } from '../utils/format'
import { BatchModal } from './Purchases'

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
  origin_type: 'nao_informado',
  category: null,
  mother_id: null,
  sire: '',
  purchase_batch_id: null,
  entry_date: '',
  exit_date: '',
  exit_reason: '',
  notes: '',
  photo_url: null
}

/** Campos que a IA pode preencher. Usado para marcar o que veio da leitura automática. */
type AiField = 'number' | 'coat' | 'breed'

export function AnimalForm() {
  const { id } = useParams()
  const { animals, batches, upsertAnimal, addWeighings } = useAppData()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [form, setForm] = useState(() => {
    // Atalhos vindos da ficha da mãe (?mae=) ou de uma compra (?compra=).
    const mother = params.get('mae')
    const batch = params.get('compra')
    if (mother) return { ...emptyForm, origin_type: 'nascido' as OriginType, mother_id: mother }
    if (batch) return { ...emptyForm, origin_type: 'comprado' as OriginType, purchase_batch_id: batch }
    return emptyForm
  })
  const [showBatch, setShowBatch] = useState(false)
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

  const mothers = useMemo(() => animals.filter((item) => item.sex === 'femea' && item.id !== id), [animals, id])
  const suggestedCategory = suggestCategory(form.sex ?? 'nao_informado', form.birth_date)
  const isExit = exitStatuses.includes(form.status as AnimalStatus)

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
      const originType = form.origin_type ?? 'nao_informado'
      const saved = await upsertAnimal({
        ...form,
        id,
        number: form.number,
        photo_url: photoUrl,
        category: form.category || suggestedCategory,
        origin_type: originType,
        // O texto antigo continua preenchido para os documentos e a planilha.
        origin: originType === 'nao_informado' ? form.origin || null : originLabel[originType],
        mother_id: originType === 'nascido' ? form.mother_id || null : null,
        purchase_batch_id: originType === 'comprado' ? form.purchase_batch_id || null : null,
        entry_date: form.entry_date || (originType === 'nascido' ? form.birth_date || null : null),
        exit_date: isExit ? form.exit_date || null : null,
        exit_reason: isExit ? form.exit_reason || null : null,
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
      // No cadastro novo, o peso informado vira a primeira pesagem do animal.
      if (!id && saved.weight) {
        await addWeighings([{ animalId: saved.id, weight: Number(saved.weight) }], saved.entry_date || todayISO(), 'Peso no cadastro')
      }
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
            <label className="field"><span>Categoria</span><select value={form.category ?? ''} onChange={(e) => update('category', (e.target.value || null) as AnimalCategory | null)}>
              <option value="">{suggestedCategory ? `Automática (${categoryLabel[suggestedCategory]})` : 'Automática pela idade'}</option>
              {(Object.keys(categoryLabel) as AnimalCategory[]).map((key) => <option key={key} value={key}>{categoryLabel[key]}</option>)}
            </select></label>
            <label className="field"><span>Situação atual</span><select value={form.status} onChange={(e) => update('status', e.target.value as AnimalStatus)}>
              {(Object.keys(statusLabel) as AnimalStatus[]).map((key) => <option key={key} value={key}>{statusLabel[key]}</option>)}
            </select></label>
            {isExit && (
              <>
                <label className="field"><span>Data da saída</span><input type="date" value={form.exit_date || ''} onChange={(e) => update('exit_date', e.target.value)} /></label>
                <label className="field"><span>Motivo / destino</span><input value={form.exit_reason || ''} onChange={(e) => update('exit_reason', e.target.value)} placeholder="Ex.: vendido para frigorífico X" /></label>
              </>
            )}
          </div>
        </section>

        <section className="panel form-panel">
          <div className="form-section-title"><span>2</span><div><h2>Origem</h2><p>Nascido na fazenda fica ligado à mãe; comprado fica ligado ao lote de compra.</p></div></div>
          <div className="origin-options">
            {(['nascido', 'comprado', 'nao_informado'] as OriginType[]).map((key) => (
              <button type="button" key={key} className={form.origin_type === key ? 'selected' : ''} onClick={() => update('origin_type', key)}>
                {key === 'nascido' ? <Baby size={18} /> : key === 'comprado' ? <ShoppingCart size={18} /> : <Check size={18} />}
                <span>{originLabel[key]}</span>
              </button>
            ))}
          </div>

          {form.origin_type === 'nascido' && (
            <div className="form-grid">
              <div className="field"><span>Mãe</span><AnimalSearchSelect animals={mothers} value={form.mother_id} onChange={(value) => update('mother_id', value)} placeholder="Brinco da mãe" /></div>
              <label className="field"><span>Pai (touro ou sêmen)</span><input value={form.sire || ''} onChange={(e) => update('sire', e.target.value)} placeholder="Ex.: Touro 900 ou sêmen Nelore REM" /></label>
            </div>
          )}

          {form.origin_type === 'comprado' && (
            <div className="form-grid">
              <label className="field"><span>Lote de compra</span>
                <select value={form.purchase_batch_id ?? ''} onChange={(e) => {
                  const batch = batches.find((item) => item.id === e.target.value)
                  update('purchase_batch_id', e.target.value || null)
                  if (batch && !form.entry_date) update('entry_date', batch.purchase_date)
                }}>
                  <option value="">Selecione a compra</option>
                  {[...batches].sort((a, b) => b.purchase_date.localeCompare(a.purchase_date)).map((item) => (
                    <option key={item.id} value={item.id}>{item.code} · {item.supplier || 'sem fornecedor'} · {formatDate(item.purchase_date)}</option>
                  ))}
                </select>
              </label>
              <div className="field"><span>&nbsp;</span><button type="button" className="button button-secondary" onClick={() => setShowBatch(true)}><Plus size={17} /> Nova compra</button></div>
            </div>
          )}

          <div className="form-grid">
            <label className="field"><span>{form.origin_type === 'comprado' ? 'Data de chegada' : 'Data de entrada no rebanho'}</span><input type="date" value={form.entry_date || ''} onChange={(e) => update('entry_date', e.target.value)} /></label>
            {form.origin_type === 'nao_informado' && <label className="field"><span>Origem (texto livre)</span><input value={form.origin || ''} onChange={(e) => update('origin', e.target.value)} placeholder="Ex.: herdado do cadastro antigo" /></label>}
          </div>
        </section>

        <section className="panel form-panel">
          <div className="form-section-title"><span>3</span><div><h2>Informações complementares</h2><p>Preencha apenas o que for útil para a fazenda.</p></div></div>
          <div className="form-grid">
            <label className="field"><span>Data de nascimento</span><input type="date" value={form.birth_date || ''} onChange={(e) => update('birth_date', e.target.value)} /></label>
            <label className="field"><span>Peso atual em kg</span><input type="number" min="0" step="0.1" value={form.weight ?? ''} onChange={(e) => update('weight', e.target.value ? Number(e.target.value) : null)} placeholder="Exemplo: 412" /></label>
            <label className="field"><span>Local ou lote atual</span><input value={form.lot || ''} onChange={(e) => update('lot', e.target.value)} placeholder="Exemplo: Curral 2" list="form-lots" /></label>
            <label className="checkbox-field"><input type="checkbox" checked={Boolean(form.birth_date_approximate)} onChange={(e) => update('birth_date_approximate', e.target.checked)} /><span><Check size={16} /> Data de nascimento aproximada</span></label>
          </div>
          <datalist id="form-lots">{[...new Set(animals.map((item) => item.lot).filter(Boolean) as string[])].map((item) => <option key={item} value={item} />)}</datalist>
          <label className="field"><span>Observações</span><textarea rows={4} value={form.notes || ''} onChange={(e) => update('notes', e.target.value)} placeholder="Anote somente o que precisa ficar registrado." /></label>
        </section>

        {message && <div className="alert alert-error">{message}</div>}
        <div className="form-actions"><button type="button" className="button button-ghost" onClick={() => navigate(-1)}>Cancelar</button><button className="button button-primary" disabled={saving}><Save size={18} /> {saving ? 'Salvando' : 'Salvar animal'}</button></div>
      </form>

      {showBatch && <BatchModal onClose={() => setShowBatch(false)} onSaved={(saved) => saved?.id && update('purchase_batch_id', saved.id)} />}

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
