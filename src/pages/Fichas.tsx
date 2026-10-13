import { ArrowLeft, Camera, CheckCircle2, FileDown, FilePlus2, NotebookPen, ScanLine } from 'lucide-react'
import { FormEvent, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useFazenda } from '../AppContext'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { Foto } from '../components/rebanho'
import { Modal, PageHeading } from '../components/ui'
import { COLUNAS_PADRAO, type ResultadoFicha, aplicarFicha, colunasRotulo, criarFicha, leituraVazia, linhaTemConteudo } from '../domain/ficha'
import { FAIXAS, GRUPOS_LOTE, type GrupoLote, TIPOS_MANEJO, faixaDoAnimal, hoje, listaDoLote, mesmoBrinco } from '../domain/regras'
import { lerPaginaDaFicha } from '../services/fichaIa'
import type { Animal, ColunasFicha, FichaCampo, LeituraFicha } from '../types'
import { data } from '../utils/format'

async function baixarPdf(ficha: FichaCampo, animais: Animal[]) {
  const { gerarFichaPdf } = await import('../utils/fichaPdf')
  const ordered = ficha.animal_ids.map((id) => animais.find((item) => item.id === id)).filter((item): item is Animal => Boolean(item))
  await gerarFichaPdf(ficha, ordered)
}

