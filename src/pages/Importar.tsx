import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, ImagePlus, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useFazenda } from '../AppContext'
import { Loading } from '../components/Loading'
import { PageHeading, Progress, Tabs } from '../components/ui'
import { salvarDados } from '../domain/operacoes'
import { type CampoImport, type LinhaImport, type Mapa, type ResultadoImport, adivinharColunas, brincoDoArquivo, campoRotulo, importar, previa } from '../domain/importacao'
import { ativo, hoje } from '../domain/regras'
import { FOTO_IGUAL, distanciaHash } from '../domain/revisao'
import { enviarFotoComHash, hashFoto, reduzirFoto } from '../services/banco'
import type { Animal } from '../types'
import { type SheetData, readSpreadsheet } from '../utils/spreadsheet'

/** Importação em massa: planilha de animais e fotos em lote. */
export function Importar() {
  const { carregando } = useFazenda()
  const [params, setParams] = useSearchParams()
  const aba = (params.get('aba') as 'planilha' | 'fotos') || 'planilha'
  if (carregando) return <Loading />
  return (
    <>
      <PageHeading eyebrow="Rebanho" title="Importar animais" text="Cadastre ou atualize vários animais de uma vez por uma planilha, e envie as fotos em lote. Antes de gravar, você vê o que acontece com cada linha." actions={<Link className="button button-secondary" to="/revisao">Revisão de duplicados</Link>} />
      <Tabs value={aba} onChange={(value) => { params.set('aba', value); setParams(params, { replace: true }) }} items={[{ value: 'planilha', label: 'Planilha', icon: FileSpreadsheet }, { value: 'fotos', label: 'Fotos em lote', icon: ImagePlus }]} />
      {aba === 'planilha' ? <ImportarPlanilha /> : <ImportarFotos />}
    </>
  )
}

const tipoRotulo = { novo: 'Novo', atualiza: 'Atualiza', igual: 'Sem mudança', erro: 'Erro' }
const tipoTom = { novo: 'emerald', atualiza: 'blue', igual: 'slate', erro: 'red' }

