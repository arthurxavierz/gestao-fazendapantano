import type {
  Animal,
  Bezerro,
  CicloEncerrado,
  ContagemIma,
  Faixa,
  FichaCampo,
  Manejo,
  NumeroLiberado,
  Protocolo,
  Revisao,
  Sexo
} from '../types'

/**
 * Regras da planilha Gado_Rebanho_Fazenda (v11), sem interface nem banco.
 * Cada função aponta para a fórmula ou macro de onde veio.
 */

export const FAIXAS: Faixa[] = ['0 a 12', '13 a 24', '25 a 36', 'Acima de 36']
export const RACAS = ['Nelore', 'Cruzado', 'Gir', 'Angus', 'Outra']
export const CORES = ['Branca', 'Cinza', 'Vermelha', 'Preta', 'Malhada', 'Rajada', 'Outra']
export const MOTIVOS_NAO_APTA = ['Prenha', 'Jovem', 'Anestro', 'Bezerro novo', 'Magra', 'Infusão', 'Outro']
export const TIPOS_MANEJO = ['Vacina', 'Vermífugo', 'Medicamento', 'Pesagem', 'Exame', 'Inseminação', 'Marcação / brinco', 'Castração', 'Desmama', 'Mudança de pasto', 'Outro']
export const MOTIVOS_SAIDA = ['Venda', 'Morte', 'Descarte'] as const
export const SITUACOES_BEZERRO = ['Mamando', 'Ficou na fazenda', 'Vendido', 'Morto', 'Descarte'] as const

/** Protocolos de IATF por ciclo. Três vazias no ciclo levam ao descarte. */
export const PROTOCOLOS_POR_CICLO = 3
/** Até este mês o bezerro fica ao pé da mãe; depois, é preciso definir o destino. */
export const MESES_BEZERRO = 8

/** Tudo o que as regras precisam enxergar de uma vez. */
export interface Fazenda {
  animais: Animal[]
  protocolos: Protocolo[]
  ciclos: CicloEncerrado[]
  bezerros: Bezerro[]
  manejos: Manejo[]
  numeros: NumeroLiberado[]
  revisoes: Revisao[]
  fichas: FichaCampo[]
}

// ---------------------------------------------------------------- datas

const pad = (value: number) => String(value).padStart(2, '0')

export function hoje(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Aceita AAAA-MM-DD, DD/MM/AAAA e DD/MM/AA. Devolve AAAA-MM-DD ou null. */
export function lerData(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  if (!text) return null
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) return validar(Number(match[1]), Number(match[2]), Number(match[3]))
  match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (match) {
    let year = Number(match[3])
    if (year < 100) year += year > 50 ? 1900 : 2000
    return validar(year, Number(match[2]), Number(match[1]))
  }
  return null
}

