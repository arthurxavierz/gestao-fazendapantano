import { Camera, ClipboardCopy, FileDown, Plus, Send, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useFazenda } from '../AppContext'
import { Loading } from '../components/Loading'
import { PageHeading, Tabs } from '../components/ui'
import { type ResultadoLinha, lancarQuadro } from '../domain/quadro'
import { CODIGOS_QUADRO, type LinhaColada, ativo, bezerroAoPe, hoje, idadeBezerro, lerColagem, lerData, mesmoBrinco, rotuloBrinco } from '../domain/regras'
import { lerFotoDoQuadro } from '../services/quadroIa'
import type { LancamentoQuadro } from '../types'
import { data } from '../utils/format'

const PROMPT_IA = 'Transcreva as anotações à mão desta foto em uma tabela com as colunas Data, Brinco, Código, Detalhe, usando os códigos da legenda do quadro (N nasceu, M morreu, S saiu/vendeu, V vacina, F faltou, P protocolo, D dado, O outro). Uma linha por anotação.'

export function Quadro() {
  const { carregando } = useFazenda()
  const [params, setParams] = useSearchParams()
  const aba = (params.get('aba') as 'imprimir' | 'lancar') || 'imprimir'
  if (carregando) return <Loading />
  return (
    <>
      <PageHeading eyebrow="Campo e IMA" title="Quadro de campo" text="A relação de todos os animais para imprimir grande e pendurar na fazenda. Quem está no campo anota à caneta; depois o que foi anotado é lançado aqui." />
      <Tabs value={aba} onChange={(value) => { params.set('aba', value); setParams(params, { replace: true }) }} items={[{ value: 'imprimir', label: '1. Imprimir o quadro' }, { value: 'lancar', label: '2. Lançar do quadro' }]} />
      {aba === 'imprimir' ? <Imprimir /> : <Lancar />}
    </>
  )
}

// ---------------------------------------------------------------- imprimir

function Imprimir() {
  const { dados, linhas } = useFazenda()
  const [gerando, setGerando] = useState(false)

  const itens = useMemo(() => {
    const animals = linhas.filter((item) => ativo(item.animal)).map((item) => ({
      brinco: item.rotulo, sexo: item.animal.sexo ?? '', faixa: item.faixa ?? '', situacao: item.situacao.curta, pend: item.pendentes
    }))
    const calves = dados.bezerros.filter(bezerroAoPe).map((calf) => {
      const mae = dados.animais.find((item) => item.id === calf.mae_id)
      const pend = dados.manejos.filter((item) => item.bezerro_id === calf.id && item.status === 'Pendente').length
      return { brinco: calf.codigo, sexo: calf.sexo ?? '', faixa: `${idadeBezerro(calf) ?? '?'} m`, situacao: `bezerro de ${mae ? rotuloBrinco(mae) : '?'}`, pend }
    })
    return { animals, calves, all: [...animals, ...calves] }
  }, [dados, linhas])

  async function gerarPdf() {
    setGerando(true)
    try {
      const { gerarQuadroPdf } = await import('../utils/quadroPdf')
      await gerarQuadroPdf(itens.all, itens.animals.length, itens.calves.length)
    } finally {
      setGerando(false)
    }
  }

  return (
    <section className="panel quadro-imprimir">
      <div className="quadro-resumo">
        <div><strong>{itens.animals.length}</strong><span>animais</span></div>
        <div><strong>{itens.calves.length}</strong><span>bezerros ao pé</span></div>
        <div><strong>6</strong><span>blocos + ocorrências</span></div>
      </div>
      <p>O PDF sai num arquivo único, vetorial: a gráfica pode ampliar para o tamanho da lona sem perder qualidade. Cada animal tem brinco, sexo, faixa, situação, pendências e um espaço de <strong>ANOTAÇÃO</strong>. O último bloco é para <strong>OCORRÊNCIAS</strong> sem animal na lista. Imprima de novo de tempos em tempos para atualizar.</p>
      <div className="legenda-codigos">
        {Object.entries(CODIGOS_QUADRO).map(([code, label]) => <span key={code}><b>{code}</b> {label}</span>)}
      </div>
      <div className="form-actions"><button className="button button-primary" onClick={() => void gerarPdf()} disabled={gerando}><FileDown size={17} /> {gerando ? 'Gerando…' : 'Gerar PDF para a gráfica'}</button></div>
    </section>
  )
}

