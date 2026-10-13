import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { type Op, Recusa, aplicar } from './domain/operacoes'
import { type Alvo, type Fazenda, type Situacao, ativo, faixaDoAnimal, ordemDaLista, pendentesDe, rotuloBrinco, situacaoDoAnimal, ultimoManejo } from './domain/regras'
import { BancoDesatualizado, type Dados, type Extras, carregar, gravar, salvarExtra, salvarExtras } from './services/banco'
import type { Animal, Faixa } from './types'

/**
 * Estado do rebanho para a interface inteira. Toda alteração passa por
 * executar(): a regra (src/domain) calcula as gravações, a tela atualiza na
 * hora e o banco recebe em seguida. Se o banco recusar, a tela volta ao que
 * está gravado.
 */

export interface LinhaRebanho {
  animal: Animal
  rotulo: string
  faixa: Faixa | null
  situacao: Situacao
  pendentes: number
  ultimoManejo: string | null
}

interface Aviso {
  id: number
  texto: string
  tom: 'ok' | 'erro'
}

interface FazendaValue {
  dados: Dados
  carregando: boolean
  erro: string | null
  bancoDesatualizado: boolean
  /** Uma linha calculada por animal (situação, faixa, pendências), na ordem da planilha. */
  linhas: LinhaRebanho[]
  linhaDe: (id: string) => LinhaRebanho | undefined
  executar: <R extends { ops: Op[]; mensagem: string }>(calcular: (fazenda: Fazenda) => R, opcoes?: { silencioso?: boolean }) => Promise<R | null>
  salvarExtra: <K extends keyof Extras>(key: K, row: Extras[K][number]) => Promise<void>
  salvarExtras: <K extends keyof Extras>(key: K, rows: Extras[K]) => Promise<void>
  recarregar: () => Promise<void>
  avisar: (texto: string, tom?: 'ok' | 'erro') => void
}

const vazio: Dados = { animais: [], protocolos: [], ciclos: [], bezerros: [], manejos: [], numeros: [], ima: [], quadro: [] }

const FazendaContext = createContext<FazendaValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [dados, setDados] = useState<Dados>(vazio)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [bancoDesatualizado, setBancoDesatualizado] = useState(false)
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const dadosRef = useRef(dados)
  dadosRef.current = dados
  // Gravações em fila: duas ações seguidas não podem chegar fora de ordem no banco.
  const fila = useRef<Promise<unknown>>(Promise.resolve())

  const avisar = useCallback((texto: string, tom: 'ok' | 'erro' = 'ok') => {
    const id = Date.now() + Math.random()
    setAvisos((current) => [...current.slice(-2), { id, texto, tom }])
    setTimeout(() => setAvisos((current) => current.filter((item) => item.id !== id)), tom === 'erro' ? 7000 : 4200)
  }, [])

  const recarregar = useCallback(async () => {
    try {
      const loaded = await carregar()
      setDados(loaded)
      setErro(null)
      setBancoDesatualizado(false)
    } catch (error) {
      if (error instanceof BancoDesatualizado) setBancoDesatualizado(true)
      setErro(error instanceof Error ? error.message : 'Não foi possível carregar o rebanho.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { void recarregar() }, [recarregar])

  const executar = useCallback(async <R extends { ops: Op[]; mensagem: string }>(calcular: (fazenda: Fazenda) => R, opcoes?: { silencioso?: boolean }) => {
    let result: R
    try {
      result = calcular(dadosRef.current)
    } catch (error) {
      avisar(error instanceof Recusa || error instanceof Error ? error.message : 'Não foi possível concluir.', 'erro')
      return null
    }
    if (!result.ops.length) {
      if (!opcoes?.silencioso) avisar(result.mensagem)
      return result
    }
    const next = { ...dadosRef.current, ...aplicar(dadosRef.current, result.ops) }
    dadosRef.current = next
    setDados(next)
    const task = fila.current.then(() => gravar(result.ops, next))
    fila.current = task.catch(() => undefined)
    try {
      await task
      if (!opcoes?.silencioso) avisar(result.mensagem)
      return result
    } catch (error) {
      avisar(error instanceof Error ? error.message : 'Não foi possível salvar.', 'erro')
      await recarregar()
      return null
    }
  }, [avisar, recarregar])

  const salvarUmExtra = useCallback(async <K extends keyof Extras>(key: K, row: Extras[K][number]) => {
    const todos = [row, ...dadosRef.current[key]] as Extras[K]
    const next = { ...dadosRef.current, [key]: todos }
    dadosRef.current = next
    setDados(next)
    try {
      await salvarExtra(key, row, todos)
    } catch (error) {
      avisar(error instanceof Error ? error.message : 'Não foi possível salvar.', 'erro')
    }
  }, [avisar])

  const salvarVariosExtras = useCallback(async <K extends keyof Extras>(key: K, rows: Extras[K]) => {
    const todos = [...rows, ...dadosRef.current[key]] as Extras[K]
    const next = { ...dadosRef.current, [key]: todos }
    dadosRef.current = next
    setDados(next)
    try {
      await salvarExtras(key, rows, todos)
    } catch (error) {
      avisar(error instanceof Error ? error.message : 'Não foi possível salvar.', 'erro')
    }
  }, [avisar])

  const linhas = useMemo<LinhaRebanho[]>(() => {
    // Índices por animal, para a lista de 400+ animais não varrer os manejos a cada linha.
    const manejosPorAnimal = new Map<string, typeof dados.manejos>()
    for (const item of dados.manejos) {
      if (!item.animal_id) continue
      const list = manejosPorAnimal.get(item.animal_id)
      if (list) list.push(item)
      else manejosPorAnimal.set(item.animal_id, [item])
    }
    return [...dados.animais].sort(ordemDaLista).map((animal) => {
      const own = manejosPorAnimal.get(animal.id) ?? []
      const alvo: Alvo = { tipo: 'animal', id: animal.id }
      return {
        animal,
        rotulo: rotuloBrinco(animal),
        faixa: faixaDoAnimal(animal),
        situacao: situacaoDoAnimal(animal, dados),
        pendentes: pendentesDe(own, alvo),
        ultimoManejo: ultimoManejo(own, alvo)
      }
    })
  }, [dados])

  const porId = useMemo(() => new Map(linhas.map((item) => [item.animal.id, item])), [linhas])
  const linhaDe = useCallback((id: string) => porId.get(id), [porId])

  const value = useMemo<FazendaValue>(() => ({
    dados,
    carregando,
    erro,
    bancoDesatualizado,
    linhas,
    linhaDe,
    executar,
    salvarExtra: salvarUmExtra,
    salvarExtras: salvarVariosExtras,
    recarregar,
    avisar
  }), [dados, carregando, erro, bancoDesatualizado, linhas, linhaDe, executar, salvarUmExtra, salvarVariosExtras, recarregar, avisar])

  return (
    <FazendaContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {avisos.map((item) => <div key={item.id} className={`toast toast-${item.tom}`}>{item.texto}</div>)}
      </div>
    </FazendaContext.Provider>
  )
}

export function useFazenda() {
  const context = useContext(FazendaContext)
  if (!context) throw new Error('useFazenda precisa estar dentro de AppProvider')
  return context
}

export const ativos = (linhas: LinhaRebanho[]) => linhas.filter((item) => ativo(item.animal))