function validar(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

/**
 * Meses completos entre duas datas (VBA FaixaDe e DATEDIF "m"):
 * o mês só conta quando o dia do nascimento já chegou.
 */
export function mesesCompletos(desde: string, ate: string = hoje()): number {
  const [y1, m1, d1] = desde.split('-').map(Number)
  const [y2, m2, d2] = ate.split('-').map(Number)
  let months = (y2 - y1) * 12 + (m2 - m1)
  if (d2 < d1) months -= 1
  return months
}

/** Faixa etária pela data de nascimento (VBA FaixaDe). */
export function faixaDe(nascimento: string, ref: string = hoje()): Faixa {
  const months = mesesCompletos(nascimento, ref)
  if (months <= 12) return '0 a 12'
  if (months <= 24) return '13 a 24'
  if (months <= 36) return '25 a 36'
  return 'Acima de 36'
}

/** Com nascimento a faixa é calculada; sem ele, vale a informada. */
export function faixaDoAnimal(animal: Pick<Animal, 'nascimento' | 'faixa'>, ref: string = hoje()): Faixa | null {
  return animal.nascimento ? faixaDe(animal.nascimento, ref) : animal.faixa
}

// ---------------------------------------------------------------- brinco

export const ativo = (animal: Pick<Animal, 'saida'>) => !animal.saida

/** Animal baixado aparece como X + brinco (VBA BaixarAnimal). */
export const rotuloBrinco = (animal: Pick<Animal, 'brinco' | 'saida'>) => (animal.saida ? `X${animal.brinco}` : animal.brinco)

export const mesmoBrinco = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Ordem natural de brincos: 2, 2-A, 2-B, 3, 10, 104 (VBA ChaveBrinco). */
export function compararBrincos(a: string, b: string): number {
  const parse = (value: string) => {
    const clean = value.replace(/^X/i, '')
    const match = clean.match(/^(\d+)(.*)$/)
    return match ? { n: Number(match[1]), rest: match[2].toLowerCase() } : { n: Number.POSITIVE_INFINITY, rest: clean.toLowerCase() }
  }
  const pa = parse(a)
  const pb = parse(b)
  if (pa.n !== pb.n) return pa.n - pb.n
  return pa.rest.localeCompare(pb.rest, 'pt-BR')
}

export function animalAtivoComBrinco(fazenda: Pick<Fazenda, 'animais'>, brinco: string, exceto?: string) {
  return fazenda.animais.find((item) => ativo(item) && item.id !== exceto && mesmoBrinco(item.brinco, brinco)) ?? null
}

/** Primeiro número "Disponível" que ninguém ativo está usando (VBA PrimeiroDisponivel). */
export function primeiroDisponivel(fazenda: Pick<Fazenda, 'animais' | 'numeros'>): string | null {
  const livres = fazenda.numeros
    .filter((item) => item.situacao === 'Disponível')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  return livres.find((item) => !animalAtivoComBrinco(fazenda, item.numero))?.numero ?? null
}

// ---------------------------------------------------------------- protocolos

export type SlotsCiclo = [Protocolo | null, Protocolo | null, Protocolo | null]

export function protocolosDoCiclo(protocolos: Protocolo[], animalId: string, ciclo: number): SlotsCiclo {
  const slots: SlotsCiclo = [null, null, null]
  for (const item of protocolos) {
    if (item.animal_id === animalId && item.ciclo === ciclo && item.numero >= 1 && item.numero <= PROTOCOLOS_POR_CICLO) {
      slots[item.numero - 1] = item
    }
  }
  return slots
}

/** Resultado do protocolo mais recente preenchido: 3º, senão 2º, senão 1º. */
export function ultimoResultado(slots: SlotsCiclo) {
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    if (slots[index]?.resultado) return slots[index]!.resultado
  }
  return null
}

export const vaziasNoCiclo = (slots: SlotsCiclo) => slots.filter((item) => item?.resultado === 'Vazia').length

/** Três vazias no mesmo ciclo: a matriz vai para descarte. */
export const deveDescartar = (slots: SlotsCiclo) => vaziasNoCiclo(slots) >= PROTOCOLOS_POR_CICLO

// ---------------------------------------------------------------- situação

export function bezerrosDaMae(bezerros: Bezerro[], maeId: string) {
  return bezerros.filter((item) => item.mae_id === maeId).sort((a, b) => (b.nascimento ?? '').localeCompare(a.nascimento ?? ''))
}

export const mamando = (bezerros: Bezerro[], maeId: string) => bezerros.filter((item) => item.mae_id === maeId && item.situacao === 'Mamando').length

export type Tom = 'verde' | 'ambar' | 'vermelho' | 'cinza' | 'azul'

export interface Situacao {
  texto: string
  curta: string
  tom: Tom
}

/**
 * Situação exibida na Geral (fórmulas F_SIT_G, F_SIT_F e F_SIT_M), na mesma
 * ordem de prioridade da planilha.
 */
