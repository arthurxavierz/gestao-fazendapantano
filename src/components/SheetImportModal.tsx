import { Camera, Check, ImagePlus, Printer, ScanLine, TriangleAlert } from 'lucide-react'
import { ChangeEvent, useMemo, useState } from 'react'
import { readFieldSheet, type ExpectedRow } from '../services/sheetVision'
import type { AiConfidence, Animal, SheetKind } from '../types'
import { ConfidenceTag, SimulatedNotice } from './AiSuggestionPanel'
import { Alert, Modal } from './ui'

/** Linha conferida, pronta para virar registro. */
export interface SheetRow {
  animal: Animal | null
  numero: string
  numeroConfianca: AiConfidence
  marcado: boolean
  marcadoConfianca: AiConfidence
  valor: string
  observacao: string
}

const copy: Record<SheetKind, { title: string; mark: [string, string]; value?: string; hint: string }> = {
  diagnostico: {
    title: 'Ler folha de diagnóstico',
    mark: ['Prenhe', 'Vazia'],
    hint: 'A IA lê o X de cada linha: Prenhe ou Vazia.'
  },
  pesagem: {
    title: 'Ler folha de pesagem',
    mark: ['Presente', 'Faltou'],
    value: 'Peso (kg)',
    hint: 'A IA lê o peso escrito à mão em cada linha.'
  },
  sanitario: {
    title: 'Ler folha de aplicação',
    mark: ['Feito', 'Não feito'],
    value: 'Dose',
    hint: 'A IA lê o X da coluna Feito e a dose, se anotada.'
  }
}

/**
 * Leitura de folha de campo: foto da folha preenchida, leitura pela IA e
 * conferência linha por linha. Nada é registrado aqui: as linhas voltam para a
 * tela de origem (diagnóstico, pesagem ou vacina), que mostra tudo de novo
 * antes de salvar.
 */
