import { AlertTriangle, ArrowLeft, Baby, Save, UserPlus } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useFazenda } from '../AppContext'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { Escolha, HistoricoManejos, NovoManejo, tomPill } from '../components/rebanho'
import { Modal, PageHeading, Tabs } from '../components/ui'
import { checarIncorporacao, incorporarBezerro, salvarBezerro } from '../domain/operacoes'
import { MESES_BEZERRO, SITUACOES_BEZERRO, avisoBezerro, bezerroAoPe, bezerroEncerrado, hoje, idadeBezerro, pendentesDe, rotuloBrinco, ultimoManejo } from '../domain/regras'
import type { Bezerro, Sexo, SituacaoBezerro } from '../types'
import { data, dataCurta } from '../utils/format'

type Filtro = 'ao-pe' | 'sem-destino' | 'prontos' | 'todos' | 'encerrados'

export function Bezerros() {
  const { dados, carregando } = useFazenda()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [incorporar, setIncorporar] = useState<Bezerro | null>(null)
  const filtro = (params.get('filtro') as Filtro) || 'ao-pe'

  const linhas = useMemo(() => dados.bezerros.map((calf) => ({
    calf,
    mae: dados.animais.find((item) => item.id === calf.mae_id),
    idade: idadeBezerro(calf),
    aviso: avisoBezerro(calf),
    ultimo: ultimoManejo(dados.manejos, { tipo: 'bezerro', id: calf.id }),
    pendentes: pendentesDe(dados.manejos, { tipo: 'bezerro', id: calf.id })
  })).sort((a, b) => (b.calf.nascimento ?? '').localeCompare(a.calf.nascimento ?? '')), [dados])

  const counts = {
    'ao-pe': linhas.filter((item) => bezerroAoPe(item.calf)).length,
    'sem-destino': linhas.filter((item) => item.aviso?.semDestino).length,
    prontos: linhas.filter((item) => item.aviso?.pronto).length,
    todos: linhas.length,
    encerrados: linhas.filter((item) => bezerroEncerrado(item.calf) || item.calf.situacao === 'Incorporado ao rebanho').length
  }

  const lista = linhas.filter((item) => {
    if (filtro === 'ao-pe') return bezerroAoPe(item.calf)
    if (filtro === 'sem-destino') return item.aviso?.semDestino
    if (filtro === 'prontos') return item.aviso?.pronto
    if (filtro === 'encerrados') return bezerroEncerrado(item.calf) || item.calf.situacao === 'Incorporado ao rebanho'
    return true
  })

  if (carregando) return <Loading />

  return (
    <>
      <PageHeading eyebrow="Rebanho" title="Bezerros" text={`Até o ${MESES_BEZERRO}º mês o bezerro fica ligado à mãe. Depois, defina o destino; se ficou na fazenda, incorpore ao rebanho com um brinco definitivo.`} />
      <Tabs<Filtro>
        value={filtro}
        onChange={(value) => { params.set('filtro', value); setParams(params, { replace: true }) }}
        items={[
          { value: 'ao-pe', label: 'Ao pé', count: counts['ao-pe'] },
          { value: 'sem-destino', label: 'Sem destino (8+ meses)', count: counts['sem-destino'] },
          { value: 'prontos', label: 'Prontos para incorporar', count: counts.prontos },
          { value: 'encerrados', label: 'Saíram ou incorporados', count: counts.encerrados },
          { value: 'todos', label: 'Todos', count: counts.todos }
        ]}
      />

      {lista.length === 0 ? (
        <EmptyState icon={Baby} title={linhas.length ? 'Nenhum bezerro aqui' : 'Nenhum bezerro registrado'} text={linhas.length ? 'Escolha outra aba.' : 'Os bezerros entram pelo botão Registrar parto, na ficha da vaca.'} />
      ) : (
        <div className="panel table-panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Bezerro</th><th>Mãe</th><th>Nascimento</th><th>Sexo</th><th>Idade</th><th>Situação</th><th>Aviso</th><th>Último manejo</th><th></th></tr></thead>
              <tbody>
                {lista.map((item) => (
                  <tr key={item.calf.id} onClick={() => navigate(item.calf.animal_id ? `/animais/${item.calf.animal_id}` : `/bezerros/${item.calf.id}`)} className={bezerroEncerrado(item.calf) ? 'linha-baixada' : ''}>
                    <td><strong>{item.calf.codigo}</strong></td>
                    <td>{item.mae ? rotuloBrinco(item.mae) : '—'}</td>
                    <td>{data(item.calf.nascimento)}</td>
                    <td>{item.calf.sexo ?? '—'}</td>
                    <td>{item.idade == null ? '—' : `${item.idade} m`}</td>
                    <td>{item.calf.situacao}</td>
                    <td>{item.aviso && <span className={tomPill(item.aviso.tom)}>{item.aviso.texto}</span>}{item.pendentes > 0 && <span className="pill tone-red">{item.pendentes} pendente(s)</span>}</td>
                    <td>{item.ultimo ? dataCurta(item.ultimo) : '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {item.calf.situacao === 'Ficou na fazenda' && <button className="button button-sm button-primary" onClick={() => setIncorporar(item.calf)}><UserPlus size={14} /> Incorporar</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {incorporar && <IncorporarModal bezerro={incorporar} onClose={() => setIncorporar(null)} />}
    </>
  )
}

export function IncorporarModal({ bezerro, onClose }: { bezerro: Bezerro; onClose: () => void }) {
  const { dados, executar } = useFazenda()
  const navigate = useNavigate()
  const check = useMemo(() => checarIncorporacao(dados, bezerro.id), [dados, bezerro.id])
  const [brinco, setBrinco] = useState(check.sugestao ?? '')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const result = await executar((f) => incorporarBezerro(f, bezerro.id, brinco))
    setSaving(false)
    if (result) {
      onClose()
      navigate(`/animais/${result.animalId}`)
    }
  }

  return (
    <Modal title={`Incorporar ${bezerro.codigo} ao rebanho`} eyebrow="Bezerro que ficou na fazenda" onClose={onClose} onSubmit={submit}
      footer={<><button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving || !brinco.trim() || !bezerro.sexo}>{saving ? 'Incorporando…' : 'Incorporar'}</button></>}>
      {check.antesDoMes && <div className="alert alert-warning"><AlertTriangle size={18} /><div>O bezerro tem {check.idade ?? '?'} meses: ainda não chegou no {MESES_BEZERRO}º mês. Pode incorporar mesmo assim.</div></div>}
      {!bezerro.sexo && <div className="alert alert-error"><AlertTriangle size={18} /><div>Falta informar o sexo do bezerro. Preencha na ficha dele antes.</div></div>}
      <p className="muted">Ele vira um animal da lista, com sexo, nascimento e a observação “filho da vaca”. Os manejos já lançados vão junto.</p>
      <label className="field required">
        <span>Brinco definitivo</span>
        <input value={brinco} onChange={(e) => setBrinco(e.target.value)} autoFocus />
        {check.sugestao && <small className="field-hint">Sugestão: {check.sugestao} (número disponível)</small>}
      </label>
    </Modal>
  )
}

export function FichaBezerro() {
  const { id } = useParams()
  const { dados, carregando, executar } = useFazenda()
  const navigate = useNavigate()
  const calf = dados.bezerros.find((item) => item.id === id)
  const inicial = () => ({
    sexo: calf?.sexo ?? null,
    nascimento: calf?.nascimento ?? '',
    situacao: calf?.situacao ?? 'Mamando',
    data_destino: calf?.data_destino ?? '',
    brinco_definitivo: calf?.brinco_definitivo ?? '',
    observacoes: calf?.observacoes ?? ''
  })
  const [form, setForm] = useState(inicial)
  const [saving, setSaving] = useState(false)
  const [incorporar, setIncorporar] = useState(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setForm(inicial()), [calf])

  if (carregando) return <Loading />
  if (!calf) return <EmptyState icon={Baby} title="Bezerro não encontrado" text="Ele pode ter sido incorporado ou o link está errado." action={<Link className="button button-primary" to="/bezerros">Ver bezerros</Link>} />

  const mae = dados.animais.find((item) => item.id === calf.mae_id)
  const aviso = avisoBezerro(calf)
  const changed = JSON.stringify(form) !== JSON.stringify(inicial())
  const travado = calf.situacao === 'Incorporado ao rebanho'

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    await executar((f) => salvarBezerro(f, calf!.id, { ...form, sexo: form.sexo as Sexo | null, situacao: form.situacao as SituacaoBezerro }))
    setSaving(false)
  }

  return (
    <div className="ficha">
      <div className="ficha-nav">
        <button className="back-button" onClick={() => navigate(-1)}><ArrowLeft size={17} /> Voltar</button>
        {mae && <Link className="text-button" to={`/animais/${mae.id}`}>Abrir a mãe ({rotuloBrinco(mae)})</Link>}
      </div>
      <section className="panel ficha-topo ficha-topo-bezerro">
        <div className="ficha-titulo">
          <span className="eyebrow">Bezerro ao pé da vaca {mae ? rotuloBrinco(mae) : '?'}</span>
          <h1>{calf.codigo}</h1>
          <div className="ficha-tags">
            <span className="pill tone-slate">{calf.situacao}</span>
            {idadeBezerro(calf) != null && <span className="pill tone-slate">{idadeBezerro(calf)} meses</span>}
            {aviso && <span className={tomPill(aviso.tom)}>{aviso.texto}</span>}
          </div>
          {calf.situacao === 'Ficou na fazenda' && <div className="ficha-acoes"><button className="button button-primary" onClick={() => setIncorporar(true)}><UserPlus size={16} /> Incorporar ao rebanho</button></div>}
        </div>
      </section>

      <div className="ficha-grid">
        <form className="panel ficha-dados" onSubmit={submit}>
          <div className="panel-head">
            <div><span className="eyebrow">Dados do bezerro</span><h2>Situação e destino</h2></div>
            <button className="button button-primary button-sm" disabled={!changed || saving || travado}><Save size={15} /> Salvar</button>
          </div>
          <fieldset disabled={travado} className="form-grid">
            <div className="field"><span>Sexo</span><Escolha<Sexo> value={form.sexo} onChange={(sexo) => setForm({ ...form, sexo })} opcoes={[{ value: 'M', label: 'Macho' }, { value: 'F', label: 'Fêmea' }]} label="Sexo" /></div>
            <label className="field"><span>Data de nascimento</span><input type="date" max={hoje()} value={form.nascimento} onChange={(e) => setForm({ ...form, nascimento: e.target.value })} /></label>
            <label className="field"><span>Situação</span>
              <select value={form.situacao} onChange={(e) => setForm({ ...form, situacao: e.target.value as SituacaoBezerro })}>
                {SITUACOES_BEZERRO.map((item) => <option key={item}>{item}</option>)}
                {travado && <option>Incorporado ao rebanho</option>}
              </select>
            </label>
            <label className="field"><span>Data do destino</span><input type="date" max={hoje()} value={form.data_destino} onChange={(e) => setForm({ ...form, data_destino: e.target.value })} /></label>
            <label className="field"><span>Brinco definitivo</span><input value={form.brinco_definitivo} onChange={(e) => setForm({ ...form, brinco_definitivo: e.target.value })} placeholder="Quando ficar na fazenda" /></label>
            <label className="field field-wide"><span>Observações</span><textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></label>
          </fieldset>
        </form>
        <section className="panel ficha-span">
          <div className="panel-head"><div><span className="eyebrow">Histórico de manejo</span><h2>Manejos deste bezerro</h2></div></div>
          {!travado && !bezerroEncerrado(calf) && <NovoManejo alvo={{ tipo: 'bezerro', id: calf.id }} />}
          <HistoricoManejos alvo={{ tipo: 'bezerro', id: calf.id }} />
        </section>
      </div>
      {incorporar && <IncorporarModal bezerro={calf} onClose={() => setIncorporar(false)} />}
    </div>
  )
}
