import { Download, LayoutGrid, List, PawPrint, Plus, Search, Sparkles, Upload } from 'lucide-react'
import { FormEvent, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { type LinhaRebanho, useFazenda } from '../AppContext'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { Escolha, Foto, SituacaoPill } from '../components/rebanho'
import { Modal, PageHeading, Tabs } from '../components/ui'
import { cadastrarAnimal, salvarDados } from '../domain/operacoes'
import { CORES, FAIXAS, RACAS, ativo, hoje, primeiroDisponivel } from '../domain/regras'
import { analyzeAnimalPhoto, type AiVisionResult } from '../services/aiVision'
import { enviarFoto } from '../services/banco'
import type { Faixa, Sexo } from '../types'
import { data, dataCurta } from '../utils/format'

type Aba = 'ativos' | 'F' | 'M' | 'sem' | 'sairam'

const VIEW_KEY = 'pantano.v3.view'

export function Animais() {
  const { linhas, carregando } = useFazenda()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [aba, setAba] = useState<Aba>((params.get('aba') as Aba) || 'ativos')
  const [busca, setBusca] = useState(params.get('busca') ?? '')
  const [faixa, setFaixa] = useState<string>('todas')
  const filtro = params.get('filtro')
  const [view, setView] = useState<'lista' | 'fotos'>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as 'lista' | 'fotos') || 'lista' } catch { return 'lista' }
  })
  const novo = params.get('novo') === '1'

  const counts = useMemo(() => {
    const active = linhas.filter((item) => ativo(item.animal))
    return {
      ativos: active.length,
      F: active.filter((item) => item.animal.sexo === 'F').length,
      M: active.filter((item) => item.animal.sexo === 'M').length,
      sem: active.filter((item) => !item.animal.sexo).length,
      sairam: linhas.length - active.length
    }
  }, [linhas])

  const lista = useMemo(() => {
    const term = busca.trim().toLowerCase().replace(/^x/, '')
    return linhas.filter((item) => {
      const a = item.animal
      if (aba === 'sairam' ? ativo(a) : !ativo(a)) return false
      if (aba === 'F' && a.sexo !== 'F') return false
      if (aba === 'M' && a.sexo !== 'M') return false
      if (aba === 'sem' && a.sexo) return false
      if (faixa !== 'todas' && (faixa === 'sem' ? item.faixa : item.faixa !== faixa)) return false
      if (filtro === 'conferir' && !a.conferencia?.startsWith('Conferir')) return false
      if (filtro === 'sem-faixa' && (item.faixa || !a.sexo)) return false
      if (filtro === 'pendentes' && !item.pendentes) return false
      if (term) {
        const haystack = [a.brinco, a.raca, a.cor, a.observacoes, a.conferencia].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })
  }, [linhas, aba, busca, faixa, filtro])

  function trocarView(next: 'lista' | 'fotos') {
    setView(next)
    try { localStorage.setItem(VIEW_KEY, next) } catch { /* sem armazenamento */ }
  }

  function exportarCsv() {
    const head = ['Brinco', 'Sexo', 'Nascimento', 'Faixa etária', 'Raça', 'Cor', 'Situação', 'Último manejo', 'No IMA', 'Manejos pendentes', 'Observações', 'Conferência da foto']
    const rows = lista.map((item) => [
      item.rotulo, item.animal.sexo ?? '', data(item.animal.nascimento), item.faixa ?? '', item.animal.raca ?? '', item.animal.cor ?? '',
      item.situacao.texto, data(item.ultimoManejo), item.animal.no_ima == null ? '' : item.animal.no_ima ? 'Sim' : 'Não', item.pendentes || '',
      item.animal.observacoes ?? '', item.animal.conferencia ?? ''
    ])
    const csv = [head, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `rebanho-${hoje()}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 2000)
  }

  if (carregando) return <Loading />

  const fecharNovo = () => { params.delete('novo'); setParams(params, { replace: true }) }

  return (
    <>
      <PageHeading
        eyebrow="Rebanho"
        title="Animais"
        text="Toque no animal para abrir a ficha completa. Sexo e faixa podem ser preenchidos direto na lista."
        actions={<>
          <button className="button button-secondary" onClick={() => navigate('/animais/importar')}><Upload size={17} /> Importar</button>
          {counts.sem > 0 && <button className="button button-secondary" onClick={() => navigate('/animais/completar')}><Sparkles size={17} /> Completar cadastro</button>}
          <button className="button button-primary" onClick={() => { params.set('novo', '1'); setParams(params) }}><Plus size={17} /> Cadastrar animal</button>
        </>}
      />

      <Tabs<Aba>
        value={aba}
        onChange={(value) => { setAba(value); params.delete('filtro'); setParams(params, { replace: true }) }}
        items={[
          { value: 'ativos', label: 'Todos', count: counts.ativos },
          { value: 'F', label: 'Fêmeas', count: counts.F },
          { value: 'M', label: 'Machos', count: counts.M },
          { value: 'sem', label: 'Sem sexo', count: counts.sem },
          { value: 'sairam', label: 'Saíram', count: counts.sairam }
        ]}
      />

      <div className="filters-panel filters-lista">
        <label className="search-box"><Search size={18} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Brinco, raça, cor ou observação" inputMode="search" /></label>
        <label className="select-box">
          <select value={faixa} onChange={(e) => setFaixa(e.target.value)} aria-label="Faixa etária">
            <option value="todas">Todas as faixas</option>
            {FAIXAS.map((item) => <option key={item} value={item}>{item} meses</option>)}
            <option value="sem">Sem faixa</option>
          </select>
        </label>
        <div className="view-toggle segmented" role="group" aria-label="Modo de exibição">
          <button type="button" className={view === 'lista' ? 'selected' : ''} onClick={() => trocarView('lista')} aria-label="Lista"><List size={17} /></button>
          <button type="button" className={view === 'fotos' ? 'selected' : ''} onClick={() => trocarView('fotos')} aria-label="Fotos"><LayoutGrid size={17} /></button>
          <button type="button" onClick={exportarCsv} aria-label="Baixar CSV" title="Baixar a lista em CSV (Excel)"><Download size={17} /></button>
        </div>
      </div>

      {filtro && (
        <div className="filtro-ativo">
          Filtro: <strong>{filtro === 'conferir' ? 'fotos para conferir no curral' : filtro === 'sem-faixa' ? 'com sexo mas sem faixa' : filtro === 'pendentes' ? 'com manejo pendente' : filtro}</strong>
          <button className="text-button" onClick={() => { params.delete('filtro'); setParams(params, { replace: true }) }}>Limpar</button>
        </div>
      )}

      <p className="contagem-lista">{lista.length} {lista.length === 1 ? 'animal' : 'animais'}</p>

      {lista.length === 0 ? (
        <EmptyState icon={PawPrint} title="Nenhum animal aqui" text="Ajuste a busca ou os filtros." />
      ) : view === 'fotos' ? (
        <div className="grade-fotos">
          {lista.map((item) => (
            <Link key={item.animal.id} to={`/animais/${item.animal.id}`} className={`cartao-animal ${item.animal.saida ? 'is-baixado' : ''}`}>
              <Foto src={item.animal.foto_url} alt={`Brinco ${item.rotulo}`} size="lg" />
              <div className="cartao-info">
                <strong>{item.rotulo}</strong>
                <span>{item.animal.sexo ?? '—'} · {item.faixa ?? 'sem faixa'}</span>
                <SituacaoPill situacao={item.situacao} curta />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="lista-rebanho">
          {lista.map((item) => <LinhaAnimal key={item.animal.id} item={item} />)}
        </div>
      )}

      {novo && <NovoAnimal onClose={fecharNovo} />}
    </>
  )
}

/** Uma linha da lista, com sexo e faixa editáveis ali mesmo (os campos cinza da planilha). */
function LinhaAnimal({ item }: { item: LinhaRebanho }) {
  const { executar } = useFazenda()
  const navigate = useNavigate()
  const a = item.animal
  const editavel = !a.saida

  const salvar = (patch: { sexo?: Sexo | null; faixa?: Faixa | null }) => void executar((f) => salvarDados(f, a.id, patch), { silencioso: true })

  return (
    <div className={`linha-animal ${a.saida ? 'is-baixado' : ''} ${a.conferencia?.startsWith('Conferir') ? 'is-conferir' : ''}`}>
      <button type="button" className="linha-abrir" onClick={() => navigate(`/animais/${a.id}`)} aria-label={`Abrir ficha do brinco ${item.rotulo}`}>
        <Foto src={a.foto_url} alt={`Brinco ${item.rotulo}`} size="sm" />
        <span className="linha-brinco">{item.rotulo}</span>
      </button>
      <div className="linha-campos">
        {editavel && !a.sexo ? (
          <Escolha<Sexo> value={null} onChange={(sexo) => sexo && salvar({ sexo })} opcoes={['M', 'F']} size="sm" label={`Sexo do ${a.brinco}`} />
        ) : (
          <span className={`sexo-tag sexo-${a.sexo ?? 'x'}`}>{a.sexo ?? '—'}</span>
        )}
        {editavel && !a.nascimento ? (
          <select className="select-mini" value={a.faixa ?? ''} onChange={(e) => salvar({ faixa: (e.target.value || null) as Faixa | null })} aria-label={`Faixa etária do ${a.brinco}`}>
            <option value="">faixa?</option>
            {FAIXAS.map((faixa) => <option key={faixa} value={faixa}>{faixa}</option>)}
          </select>
        ) : (
          <span className="faixa-tag">{item.faixa ?? '—'}</span>
        )}
      </div>
      <button type="button" className="linha-resto" onClick={() => navigate(`/animais/${a.id}`)} tabIndex={-1}>
        <SituacaoPill situacao={item.situacao} />
        <span className="linha-meta">
          {item.ultimoManejo && <span>Manejo {dataCurta(item.ultimoManejo)}</span>}
          {item.pendentes > 0 && <span className="pill tone-red">{item.pendentes} pendente(s)</span>}
          {a.raca && <span>{a.raca}</span>}
          {a.conferencia?.startsWith('Conferir') && <span className="pill tone-amber" title={a.conferencia}>conferir foto</span>}
        </span>
      </button>
    </div>
  )
}

function NovoAnimal({ onClose }: { onClose: () => void }) {
  const { dados, executar } = useFazenda()
  const navigate = useNavigate()
  const sugestao = useMemo(() => primeiroDisponivel(dados), [dados])
  const [form, setForm] = useState({ brinco: '', sexo: null as Sexo | null, nascimento: '', faixa: null as Faixa | null, raca: '', cor: '', observacoes: '' })
  const [foto, setFoto] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => (foto ? URL.createObjectURL(foto) : null), [foto])
  const [leitura, setLeitura] = useState<AiVisionResult | null>(null)
  const [lendo, setLendo] = useState(false)

  async function lerBrinco() {
    if (!preview) return
    setLendo(true)
    try {
      setLeitura(await analyzeAnimalPhoto(preview, dados.animais.filter((item) => !item.saida).map((item) => item.brinco)))
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível ler a foto.')
    } finally {
      setLendo(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    let foto_url: string | null = null
    try {
      if (foto) foto_url = await enviarFoto(foto, form.brinco || 'novo')
    } catch (error) {
      setSaving(false)
      window.alert(error instanceof Error ? error.message : 'Não foi possível enviar a foto.')
      return
    }
    const result = await executar((f) => cadastrarAnimal(f, { ...form, foto_url }))
    setSaving(false)
    if (result) {
      onClose()
      navigate(`/animais/${result.id}`)
    }
  }

  return (
    <Modal
      title="Cadastrar animal"
      eyebrow="Rebanho"
      onClose={onClose}
      onSubmit={submit}
      size="lg"
      footer={<>
        <button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button>
        <button className="button button-primary" disabled={saving || !form.brinco.trim()}>{saving ? 'Salvando…' : 'Cadastrar'}</button>
      </>}
    >
      <div className="novo-animal">
        <button type="button" className="novo-foto" onClick={() => fileRef.current?.click()}>
          {preview ? <img src={preview} alt="Foto do animal" /> : <span>Adicionar foto</span>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { setFoto(e.target.files?.[0] ?? null); setLeitura(null) }} />
        {preview && (
          <div className="leitura-ia">
            <button type="button" className="button button-sm button-secondary" onClick={() => void lerBrinco()} disabled={lendo}>{lendo ? 'Lendo…' : 'Ler o brinco da foto com IA'}</button>
            {leitura && (
              <p>
                {leitura.simulated && <em>Leitura simulada (demonstração). </em>}
                Brinco <strong>{leitura.analysis.numero || '?'}</strong> ({leitura.analysis.numero_confianca}){leitura.analysis.pelagem ? `, pelagem ${leitura.analysis.pelagem}` : ''}.{' '}
                {leitura.analysis.numero && <button type="button" className="text-button" onClick={() => setForm({ ...form, brinco: leitura.analysis.numero })}>Usar este número</button>}
              </p>
            )}
          </div>
        )}
        <div className="form-grid">
          <label className="field required">
            <span>Brinco</span>
            <input value={form.brinco} onChange={(e) => setForm({ ...form, brinco: e.target.value })} autoFocus placeholder="Ex.: 412" />
            {sugestao && <small className="field-hint">Número disponível: <button type="button" className="text-button" onClick={() => setForm({ ...form, brinco: sugestao })}>{sugestao}</button></small>}
          </label>
          <div className="field"><span>Sexo</span><Escolha<Sexo> value={form.sexo} onChange={(sexo) => setForm({ ...form, sexo })} opcoes={[{ value: 'M', label: 'Macho' }, { value: 'F', label: 'Fêmea' }]} label="Sexo" /></div>
          <label className="field"><span>Data de nascimento</span><input type="date" max={hoje()} value={form.nascimento} onChange={(e) => setForm({ ...form, nascimento: e.target.value })} /></label>
          <label className="field"><span>Faixa etária (sem data)</span>
            <select value={form.faixa ?? ''} disabled={Boolean(form.nascimento)} onChange={(e) => setForm({ ...form, faixa: (e.target.value || null) as Faixa | null })}>
              <option value="">{form.nascimento ? 'Calculada pela data' : 'Não informada'}</option>
              {FAIXAS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="field"><span>Raça</span><select value={form.raca} onChange={(e) => setForm({ ...form, raca: e.target.value })}><option value="">—</option>{RACAS.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field"><span>Cor</span><select value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })}><option value="">—</option>{CORES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field field-wide"><span>Observações</span><input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder="Ex.: comprado do vizinho" /></label>
        </div>
      </div>
    </Modal>
  )
}