/** Fichas de campo: imprimir o checklist, marcar à caneta, fotografar e a IA lança. */
export function Fichas() {
  const { dados, carregando } = useFazenda()
  const navigate = useNavigate()
  const [nova, setNova] = useState(false)
  const [baixando, setBaixando] = useState<string | null>(null)

  if (carregando) return <Loading />
  const fichas = [...dados.fichas].sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <>
      <PageHeading
        eyebrow="Campo e IMA"
        title="Fichas de campo"
        text="Imprima uma ficha com os animais e quadradinhos para marcar com X. No dia da pesagem ou da vacina a equipe marca no curral; depois é só fotografar a folha que a IA lê as marcas e as anotações, e você confere antes de lançar."
        actions={<button className="button button-primary" onClick={() => setNova(true)}><FilePlus2 size={17} /> Nova ficha</button>}
      />
      <div className="ficha-passos">
        <div><span>1</span><strong>Gerar e imprimir</strong><small>Escolha os animais e o que conferir.</small></div>
        <div><span>2</span><strong>Marcar no curral</strong><small>X nos quadradinhos, peso e observação.</small></div>
        <div><span>3</span><strong>Fotografar e conferir</strong><small>A IA lê; você confere e lança.</small></div>
      </div>
      {fichas.length === 0 ? (
        <EmptyState icon={NotebookPen} title="Nenhuma ficha ainda" text="Gere a primeira ficha para o próximo dia de manejo." action={<button className="button button-primary" onClick={() => setNova(true)}>Nova ficha</button>} />
      ) : (
        <div className="panel table-panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Código</th><th>Ficha</th><th>Data</th><th>Animais</th><th>Situação</th><th></th></tr></thead>
              <tbody>
                {fichas.map((ficha) => (
                  <tr key={ficha.id}>
                    <td><strong className="numero-grande">{ficha.codigo}</strong></td>
                    <td>{ficha.titulo}{ficha.manejo && <small className="muted"> · {ficha.manejo}</small>}</td>
                    <td>{data(ficha.data)}</td>
                    <td>{ficha.animal_ids.length}</td>
                    <td>{ficha.aplicada_em ? <span className="pill tone-emerald">lançada em {new Date(ficha.aplicada_em).toLocaleDateString('pt-BR')}</span> : <span className="pill tone-amber">aguardando a folha</span>}</td>
                    <td className="acoes-celula">
                      <button className="button button-sm button-secondary" disabled={baixando === ficha.id} onClick={async () => { setBaixando(ficha.id); try { await baixarPdf(ficha, dados.animais) } finally { setBaixando(null) } }}><FileDown size={14} /> {baixando === ficha.id ? 'Gerando…' : 'PDF'}</button>
                      <button className="button button-sm button-primary" onClick={() => navigate(`/fichas/${ficha.id}`)}><ScanLine size={14} /> Ler folha</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {nova && <NovaFicha onClose={() => setNova(false)} />}
    </>
  )
}

function NovaFicha({ onClose }: { onClose: () => void }) {
  const { dados, executar } = useFazenda()
  const [form, setForm] = useState({ titulo: `Ficha de campo ${data(hoje())}`, data: hoje(), manejo: '', produtos: '' })
  const [grupo, setGrupo] = useState<GrupoLote>('Todo o rebanho')
  const [soIncompletos, setSoIncompletos] = useState(false)
  const [colunas, setColunas] = useState<ColunasFicha>(COLUNAS_PADRAO)
  const [saving, setSaving] = useState(false)

  const grupos = GRUPOS_LOTE.filter((item) => item !== 'Bezerros ao pé' && item !== 'Todo o rebanho + bezerros')
  const ids = useMemo(() => {
    const list = listaDoLote(dados, grupo).filter((item) => item.alvo.tipo === 'animal').map((item) => item.alvo.id)
    if (!soIncompletos) return list
    return list.filter((id) => {
      const animal = dados.animais.find((item) => item.id === id)!
      return !animal.sexo || !faixaDoAnimal(animal)
    })
  }, [dados, grupo, soIncompletos])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const result = await executar((f) => criarFicha(f, { ...form, manejo: form.manejo || null, produtos: form.produtos || null, colunas, animal_ids: ids }))
    if (result) {
      try { await baixarPdf(result.ficha, dados.animais) } catch { /* o PDF pode ser baixado de novo na lista */ }
      onClose()
    }
    setSaving(false)
  }

  return (
    <Modal title="Nova ficha de campo" eyebrow="Imprimir e marcar no curral" onClose={onClose} onSubmit={submit} size="lg"
      footer={<><button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving || !ids.length}><FileDown size={16} /> {saving ? 'Gerando…' : `Criar e baixar PDF (${ids.length} animais)`}</button></>}>
      <div className="form-grid">
        <label className="field field-wide"><span>Título</span><input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></label>
        <label className="field"><span>Data</span><input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></label>
        <label className="field"><span>Manejo do dia (opcional)</span>
          <select value={form.manejo} onChange={(e) => setForm({ ...form, manejo: e.target.value })}>
            <option value="">Nenhum, só conferência</option>
            {TIPOS_MANEJO.map((item) => <option key={item}>{item}</option>)}
          </select>
          <small className="field-hint">Com manejo, a ficha ganha a coluna "Veio": quem não veio fica com o manejo pendente.</small>
        </label>
        {form.manejo && <label className="field field-wide"><span>Produto</span><input value={form.produtos} onChange={(e) => setForm({ ...form, produtos: e.target.value })} placeholder="Ex.: Ivermectina 1%" /></label>}
        <label className="field"><span>Animais</span>
          <select value={grupo} onChange={(e) => setGrupo(e.target.value as GrupoLote)}>
            {grupos.map((item) => <option key={item} value={item}>{/^\d|Acima/.test(item) ? `Faixa ${item} meses` : item}</option>)}
          </select>
        </label>
        <label className="checkbox-linha"><input type="checkbox" checked={soIncompletos} onChange={(e) => setSoIncompletos(e.target.checked)} /><span>Só quem está sem sexo ou sem faixa</span></label>
      </div>
      <div className="field"><span>O que a equipe vai conferir</span>
        <div className="colunas-ficha">
          {(Object.keys(colunasRotulo) as (keyof ColunasFicha)[]).map((key) => (
            <label key={key} className="checkbox-linha"><input type="checkbox" checked={colunas[key]} onChange={(e) => setColunas({ ...colunas, [key]: e.target.checked })} /><span>{colunasRotulo[key]}</span></label>
          ))}
        </div>
        <small className="field-hint">Observação à mão sempre vai. {ids.length} animais = {Math.max(1, Math.ceil(ids.length / 22))} folha(s).</small>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- ler a folha

type Linha = LeituraFicha & { animal: Animal | null; lida: boolean }

export function LerFicha() {
  const { id } = useParams()
  const { dados, carregando, executar, avisar } = useFazenda()
  const navigate = useNavigate()
  const ficha = dados.fichas.find((item) => item.id === id)
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [lendo, setLendo] = useState(0)
  const [simulada, setSimulada] = useState(false)
  const [extras, setExtras] = useState<string[]>([])
  const [resultado, setResultado] = useState<ResultadoFicha[] | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const animaisDaFicha = useMemo(() => (ficha ? ficha.animal_ids.map((aid) => dados.animais.find((item) => item.id === aid)).filter((item): item is Animal => Boolean(item)) : []), [ficha, dados.animais])

  if (carregando) return <Loading />
  if (!ficha) return <EmptyState icon={NotebookPen} title="Ficha não encontrada" text="Volte para a lista de fichas." action={<Link className="button button-primary" to="/fichas">Fichas de campo</Link>} />

  const base = (): Linha[] => leituraVazia(dados, ficha).map((item) => ({ ...item, animal: animaisDaFicha.find((a) => mesmoBrinco(a.brinco, item.brinco)) ?? null, lida: false }))

  async function lerFotos(files: FileList) {
    const brincos = animaisDaFicha.map((item) => item.brinco)
    let current = linhas ?? base()
    const sobras: string[] = []
    setLendo(files.length)
    for (const file of [...files]) {
      try {
        const page = await lerPaginaDaFicha(file, ficha!, brincos, current.filter((item) => !item.lida).map((item) => item.brinco))
        if (page.simulada) setSimulada(true)
        if (page.codigo && ficha && page.codigo.replace(/\s/g, '').toUpperCase() !== ficha.codigo && /F-?\d+/i.test(page.codigo)) {
          avisar(`Atenção: a foto parece ser da ficha ${page.codigo}, não da ${ficha.codigo}.`, 'erro')
        }
        for (const lido of page.linhas) {
          const index = current.findIndex((item) => mesmoBrinco(item.brinco, lido.brinco))
          if (index < 0) { sobras.push(lido.brinco); continue }
          current = current.map((item, i) => (i === index ? { ...item, ...lido, brinco: item.brinco, lida: true } : item))
        }
      } catch (error) {
        avisar(error instanceof Error ? error.message : 'Não foi possível ler a foto.', 'erro')
      }
      setLendo((value) => value - 1)
    }
    setLinhas(current)
    setExtras(sobras)
  }

  const set = (index: number, patch: Partial<Linha>) => setLinhas((current) => current?.map((item, i) => (i === index ? { ...item, ...patch } : item)) ?? null)

  async function aplicar() {
    if (!linhas) return
    setSaving(true)
    let resultados: ResultadoFicha[] = []
    const result = await executar((f) => {
      const r = aplicarFicha(f, ficha!.id, linhas)
      resultados = r.resultados
      return r
    })
    setSaving(false)
    if (result) setResultado(resultados)
  }

  const comConteudo = linhas?.filter((item) => linhaTemConteudo(ficha, item)).length ?? 0
  const duvidas = linhas?.filter((item) => item.lida && item.confianca !== 'alta').length ?? 0
  const c = ficha.colunas

  return (
    <>
      <div className="ficha-nav"><button className="back-button" onClick={() => navigate('/fichas')}><ArrowLeft size={17} /> Fichas de campo</button></div>
      <PageHeading eyebrow={`Ficha ${ficha.codigo} · ${data(ficha.data)}`} title={ficha.titulo} text={`${animaisDaFicha.length} animais${ficha.manejo ? ` · manejo do dia: ${ficha.manejo}${ficha.produtos ? ` (${ficha.produtos})` : ''}` : ''}${ficha.aplicada_em ? ' · já lançada uma vez' : ''}`}
        actions={<button className="button button-secondary" onClick={() => void baixarPdf(ficha, dados.animais)}><FileDown size={16} /> PDF</button>} />

      {resultado ? (
        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Ficha lançada</span><h2>{resultado.filter((item) => item.ok).length} animal(is) atualizado(s){resultado.some((item) => !item.ok) ? `, ${resultado.filter((item) => !item.ok).length} com erro` : ''}</h2></div><Link className="button button-secondary" to="/fichas">Voltar às fichas</Link></div>
          <ul className="resultado-lista">{resultado.map((item, index) => <li key={index} className={item.ok ? 'is-ok' : 'is-erro'}><strong>{item.linha.brinco}</strong><em>{item.texto}</em></li>)}</ul>
        </section>
      ) : (
        <>
          <section className="panel ler-ficha-topo">
            <div>
              <strong>Fotografe cada folha inteira, de cima e com boa luz.</strong>
              <p className="muted">Pode enviar várias folhas de uma vez. A IA lê os X, os pesos e as observações; nada é gravado antes de você conferir.</p>
            </div>
            <div className="ler-ficha-botoes">
              <button className="button button-primary" disabled={lendo > 0} onClick={() => fileRef.current?.click()}><Camera size={17} /> {lendo > 0 ? `Lendo ${lendo} folha(s)…` : 'Enviar foto da folha'}</button>
              {!linhas && <button className="button button-ghost" onClick={() => setLinhas(base())}>Preencher à mão</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { if (e.target.files?.length) void lerFotos(e.target.files); e.target.value = '' }} />
          </section>

          {simulada && <div className="alert alert-warning">Leitura simulada (demonstração sem IA configurada): os valores abaixo são de exemplo.</div>}
          {extras.length > 0 && <div className="alert alert-warning">A IA leu brincos que não estão nesta ficha: {extras.join(', ')}. Eles foram ignorados.</div>}

          {linhas && (
            <section className="panel">
              <div className="panel-head">
                <div><span className="eyebrow">Conferência</span><h2>{comConteudo} linha(s) com algo a lançar</h2></div>
                {duvidas > 0 && <span className="pill tone-amber">{duvidas} linha(s) com dúvida da IA</span>}
              </div>
              <div className="table-wrap">
                <table className="data-table tabela-conferencia">
                  <thead>
                    <tr>
                      <th>Animal</th>
                      {ficha.manejo && <th>Veio</th>}
                      {c.sexo && <th>Sexo</th>}
                      {c.faixa && <th>Faixa</th>}
                      {c.peso && <th>Peso</th>}
                      {c.diagnostico && <th>Prenha/vazia</th>}
                      {c.saida && <th>Saída</th>}
                      <th>Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((linha, index) => (
                      <tr key={linha.brinco} className={linha.lida && linha.confianca !== 'alta' ? 'linha-duvida' : linhaTemConteudo(ficha, linha) ? 'linha-marcada' : ''}>
                        <td><span className="celula-animal"><Foto src={linha.animal?.foto_url} alt={linha.brinco} size="xs" /><strong>{linha.brinco}</strong><small>{linha.animal?.sexo ?? '—'} · {linha.animal ? faixaDoAnimal(linha.animal) ?? 's/ faixa' : ''}</small></span>{linha.lida && linha.confianca !== 'alta' && <small className="texto-aviso">IA: confiança {linha.confianca}</small>}</td>
                        {ficha.manejo && <td><select value={linha.presente == null ? '' : linha.presente ? 's' : 'n'} onChange={(e) => set(index, { presente: e.target.value === '' ? null : e.target.value === 's' })}><option value="">—</option><option value="s">Veio</option><option value="n">Faltou</option></select></td>}
                        {c.sexo && <td><select value={linha.sexo} onChange={(e) => set(index, { sexo: e.target.value as 'M' | 'F' | '' })}><option value="">—</option><option>M</option><option>F</option></select></td>}
                        {c.faixa && <td><select value={linha.faixa} onChange={(e) => set(index, { faixa: e.target.value })}><option value="">—</option>{FAIXAS.map((faixa, i) => <option key={faixa} value={String(i + 1)}>{faixa}</option>)}</select></td>}
                        {c.peso && <td><input className="input-mini" inputMode="decimal" value={linha.peso} onChange={(e) => set(index, { peso: e.target.value })} placeholder="kg" /></td>}
                        {c.diagnostico && <td><select value={linha.diagnostico} onChange={(e) => set(index, { diagnostico: e.target.value as LeituraFicha['diagnostico'] })}><option value="">—</option><option value="prenha">Prenha</option><option value="vazia">Vazia</option></select></td>}
                        {c.saida && <td><select value={linha.saida} onChange={(e) => set(index, { saida: e.target.value as LeituraFicha['saida'] })}><option value="">—</option><option value="morte">Morreu</option><option value="venda">Vendeu</option><option value="descarte">Descarte</option></select></td>}
                        <td><input className="input-obs" value={linha.observacao} onChange={(e) => set(index, { observacao: e.target.value })} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-actions">
                <button className="button button-primary" disabled={saving || !comConteudo} onClick={() => void aplicar()}><CheckCircle2 size={16} /> {saving ? 'Lançando…' : `Lançar ${comConteudo} linha(s)`}</button>
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}

