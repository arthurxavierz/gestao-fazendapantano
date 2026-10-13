import type { Animal, Faixa, MotivoSaida, Sexo } from '../types'
import { type Op, Recusa, aplicar, cadastrarAnimal, darBaixa, salvarDados } from './operacoes'
import { lerFaixa } from './ficha'
import { baseDoBrinco } from './revisao'
import { type Fazenda, CORES, RACAS, ativo, faixaDe, lerData, mesmoBrinco } from './regras'

/**
 * Importação em massa: cada linha da planilha vira um animal novo ou uma
 * atualização de um animal que já existe (pelo brinco). Antes de gravar, a
 * tela mostra o que vai acontecer com cada linha, inclusive os possíveis
 * duplicados, e nada é apagado: célula vazia na planilha não limpa o cadastro.
 */

export type CampoImport = 'brinco' | 'sexo' | 'nascimento' | 'faixa' | 'raca' | 'cor' | 'no_ima' | 'observacoes' | 'saida' | 'data_saida'

export const campoRotulo: Record<CampoImport, string> = {
  brinco: 'Brinco',
  sexo: 'Sexo',
  nascimento: 'Data de nascimento',
  faixa: 'Faixa etária',
  raca: 'Raça',
  cor: 'Cor',
  no_ima: 'No IMA?',
  observacoes: 'Observações',
  saida: 'Saída (venda, morte, descarte)',
  data_saida: 'Data da saída'
}

const dicas: Record<CampoImport, string[]> = {
  brinco: ['brinco', 'numero', 'n', 'no', 'animal', 'identificacao', 'codigo', 'id'],
  sexo: ['sexo', 'genero'],
  nascimento: ['data nasc', 'nascimento', 'data de nascimento', 'dt nasc', 'nasc'],
  faixa: ['faixa etaria meses', 'faixa etaria', 'faixa', 'idade'],
  raca: ['raca'],
  cor: ['cor', 'pelagem'],
  no_ima: ['no ima', 'ima', 'cadastrado no ima'],
  observacoes: ['observacoes', 'observacao', 'obs', 'anotacao'],
  saida: ['saida', 'situacao', 'destino', 'baixa'],
  data_saida: ['data saida', 'data da saida', 'data baixa']
}

export const normalizar = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export type Mapa = Record<CampoImport, number | null>

/** Adivinha a coluna de cada campo: primeiro título idêntico, depois por trecho. */
export function adivinharColunas(headers: string[]): Mapa {
  const map = Object.fromEntries((Object.keys(campoRotulo) as CampoImport[]).map((key) => [key, null])) as Mapa
  const norm = headers.map(normalizar)
  const used = new Set<number>()
  const claim = (match: (header: string, hint: string) => boolean) => {
    for (const field of Object.keys(dicas) as CampoImport[]) {
      if (map[field] != null) continue
      for (const hint of dicas[field]) {
        const index = norm.findIndex((header, i) => !used.has(i) && header && match(header, hint))
        if (index >= 0) { map[field] = index; used.add(index); break }
      }
    }
  }
  claim((header, hint) => header === hint)
  claim((header, hint) => hint.length > 2 && header.includes(hint))
  return map
}

export interface DadosLinha {
  brinco: string
  sexo?: Sexo | null
  nascimento?: string | null
  faixa?: Faixa | null
  raca?: string | null
  cor?: string | null
  no_ima?: boolean | null
  observacoes?: string | null
  saida?: MotivoSaida | null
  data_saida?: string | null
}

export type TipoLinha = 'novo' | 'atualiza' | 'igual' | 'erro'

export interface LinhaImport {
  numero: number
  dados: DadosLinha
  tipo: TipoLinha
  existente: Animal | null
  mudancas: string[]
  avisos: string[]
  erro: string | null
}

const canonico = (value: string, lista: string[]) => lista.find((item) => normalizar(item) === normalizar(value)) ?? value.trim()

function lerSexo(value: string): Sexo | null | 'erro' {
  const v = normalizar(value)
  if (!v) return null
  if (v === 'm' || v.startsWith('mach')) return 'M'
  if (v === 'f' || v.startsWith('fem')) return 'F'
  return 'erro'
}

function lerSaida(value: string): MotivoSaida | null {
  const v = normalizar(value)
  if (v.startsWith('vend') || v === 'venda') return 'Venda'
  if (v.startsWith('mort') || v.startsWith('morreu')) return 'Morte'
  if (v.startsWith('descart') || v.startsWith('abat')) return 'Descarte'
  return null
}

