import { AlertTriangle, CheckCheck, ImageOff, Trash2 } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { useFazenda } from '../AppContext'
import { useAuth } from '../AuthContext'
import { adicionarManejo, darBaixa, excluirManejo, marcarPendenciasFeitas } from '../domain/operacoes'
import { type Alvo, type Situacao, type Tom, MOTIVOS_SAIDA, TIPOS_MANEJO, hoje, manejosDe } from '../domain/regras'
import type { MotivoSaida } from '../types'
import { data } from '../utils/format'
import { Modal } from './ui'

const tomClasse: Record<Tom, string> = { verde: 'emerald', ambar: 'amber', vermelho: 'red', cinza: 'slate', azul: 'blue' }

export function SituacaoPill({ situacao, curta = false }: { situacao: Situacao | { texto: string; tom: Tom; curta?: string }; curta?: boolean }) {
  return <span className={`pill tone-${tomClasse[situacao.tom]}`}>{curta && 'curta' in situacao && situacao.curta ? situacao.curta : situacao.texto}</span>
}

export const tomPill = (tom: Tom) => `pill tone-${tomClasse[tom]}`

/** Foto do animal; sem foto, um quadrado neutro. Fotos são carregadas só quando aparecem. */
export function Foto({ src, alt, size = 'sm', onClick }: { src?: string | null; alt: string; size?: 'xs' | 'sm' | 'md' | 'lg'; onClick?: () => void }) {
  const [broken, setBroken] = useState(false)
  const content = src && !broken
    ? <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setBroken(true)} />
    : <span className="foto-vazia"><ImageOff size={size === 'lg' ? 32 : 16} /></span>
  return onClick && src && !broken
    ? <button type="button" className={`foto foto-${size}`} onClick={onClick} aria-label={`Ampliar ${alt}`}>{content}</button>
    : <span className={`foto foto-${size}`}>{content}</span>
}