export function situacaoDoAnimal(animal: Animal, fazenda: Pick<Fazenda, 'protocolos' | 'bezerros'>): Situacao {
  if (!animal.sexo) {
    if (animal.saida) return { texto: animal.saida, curta: animal.saida.toLowerCase(), tom: 'vermelho' }
    return { texto: 'Falta informar o sexo', curta: 'sem sexo', tom: 'cinza' }
  }
  if (animal.saida) return { texto: animal.saida, curta: animal.saida.toLowerCase(), tom: 'vermelho' }
  if (animal.sexo === 'M') return { texto: 'Ativo (destino: descarte)', curta: 'ativo', tom: 'azul' }

  const slots = protocolosDoCiclo(fazenda.protocolos, animal.id, animal.ciclo)
  if (deveDescartar(slots)) return { texto: 'Descarte (3 protocolos vazia)', curta: 'DESCARTE', tom: 'vermelho' }
  const last = ultimoResultado(slots)
  if (last === 'Prenha') return { texto: 'Prenha', curta: 'prenha', tom: 'verde' }
  if (last === 'Vazia') return { texto: 'Vazia (aguardando próximo protocolo)', curta: 'vazia', tom: 'ambar' }
  if (mamando(fazenda.bezerros, animal.id) > 0) return { texto: 'Com bezerro ao pé', curta: 'c/ bezerro', tom: 'verde' }
  return { texto: 'Aguardando protocolo', curta: 'aguard. protocolo', tom: 'cinza' }
}

// ---------------------------------------------------------------- bezerros

export const idadeBezerro = (bezerro: Pick<Bezerro, 'nascimento'>, ref: string = hoje()) =>
  bezerro.nascimento ? Math.max(0, mesesCompletos(bezerro.nascimento, ref)) : null

export const bezerroEncerrado = (bezerro: Pick<Bezerro, 'situacao'>) =>
  bezerro.situacao === 'Vendido' || bezerro.situacao === 'Morto' || bezerro.situacao === 'Descarte'

/** Bezerros ao pé: mamando ou que ficaram na fazenda e ainda não foram incorporados. */
export const bezerroAoPe = (bezerro: Pick<Bezerro, 'situacao'>) => bezerro.situacao === 'Mamando' || bezerro.situacao === 'Ficou na fazenda'

export interface AvisoBezerro {
  texto: string
  tom: Tom
  /** Passou do 8º mês sem destino definido. */
  semDestino: boolean
  pronto: boolean
}

/** Aviso da aba Bezerros (fórmula F_BZ_ALERTA). */
export function avisoBezerro(bezerro: Bezerro, ref: string = hoje()): AvisoBezerro | null {
  if (bezerroEncerrado(bezerro)) return null
  if (bezerro.situacao === 'Incorporado ao rebanho') return { texto: 'Já está no rebanho', tom: 'cinza', semDestino: false, pronto: false }
  const idade = idadeBezerro(bezerro, ref)
  if (idade == null) return { texto: 'Informe a data de nascimento', tom: 'ambar', semDestino: false, pronto: false }
  if (idade >= MESES_BEZERRO) {
    if (bezerro.situacao === 'Ficou na fazenda') return { texto: 'Pronto: incorporar ao rebanho', tom: 'verde', semDestino: false, pronto: true }
    return { texto: `Passou do ${MESES_BEZERRO}º mês: definir o destino`, tom: 'vermelho', semDestino: true, pronto: false }
  }
  const falta = MESES_BEZERRO - idade
  return { texto: `Ao pé da mãe: faltam ${falta} ${falta === 1 ? 'mês' : 'meses'} para o ${MESES_BEZERRO}º mês`, tom: 'azul', semDestino: false, pronto: false }
}

/** Código do bezerro: <brinco da mãe>-B<n>, pulando códigos já usados (VBA RegistrarParto). */
export function codigoBezerro(maeBrinco: string, bezerros: Bezerro[], maeId: string): string {
  let n = bezerros.filter((item) => item.mae_id === maeId).length + 1
  const used = new Set(bezerros.map((item) => item.codigo.toLowerCase()))
  let code = `${maeBrinco}-B${n}`
  while (used.has(code.toLowerCase())) {
    n += 1
    code = `${maeBrinco}-B${n}`
  }
  return code
}

// ---------------------------------------------------------------- manejos

export type Alvo = { tipo: 'animal'; id: string } | { tipo: 'bezerro'; id: string }

