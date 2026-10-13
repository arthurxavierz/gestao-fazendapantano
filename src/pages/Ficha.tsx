import { AlertTriangle, ArrowLeft, Baby, Camera, ChevronLeft, ChevronRight, LogOut, RotateCcw, Save } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useFazenda } from '../AppContext'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { PhotoViewer } from '../components/PhotoViewer'
import { BaixaModal, Escolha, Foto, HistoricoManejos, NovoManejo, SituacaoPill } from '../components/rebanho'
import { Modal } from '../components/ui'
import {
  type DadosProtocolo,
  desfazerBaixa,
  registrarParto,
  salvarAvaliacao,
  salvarDados,
  salvarProtocolos
} from '../domain/operacoes'
import {
  CORES,
  FAIXAS,
  MOTIVOS_NAO_APTA,
  RACAS,
  avisoBezerro,
  bezerrosDaMae,
  hoje,
  idadeBezerro,
  mamando,
  protocolosDoCiclo,
  vaziasNoCiclo
} from '../domain/regras'
import { enviarFoto } from '../services/banco'
import type { Animal, Faixa, Sexo } from '../types'
import { data, idade } from '../utils/format'

export function Ficha() {
  const { id } = useParams()
  const { dados, linhas, linhaDe, carregando, executar, avisar } = useFazenda()
  const navigate = useNavigate()
  const [zoom, setZoom] = useState(false)
  const [baixa, setBaixa] = useState<null | 'Descarte' | 'escolher'>(null)
  const [enviando, setEnviando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const item = id ? linhaDe(id) : undefined

  // Navegação: as setas azuis seguem todos os animais; as verdes, só os do mesmo sexo.
  const vizinhos = useMemo(() => {
    if (!item) return null
    const all = linhas
    const same = linhas.filter((row) => row.animal.sexo === item.animal.sexo)
    const around = (list: typeof linhas) => {
      const index = list.findIndex((row) => row.animal.id === item.animal.id)
      return { prev: list[index - 1]?.animal.id, next: list[index + 1]?.animal.id }
    }
    return { todos: around(all), sexo: around(same) }
  }, [linhas, item])

  useEffect(() => { window.scrollTo({ top: 0 }) }, [id])

  if (carregando) return <Loading />
  if (!item) return <EmptyState icon={AlertTriangle} title="Animal não encontrado" text="Ele pode ter sido apagado ou o link está errado." action={<Link className="button button-primary" to="/animais">Ver animais</Link>} />

  const a = item.animal

  async function trocarFoto(file: File) {
    setEnviando(true)
    try {
      const url = await enviarFoto(file, a.brinco)
      await executar((f) => salvarDados(f, a.id, { foto_url: url }))
    } catch (error) {
      avisar(error instanceof Error ? error.message : 'Não foi possível enviar a foto.', 'erro')
    } finally {
      setEnviando(false)
    }
  }

  async function desfazer() {
    if (!window.confirm(`Desfazer a baixa de X${a.brinco}? O animal volta ao rebanho e a saída (${a.saida}) é apagada.`)) return
    // O número original pode ter sido reutilizado: aí é preciso escolher outro.
    let outro: string | undefined
    const check = desfazerBaixa(dados, a.id)
    if (check.precisaNumero) {
      outro = window.prompt(check.mensagem)?.trim()
      if (!outro) return
    }
    await executar((f) => desfazerBaixa(f, a.id, outro))
  }

  return (
    <div className="ficha">
      <div className="ficha-nav">
        <button className="back-button" onClick={() => navigate(-1)}><ArrowLeft size={17} /> Voltar</button>
        <div className="ficha-setas">
          <NavSeta to={vizinhos?.todos.prev} label="Anterior (todos)" tone="azul" dir="prev" />
          <NavSeta to={vizinhos?.todos.next} label="Próximo (todos)" tone="azul" dir="next" />
          {a.sexo && <NavSeta to={vizinhos?.sexo.prev} label={`Anterior (${a.sexo === 'F' ? 'fêmeas' : 'machos'})`} tone="verde" dir="prev" />}
          {a.sexo && <NavSeta to={vizinhos?.sexo.next} label={`Próximo (${a.sexo === 'F' ? 'fêmeas' : 'machos'})`} tone="verde" dir="next" />}
        </div>
      </div>

      {a.saida && (
        <div className="alert alert-error baixado-alerta">
          <LogOut size={18} />
          <div>
            <strong>Animal baixado: {a.saida} em {data(a.data_saida)}.</strong> O registro fica guardado como X{a.brinco} e o número foi liberado.
          </div>
          <button className="button button-sm button-danger" onClick={() => void desfazer()}><RotateCcw size={15} /> Desfazer baixa</button>
        </div>
      )}

      <section className="ficha-topo panel">
        <div className="ficha-foto">
          <Foto src={a.foto_url} alt={`Brinco ${item.rotulo}`} size="lg" onClick={() => setZoom(true)} />
          <button className="button button-sm button-glass-dark" onClick={() => fileRef.current?.click()} disabled={enviando}><Camera size={15} /> {enviando ? 'Enviando…' : a.foto_url ? 'Trocar foto' : 'Adicionar foto'}</button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void trocarFoto(file); e.target.value = '' }} />
        </div>
        <div className="ficha-titulo">
          <span className="eyebrow">{a.sexo === 'F' ? 'Fêmea' : a.sexo === 'M' ? 'Macho' : 'Animal'}{a.ordem ? ` · nº ${a.ordem} da planilha` : ''}</span>
          <h1 className={a.saida ? 'is-baixado' : ''}>{item.rotulo}</h1>
          <div className="ficha-tags">
            <SituacaoPill situacao={item.situacao} />
            {item.faixa && <span className="pill tone-slate">{item.faixa} meses</span>}
            {a.nascimento && <span className="pill tone-slate">{idade(a.nascimento)}</span>}
            {item.pendentes > 0 && <span className="pill tone-red">{item.pendentes} manejo(s) pendente(s)</span>}
          </div>
          <dl className="ficha-resumo">
            <div><dt>Último manejo</dt><dd>{item.ultimoManejo ? data(item.ultimoManejo) : '—'}</dd></div>
            <div><dt>Raça</dt><dd>{a.raca ?? '—'}</dd></div>
            <div><dt>Cor</dt><dd>{a.cor ?? '—'}</dd></div>
            <div><dt>No IMA?</dt><dd>{a.no_ima == null ? '—' : a.no_ima ? 'Sim' : 'Não'}</dd></div>
          </dl>
          {!a.saida && (
            <div className="ficha-acoes">
              <button className="button button-ghost danger" onClick={() => setBaixa('escolher')}><LogOut size={16} /> Dar baixa (venda, morte ou descarte)</button>
            </div>
          )}
        </div>
      </section>

      <div className="ficha-grid">
        <DadosGerais animal={a} largo={a.sexo !== 'M'} />
        {a.sexo === 'F' && <SecaoFemea animal={a} onDescarte={() => setBaixa('Descarte')} />}
        {a.sexo === 'M' && <SecaoMacho animal={a} />}
        {!a.sexo && (
          <section className="panel ficha-aviso">
            <p>Informe o sexo e salve para ver os <strong>protocolos de IATF</strong> (fêmea) ou a <strong>avaliação</strong> (macho).</p>
          </section>
        )}
        <section className="panel ficha-span">
          <div className="panel-head"><div><span className="eyebrow">Histórico de manejo</span><h2>Manejos deste animal</h2></div></div>
          {!a.saida && <NovoManejo alvo={{ tipo: 'animal', id: a.id }} />}
          <HistoricoManejos alvo={{ tipo: 'animal', id: a.id }} />
        </section>
      </div>

      {zoom && a.foto_url && <PhotoViewer src={a.foto_url} alt={`Brinco ${item.rotulo}`} caption={`Brinco ${item.rotulo}`} onClose={() => setZoom(false)} />}
      {baixa && <BaixaModal animalId={a.id} brinco={a.brinco} inicial={baixa === 'Descarte' ? 'Descarte' : null} onClose={() => setBaixa(null)} />}
    </div>
  )
}

