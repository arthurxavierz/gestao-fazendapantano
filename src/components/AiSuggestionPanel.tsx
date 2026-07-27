import { Check, Sparkles, TriangleAlert } from 'lucide-react'
import type { AiConfidence, AiPhotoAnalysis } from '../types'

const confidenceLabel: Record<AiConfidence, string> = {
  alta: 'Confiança alta',
  media: 'Confiança média',
  baixa: 'Confiança baixa',
  ilegivel: 'Não conseguiu ler'
}

export function ConfidenceTag({ level }: { level: AiConfidence }) {
  return <span className={`confidence-tag confidence-${level}`}>{confidenceLabel[level]}</span>
}

interface SuggestionRow {
  key: string
  label: string
  value: string
  confidence: AiConfidence
  applied: boolean
  onApply: () => void
}

interface Props {
  analysis: AiPhotoAnalysis
  rows: SuggestionRow[]
  onApplyAll: () => void
  onDismiss: () => void
}

export function AiSuggestionPanel({ analysis, rows, onApplyAll, onDismiss }: Props) {
  const usable = rows.filter((row) => row.value && row.confidence !== 'ilegivel')
  const unreadable = analysis.numero_confianca === 'ilegivel'
  const lowConfidence = analysis.numero_confianca === 'baixa'

  return (
    <div className="ai-panel">
      <div className="ai-panel-head">
        <div>
          <span className="eyebrow"><Sparkles size={14} /> Interpretado pela IA</span>
          <h3>Confira antes de aplicar</h3>
          <p>Nada foi salvo. Use as sugestões que estiverem certas e corrija o que estiver errado.</p>
        </div>
        <button type="button" className="icon-button" onClick={onDismiss} aria-label="Fechar sugestões">×</button>
      </div>

      {unreadable && (
        <div className="ai-warning">
          <TriangleAlert size={17} />
          <span>A IA não conseguiu ler o brinco nesta foto. Digite o número manualmente ou tire outra foto mais próxima do brinco.</span>
        </div>
      )}

      {lowConfidence && (
        <div className="ai-warning">
          <TriangleAlert size={17} />
          <span>A leitura do número ficou com confiança baixa. Confira dígito por dígito antes de aceitar.</span>
        </div>
      )}

      <ul className="ai-suggestion-list">
        {rows.map((row) => (
          <li key={row.key} className={row.confidence === 'ilegivel' || !row.value ? 'is-empty' : ''}>
            <div className="ai-suggestion-info">
              <span className="ai-suggestion-label">{row.label}</span>
              <strong>{row.value || 'Não identificado'}</strong>
              <ConfidenceTag level={row.confidence} />
            </div>
            {row.value && row.confidence !== 'ilegivel' && (
              <button
                type="button"
                className={`button ${row.applied ? 'button-ghost' : 'button-secondary'} ai-apply-button`}
                onClick={row.onApply}
                disabled={row.applied}
              >
                {row.applied ? <><Check size={16} /> Aplicado</> : 'Usar'}
              </button>
            )}
          </li>
        ))}
      </ul>

      {analysis.observacao && (
        <p className="ai-observation"><strong>Observação visual:</strong> {analysis.observacao}</p>
      )}

      {usable.length > 0 && (
        <div className="ai-panel-actions">
          <button type="button" className="button button-primary" onClick={onApplyAll}>
            <Check size={17} /> Aplicar todas as sugestões
          </button>
          <button type="button" className="button button-ghost" onClick={onDismiss}>Descartar</button>
        </div>
      )}
    </div>
  )
}
