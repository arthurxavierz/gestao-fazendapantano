import { Camera, Check, ImagePlus, Sparkles, TriangleAlert } from 'lucide-react'
import { ChangeEvent, useMemo, useState } from 'react'
import { isSheetVisionConfigured, readFieldSheet } from '../services/sheetVision'
import type { AiConfidence, Animal, SheetKind } from '../types'
import { ConfidenceTag } from './AiSuggestionPanel'

export interface ReviewedRow {
  animal: Animal | null
  numero: string
  numeroConfianca: AiConfidence
  marcado: boolean
  marcadoConfianca: AiConfidence
  valor: string
  observacao: string
}

interface Props {
  kind: SheetKind
  animals: Animal[]
  onConfirm: (rows: ReviewedRow[]) => Promise<void> | void
  onClose: () => void
}

const copy: Record<SheetKind, { title: string; primary: string; value: string; hint: string }> = {
  reproducao: {
    title: 'Importar folha de protocolo',
    primary: 'Prenha',
    value: 'Data do protocolo',
    hint: 'A IA lê cada linha: marca de Prenha e a data escrita. Vazio em Prenha vira "vazia".'
  },
  manejo: {
    title: 'Importar folha de manejo',
    primary: 'Feito',
    value: 'Peso (kg)',
    hint: 'A IA lê cada linha: a marca de Feito e o peso escrito à mão.'
  }
}

type Step = 'upload' | 'reading' | 'review'

export function SheetImportModal({ kind, animals, onConfirm, onClose }: Props) {
  const labels = copy[kind]
  const [step, setStep] = useState<Step>('upload')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [rows, setRows] = useState<ReviewedRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const byNumber = useMemo(() => new Map(animals.map((item) => [item.number.trim(), item])), [animals])

  function matchAnimal(numero: string): Animal | null {
    return byNumber.get(numero.trim()) ?? null
  }

  function seedFromSelection() {
    // Sem IA configurada (ou por escolha), a folha é conferida manualmente:
    // uma linha por animal selecionado, tudo em branco para o usuário preencher.
    setRows(
      animals.map((animal) => ({
        animal,
        numero: animal.number,
        numeroConfianca: 'alta' as AiConfidence,
        marcado: false,
        marcadoConfianca: 'alta' as AiConfidence,
        valor: '',
        observacao: ''
      }))
    )
    setStep('review')
  }

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setPhotoUrl(url)
    setError(null)

    if (!isSheetVisionConfigured) {
      seedFromSelection()
      return
    }

    setStep('reading')
    try {
      const result = await readFieldSheet(url, kind, animals.map((item) => item.number))
      const reviewed: ReviewedRow[] = result.linhas.map((line) => ({
        animal: matchAnimal(line.numero),
        numero: line.numero,
        numeroConfianca: line.numero_confianca,
        marcado: line.marcado,
        marcadoConfianca: line.marcado_confianca,
        valor: line.valor,
        observacao: line.observacao
      }))
      setRows(reviewed.length ? reviewed : [])
      setStep('review')
      if (!reviewed.length) setError('A IA não encontrou linhas legíveis. Você pode preencher manualmente.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ler a folha.')
      setStep('upload')
    }
  }

  function updateRow(index: number, patch: Partial<ReviewedRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function confirm() {
    setSaving(true)
    try {
      // Só registra o que está de fato na folha: linhas sem animal reconhecido
      // e, no manejo, linhas não marcadas como feitas são descartadas na origem
      // pela tela que consome estas linhas.
      await onConfirm(rows.filter((row) => row.animal))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar a folha.')
    } finally {
      setSaving(false)
    }
  }

  const marked = rows.filter((row) => row.marcado && row.animal).length

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal modal-wide sheet-import" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div><span className="eyebrow"><Sparkles size={14} /> Leitura de ficha</span><h2>{labels.title}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        {step === 'upload' && (
          <div className="sheet-upload">
            <p className="sheet-hint">{labels.hint}</p>
            <label className="import-dropzone">
              {photoUrl ? <img src={photoUrl} alt="Foto da folha" /> : <><Camera size={34} /><strong>Foto da folha preenchida</strong><span>Enquadre a folha inteira, bem iluminada e sem dobras.</span></>}
              <input type="file" accept="image/*" onChange={selectPhoto} hidden />
            </label>
            <div className="sheet-upload-actions">
              <label className="button button-primary file-button"><ImagePlus size={18} /> Escolher foto<input type="file" accept="image/*" onChange={selectPhoto} hidden /></label>
              <button type="button" className="button button-ghost" onClick={seedFromSelection}>Preencher manualmente</button>
            </div>
            {!isSheetVisionConfigured && <small className="ai-hint">Leitura automática indisponível neste ambiente. Use o preenchimento manual.</small>}
            {error && <div className="alert alert-error">{error}</div>}
          </div>
        )}

        {step === 'reading' && (
          <div className="sheet-reading"><span className="spinner" /> Lendo a folha e casando os animais...</div>
        )}

        {step === 'review' && (
          <div className="sheet-review">
            <div className="sheet-review-note">
              <TriangleAlert size={16} />
              <span>Confira linha por linha. Nada é salvo antes de você confirmar. Só o que está marcado na folha será registrado.</span>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="review-table">
              <div className="review-row review-head">
                <span>Animal</span><span>{labels.primary}</span><span>{labels.value}</span><span>Observação</span>
              </div>
              {rows.map((row, index) => (
                <div className={`review-row ${row.animal ? '' : 'is-unmatched'}`} key={index}>
                  <div className="review-animal">
                    <select
                      value={row.animal?.id ?? ''}
                      onChange={(e) => updateRow(index, { animal: animals.find((a) => a.id === e.target.value) ?? null })}
                    >
                      <option value="">{row.numero ? `Nº ${row.numero} (não reconhecido)` : 'Selecione o animal'}</option>
                      {animals.map((animal) => <option key={animal.id} value={animal.id}>{animal.number}{animal.breed ? ` — ${animal.breed}` : ''}</option>)}
                    </select>
                    {row.numeroConfianca !== 'alta' && <ConfidenceTag level={row.numeroConfianca} />}
                  </div>
                  <label className="review-check">
                    <input type="checkbox" checked={row.marcado} onChange={(e) => updateRow(index, { marcado: e.target.checked })} />
                    <span>{labels.primary}</span>
                  </label>
                  <input className="review-value" value={row.valor} onChange={(e) => updateRow(index, { valor: e.target.value })} placeholder={labels.value} />
                  <input className="review-obs" value={row.observacao} onChange={(e) => updateRow(index, { observacao: e.target.value })} placeholder="Opcional" />
                </div>
              ))}
            </div>
            <div className="sheet-review-summary">{marked} de {rows.length} linhas marcadas serão registradas.</div>
            <div className="modal-actions">
              <button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button>
              <button type="button" className="button button-primary" onClick={() => void confirm()} disabled={saving || !rows.some((r) => r.animal)}>
                <Check size={18} /> {saving ? 'Registrando' : 'Confirmar e registrar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