export function SheetImportModal({ kind, animals, hints = {}, onApply, onPrint, onClose }: {
  kind: SheetKind
  /** Animais impressos na folha, na mesma ordem. */
  animals: Animal[]
  /** Valor provável por id de animal (peso esperado), para a simulação. */
  hints?: Record<string, string>
  onApply: (rows: SheetRow[]) => void
  onPrint?: () => void
  onClose: () => void
}) {
  const labels = copy[kind]
  const [step, setStep] = useState<'upload' | 'reading' | 'review'>('upload')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [rows, setRows] = useState<SheetRow[]>([])
  const [simulated, setSimulated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const byNumber = useMemo(() => new Map(animals.map((item) => [item.number.trim(), item])), [animals])
  const matchAnimal = (numero: string) => byNumber.get(numero.trim()) ?? byNumber.get(numero.trim().replace(/^0+/, '')) ?? null

  function manual() {
    setRows(animals.map((animal) => ({ animal, numero: animal.number, numeroConfianca: 'alta', marcado: kind !== 'diagnostico', marcadoConfianca: 'alta', valor: '', observacao: '' })))
    setSimulated(false)
    setStep('review')
  }

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setPhotoUrl(url)
    setError(null)
    setStep('reading')
    try {
      const expected: ExpectedRow[] = animals.map((animal) => ({ number: animal.number, hint: hints[animal.id] }))
      const result = await readFieldSheet(url, kind, expected)
      setSimulated(result.simulated)
      setRows(result.linhas.map((line) => ({
        animal: matchAnimal(line.numero),
        numero: line.numero,
        numeroConfianca: line.numero_confianca,
        marcado: line.marcado,
        marcadoConfianca: line.marcado_confianca,
        // No peso, só algarismos e separador decimal; nos demais, o texto como foi lido.
        valor: kind === 'pesagem' ? (line.valor || '').replace(',', '.').replace(/[^\d.]/g, '') : line.valor || '',
        observacao: line.observacao
      })))
      setStep('review')
      if (!result.linhas.length) setError('A IA não encontrou linhas legíveis. Tire outra foto ou preencha manualmente.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ler a folha.')
      setStep('upload')
    }
  }

  const update = (index: number, patch: Partial<SheetRow>) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const usable = rows.filter((row) => row.animal)
  const doubtful = rows.filter((row) => row.numeroConfianca !== 'alta' || row.marcadoConfianca !== 'alta' || !row.animal).length

  return (
    <Modal
      title={labels.title}
      eyebrow="Folha de campo · leitura por IA"
      onClose={onClose}
      size="lg"
      footer={step === 'review' ? <>
        <span className="modal-summary">{usable.length} linhas reconhecidas{doubtful ? ` · ${doubtful} para conferir` : ''}</span>
        <button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="button button-primary" onClick={() => { onApply(usable); onClose() }} disabled={!usable.length}><Check size={18} /> Usar estas linhas</button>
      </> : undefined}
    >
      {step === 'upload' && (
        <div className="sheet-upload">
          <p className="modal-text">{labels.hint} A folha precisa ter sido impressa pelo sistema, com os brincos já escritos.</p>
          <label className="sheet-drop">
            <Camera size={34} />
            <strong>Foto da folha preenchida</strong>
            <span>Folha inteira, de cima, bem iluminada e sem dobras.</span>
            <input type="file" accept="image/*" onChange={selectPhoto} />
          </label>
          <div className="sheet-actions">
            <label className="button button-primary file-button"><ImagePlus size={18} /> Escolher foto<input type="file" accept="image/*" onChange={selectPhoto} /></label>
            {onPrint && <button type="button" className="button button-secondary" onClick={onPrint}><Printer size={18} /> Imprimir a folha</button>}
            <button type="button" className="button button-ghost" onClick={manual}>Conferir sem foto</button>
          </div>
          {error && <Alert>{error}</Alert>}
        </div>
      )}

      {step === 'reading' && (
        <div className="sheet-reading">
          {photoUrl && <img src={photoUrl} alt="Folha enviada" />}
          <div className="sheet-scan"><ScanLine size={22} /> Lendo a folha e casando cada linha com o animal…</div>
        </div>
      )}

      {step === 'review' && (
        <div className="sheet-review">
          {simulated && <SimulatedNotice />}
          <div className="ai-warning"><TriangleAlert size={16} /><span>Confira as linhas destacadas. Nada é salvo antes da próxima tela.</span></div>
          {error && <Alert>{error}</Alert>}
          <div className="sheet-table">
            <div className="sheet-row sheet-head"><span>Brinco</span><span>Leitura</span>{labels.value && <span>{labels.value}</span>}<span>Observação</span></div>
            {rows.map((row, index) => {
              const doubt = row.numeroConfianca !== 'alta' || row.marcadoConfianca !== 'alta' || !row.animal
              return (
                <div key={index} className={`sheet-row ${doubt ? 'is-doubt' : ''} ${labels.value ? '' : 'no-value'}`}>
                  <div className="sheet-animal">
                    <select value={row.animal?.id ?? ''} onChange={(e) => update(index, { animal: animals.find((a) => a.id === e.target.value) ?? null })}>
                      <option value="">{row.numero ? `${row.numero} (não reconhecido)` : 'Escolha'}</option>
                      {animals.map((animal) => <option key={animal.id} value={animal.id}>{animal.number}</option>)}
                    </select>
                    {row.numeroConfianca !== 'alta' && <ConfidenceTag level={row.numeroConfianca} />}
                  </div>
                  <div className="sheet-mark">
                    <div className="result-toggle">
                      <button type="button" className={row.marcado ? 'is-pos' : ''} onClick={() => update(index, { marcado: true, marcadoConfianca: 'alta' })}>{labels.mark[0]}</button>
                      <button type="button" className={!row.marcado ? 'is-neg' : ''} onClick={() => update(index, { marcado: false, marcadoConfianca: 'alta' })}>{labels.mark[1]}</button>
                    </div>
                    {row.marcadoConfianca !== 'alta' && <ConfidenceTag level={row.marcadoConfianca} />}
                  </div>
                  {labels.value && <input value={row.valor} inputMode={kind === 'pesagem' ? 'decimal' : 'text'} onChange={(e) => update(index, { valor: e.target.value })} placeholder={labels.value} />}
                  <input value={row.observacao} onChange={(e) => update(index, { observacao: e.target.value })} placeholder="Opcional" />
                </div>
              )
            })}
          </div>
          {photoUrl && <details className="sheet-photo"><summary>Ver a foto da folha</summary><img src={photoUrl} alt="Folha enviada" /></details>}
        </div>
      )}
    </Modal>
  )
}