function lerSimNao(value: string): boolean | null {
  const v = normalizar(value)
  if (!v) return null
  if (['s', 'sim', 'yes', 'x', '1', 'true', 'verdadeiro'].includes(v)) return true
  if (['n', 'nao', 'no', '0', 'false', 'falso'].includes(v)) return false
  return null
}

const rotulos: Record<string, string> = { sexo: 'sexo', nascimento: 'nascimento', faixa: 'faixa', raca: 'raça', cor: 'cor', no_ima: 'IMA', observacoes: 'observações' }

/** Monta a prévia de cada linha. `sobrescrever` troca valores que já existem; sem ele, só completa o que está vazio. */
export function previa(fazenda: Fazenda, rows: string[][], mapa: Mapa, sobrescrever: boolean): LinhaImport[] {
  const cell = (row: string[], field: CampoImport) => (mapa[field] == null ? '' : (row[mapa[field]!] ?? '').trim())
  const vistos = new Map<string, number>()
  return rows.map((row, index) => {
    const linha: LinhaImport = { numero: index + 1, dados: { brinco: '' }, tipo: 'erro', existente: null, mudancas: [], avisos: [], erro: null }
    try {
      const brinco = cell(row, 'brinco').replace(/\.0$/, '').replace(/^x(?=\d)/i, '')
      if (!brinco) throw new Recusa('sem brinco')
      linha.dados.brinco = brinco
      const repetida = [...vistos.entries()].find(([key]) => mesmoBrinco(key, brinco))
      if (repetida) throw new Recusa(`brinco repetido na planilha (linha ${repetida[1]})`)
      vistos.set(brinco, linha.numero)

      const sexo = lerSexo(cell(row, 'sexo'))
      if (sexo === 'erro') throw new Recusa(`sexo "${cell(row, 'sexo')}" não entendido (use M ou F)`)
      linha.dados.sexo = sexo
      const nascTexto = cell(row, 'nascimento')
      const nascimento = lerData(nascTexto)
      if (nascTexto && !nascimento) throw new Recusa(`data de nascimento "${nascTexto}" inválida`)
      linha.dados.nascimento = nascimento
      const faixaTexto = cell(row, 'faixa')
      const faixa = nascimento ? faixaDe(nascimento) : lerFaixa(faixaTexto)
      if (faixaTexto && !nascimento && !faixa) throw new Recusa(`faixa "${faixaTexto}" não entendida`)
      linha.dados.faixa = faixa
      if (cell(row, 'raca')) linha.dados.raca = canonico(cell(row, 'raca'), RACAS)
      if (cell(row, 'cor')) linha.dados.cor = canonico(cell(row, 'cor'), CORES)
      linha.dados.no_ima = lerSimNao(cell(row, 'no_ima'))
      if (cell(row, 'observacoes')) linha.dados.observacoes = cell(row, 'observacoes')
      linha.dados.saida = lerSaida(cell(row, 'saida'))
      const dataSaida = lerData(cell(row, 'data_saida'))
      linha.dados.data_saida = dataSaida

      const existente = fazenda.animais.find((item) => ativo(item) && mesmoBrinco(item.brinco, brinco)) ?? null
      linha.existente = existente
      if (!existente) {
        linha.tipo = 'novo'
        const mesmaBase = fazenda.animais.filter((item) => ativo(item) && baseDoBrinco(item.brinco) === baseDoBrinco(brinco))
        if (mesmaBase.length) linha.avisos.push(`possível duplicado: já existe ${mesmaBase.map((item) => item.brinco).join(', ')}`)
        if (fazenda.animais.some((item) => item.saida && mesmoBrinco(item.brinco, brinco))) linha.avisos.push('número de um animal que saiu: será reutilizado')
        if (linha.dados.saida) linha.avisos.push(`entra e já sai por ${linha.dados.saida.toLowerCase()}`)
        return linha
      }

      for (const key of ['sexo', 'nascimento', 'faixa', 'raca', 'cor', 'no_ima', 'observacoes'] as const) {
        const novo = linha.dados[key]
        if (novo == null || novo === '') continue
        const atual = existente[key]
        if (key === 'faixa' && existente.nascimento && !linha.dados.nascimento) continue
        if (atual === novo) continue
        if (atual != null && atual !== '' && !sobrescrever) {
          linha.avisos.push(`${rotulos[key]} mantido (${String(atual)}; planilha diz ${String(novo)})`)
          continue
        }
        if (key === 'sexo' && atual && atual !== novo) linha.avisos.push(`troca de sexo ${atual} → ${novo}`)
        linha.mudancas.push(`${rotulos[key]}: ${atual == null || atual === '' ? '—' : String(atual)} → ${key === 'no_ima' ? (novo ? 'sim' : 'não') : String(novo)}`)
      }
      if (linha.dados.saida) linha.mudancas.push(`baixa por ${linha.dados.saida.toLowerCase()}`)
      linha.tipo = linha.mudancas.length ? 'atualiza' : 'igual'
    } catch (error) {
      linha.tipo = 'erro'
      linha.erro = error instanceof Error ? error.message : String(error)
    }
    return linha
  })
}