function ImportarPlanilha() {
  const { dados, executar } = useFazenda()
  const [sheet, setSheet] = useState<SheetData | null>(null)
  const [arquivo, setArquivo] = useState('')
  const [mapa, setMapa] = useState<Mapa | null>(null)
  const [sobrescrever, setSobrescrever] = useState(false)
  const [filtro, setFiltro] = useState<'todos' | 'novo' | 'atualiza' | 'erro' | 'avisos'>('todos')
  const [erro, setErro] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImport[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const linhas = useMemo<LinhaImport[]>(() => (sheet && mapa && mapa.brinco != null ? previa(dados, sheet.rows, mapa, sobrescrever) : []), [dados, sheet, mapa, sobrescrever])
  const conta = (tipo: string) => linhas.filter((item) => item.tipo === tipo).length
  const comAviso = linhas.filter((item) => item.avisos.length).length
  const visiveis = linhas.filter((item) => filtro === 'todos' || (filtro === 'avisos' ? item.avisos.length : item.tipo === filtro))

  async function abrir(file: File) {
    setErro(null); setResultado(null)
    try {
      const data = await readSpreadsheet(file)
      if (!data.rows.length) throw new Error('A planilha não tem linhas de dados.')
      setSheet(data)
      setArquivo(file.name)
      setMapa(adivinharColunas(data.headers))
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível ler a planilha.')
    }
  }

  async function gravar() {
    setSaving(true)
    let resultados: ResultadoImport[] = []
    const result = await executar((f) => {
      const r = importar(f, linhas, sobrescrever)
      resultados = r.resultados
      return r
    })
    setSaving(false)
    if (result) {
      setResultado(resultados)
      setSheet(null)
    }
  }

  function baixarModelo() {
    const head = ['Brinco', 'Sexo', 'Data nasc.', 'Faixa etária (meses)', 'Raça', 'Cor', 'No IMA?', 'Observações', 'Saída', 'Data da saída']
    const exemplo = [['412', 'F', '10/03/2024', '', 'Nelore', 'Branca', 'Sim', 'Comprada do vizinho', '', ''], ['413', 'M', '', '13 a 24', 'Cruzado', 'Vermelha', '', '', '', ''], ['149', '', '', '', '', '', '', '', 'Venda', `${hoje().split('-').reverse().join('/')}`]]
    const csv = [head, ...exemplo].map((row) => row.map((cell) => `"${cell}"`).join(';')).join('\r\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    link.download = 'modelo-importacao-rebanho.csv'
    link.click()
  }

  if (resultado) {
    const ok = resultado.filter((item) => item.ok)
    return (
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">Importação concluída</span><h2>{ok.length} gravado(s){resultado.length - ok.length ? `, ${resultado.length - ok.length} com erro` : ''}</h2></div>
          <button className="button button-secondary" onClick={() => setResultado(null)}>Importar outra planilha</button></div>
        <ul className="resultado-lista">
          {resultado.map((item) => <li key={item.linha.numero} className={item.ok ? 'is-ok' : 'is-erro'}><strong>{item.linha.dados.brinco}</strong><em>{item.ok ? item.texto : `ERRO: ${item.texto}`}</em></li>)}
        </ul>
        <p className="muted">Animais novos com número parecido com outro aparecem em <Link to="/revisao">Revisão de duplicados</Link>.</p>
      </section>
    )
  }

  return (
    <>
      {!sheet ? (
        <section className="panel">
          <button type="button" className="import-drop" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void abrir(file) }}>
            <Upload size={28} />
            <strong>Escolha ou arraste a planilha</strong>
            <span>Excel (.xlsx, inclusive a Gado_Rebanho_Fazenda) ou CSV. Precisa ter a coluna Brinco; as outras são opcionais.</span>
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv,.txt" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void abrir(file); e.target.value = '' }} />
          {erro && <div className="alert alert-error">{erro}</div>}
          <div className="import-dicas">
            <p><strong>Como funciona:</strong> brinco que já existe é <strong>atualizado</strong>; brinco novo é <strong>cadastrado</strong>. Célula vazia não apaga nada. Uma coluna Saída com Venda, Morte ou Descarte dá a baixa.</p>
            <button className="button button-ghost" onClick={baixarModelo}><Download size={16} /> Baixar planilha modelo</button>
          </div>
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">{arquivo}</span><h2>{sheet.rows.length} linha(s) · confira as colunas</h2></div>
              <button className="button button-ghost" onClick={() => setSheet(null)}>Trocar arquivo</button>
            </div>
            <div className="mapa-colunas">
              {(Object.keys(campoRotulo) as CampoImport[]).map((campo) => (
                <label key={campo} className={`field ${campo === 'brinco' ? 'required' : ''}`}>
                  <span>{campoRotulo[campo]}</span>
                  <select value={mapa?.[campo] ?? ''} onChange={(e) => setMapa((current) => ({ ...current!, [campo]: e.target.value === '' ? null : Number(e.target.value) }))}>
                    <option value="">— não importar —</option>
                    {sheet.headers.map((header, index) => <option key={index} value={index}>{header || `Coluna ${index + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <label className="checkbox-linha">
              <input type="checkbox" checked={sobrescrever} onChange={(e) => setSobrescrever(e.target.checked)} />
              <span><strong>Trocar dados que já existem</strong> pelos da planilha. Desmarcado, só completa o que está vazio.</span>
            </label>
          </section>

          {mapa?.brinco == null ? <div className="alert alert-error"><AlertTriangle size={18} /><div>Escolha qual coluna é o brinco.</div></div> : (
            <section className="panel">
              <div className="import-resumo">
                {(['todos', 'novo', 'atualiza', 'erro', 'avisos'] as const).map((key) => (
                  <button key={key} className={`import-chip ${filtro === key ? 'selected' : ''}`} onClick={() => setFiltro(key)}>
                    <strong>{key === 'todos' ? linhas.length : key === 'avisos' ? comAviso : conta(key)}</strong>
                    <span>{key === 'todos' ? 'linhas' : key === 'avisos' ? 'com aviso' : key === 'novo' ? 'novos' : key === 'atualiza' ? 'atualizações' : 'com erro'}</span>
                  </button>
                ))}
                <span className="muted">{conta('igual')} sem mudança</span>
              </div>
              <div className="table-wrap import-tabela">
                <table className="data-table">
                  <thead><tr><th>Linha</th><th>Brinco</th><th>O que acontece</th><th>Detalhes</th></tr></thead>
                  <tbody>
                    {visiveis.slice(0, 400).map((item) => (
                      <tr key={item.numero}>
                        <td>{item.numero}</td>
                        <td><strong>{item.dados.brinco || '—'}</strong></td>
                        <td><span className={`pill tone-${tipoTom[item.tipo]}`}>{tipoRotulo[item.tipo]}</span></td>
                        <td className="celula-obs"><div className="detalhes-import">
                          {item.erro && <span className="texto-erro">{item.erro}</span>}
                          {item.tipo === 'novo' && <span>{[item.dados.sexo, item.dados.faixa, item.dados.raca, item.dados.cor].filter(Boolean).join(' · ') || 'só o brinco'}</span>}
                          {item.mudancas.length > 0 && <span>{item.mudancas.join('; ')}</span>}
                          {item.avisos.map((aviso) => <span key={aviso} className="texto-aviso">⚠ {aviso}</span>)}
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-actions">
                <button className="button button-primary" disabled={saving || !(conta('novo') + conta('atualiza'))} onClick={() => void gravar()}>
                  {saving ? 'Gravando…' : `Gravar ${conta('novo')} novo(s) e ${conta('atualiza')} atualização(ões)`}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}

interface ItemFoto {
  file: File
  preview: string
  brinco: string
  animal: Animal | null
  parecido: string | null
  status: 'pronto' | 'enviando' | 'ok' | 'erro'
  erro?: string
}

function ImportarFotos() {
  const { dados, executar } = useFazenda()
  const [itens, setItens] = useState<ItemFoto[]>([])
  const [substituir, setSubstituir] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const ativos = useMemo(() => dados.animais.filter(ativo), [dados.animais])

  async function escolher(files: FileList | File[]) {
    const list = [...files].filter((file) => file.type.startsWith('image/'))
    const novos: ItemFoto[] = []
    for (const file of list) {
      const animal = brincoDoArquivo(file.name, dados)
      const small = await reduzirFoto(file, 360)
      const hash = await hashFoto(small)
      // Foto quase igual à de outro animal: provavelmente é o mesmo bicho.
      const parecido = hash ? ativos.find((item) => item.id !== animal?.id && (distanciaHash(item.foto_hash, hash) ?? 99) <= FOTO_IGUAL) : undefined
      novos.push({ file, preview: URL.createObjectURL(small), brinco: animal?.brinco ?? '', animal, parecido: parecido?.brinco ?? null, status: 'pronto' })
    }
    setItens((current) => [...current, ...novos])
  }

  function trocarBrinco(index: number, brinco: string) {
    setItens((current) => current.map((item, i) => (i === index ? { ...item, brinco, animal: brincoDoArquivo(brinco, dados) } : item)))
  }

  async function enviar() {
    setEnviando(true)
    for (let index = 0; index < itens.length; index += 1) {
      const item = itens[index]
      if (item.status === 'ok' || !item.animal) continue
      if (item.animal.foto_url && !substituir) continue
      setItens((current) => current.map((x, i) => (i === index ? { ...x, status: 'enviando' } : x)))
      try {
        const { url, hash } = await enviarFotoComHash(item.file, item.animal.brinco)
        const result = await executar((f) => salvarDados(f, item.animal!.id, { foto_url: url, foto_hash: hash }), { silencioso: true })
        if (!result) throw new Error('não salvou')
        setItens((current) => current.map((x, i) => (i === index ? { ...x, status: 'ok' } : x)))
      } catch (error) {
        setItens((current) => current.map((x, i) => (i === index ? { ...x, status: 'erro', erro: error instanceof Error ? error.message : 'falhou' } : x)))
      }
    }
    setEnviando(false)
  }

  const prontos = itens.filter((item) => item.animal && item.status !== 'ok' && (!item.animal.foto_url || substituir)).length
  const feitos = itens.filter((item) => item.status === 'ok').length

  return (
    <section className="panel">
      <button type="button" className="import-drop" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void escolher(e.dataTransfer.files) }}>
        <ImagePlus size={28} />
        <strong>Escolha ou arraste as fotos</strong>
        <span>O nome do arquivo diz de qual animal é: <code>149.jpg</code>, <code>brinco 149.jpg</code> ou <code>028_149.jpg</code>. Dá para corrigir o brinco de cada foto antes de enviar.</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void escolher(e.target.files); e.target.value = '' }} />

      {itens.length > 0 && (
        <>
          <div className="fotos-barra">
            <label className="checkbox-linha"><input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} /><span>Substituir a foto de quem já tem foto</span></label>
            {enviando && <Progress value={feitos} max={feitos + prontos} />}
            <button className="button button-primary" disabled={enviando || !prontos} onClick={() => void enviar()}><Upload size={16} /> {enviando ? 'Enviando…' : `Enviar ${prontos} foto(s)`}</button>
          </div>
          <div className="fotos-lote">
            {itens.map((item, index) => (
              <div key={index} className={`foto-item is-${item.status} ${!item.animal ? 'sem-animal' : ''}`}>
                <img src={item.preview} alt={item.file.name} />
                <small className="foto-nome">{item.file.name}</small>
                <input value={item.brinco} onChange={(e) => trocarBrinco(index, e.target.value)} placeholder="Brinco" disabled={item.status === 'ok'} />
                {!item.animal && <span className="texto-erro">brinco não encontrado</span>}
                {item.animal?.foto_url && !substituir && item.status !== 'ok' && <span className="texto-aviso">já tem foto</span>}
                {item.parecido && <span className="texto-aviso">⚠ parece a foto do {item.parecido}</span>}
                {item.status === 'ok' && <span className="texto-ok"><CheckCircle2 size={14} /> enviada</span>}
                {item.status === 'erro' && <span className="texto-erro">{item.erro}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