// ---------------------------------------------------------------- lançar

function Lancar() {
  const { dados, executar, salvarExtras, avisar } = useFazenda()
  const [texto, setTexto] = useState('')
  const [manual, setManual] = useState<LinhaColada[]>([])
  const [novo, setNovo] = useState<LinhaColada>({ data: hoje(), brinco: '', codigo: 'V', detalhe: '' })
  const [resultados, setResultados] = useState<ResultadoLinha[] | null>(null)
  const [lendo, setLendo] = useState(false)
  const [lancando, setLancando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const coladas = useMemo(() => lerColagem(texto), [texto])
  const linhas = [...coladas, ...manual]

  function existe(brinco: string) {
    return dados.animais.some((item) => ativo(item) && mesmoBrinco(item.brinco, brinco)) || dados.bezerros.some((item) => mesmoBrinco(item.codigo, brinco))
  }

  async function lancar() {
    if (!linhas.length) return
    setLancando(true)
    const padrao = hoje()
    let saida: ResultadoLinha[] = []
    const result = await executar((f) => {
      const r = lancarQuadro(f, linhas, padrao)
      saida = r.resultados
      const ok = r.resultados.filter((item) => item.ok).length
      return { ops: r.ops, mensagem: `${ok} linha(s) lançada(s)${r.resultados.length - ok ? `, ${r.resultados.length - ok} com erro (veja o resultado)` : ''}.` }
    })
    setLancando(false)
    if (!result) return
    setResultados(saida)
    const registros: LancamentoQuadro[] = saida.map((item) => ({
      id: crypto.randomUUID(), data: item.linha.data, brinco: item.linha.brinco, codigo: item.linha.codigo, detalhe: item.linha.detalhe || null,
      resultado: item.texto, ok: item.ok, created_at: new Date().toISOString()
    }))
    await salvarExtras('quadro', registros)
    // Linhas lançadas saem da caixa; as com erro ficam para corrigir.
    const comErro = saida.filter((item) => !item.ok).map((item) => item.linha)
    setTexto(comErro.map((item) => [item.data ? data(item.data) : '', item.brinco, item.codigo, item.detalhe].join('\t')).join('\n'))
    setManual([])
  }

  async function lerFoto(file: File) {
    setLendo(true)
    try {
      const rows = await lerFotoDoQuadro(file, dados.animais.filter(ativo).map((item) => item.brinco))
      if (!rows.length) avisar('A IA não encontrou anotações legíveis na foto.', 'erro')
      setTexto((current) => [current.trim(), ...rows.map((item) => [item.data, item.brinco, item.codigo, item.detalhe].join('\t'))].filter(Boolean).join('\n'))
    } catch (error) {
      avisar(error instanceof Error ? error.message : 'Não foi possível ler a foto.', 'erro')
    } finally {
      setLendo(false)
    }
  }

  return (
    <>
      <section className="panel lancar-panel">
        <div className="panel-head"><div><span className="eyebrow">Do quadro para o sistema</span><h2>Cole, fotografe ou digite as anotações</h2></div></div>
        <div className="lancar-opcoes">
          <button className="button button-secondary" onClick={() => fileRef.current?.click()} disabled={lendo}><Camera size={17} /> {lendo ? 'Lendo a foto…' : 'Ler foto do quadro com IA'}</button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void lerFoto(file); e.target.value = '' }} />
          <button className="button button-ghost" onClick={() => { void navigator.clipboard?.writeText(PROMPT_IA); avisar('Instrução copiada. Cole no ChatGPT ou Claude junto com a foto.') }}><ClipboardCopy size={16} /> Copiar instrução para outra IA</button>
        </div>
        <label className="field">
          <span>Colar tabela (Data, Brinco, Código, Detalhe)</span>
          <textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={'05/10/2026\t149\tV\taftosa\n05/10/2026\t87\tN\tfêmea\n06/10/2026\t230\tP\tprenha'} className="mono" />
        </label>
        <div className="lancar-manual">
          <input type="date" value={novo.data ?? ''} onChange={(e) => setNovo({ ...novo, data: e.target.value })} aria-label="Data" />
          <input value={novo.brinco} onChange={(e) => setNovo({ ...novo, brinco: e.target.value })} placeholder="Brinco" aria-label="Brinco" />
          <select value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} aria-label="Código">
            {Object.entries(CODIGOS_QUADRO).map(([code, label]) => <option key={code} value={code}>{code} · {label}</option>)}
          </select>
          <input value={novo.detalhe} onChange={(e) => setNovo({ ...novo, detalhe: e.target.value })} placeholder="Detalhe" aria-label="Detalhe" />
          <button className="button button-secondary" disabled={!novo.brinco.trim()} onClick={() => { setManual([...manual, { ...novo, data: lerData(novo.data), brinco: novo.brinco.trim() }]); setNovo({ ...novo, brinco: '', detalhe: '' }) }}><Plus size={16} /> Adicionar</button>
        </div>

        {linhas.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Data</th><th>Brinco</th><th>Código</th><th>Detalhe</th><th>Conferência</th><th></th></tr></thead>
              <tbody>
                {linhas.map((item, index) => {
                  const okCode = item.codigo in CODIGOS_QUADRO
                  const okBrinco = existe(item.brinco)
                  return (
                    <tr key={index}>
                      <td>{item.data ? data(item.data) : <span className="muted">hoje</span>}</td>
                      <td><strong>{item.brinco}</strong></td>
                      <td>{item.codigo} <small className="muted">{CODIGOS_QUADRO[item.codigo] ?? ''}</small></td>
                      <td>{item.detalhe}</td>
                      <td>{!okCode ? <span className="pill tone-red">código inválido</span> : !okBrinco ? <span className="pill tone-red">brinco não encontrado</span> : <span className="pill tone-emerald">ok</span>}</td>
                      <td>{index >= coladas.length && <button className="icon-button" onClick={() => setManual(manual.filter((_, i) => i !== index - coladas.length))} aria-label="Remover"><Trash2 size={15} /></button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="form-actions"><button className="button button-primary" onClick={() => void lancar()} disabled={!linhas.length || lancando}><Send size={16} /> {lancando ? 'Lançando…' : `Lançar no sistema (${linhas.length})`}</button></div>
      </section>

      {resultados && (
        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Resultado</span><h2>{resultados.filter((item) => item.ok).length} lançada(s), {resultados.filter((item) => !item.ok).length} com erro</h2></div></div>
          <ul className="resultado-lista">
            {resultados.map((item, index) => <li key={index} className={item.ok ? 'is-ok' : 'is-erro'}><strong>{item.linha.brinco} · {item.linha.codigo}</strong> {item.linha.detalhe && <span>{item.linha.detalhe}</span>}<em>{item.texto}</em></li>)}
          </ul>
          {resultados.some((item) => !item.ok) && <p className="muted">As linhas com erro voltaram para a caixa acima: corrija e lance de novo.</p>}
        </section>
      )}

      {dados.quadro.length > 0 && (
        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Histórico</span><h2>Últimos lançamentos do quadro</h2></div></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Lançado em</th><th>Data</th><th>Brinco</th><th>Código</th><th>Detalhe</th><th>Resultado</th></tr></thead>
              <tbody>
                {dados.quadro.slice(0, 60).map((item) => (
                  <tr key={item.id} className={item.ok ? '' : 'linha-pendente'}>
                    <td>{new Date(item.created_at).toLocaleDateString('pt-BR')}</td><td>{data(item.data)}</td><td>{item.brinco}</td><td>{item.codigo}</td><td>{item.detalhe}</td><td>{item.resultado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