export const manejosDe = (manejos: Manejo[], alvo: Alvo) =>
  manejos
    .filter((item) => (alvo.tipo === 'animal' ? item.animal_id === alvo.id : item.bezerro_id === alvo.id))
    .sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at))

export const pendentesDe = (manejos: Manejo[], alvo: Alvo) => manejosDe(manejos, alvo).filter((item) => item.status === 'Pendente').length

export const ultimoManejo = (manejos: Manejo[], alvo: Alvo) => manejosDe(manejos, alvo)[0]?.data ?? null

export const GRUPOS_LOTE = [
  'Todo o rebanho',
  'Todo o rebanho + bezerros',
  'Fêmeas',
  'Machos',
  '0 a 12',
  '13 a 24',
  '25 a 36',
  'Acima de 36',
  'Bezerros ao pé',
  'Sem sexo informado'
] as const
export type GrupoLote = (typeof GRUPOS_LOTE)[number]

export interface ItemLote {
  alvo: Alvo
  rotulo: string
  tipo: string
  sexo: Sexo | null
  idade: string
}

/** Lista do manejo em lote (VBA GerarListaLote). Animais baixados não entram. */
export function listaDoLote(fazenda: Pick<Fazenda, 'animais' | 'bezerros'>, grupo: GrupoLote, ref: string = hoje()): ItemLote[] {
  const items: ItemLote[] = []
  if (grupo !== 'Bezerros ao pé') {
    const animals = fazenda.animais.filter(ativo).sort((a, b) => ordemDaLista(a, b))
    for (const animal of animals) {
      const faixa = faixaDoAnimal(animal, ref)
      const ok = grupo === 'Todo o rebanho' || grupo === 'Todo o rebanho + bezerros'
        ? true
        : grupo === 'Fêmeas' ? animal.sexo === 'F'
          : grupo === 'Machos' ? animal.sexo === 'M'
            : grupo === 'Sem sexo informado' ? !animal.sexo
              : faixa === grupo
      if (ok) items.push({ alvo: { tipo: 'animal', id: animal.id }, rotulo: animal.brinco, tipo: 'Animal', sexo: animal.sexo, idade: faixa ?? '' })
    }
  }
  if (grupo === 'Bezerros ao pé' || grupo === 'Todo o rebanho + bezerros') {
    for (const calf of fazenda.bezerros.filter(bezerroAoPe)) {
      const mae = fazenda.animais.find((item) => item.id === calf.mae_id)
      const idade = idadeBezerro(calf, ref)
      items.push({
        alvo: { tipo: 'bezerro', id: calf.id },
        rotulo: calf.codigo,
        tipo: `Bezerro de ${mae ? rotuloBrinco(mae) : '?'}`,
        sexo: calf.sexo,
        idade: idade == null ? '' : `${idade} meses`
      })
    }
  }
  return items
}

/** A lista abre na ordem da planilha; animais novos vão para o fim, em ordem de brinco. */
export function ordemDaLista(a: Animal, b: Animal) {
  const oa = a.ordem ?? Number.MAX_SAFE_INTEGER
  const ob = b.ordem ?? Number.MAX_SAFE_INTEGER
  if (oa !== ob) return oa - ob
  return compararBrincos(a.brinco, b.brinco)
}

// ---------------------------------------------------------------- painel

export interface QuadroFaixas {
  linhas: { rotulo: 'Machos' | 'Fêmeas' | 'Sem sexo'; porFaixa: number[]; semFaixa: number; total: number }[]
  totais: number[]
  semFaixa: number
  total: number
}