/** Botões grandes de escolha (M/F, S/N, faixas): mais rápidos que lista no celular. */
export function Escolha<T extends string>({ value, onChange, opcoes, allowEmpty = true, size = 'md', label }: {
  value: T | null
  onChange: (value: T | null) => void
  opcoes: readonly (T | { value: T; label: string })[]
  allowEmpty?: boolean
  size?: 'sm' | 'md' | 'lg'
  label?: string
}) {
  return (
    <div className={`escolha escolha-${size}`} role="radiogroup" aria-label={label}>
      {opcoes.map((item) => {
        const option = typeof item === 'string' ? { value: item, label: item } : item
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={selected ? 'selected' : ''}
            onClick={() => onChange(selected && allowEmpty ? null : option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- manejos

export function NovoManejo({ alvo, compacto = false }: { alvo: Alvo; compacto?: boolean }) {
  const { executar } = useFazenda()
  const [form, setForm] = useState({ data: hoje(), manejo: 'Vacina', produtos: '', observacao: '' })
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const result = await executar((fazenda) => adicionarManejo(fazenda, alvo, form))
    setSaving(false)
    if (result) setForm((current) => ({ ...current, produtos: '', observacao: '' }))
  }

  return (
    <form className={`manejo-form ${compacto ? 'is-compact' : ''}`} onSubmit={submit}>
      <label className="field"><span>Data</span><input type="date" value={form.data} max={hoje()} onChange={(e) => setForm({ ...form, data: e.target.value })} required /></label>
      <label className="field"><span>Manejo</span>
        <select value={form.manejo} onChange={(e) => setForm({ ...form, manejo: e.target.value })}>
          {TIPOS_MANEJO.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label className="field"><span>Produtos utilizados</span><input value={form.produtos} onChange={(e) => setForm({ ...form, produtos: e.target.value })} placeholder="Ex.: Vacina aftosa 5 ml" /></label>
      <label className="field field-wide"><span>Observação</span><input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder="Opcional" /></label>
      <button className="button button-primary" disabled={saving}>{saving ? 'Lançando…' : 'Adicionar manejo'}</button>
    </form>
  )
}

export function HistoricoManejos({ alvo, vazio = 'Nenhum manejo lançado ainda.' }: { alvo: Alvo; vazio?: string }) {
  const { dados, executar } = useFazenda()
  const { isAdmin } = useAuth()
  const [pendenteData, setPendenteData] = useState<string | null>(null)
  const list = manejosDe(dados.manejos, alvo)
  const pendentes = list.filter((item) => item.status === 'Pendente').length

  return (
    <div className="manejo-historico">
      {pendentes > 0 && (
        <div className="alert alert-error pendencia-alerta">
          <AlertTriangle size={18} />
          <div>
            <strong>{pendentes} manejo(s) pendente(s):</strong> o animal faltou no dia.
            {pendenteData == null ? (
              <button type="button" className="button button-sm button-danger" onClick={() => setPendenteData(hoje())}><CheckCheck size={15} /> Marcar como feitas</button>
            ) : (
              <span className="pendencia-confirma">
                Feito em <input type="date" value={pendenteData} max={hoje()} onChange={(e) => setPendenteData(e.target.value)} />
                <button type="button" className="button button-sm button-primary" onClick={async () => { await executar((f) => marcarPendenciasFeitas(f, alvo, pendenteData)); setPendenteData(null) }}>Confirmar</button>
                <button type="button" className="text-button" onClick={() => setPendenteData(null)}>Cancelar</button>
              </span>
            )}
          </div>
        </div>
      )}
      {list.length === 0 ? <p className="muted vazio-linha">{vazio}</p> : (
        <ul className="manejo-lista">
          {list.map((item) => (
            <li key={item.id} className={item.status === 'Pendente' ? 'is-pendente' : ''}>
              <span className="manejo-data">{data(item.data)}</span>
              <div className="manejo-corpo">
                <strong>{item.manejo}{item.status === 'Pendente' && <em> · PENDENTE: faltou</em>}{item.status === 'Feito depois' && <em className="feito-depois"> · feito em {data(item.feito_em)}</em>}</strong>
                {item.produtos && <span>{item.produtos}</span>}
                {item.observacao && <small>{item.observacao}</small>}
              </div>
              {isAdmin && (
                <button type="button" className="icon-button" title="Excluir manejo" onClick={() => { if (window.confirm(`Excluir o manejo "${item.manejo}" de ${data(item.data)}?`)) void executar((f) => excluirManejo(f, item.id)) }}>
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- saída

export function BaixaModal({ animalId, brinco, inicial, onClose }: { animalId: string; brinco: string; inicial?: MotivoSaida | null; onClose: () => void }) {
  const { executar } = useFazenda()
  const [motivo, setMotivo] = useState<MotivoSaida | null>(inicial ?? null)
  const [quando, setQuando] = useState(hoje())
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!motivo) return
    setSaving(true)
    const result = await executar((f) => darBaixa(f, animalId, motivo, quando))
    setSaving(false)
    if (result) onClose()
  }

  return (
    <Modal
      title={`Dar baixa no brinco ${brinco}`}
      eyebrow="Saída do rebanho"
      onClose={onClose}
      onSubmit={submit}
      footer={<>
        <button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button>
        <button className="button button-danger" disabled={!motivo || saving}>{saving ? 'Salvando…' : 'Confirmar baixa'}</button>
      </>}
    >
      <p className="muted">O registro continua guardado como <strong>X{brinco}</strong>, em vermelho, com todo o histórico. O número <strong>{brinco}</strong> vai para Números disponíveis.</p>
      <div className="field"><span>Motivo</span><Escolha value={motivo} onChange={setMotivo} opcoes={MOTIVOS_SAIDA} allowEmpty={false} size="lg" label="Motivo da saída" /></div>
      <label className="field"><span>Data da saída</span><input type="date" value={quando} max={hoje()} onChange={(e) => setQuando(e.target.value)} required /></label>
    </Modal>
  )
}