function NavSeta({ to, label, tone, dir }: { to?: string; label: string; tone: 'azul' | 'verde'; dir: 'prev' | 'next' }) {
  const navigate = useNavigate()
  return (
    <button className={`seta seta-${tone}`} disabled={!to} onClick={() => to && navigate(`/animais/${to}`, { replace: true })} title={label} aria-label={label}>
      {dir === 'prev' ? <ChevronLeft size={18} /> : null}
      <span>{label}</span>
      {dir === 'next' ? <ChevronRight size={18} /> : null}
    </button>
  )
}

// ---------------------------------------------------------------- dados gerais

function DadosGerais({ animal, largo }: { animal: Animal; largo: boolean }) {
  const { executar } = useFazenda()
  const inicial = () => ({
    brinco: animal.brinco,
    sexo: animal.sexo,
    nascimento: animal.nascimento ?? '',
    faixa: animal.faixa,
    raca: animal.raca ?? '',
    cor: animal.cor ?? '',
    no_ima: animal.no_ima,
    observacoes: animal.observacoes ?? '',
    conferencia: animal.conferencia ?? ''
  })
  const [form, setForm] = useState(inicial)
  const [saving, setSaving] = useState(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setForm(inicial()), [animal])

  const changed = JSON.stringify(form) !== JSON.stringify(inicial())
  const disabled = Boolean(animal.saida)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    await executar((f) => salvarDados(f, animal.id, { ...form, faixa: form.nascimento ? undefined : form.faixa }))
    setSaving(false)
  }

  return (
    <form className={`panel ficha-dados ${largo ? 'ficha-span ficha-dados-largo' : ''}`} onSubmit={submit}>
      <div className="panel-head">
        <div><span className="eyebrow">Dados gerais</span><h2>Cadastro</h2></div>
        <button className="button button-primary button-sm" disabled={!changed || saving || disabled}><Save size={15} /> {saving ? 'Salvando…' : 'Salvar alterações'}</button>
      </div>
      <fieldset disabled={disabled} className="form-grid">
        <label className="field"><span>Brinco</span><input value={form.brinco} onChange={(e) => setForm({ ...form, brinco: e.target.value })} /></label>
        <div className="field"><span>Sexo</span><Escolha<Sexo> value={form.sexo} onChange={(sexo) => setForm({ ...form, sexo })} opcoes={[{ value: 'M', label: 'Macho' }, { value: 'F', label: 'Fêmea' }]} label="Sexo" /></div>
        <label className="field"><span>Data de nascimento</span><input type="date" max={hoje()} value={form.nascimento} onChange={(e) => setForm({ ...form, nascimento: e.target.value })} /></label>
        <label className="field"><span>Faixa etária (meses)</span>
          <select value={form.nascimento ? '' : form.faixa ?? ''} disabled={Boolean(form.nascimento)} onChange={(e) => setForm({ ...form, faixa: (e.target.value || null) as Faixa | null })}>
            <option value="">{form.nascimento ? 'Calculada pela data' : 'Não informada'}</option>
            {FAIXAS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="field"><span>Raça</span><select value={form.raca} onChange={(e) => setForm({ ...form, raca: e.target.value })}><option value="">—</option>{RACAS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="field"><span>Cor</span><select value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })}><option value="">—</option>{CORES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <div className="field"><span>Cadastrado no IMA?</span>
          <Escolha<'S' | 'N'> value={form.no_ima == null ? null : form.no_ima ? 'S' : 'N'} onChange={(value) => setForm({ ...form, no_ima: value == null ? null : value === 'S' })} opcoes={[{ value: 'S', label: 'Sim' }, { value: 'N', label: 'Não' }]} label="No IMA" />
        </div>
        <label className="field field-wide"><span>Observações</span><textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></label>
        <label className="field field-wide"><span>Conferência da foto</span><input value={form.conferencia} onChange={(e) => setForm({ ...form, conferencia: e.target.value })} placeholder="Ex.: Conferir no curral: brinco ilegível" /></label>
      </fieldset>
    </form>
  )
}