/** Quadro do topo da Geral: ativos por sexo e faixa etária. */
export function quadroPorFaixa(animais: Animal[], ref: string = hoje()): QuadroFaixas {
  const rows = (['M', 'F', null] as (Sexo | null)[]).map((sexo) => {
    const group = animais.filter((item) => ativo(item) && item.sexo === sexo)
    const porFaixa = FAIXAS.map((faixa) => group.filter((item) => faixaDoAnimal(item, ref) === faixa).length)
    const semFaixa = group.filter((item) => !faixaDoAnimal(item, ref)).length
    return { rotulo: (sexo === 'M' ? 'Machos' : sexo === 'F' ? 'Fêmeas' : 'Sem sexo') as 'Machos' | 'Fêmeas' | 'Sem sexo', porFaixa, semFaixa, total: group.length }
  })
  return {
    linhas: rows,
    totais: FAIXAS.map((_, index) => rows.reduce((sum, row) => sum + row.porFaixa[index], 0)),
    semFaixa: rows.reduce((sum, row) => sum + row.semFaixa, 0),
    total: rows.reduce((sum, row) => sum + row.total, 0)
  }
}

// ---------------------------------------------------------------- IMA

export const contagemVazia = (): ContagemIma => ({
  '0 a 12': { M: 0, F: 0 },
  '13 a 24': { M: 0, F: 0 },
  '25 a 36': { M: 0, F: 0 },
  'Acima de 36': { M: 0, F: 0 }
})

/**
 * O que a fazenda tem, no formato do IMA: ativos por sexo e faixa, mais os
 * bezerros mamando ou que ficaram na fazenda, na faixa de 0 a 12.
 */
export function contagemDaFazenda(fazenda: Pick<Fazenda, 'animais' | 'bezerros'>, ref: string = hoje()): ContagemIma {
  const count = contagemVazia()
  for (const animal of fazenda.animais) {
    if (!ativo(animal) || !animal.sexo) continue
    const faixa = faixaDoAnimal(animal, ref)
    if (faixa) count[faixa][animal.sexo] += 1
  }
  for (const calf of fazenda.bezerros) {
    if (bezerroAoPe(calf) && calf.sexo) count['0 a 12'][calf.sexo] += 1
  }
  return count
}

export const foraDaComparacao = (animais: Animal[], ref: string = hoje()) =>
  animais.filter((item) => ativo(item) && (!item.sexo || !faixaDoAnimal(item, ref))).length

export interface LinhaPlano {
  texto: string
  tom: 'info' | 'aviso' | 'saida' | 'entrada' | 'ok'
}

