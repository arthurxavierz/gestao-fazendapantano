import { CheckCircle2, ListChecks, MessageSquarePlus, RotateCcw, Search, UserX } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFazenda } from '../AppContext'
import { Loading } from '../components/Loading'
import { Foto } from '../components/rebanho'
import { PageHeading } from '../components/ui'
import { confirmarLote } from '../domain/operacoes'
import { GRUPOS_LOTE, type GrupoLote, type ItemLote, TIPOS_MANEJO, hoje, listaDoLote } from '../domain/regras'

interface Marcado extends ItemLote {
  faltou: boolean
  observacao: string
  foto: string | null
}

/**
 * Manejo em lote: 1) o que foi feito e para quem; 2) a lista com todos como
 * "Feito", trocando para "Faltou" quem não veio; 3) confirmar. Quem faltou
 * fica com o manejo pendente.
 */
export function Lote() {
  const { dados, carregando, executar } = useFazenda()
  const [form, setForm] = useState({ data: hoje(), manejo: 'Vacina', produtos: '', observacao: '', grupo: '' as GrupoLote | '' })
  const [lista, setLista] = useState<Marcado[] | null>(null)
  const [busca, setBusca] = useState('')
  const [obsAberta, setObsAberta] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [feito, setFeito] = useState<string | null>(null)

  const previa = useMemo(() => (form.grupo ? listaDoLote(dados, form.grupo).length : 0), [dados, form.grupo])

  function gerar(event: FormEvent) {
    event.preventDefault()
    if (!form.grupo) return
    const fotos = new Map(dados.animais.map((item) => [item.id, item.foto_url]))
    setLista(listaDoLote(dados, form.grupo).map((item) => ({ ...item, faltou: false, observacao: '', foto: item.alvo.tipo === 'animal' ? fotos.get(item.alvo.id) ?? null : null })))
    setFeito(null)
  }

  async function confirmar() {
    if (!lista) return
    setSaving(true)
    const result = await executar((f) => confirmarLote(f, form, lista.map((item) => ({ alvo: item.alvo, faltou: item.faltou, observacao: item.observacao }))))
    setSaving(false)
    if (result) {
      setFeito(result.mensagem)
      setLista(null)
      setForm((current) => ({ ...current, produtos: '', observacao: '', grupo: '' }))
    }
  }

  if (carregando) return <Loading />

  const faltaram = lista?.filter((item) => item.faltou).length ?? 0
  const visiveis = lista?.filter((item) => !busca.trim() || item.rotulo.toLowerCase().includes(busca.trim().toLowerCase())) ?? []
  const toggle = (key: string, patch: Partial<Marcado>) => setLista((current) => current?.map((item) => (item.alvo.id === key ? { ...item, ...patch } : item)) ?? null)

  return (
    <>
      <PageHeading eyebrow="Manejo" title="Manejo em lote" text="Vacinação e manejos de vários animais no mesmo dia. Quem faltou fica pendente até ser feito." actions={<Link className="button button-secondary" to="/manejos">Ver histórico</Link>} />

      {feito && <div className="alert alert-success lote-feito"><CheckCircle2 size={18} /><div>{feito}</div></div>}

      <form className={`panel lote-form ${lista ? 'is-travado' : ''}`} onSubmit={gerar}>
        <div className="panel-head"><div><span className="eyebrow">Passo 1</span><h2>O que foi feito e para quem</h2></div></div>
        <fieldset disabled={Boolean(lista)} className="form-grid">
          <label className="field required"><span>Data do manejo</span><input type="date" max={hoje()} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} required /></label>
          <label className="field required"><span>Manejo</span><select value={form.manejo} onChange={(e) => setForm({ ...form, manejo: e.target.value })}>{TIPOS_MANEJO.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field"><span>Produto utilizado</span><input value={form.produtos} onChange={(e) => setForm({ ...form, produtos: e.target.value })} placeholder="Ex.: Vacina aftosa" /></label>
          <label className="field"><span>Observação geral</span><input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder="Opcional" /></label>
          <label className="field field-wide required"><span>Aplicar a</span>
            <select value={form.grupo} onChange={(e) => setForm({ ...form, grupo: e.target.value as GrupoLote })} required>
              <option value="">Escolha para quem vale…</option>
              {GRUPOS_LOTE.map((item) => <option key={item} value={item}>{/^\d|Acima/.test(item) ? `Faixa ${item} meses` : item}</option>)}
            </select>
            {form.grupo && <small className="field-hint">{previa} na lista</small>}
          </label>
        </fieldset>
        {!lista && <div className="form-actions"><button className="button button-primary" disabled={!form.grupo || !previa}><ListChecks size={17} /> Gerar lista de animais</button></div>}
      </form>

      {lista && (
        <section className="panel lote-lista">
          <div className="panel-head">
            <div><span className="eyebrow">Passo 2</span><h2>Marque quem faltou</h2></div>
            <div className="lote-contadores"><span className="pill tone-emerald">{lista.length - faltaram} feito(s)</span><span className="pill tone-red">{faltaram} faltou</span></div>
          </div>
          <div className="lote-ferramentas">
            <label className="search-box compact"><Search size={16} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Achar brinco na lista" /></label>
            <button type="button" className="text-button" onClick={() => setLista(lista.map((item) => ({ ...item, faltou: false })))}><RotateCcw size={14} /> Todos feito</button>
          </div>
          <ul className="lote-itens">
            {visiveis.map((item) => (
              <li key={item.alvo.id} className={item.faltou ? 'is-faltou' : ''}>
                <Foto src={item.foto} alt={item.rotulo} size="xs" />
                <div className="lote-item-info">
                  <strong>{item.rotulo}</strong>
                  <small>{[item.tipo !== 'Animal' ? item.tipo : null, item.sexo, item.idade].filter(Boolean).join(' · ')}</small>
                  {obsAberta === item.alvo.id
                    ? <input className="lote-obs" autoFocus value={item.observacao} onChange={(e) => toggle(item.alvo.id, { observacao: e.target.value })} onBlur={() => setObsAberta(null)} placeholder="Observação deste animal" />
                    : item.observacao && <em>{item.observacao}</em>}
                </div>
                <button type="button" className="icon-button" onClick={() => setObsAberta(item.alvo.id)} aria-label="Observação"><MessageSquarePlus size={17} /></button>
                <button type="button" className={`presenca ${item.faltou ? 'faltou' : 'feito'}`} onClick={() => toggle(item.alvo.id, { faltou: !item.faltou })}>
                  {item.faltou ? <><UserX size={16} /> Faltou</> : <><CheckCircle2 size={16} /> Feito</>}
                </button>
              </li>
            ))}
          </ul>
          <div className="lote-rodape">
            <button type="button" className="button button-ghost" onClick={() => setLista(null)}>Voltar e mudar</button>
            <button type="button" className="button button-primary" onClick={() => void confirmar()} disabled={saving}>{saving ? 'Lançando…' : `Confirmar manejo (${lista.length})`}</button>
          </div>
        </section>
      )}
    </>
  )
}