// ---------------------------------------------------------------- fêmea

const slotVazio: DadosProtocolo = { apta: null, motivo: null, data_protocolo: null, data_confirmacao: null, resultado: null }

function SecaoFemea({ animal, onDescarte }: { animal: Animal; onDescarte: () => void }) {
  const { dados, executar } = useFazenda()
  const slots = useMemo(() => protocolosDoCiclo(dados.protocolos, animal.id, animal.ciclo), [dados.protocolos, animal.id, animal.ciclo])
  const inicial = () => slots.map((item) => (item ? {
    apta: item.apta, motivo: item.motivo, data_protocolo: item.data_protocolo, data_confirmacao: item.data_confirmacao, resultado: item.resultado
  } : { ...slotVazio }))
  const [form, setForm] = useState<DadosProtocolo[]>(inicial)
  const [saving, setSaving] = useState(false)
  const [parto, setParto] = useState(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setForm(inicial()), [slots])

  const changed = JSON.stringify(form) !== JSON.stringify(inicial())
  const vazias = vaziasNoCiclo(slots)
  const filhos = bezerrosDaMae(dados.bezerros, animal.id)
  const ciclos = dados.ciclos.filter((item) => item.animal_id === animal.id).sort((a, b) => b.ciclo - a.ciclo)
  const disabled = Boolean(animal.saida)

  const set = (index: number, patch: Partial<DadosProtocolo>) => setForm((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  async function salvar() {
    setSaving(true)
    await executar((f) => salvarProtocolos(f, animal.id, form))
    setSaving(false)
  }

  return (
    <>
      <section className="panel ficha-protocolos">
        <div className="panel-head">
          <div><span className="eyebrow">Protocolos de IATF · ciclo nº {animal.ciclo}</span><h2>3 tentativas por ciclo</h2></div>
          <button className="button button-primary button-sm" onClick={() => void salvar()} disabled={!changed || saving || disabled}><Save size={15} /> {saving ? 'Salvando…' : 'Salvar protocolos'}</button>
        </div>
        {vazias >= 3 && !animal.saida && (
          <div className="alert alert-error">
            <AlertTriangle size={18} />
            <div><strong>3 protocolos vazios neste ciclo: a regra manda para descarte.</strong> Confirme a saída quando a vaca for para o abate.</div>
            <button className="button button-sm button-danger" onClick={onDescarte}>Dar saída por descarte</button>
          </div>
        )}
        <fieldset disabled={disabled} className="protocolos">
          {form.map((slot, index) => {
            const result = slot.resultado
            return (
              <div key={index} className={`protocolo ${result === 'Prenha' ? 'is-prenha' : result === 'Vazia' ? 'is-vazia' : slot.data_protocolo ? 'is-aberto' : ''}`}>
                <div className="protocolo-head"><strong>{index + 1}º protocolo</strong>{result && <span className={`pill tone-${result === 'Prenha' ? 'emerald' : 'red'}`}>{result}</span>}{!result && slot.data_protocolo && <span className="pill tone-amber">aguardando confirmação</span>}</div>
                <div className="protocolo-campos">
                  <div className="field"><span>Apta p/ IATF</span><Escolha<'S' | 'N'> value={slot.apta} onChange={(apta) => set(index, { apta, motivo: apta === 'N' ? slot.motivo : null })} opcoes={[{ value: 'S', label: 'Sim' }, { value: 'N', label: 'Não' }]} size="sm" label="Apta" /></div>
                  {slot.apta === 'N' && (
                    <label className="field"><span>Motivo</span>
                      <select value={slot.motivo ?? ''} onChange={(e) => set(index, { motivo: e.target.value || null })}>
                        <option value="">—</option>{MOTIVOS_NAO_APTA.map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="field"><span>Data do protocolo</span><input type="date" value={slot.data_protocolo ?? ''} max={hoje()} onChange={(e) => set(index, { data_protocolo: e.target.value || null })} /></label>
                  <label className="field"><span>Data da confirmação</span><input type="date" value={slot.data_confirmacao ?? ''} max={hoje()} onChange={(e) => set(index, { data_confirmacao: e.target.value || null })} /></label>
                  <div className="field"><span>Resultado</span><Escolha value={slot.resultado} onChange={(resultado) => set(index, { resultado, data_confirmacao: resultado && !slot.data_confirmacao ? hoje() : slot.data_confirmacao })} opcoes={['Prenha', 'Vazia'] as const} size="sm" label="Resultado" /></div>
                </div>
              </div>
            )
          })}
        </fieldset>
      </section>

      <section className="panel ficha-partos">
        <div className="panel-head">
          <div><span className="eyebrow">Partos e bezerros</span><h2>{filhos.length ? `${filhos.length} parto(s) · ${mamando(dados.bezerros, animal.id)} ao pé` : 'Nenhum parto registrado'}</h2></div>
          {!animal.saida && <button className="button button-primary button-sm" onClick={() => setParto(true)}><Baby size={15} /> Registrar parto</button>}
        </div>
        {filhos.length > 0 && (
          <ul className="lista-bezerros">
            {filhos.map((calf) => {
              const aviso = avisoBezerro(calf)
              return (
                <li key={calf.id}>
                  <Link to={calf.animal_id ? `/animais/${calf.animal_id}` : `/bezerros/${calf.id}`}>
                    <strong>{calf.codigo}</strong>
                    <span>{calf.sexo ?? '—'} · nasceu {data(calf.nascimento)} · {idadeBezerro(calf) ?? '?'} meses</span>
                    <span className="pill tone-slate">{calf.situacao}</span>
                    {aviso && <small>{aviso.texto}</small>}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
        {ciclos.length > 0 && (
          <>
            <h3 className="sub-titulo">Ciclos anteriores</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Ciclo</th><th>Resultados</th><th>Parto</th><th>Bezerro</th><th>Encerrado em</th></tr></thead>
                <tbody>
                  {ciclos.map((ciclo) => {
                    const results = protocolosDoCiclo(dados.protocolos, animal.id, ciclo.ciclo)
                      .map((item, i) => (item?.resultado ? `${i + 1}º ${item.resultado}` : null)).filter(Boolean).join(', ')
                    return <tr key={ciclo.id}><td>{ciclo.ciclo}</td><td>{results || '—'}</td><td>{data(ciclo.data_parto)}</td><td>{ciclo.bezerro_codigo}</td><td>{data(ciclo.encerrado_em)}</td></tr>
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {parto && <PartoModal animal={animal} onClose={() => setParto(false)} />}
    </>
  )
}

function PartoModal({ animal, onClose }: { animal: Animal; onClose: () => void }) {
  const { executar } = useFazenda()
  const [form, setForm] = useState({ data: hoje(), sexo: null as Sexo | null, observacao: '' })
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const result = await executar((f) => registrarParto(f, animal.id, form))
    setSaving(false)
    if (result) onClose()
  }

  return (
    <Modal title={`Registrar parto da ${animal.brinco}`} eyebrow="Bezerro novo" onClose={onClose} onSubmit={submit}
      footer={<><button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? 'Registrando…' : 'Registrar parto'}</button></>}>
      <p className="muted">O bezerro entra como <strong>mamando</strong>, ligado a esta vaca. O ciclo nº {animal.ciclo} vai para os ciclos anteriores e a vaca volta para o 1º protocolo.</p>
      <label className="field required"><span>Data do parto</span><input type="date" max={hoje()} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} required /></label>
      <div className="field"><span>Sexo do bezerro</span><Escolha<Sexo> value={form.sexo} onChange={(sexo) => setForm({ ...form, sexo })} opcoes={[{ value: 'M', label: 'Macho' }, { value: 'F', label: 'Fêmea' }]} size="lg" label="Sexo do bezerro" /></div>
      <label className="field"><span>Observação</span><input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder="Opcional" /></label>
    </Modal>
  )
}

// ---------------------------------------------------------------- macho

function SecaoMacho({ animal }: { animal: Animal }) {
  const { executar } = useFazenda()
  const inicial = () => ({ avaliacao: animal.avaliacao ?? '', data_avaliacao: animal.data_avaliacao ?? '', peso: animal.peso == null ? '' : String(animal.peso) })
  const [form, setForm] = useState(inicial)
  const [saving, setSaving] = useState(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setForm(inicial()), [animal])
  const changed = JSON.stringify(form) !== JSON.stringify(inicial())

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    await executar((f) => salvarAvaliacao(f, animal.id, {
      avaliacao: form.avaliacao,
      data_avaliacao: form.data_avaliacao || null,
      peso: form.peso === '' ? null : Number(form.peso.replace(',', '.'))
    }))
    setSaving(false)
  }

  return (
    <form className="panel ficha-macho" onSubmit={submit}>
      <div className="panel-head">
        <div><span className="eyebrow">Avaliação do macho</span><h2>Destino padrão: descarte</h2></div>
        <button className="button button-primary button-sm" disabled={!changed || saving || Boolean(animal.saida)}><Save size={15} /> Salvar</button>
      </div>
      <fieldset disabled={Boolean(animal.saida)} className="form-grid">
        <label className="field field-wide"><span>Avaliação</span><input value={form.avaliacao} onChange={(e) => setForm({ ...form, avaliacao: e.target.value })} placeholder="Ex.: bom acabamento, separar para venda" /></label>
        <label className="field"><span>Data da avaliação</span><input type="date" max={hoje()} value={form.data_avaliacao} onChange={(e) => setForm({ ...form, data_avaliacao: e.target.value })} /></label>
        <label className="field"><span>Peso (kg)</span><input inputMode="decimal" value={form.peso} onChange={(e) => setForm({ ...form, peso: e.target.value })} placeholder="Ex.: 420" /></label>
      </fieldset>
    </form>
  )
}