/** Plano de ação da comparação com o IMA (VBA CompararIMA). */
export function planoIma(ima: ContagemIma, fazenda: ContagemIma, semSexoOuFaixa: number, dataRelatorio?: string | null): LinhaPlano[] {
  const sexKeys: Sexo[] = ['M', 'F']
  const sexLabel = { M: 'macho(s)', F: 'fêmea(s)' }
  const faixaLabel = (faixa: Faixa) => faixa.toLowerCase()
  const total = FAIXAS.reduce((sum, faixa) => sum + ima[faixa].M + ima[faixa].F, 0)
  const lines: LinhaPlano[] = []
  if (total === 0) return [{ texto: 'Digite primeiro os números do relatório do IMA (machos e fêmeas por faixa).', tom: 'aviso' }]

  lines.push({ texto: `Comparação feita em ${formatarData(hoje())}${dataRelatorio ? ` com o relatório do IMA de ${formatarData(dataRelatorio)}` : ''}.`, tom: 'info' })
  if (semSexoOuFaixa > 0) {
    lines.push({
      texto: `Atenção: ${semSexoOuFaixa} animal(is) da fazenda estão sem sexo ou sem faixa etária e ficaram fora da conta. Complete o cadastro antes de declarar qualquer coisa no IMA; parte das diferenças abaixo pode ser só isso.`,
      tom: 'aviso'
    })
  }

  const dif = FAIXAS.map((faixa) => ({ M: fazenda[faixa].M - ima[faixa].M, F: fazenda[faixa].F - ima[faixa].F }))
  for (const sexo of sexKeys) {
    for (let i = 0; i < FAIXAS.length - 1; i += 1) {
      const a = dif[i][sexo]
      const b = dif[i + 1][sexo]
      if (a > 0 && b < 0) {
        const m = Math.min(a, -b)
        lines.push({ texto: `Faixa diferente: a fazenda tem ${m} ${sexLabel[sexo]} a mais em ${faixaLabel(FAIXAS[i])} e o IMA tem ${m} a mais em ${faixaLabel(FAIXAS[i + 1])}. Confira a idade desses animais (podem estar com a faixa errada aqui) e ajuste onde estiver errado.`, tom: 'info' })
        dif[i][sexo] -= m
        dif[i + 1][sexo] += m
      } else if (a < 0 && b > 0) {
        const m = Math.min(-a, b)
        lines.push({ texto: `Mudança de faixa: ${m} ${sexLabel[sexo]} provavelmente passaram de ${faixaLabel(FAIXAS[i])} para ${faixaLabel(FAIXAS[i + 1])} meses (a fazenda já conta na faixa nova). Atualize a faixa etária desses animais no IMA.`, tom: 'info' })
        dif[i][sexo] += m
        dif[i + 1][sexo] -= m
      }
    }
  }

  let sobra = false
  for (const sexo of sexKeys) {
    FAIXAS.forEach((faixa, i) => {
      const value = dif[i][sexo]
      if (value < 0) {
        sobra = true
        lines.push({ texto: `O IMA tem ${-value} ${sexLabel[sexo]} de ${faixaLabel(faixa)} meses A MAIS do que a fazenda: declare no IMA a saída desses animais (morte, venda, abate ou descarte). Os que já saíram estão em Números disponíveis, com motivo e data.`, tom: 'saida' })
      } else if (value > 0) {
        sobra = true
        lines.push({
          texto: i === 0
            ? `A fazenda tem ${value} ${sexLabel[sexo]} de 0 a 12 meses A MAIS do que o IMA: declare no IMA os nascimentos (veja Bezerros) ou a compra, se vieram de fora.`
            : `A fazenda tem ${value} ${sexLabel[sexo]} de ${faixaLabel(faixa)} meses A MAIS do que o IMA: declare no IMA a entrada desses animais (compra de lote ou transferência), ou confira se a faixa etária deles está certa.`,
          tom: 'entrada'
        })
      }
    })
  }
  if (!sobra) lines.push({ texto: 'Tudo certo: depois de considerar as mudanças de faixa, a fazenda bate com o IMA.', tom: 'ok' })
  return lines
}

export function formatarData(value?: string | null) {
  if (!value) return ''
  const [y, m, d] = value.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// ---------------------------------------------------------------- quadro de campo

export const CODIGOS_QUADRO: Record<string, string> = {
  N: 'nasceu bezerro (sexo)',
  M: 'morreu',
  S: 'saiu / vendeu',
  V: 'vacina ou remédio (qual)',
  F: 'faltou no manejo (qual)',
  P: 'protocolo (prenha / vazia)',
  D: 'dado (sexo, faixa, nascimento)',
  O: 'outro'
}

export interface LinhaColada {
  data: string | null
  brinco: string
  codigo: string
  detalhe: string
}

/**
 * Lê o que foi colado (de uma planilha ou da resposta de uma IA): colunas
 * Data, Brinco, Código, Detalhe separadas por tabulação, ponto e vírgula ou
 * barra vertical. Cabeçalho e linhas de tabela markdown são ignorados.
 */
export function lerColagem(texto: string): LinhaColada[] {
  const rows: LinhaColada[] = []
  for (const raw of texto.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || /^\|?\s*:?-{3,}/.test(line)) continue
    const sep = line.includes('\t') ? '\t' : line.includes('|') ? '|' : line.includes(';') ? ';' : ','
    const cells = line.split(sep).map((cell) => cell.trim())
    if (sep === '|') {
      if (cells[0] === '') cells.shift()
      if (cells[cells.length - 1] === '') cells.pop()
    }
    if (cells.length < 3) continue
    if (/^data$/i.test(cells[0]) || /brinco/i.test(cells[1] ?? '')) continue
    const [data, brinco, codigo, ...rest] = cells
    if (!brinco) continue
    // "074" escrito no quadro é o brinco 74.
    rows.push({ data: lerData(data), brinco: brinco.replace(/^0+(?=\d)/, ''), codigo: codigo.toUpperCase().slice(0, 1), detalhe: rest.join(' ').trim() })
  }
  return rows
}