export interface ResultadoImport {
  linha: LinhaImport
  ok: boolean
  texto: string
}

/** Grava as linhas novas e as atualizações, uma enxergando o efeito da anterior. */
export function importar(fazenda: Fazenda, linhas: LinhaImport[], sobrescrever: boolean) {
  let state = fazenda
  const ops: Op[] = []
  const resultados: ResultadoImport[] = []
  const nextOrdem = () => Math.max(0, ...state.animais.map((item) => item.ordem ?? 0)) + 1
  for (const linha of linhas) {
    if (linha.tipo === 'erro' || linha.tipo === 'igual') continue
    try {
      const local: Op[] = []
      const run = (result: { ops: Op[] }) => { local.push(...result.ops); state = aplicar(state, result.ops) }
      const d = linha.dados
      let id: string
      if (linha.tipo === 'novo') {
        const created = cadastrarAnimal(state, { ...d })
        const insert = created.ops[0] as Extract<Op, { t: 'insert' }>
        insert.row.ordem = nextOrdem()
        run(created)
        id = created.id
      } else {
        const atual = state.animais.find((item) => item.id === linha.existente!.id)
        if (!atual) throw new Recusa('o animal não existe mais')
        id = atual.id
        const patch: Record<string, unknown> = {}
        for (const key of ['sexo', 'nascimento', 'faixa', 'raca', 'cor', 'no_ima', 'observacoes'] as const) {
          const novo = d[key]
          if (novo == null || novo === '') continue
          if (atual[key] != null && atual[key] !== '' && !sobrescrever) continue
          if (key === 'faixa' && (atual.nascimento || d.nascimento)) continue
          patch[key] = novo
        }
        if (Object.keys(patch).length) run(salvarDados(state, id, patch))
      }
      if (d.saida) run(darBaixa(state, id, d.saida, d.data_saida))
      ops.push(...local)
      resultados.push({ linha, ok: true, texto: linha.tipo === 'novo' ? 'cadastrado' : `atualizado (${linha.mudancas.join('; ')})` })
    } catch (error) {
      resultados.push({ linha, ok: false, texto: error instanceof Error ? error.message : String(error) })
    }
  }
  const ok = resultados.filter((item) => item.ok)
  const novos = ok.filter((item) => item.linha.tipo === 'novo').length
  return {
    ops,
    resultados,
    mensagem: `Importação concluída: ${novos} novo(s), ${ok.length - novos} atualizado(s)${resultados.length - ok.length ? `, ${resultados.length - ok.length} com erro` : ''}.`
  }
}

// ---------------------------------------------------------------- fotos em lote

/**
 * Descobre o brinco pelo nome do arquivo: "149.jpg", "brinco 149.jpg",
 * "028_149.jpg" (ordem_brinco), "2-A.jpg". Zeros à esquerda são ignorados.
 */
export function brincoDoArquivo(nome: string, fazenda: Pick<Fazenda, 'animais'>): Animal | null {
  const sem = nome.replace(/\.[a-z0-9]+$/i, '').trim()
  const candidatos = [
    sem,
    sem.replace(/^(brinco|animal|foto|img)[\s_-]*/i, ''),
    sem.split(/[_\s]+/).at(-1) ?? '',
    sem.replace(/_/g, '-')
  ].map((item) => item.trim()).filter(Boolean)
  const ativos = fazenda.animais.filter(ativo)
  for (const candidato of candidatos) {
    const found = ativos.find((item) => mesmoBrinco(item.brinco, candidato))
      ?? ativos.find((item) => item.brinco.replace(/^0+(?=\d)/, '') === candidato.replace(/^0+(?=\d)/, ''))
    if (found) return found
  }
  return null
}
