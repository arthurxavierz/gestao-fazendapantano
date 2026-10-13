import { ArrowLeft, ArrowRight, CheckCircle2, SkipForward } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFazenda } from '../AppContext'
import { Loading } from '../components/Loading'
import { PhotoViewer } from '../components/PhotoViewer'
import { Escolha, Foto } from '../components/rebanho'
import { Progress } from '../components/ui'
import { salvarDados } from '../domain/operacoes'
import { CORES, FAIXAS, RACAS, ativo } from '../domain/regras'
import type { Faixa, Sexo } from '../types'

/**
 * Completar cadastro: um animal por vez, foto grande, botões grandes.
 * É o jeito rápido de preencher sexo e faixa dos 400 animais vindos da
 * planilha, no celular, no curral. Teclado: M, F, 1 a 4, Enter, seta.
 */
export function Completar() {
  const { linhas, carregando, executar } = useFazenda()
  const navigate = useNavigate()
  // A fila é montada uma vez: quem acabou de ser preenchido não some do meio da navegação.
  const [fila, setFila] = useState<string[] | null>(null)
  const [pos, setPos] = useState(0)
  const [form, setForm] = useState({ sexo: null as Sexo | null, faixa: null as Faixa | null, raca: null as string | null, cor: null as string | null })
  const [zoom, setZoom] = useState(false)

  const pendentes = useMemo(() => linhas.filter((item) => ativo(item.animal) && (!item.animal.sexo || !item.faixa)), [linhas])
  const total = useMemo(() => linhas.filter((item) => ativo(item.animal)).length, [linhas])

  useEffect(() => {
    if (!carregando && fila == null) setFila(pendentes.map((item) => item.animal.id))
  }, [carregando, fila, pendentes])

  const atualId = fila?.[pos]
  const atual = linhas.find((item) => item.animal.id === atualId)

  useEffect(() => {
    if (!atual) return
    setForm({ sexo: atual.animal.sexo, faixa: atual.faixa, raca: atual.animal.raca, cor: atual.animal.cor })
    // Só quando troca de animal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atualId])

  // Animal da fila que saiu ou foi apagado enquanto isso: pula.
  useEffect(() => {
    if (fila && pos < fila.length && !atual && !carregando) setPos((value) => value + 1)
  }, [fila, pos, atual, carregando])

  async function salvarEProximo() {
    if (!atual) return
    const patch: Record<string, unknown> = {}
    if (form.sexo !== atual.animal.sexo) patch.sexo = form.sexo
    if (!atual.animal.nascimento && form.faixa !== atual.animal.faixa) patch.faixa = form.faixa
    if (form.raca !== atual.animal.raca) patch.raca = form.raca
    if (form.cor !== atual.animal.cor) patch.cor = form.cor
    if (Object.keys(patch).length) {
      const result = await executar((f) => salvarDados(f, atual.animal.id, patch), { silencioso: true })
      if (!result) return
    }
    setPos((value) => value + 1)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.tagName === 'INPUT' || zoom) return
      const key = event.key.toLowerCase()
      if (key === 'm') setForm((f) => ({ ...f, sexo: 'M' }))
      else if (key === 'f') setForm((f) => ({ ...f, sexo: 'F' }))
      else if (['1', '2', '3', '4'].includes(key)) setForm((f) => ({ ...f, faixa: FAIXAS[Number(key) - 1] }))
      else if (key === 'enter') { event.preventDefault(); void salvarEProximo() }
      else if (key === 'arrowright') setPos((value) => value + 1)
      else if (key === 'arrowleft') setPos((value) => Math.max(0, value - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (carregando || fila == null) return <Loading />

  const feitos = total - pendentes.length

  if (!fila.length || pos >= fila.length) {
    return (
      <div className="completar-fim panel">
        <CheckCircle2 size={44} />
        <h1>{fila.length ? 'Fila concluída' : 'Cadastro completo'}</h1>
        <p>{pendentes.length ? `Ainda faltam ${pendentes.length} animais com sexo ou faixa em branco (os que foram pulados).` : 'Todos os animais ativos têm sexo e faixa etária.'}</p>
        <div className="hero-actions centro">
          {pendentes.length > 0 && <button className="button button-primary" onClick={() => { setFila(pendentes.map((item) => item.animal.id)); setPos(0) }}>Revisar os pulados</button>}
          <Link className="button button-secondary" to="/">Voltar ao painel</Link>
        </div>
      </div>
    )
  }

  if (!atual) return <Loading />

  const a = atual.animal

  return (
    <div className="completar">
      <div className="completar-topo">
        <button className="back-button" onClick={() => navigate(-1)}><ArrowLeft size={17} /> Sair</button>
        <div className="completar-progresso">
          <span>{pos + 1} de {fila.length} · {feitos} de {total} completos</span>
          <Progress value={feitos} max={total} />
        </div>
      </div>

      <div className="completar-corpo">
        <div className="completar-foto">
          <Foto src={a.foto_url} alt={`Brinco ${a.brinco}`} size="lg" onClick={() => setZoom(true)} />
          <div className="completar-brinco"><span>Brinco</span><strong>{a.brinco}</strong></div>
          {a.conferencia && <p className={`completar-conferencia ${a.conferencia.startsWith('Conferir') ? 'is-alerta' : ''}`}>{a.conferencia}</p>}
        </div>

        <div className="completar-campos">
          <div className="field"><span>Sexo <kbd>M</kbd> <kbd>F</kbd></span>
            <Escolha<Sexo> value={form.sexo} onChange={(sexo) => setForm({ ...form, sexo })} opcoes={[{ value: 'M', label: 'Macho' }, { value: 'F', label: 'Fêmea' }]} size="lg" label="Sexo" />
          </div>
          <div className="field"><span>Faixa etária (meses) <kbd>1</kbd>–<kbd>4</kbd></span>
            {a.nascimento
              ? <p className="muted">Calculada pela data de nascimento: <strong>{atual.faixa}</strong></p>
              : <Escolha<Faixa> value={form.faixa} onChange={(faixa) => setForm({ ...form, faixa })} opcoes={FAIXAS} size="md" label="Faixa etária" />}
          </div>
          <div className="field"><span>Raça <small className="muted">(opcional)</small></span>
            <Escolha value={form.raca} onChange={(raca) => setForm({ ...form, raca })} opcoes={RACAS} size="sm" label="Raça" />
          </div>
          <div className="field"><span>Cor <small className="muted">(opcional)</small></span>
            <Escolha value={form.cor} onChange={(cor) => setForm({ ...form, cor })} opcoes={CORES} size="sm" label="Cor" />
          </div>

          <div className="completar-acoes">
            <button className="button button-ghost" onClick={() => setPos((value) => Math.max(0, value - 1))} disabled={pos === 0}><ArrowLeft size={17} /> Anterior</button>
            <button className="button button-secondary" onClick={() => setPos((value) => value + 1)}><SkipForward size={17} /> Pular</button>
            <button className="button button-primary completar-salvar" onClick={() => void salvarEProximo()}>Salvar e próximo <ArrowRight size={17} /></button>
          </div>
          <Link className="text-button" to={`/animais/${a.id}`}>Abrir a ficha completa deste animal</Link>
        </div>
      </div>

      {zoom && a.foto_url && <PhotoViewer src={a.foto_url} alt={`Brinco ${a.brinco}`} caption={`Brinco ${a.brinco}`} onClose={() => setZoom(false)} />}
    </div>
  )
}
