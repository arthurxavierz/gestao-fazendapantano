import type {
  Animal,
  Bezerro,
  CicloEncerrado,
  Faixa,
  Manejo,
  MotivoSaida,
  NumeroLiberado,
  Protocolo,
  ResultadoProtocolo,
  Sexo,
  SituacaoBezerro
} from '../types'
import {
  type Alvo,
  type Fazenda,
  FAIXAS,
  MESES_BEZERRO,
  PROTOCOLOS_POR_CICLO,
  animalAtivoComBrinco,
  codigoBezerro,
  faixaDe,
  hoje,
  idadeBezerro,
  lerData,
  mesmoBrinco,
  protocolosDoCiclo,
  rotuloBrinco
} from './regras'

/**
 * As ações da planilha (macros) como funções puras: recebem o estado atual e
 * devolvem a lista de gravações a fazer. Quem chama aplica no banco e na tela.
 * Assim cada regra é testável sem banco e sem interface.
 */

export type Tabela = keyof Fazenda

export type Op =
  | { t: 'insert'; tabela: Tabela; row: Record<string, unknown> & { id: string } }
  | { t: 'update'; tabela: Tabela; id: string; patch: Record<string, unknown> }
  | { t: 'delete'; tabela: Tabela; id: string }

export interface Resultado {
  ops: Op[]
  mensagem: string
}

/** Erro de regra de negócio, com mensagem pronta para a tela. */
export class Recusa extends Error {}

const novoId = () => crypto.randomUUID()
const agora = () => new Date().toISOString()

/** Aplica gravações ao estado em memória (tela otimista e lançamentos em sequência). */
export function aplicar(fazenda: Fazenda, ops: Op[]): Fazenda {
  const next: Fazenda = { ...fazenda }
  for (const op of ops) {
    const list = next[op.tabela] as unknown as { id: string }[]
    if (op.t === 'insert') next[op.tabela] = [...list, op.row] as never
    else if (op.t === 'update') next[op.tabela] = list.map((item) => (item.id === op.id ? { ...item, ...op.patch } : item)) as never
    else next[op.tabela] = list.filter((item) => item.id !== op.id) as never
  }
  return next
}

function achar(fazenda: Fazenda, animalId: string) {
  const animal = fazenda.animais.find((item) => item.id === animalId)
  if (!animal) throw new Recusa('Animal não encontrado.')
  return animal
}

/** Número que estava "Disponível" e foi usado de novo (VBA MarcarNumeroUsado). */
function marcarNumeroUsado(fazenda: Fazenda, brinco: string): Op[] {
  const livre = fazenda.numeros.find((item) => item.situacao === 'Disponível' && mesmoBrinco(item.numero, brinco))
  return livre ? [{ t: 'update', tabela: 'numeros', id: livre.id, patch: { situacao: 'Reutilizado', reutilizado_em: hoje() } }] : []
}

// ---------------------------------------------------------------- cadastro

export interface DadosAnimal {
  brinco: string
  sexo?: Sexo | null
  nascimento?: string | null
  faixa?: Faixa | null
  raca?: string | null
  cor?: string | null
  no_ima?: boolean | null
  observacoes?: string | null
  conferencia?: string | null
  foto_url?: string | null
}

export function cadastrarAnimal(fazenda: Fazenda, dados: DadosAnimal): Resultado & { id: string } {
  const brinco = dados.brinco.trim()
  if (!brinco) throw new Recusa('Informe o brinco.')
  if (/^x\d/i.test(brinco)) throw new Recusa('O X na frente é reservado para animais que saíram. Digite só o número do brinco.')
  if (animalAtivoComBrinco(fazenda, brinco)) throw new Recusa(`O brinco ${brinco} já está em uso por outro animal ativo.`)
  const id = novoId()
  const nascimento = lerData(dados.nascimento)
  const row: Animal = {
    id,
    brinco,
    sexo: dados.sexo ?? null,
    nascimento,
    faixa: nascimento ? faixaDe(nascimento) : dados.faixa ?? null,
    raca: dados.raca || null,
    cor: dados.cor || null,
    no_ima: dados.no_ima ?? null,
    observacoes: dados.observacoes || null,
    conferencia: dados.conferencia || null,
    foto_url: dados.foto_url ?? null,
    ordem: null,
    ciclo: 1,
    avaliacao: null,
    data_avaliacao: null,
    peso: null,
    saida: null,
    data_saida: null,
    bezerro_id: null,
    created_at: agora()
  }
  const reuse = marcarNumeroUsado(fazenda, brinco)
  return {
    id,
    ops: [{ t: 'insert', tabela: 'animais', row: row as never }, ...reuse],
    mensagem: reuse.length ? `Animal ${brinco} cadastrado. O número estava disponível e foi marcado como reutilizado.` : `Animal ${brinco} cadastrado.`
  }
}

/** A fêmea tem protocolo lançado neste ciclo, ciclos anteriores ou bezerros? */
function temDadosDeFemea(fazenda: Fazenda, animal: Animal) {
  return fazenda.protocolos.some((item) => item.animal_id === animal.id)
    || fazenda.ciclos.some((item) => item.animal_id === animal.id)
    || fazenda.bezerros.some((item) => item.mae_id === animal.id)
}

const temDadosDeMacho = (animal: Animal) => Boolean(animal.avaliacao || animal.data_avaliacao || animal.peso)

/**
 * Salva os dados gerais da ficha. A troca de sexo segue a VBA SincronizarSexo:
 * não deixa sumir protocolo de fêmea nem avaliação de macho.
 */
export function salvarDados(fazenda: Fazenda, animalId: string, dados: Partial<DadosAnimal>): Resultado {
  const animal = achar(fazenda, animalId)
  const patch: Record<string, unknown> = {}

  if (dados.brinco !== undefined && !mesmoBrinco(dados.brinco, animal.brinco)) {
    const brinco = dados.brinco.trim()
    if (!brinco) throw new Recusa('O brinco não pode ficar vazio.')
    if (animal.saida) throw new Recusa('Desfaça a baixa antes de trocar o brinco.')
    if (animalAtivoComBrinco(fazenda, brinco, animal.id)) throw new Recusa(`O brinco ${brinco} já está em uso por outro animal ativo.`)
    patch.brinco = brinco
  }

  if (dados.sexo !== undefined && (dados.sexo ?? null) !== animal.sexo) {
    if (animal.sexo === 'F' && temDadosDeFemea(fazenda, animal)) {
      throw new Recusa(`A ${animal.brinco} tem protocolos, ciclos ou bezerros lançados como fêmea. Confira antes de trocar o sexo.`)
    }
    if (animal.sexo === 'M' && temDadosDeMacho(animal)) {
      throw new Recusa(`O ${animal.brinco} tem avaliação ou peso lançados como macho. Apague esses dados antes de trocar o sexo.`)
    }
    patch.sexo = dados.sexo ?? null
    if (dados.sexo === 'F' && !animal.ciclo) patch.ciclo = 1
  }

  if (dados.nascimento !== undefined) {
    const nascimento = lerData(dados.nascimento)
    if (dados.nascimento && !nascimento) throw new Recusa('Data de nascimento inválida.')
    patch.nascimento = nascimento
    if (nascimento) patch.faixa = faixaDe(nascimento)
  }
  if (dados.faixa !== undefined && !(patch.nascimento ?? animal.nascimento)) {
    if (dados.faixa && !FAIXAS.includes(dados.faixa)) throw new Recusa('Faixa etária inválida.')
    patch.faixa = dados.faixa ?? null
  }
  for (const key of ['raca', 'cor', 'observacoes', 'conferencia', 'foto_url'] as const) {
    if (dados[key] !== undefined) patch[key] = dados[key] || null
  }
  if (dados.no_ima !== undefined) patch.no_ima = dados.no_ima

  if (!Object.keys(patch).length) return { ops: [], mensagem: 'Nada mudou.' }
  patch.updated_at = agora()
  return { ops: [{ t: 'update', tabela: 'animais', id: animal.id, patch }], mensagem: 'Alterações salvas.' }
}

export interface AvaliacaoMacho {
  avaliacao: string | null
  data_avaliacao: string | null
  peso: number | null
}

export function salvarAvaliacao(fazenda: Fazenda, animalId: string, dados: AvaliacaoMacho): Resultado {
  const animal = achar(fazenda, animalId)
  if (animal.sexo !== 'M') throw new Recusa('A avaliação é só para machos.')
  const data = lerData(dados.data_avaliacao)
  if (dados.data_avaliacao && !data) throw new Recusa('Data da avaliação inválida.')
  if (dados.peso != null && (Number.isNaN(dados.peso) || dados.peso < 0)) throw new Recusa('Peso inválido.')
  return {
    ops: [{ t: 'update', tabela: 'animais', id: animal.id, patch: { avaliacao: dados.avaliacao || null, data_avaliacao: data, peso: dados.peso ?? null, updated_at: agora() } }],
    mensagem: 'Avaliação salva.'
  }
}

// ---------------------------------------------------------------- protocolos

export interface DadosProtocolo {
  apta: 'S' | 'N' | null
  motivo: string | null
  data_protocolo: string | null
  data_confirmacao: string | null
  resultado: ResultadoProtocolo | null
}

const vazio = (item: DadosProtocolo) => !item.apta && !item.motivo && !item.data_protocolo && !item.data_confirmacao && !item.resultado

/** Salva os 3 protocolos do ciclo atual (bloco "Protocolos de IATF" da ficha). */
export function salvarProtocolos(fazenda: Fazenda, animalId: string, slots: DadosProtocolo[]): Resultado {
  const animal = achar(fazenda, animalId)
  if (animal.sexo !== 'F') throw new Recusa('Protocolos são só para fêmeas.')
  if (animal.saida) throw new Recusa('Este animal já saiu do rebanho. Desfaça a baixa para lançar protocolos.')
  const current = protocolosDoCiclo(fazenda.protocolos, animal.id, animal.ciclo)
  const ops: Op[] = []
  slots.slice(0, PROTOCOLOS_POR_CICLO).forEach((raw, index) => {
    const item: DadosProtocolo = {
      apta: raw.apta || null,
      motivo: raw.apta === 'N' ? raw.motivo || null : null,
      data_protocolo: lerData(raw.data_protocolo),
      data_confirmacao: lerData(raw.data_confirmacao),
      resultado: raw.resultado || null
    }
    if (raw.data_protocolo && !item.data_protocolo) throw new Recusa(`Data do ${index + 1}º protocolo inválida.`)
    if (raw.data_confirmacao && !item.data_confirmacao) throw new Recusa(`Data da confirmação do ${index + 1}º protocolo inválida.`)
    if (item.data_protocolo && item.data_confirmacao && item.data_confirmacao < item.data_protocolo) {
      throw new Recusa(`No ${index + 1}º protocolo, a confirmação está antes da data do protocolo.`)
    }
    const existing = current[index]
    if (existing) {
      if (vazio(item)) ops.push({ t: 'delete', tabela: 'protocolos', id: existing.id })
      else ops.push({ t: 'update', tabela: 'protocolos', id: existing.id, patch: { ...item } })
    } else if (!vazio(item)) {
      const row: Protocolo = { id: novoId(), animal_id: animal.id, ciclo: animal.ciclo, numero: index + 1, ...item, created_at: agora() }
      ops.push({ t: 'insert', tabela: 'protocolos', row: row as never })
    }
  })
  return { ops, mensagem: 'Protocolos salvos.' }
}

// ---------------------------------------------------------------- parto

export interface DadosParto {
  data: string
  sexo: Sexo | null
  observacao?: string | null
}

/**
 * Registrar parto (VBA RegistrarParto + EncerrarCiclo): cria o bezerro
 * mamando, arquiva o ciclo e a vaca volta para o 1º protocolo do ciclo seguinte.
 */
export function registrarParto(fazenda: Fazenda, vacaId: string, dados: DadosParto): Resultado & { bezerroId: string; codigo: string } {
  const vaca = achar(fazenda, vacaId)
  if (vaca.sexo !== 'F') throw new Recusa('Parto só pode ser registrado em fêmea.')
  if (vaca.saida) throw new Recusa('Esta vaca já saiu do rebanho.')
  const data = lerData(dados.data)
  if (!data) throw new Recusa('Informe a data do parto.')
  if (data > hoje()) throw new Recusa('A data do parto não pode ser no futuro.')
  const codigo = codigoBezerro(vaca.brinco, fazenda.bezerros, vaca.id)
  const bezerroId = novoId()
  const bezerro: Bezerro = {
    id: bezerroId,
    codigo,
    mae_id: vaca.id,
    nascimento: data,
    sexo: dados.sexo ?? null,
    situacao: 'Mamando',
    data_destino: null,
    brinco_definitivo: null,
    observacoes: dados.observacao || null,
    incorporado_em: null,
    animal_id: null,
    created_at: agora()
  }
  const ciclo: CicloEncerrado = {
    id: novoId(),
    animal_id: vaca.id,
    ciclo: vaca.ciclo || 1,
    data_parto: data,
    bezerro_codigo: codigo,
    encerrado_em: hoje(),
    created_at: agora()
  }
  return {
    bezerroId,
    codigo,
    ops: [
      { t: 'insert', tabela: 'bezerros', row: bezerro as never },
      { t: 'insert', tabela: 'ciclos', row: ciclo as never },
      { t: 'update', tabela: 'animais', id: vaca.id, patch: { ciclo: (vaca.ciclo || 1) + 1, updated_at: agora() } }
    ],
    mensagem: `Parto registrado: bezerro ${codigo}. Protocolos reiniciados no 1º do ciclo ${(vaca.ciclo || 1) + 1}.`
  }
}

// ---------------------------------------------------------------- saída

/** Baixa do animal (VBA BaixarAnimal + LiberarNumero). */
export function darBaixa(fazenda: Fazenda, animalId: string, motivo: MotivoSaida, data?: string | null): Resultado {
  const animal = achar(fazenda, animalId)
  if (animal.saida) throw new Recusa('Este animal já saiu do rebanho.')
  const quando = lerData(data) ?? hoje()
  const numero: NumeroLiberado = {
    id: novoId(),
    numero: animal.brinco,
    animal_id: animal.id,
    liberado_em: hoje(),
    registro_antigo: `X${animal.brinco}`,
    situacao: 'Disponível',
    motivo: `${motivo} em ${quando.split('-').reverse().join('/')}`,
    reutilizado_em: null,
    created_at: agora()
  }
  return {
    ops: [
      { t: 'update', tabela: 'animais', id: animal.id, patch: { saida: motivo, data_saida: quando, updated_at: agora() } },
      { t: 'insert', tabela: 'numeros', row: numero as never }
    ],
    mensagem: `Baixa dada: o registro ficou guardado como X${animal.brinco} e o número ${animal.brinco} está disponível.`
  }
}

export type ResultadoDesfazer = (Resultado & { precisaNumero: false; brinco: string }) | { precisaNumero: true; ops: []; mensagem: string }

/**
 * Desfazer baixa (VBA DesfazerBaixaDe): volta com o número original; se ele já
 * foi reutilizado, é preciso informar outro número livre.
 */
export function desfazerBaixa(fazenda: Fazenda, animalId: string, outroNumero?: string): ResultadoDesfazer {
  const animal = achar(fazenda, animalId)
  if (!animal.saida) throw new Recusa('Este animal não está baixado.')
  let brinco = animal.brinco
  if (animalAtivoComBrinco(fazenda, brinco, animal.id)) {
    if (!outroNumero?.trim()) {
      return { precisaNumero: true, ops: [], mensagem: `O número ${brinco} já foi usado por outro animal depois da baixa. Informe outro número para devolver este animal ao rebanho.` }
    }
    brinco = outroNumero.trim()
    if (animalAtivoComBrinco(fazenda, brinco, animal.id)) throw new Recusa(`O número ${brinco} também já está em uso. Nada foi alterado.`)
  }
  const ops: Op[] = [{ t: 'update', tabela: 'animais', id: animal.id, patch: { saida: null, data_saida: null, brinco, updated_at: agora() } }]
  const liberado = fazenda.numeros.filter((item) => item.animal_id === animal.id && item.situacao === 'Disponível').at(-1)
    ?? fazenda.numeros.filter((item) => item.animal_id === animal.id).at(-1)
  if (liberado && liberado.situacao !== 'Baixa desfeita') ops.push({ t: 'update', tabela: 'numeros', id: liberado.id, patch: { situacao: 'Baixa desfeita', reutilizado_em: hoje() } })
  if (!mesmoBrinco(brinco, animal.brinco)) ops.push(...marcarNumeroUsado(fazenda, brinco))
  return { precisaNumero: false, brinco, ops, mensagem: `Baixa desfeita: o animal voltou como brinco ${brinco}.` }
}

// ---------------------------------------------------------------- manejos

export interface DadosManejo {
  data: string
  manejo: string
  produtos?: string | null
  observacao?: string | null
}

const alvoCampos = (alvo: Alvo) => (alvo.tipo === 'animal' ? { animal_id: alvo.id, bezerro_id: null } : { animal_id: null, bezerro_id: alvo.id })

/** Manejo de um animal ou bezerro (VBA AdicionarManejo). */
export function adicionarManejo(fazenda: Fazenda, alvo: Alvo, dados: DadosManejo, status: Manejo['status'] = 'Feito'): Resultado {
  const data = lerData(dados.data)
  if (!data) throw new Recusa('Informe a data do manejo.')
  if (!`${dados.manejo ?? ''}${dados.produtos ?? ''}${dados.observacao ?? ''}`.trim()) throw new Recusa('Preencha o manejo, os produtos ou a observação.')
  if (alvo.tipo === 'animal') achar(fazenda, alvo.id)
  else if (!fazenda.bezerros.some((item) => item.id === alvo.id)) throw new Recusa('Bezerro não encontrado.')
  const row: Manejo = {
    id: novoId(),
    data,
    ...alvoCampos(alvo),
    manejo: dados.manejo?.trim() || 'Outro',
    produtos: dados.produtos?.trim() || null,
    observacao: dados.observacao?.trim() || null,
    status,
    feito_em: null,
    lote_id: null,
    created_at: agora()
  }
  return { ops: [{ t: 'insert', tabela: 'manejos', row: row as never }], mensagem: status === 'Pendente' ? 'Manejo lançado como pendente.' : 'Manejo lançado.' }
}

/** Marcar pendências como feitas (VBA MarcarPendenciasFeitas). */
export function marcarPendenciasFeitas(fazenda: Fazenda, alvo: Alvo, data: string): Resultado {
  const quando = lerData(data)
  if (!quando) throw new Recusa('Data inválida.')
  const pending = fazenda.manejos.filter((item) => item.status === 'Pendente' && (alvo.tipo === 'animal' ? item.animal_id === alvo.id : item.bezerro_id === alvo.id))
  return {
    ops: pending.map((item) => ({ t: 'update' as const, tabela: 'manejos' as const, id: item.id, patch: { status: 'Feito depois', feito_em: quando } })),
    mensagem: `${pending.length} pendência(s) marcada(s) como feita(s) em ${quando.split('-').reverse().join('/')}.`
  }
}

export interface DadosLote {
  data: string
  manejo: string
  produtos?: string | null
  observacao?: string | null
}

export interface MarcacaoLote {
  alvo: Alvo
  faltou: boolean
  observacao?: string | null
}

/** Manejo em lote (VBA ConfirmarLote): quem faltou fica pendente. */
export function confirmarLote(fazenda: Fazenda, dados: DadosLote, lista: MarcacaoLote[]): Resultado & { feitos: number; pendentes: number } {
  const data = lerData(dados.data)
  if (!data) throw new Recusa('Informe a data do manejo.')
  if (!dados.manejo?.trim()) throw new Recusa('Informe qual foi o manejo.')
  if (!lista.length) throw new Recusa('Gere a lista de animais primeiro.')
  const loteId = novoId()
  let feitos = 0
  let pendentes = 0
  const ops: Op[] = lista.map((item) => {
    const obs = [dados.observacao?.trim(), item.observacao?.trim()].filter(Boolean).join(' | ')
    if (item.faltou) pendentes += 1
    else feitos += 1
    const row: Manejo = {
      id: novoId(),
      data,
      ...alvoCampos(item.alvo),
      manejo: dados.manejo.trim(),
      produtos: dados.produtos?.trim() || null,
      observacao: obs || null,
      status: item.faltou ? 'Pendente' : 'Feito',
      feito_em: null,
      lote_id: loteId,
      created_at: agora()
    }
    return { t: 'insert' as const, tabela: 'manejos' as const, row: row as never }
  })
  void fazenda
  return {
    ops,
    feitos,
    pendentes,
    mensagem: `Manejo lançado: ${feitos} feito(s) e ${pendentes} pendente(s)${pendentes ? ' (faltaram). Os pendentes aparecem em vermelho na lista e na ficha de cada um.' : '.'}`
  }
}

export function excluirManejo(fazenda: Fazenda, manejoId: string): Resultado {
  if (!fazenda.manejos.some((item) => item.id === manejoId)) throw new Recusa('Manejo não encontrado.')
  return { ops: [{ t: 'delete', tabela: 'manejos', id: manejoId }], mensagem: 'Manejo excluído.' }
}

// ---------------------------------------------------------------- bezerros

export interface DadosBezerro {
  sexo?: Sexo | null
  nascimento?: string | null
  situacao?: SituacaoBezerro
  data_destino?: string | null
  brinco_definitivo?: string | null
  observacoes?: string | null
}

export function salvarBezerro(fazenda: Fazenda, bezerroId: string, dados: DadosBezerro): Resultado {
  const calf = fazenda.bezerros.find((item) => item.id === bezerroId)
  if (!calf) throw new Recusa('Bezerro não encontrado.')
  if (calf.situacao === 'Incorporado ao rebanho') throw new Recusa('Este bezerro já foi incorporado. Edite pela ficha do animal.')
  if (dados.situacao === 'Incorporado ao rebanho') throw new Recusa('Use o botão "Incorporar ao rebanho".')
  const patch: Record<string, unknown> = {}
  if (dados.sexo !== undefined) patch.sexo = dados.sexo ?? null
  if (dados.nascimento !== undefined) {
    const nascimento = lerData(dados.nascimento)
    if (dados.nascimento && !nascimento) throw new Recusa('Data de nascimento inválida.')
    patch.nascimento = nascimento
  }
  if (dados.situacao !== undefined) {
    patch.situacao = dados.situacao
    // Saiu (vendido, morto, descarte) sem data: vale a de hoje.
    if (['Vendido', 'Morto', 'Descarte'].includes(dados.situacao) && !dados.data_destino && !calf.data_destino) patch.data_destino = hoje()
  }
  if (dados.data_destino !== undefined) {
    const destino = lerData(dados.data_destino)
    if (dados.data_destino && !destino) throw new Recusa('Data do destino inválida.')
    patch.data_destino = destino
  }
  if (dados.brinco_definitivo !== undefined) patch.brinco_definitivo = dados.brinco_definitivo?.trim() || null
  if (dados.observacoes !== undefined) patch.observacoes = dados.observacoes || null
  return { ops: Object.keys(patch).length ? [{ t: 'update', tabela: 'bezerros', id: calf.id, patch }] : [], mensagem: 'Bezerro salvo.' }
}

export interface ChecagemIncorporar {
  idade: number | null
  antesDoMes: boolean
  sugestao: string | null
}

export function checarIncorporacao(fazenda: Fazenda, bezerroId: string): ChecagemIncorporar {
  const calf = fazenda.bezerros.find((item) => item.id === bezerroId)
  if (!calf) throw new Recusa('Bezerro não encontrado.')
  const idade = idadeBezerro(calf)
  const free = fazenda.numeros
    .filter((item) => item.situacao === 'Disponível')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .find((item) => !animalAtivoComBrinco(fazenda, item.numero))
  return { idade, antesDoMes: idade == null || idade < MESES_BEZERRO, sugestao: calf.brinco_definitivo || free?.numero || null }
}

/** Incorporar ao rebanho (VBA IncorporarBezerros + IncluirNaGeral). */
export function incorporarBezerro(fazenda: Fazenda, bezerroId: string, brincoDefinitivo: string): Resultado & { animalId: string } {
  const calf = fazenda.bezerros.find((item) => item.id === bezerroId)
  if (!calf) throw new Recusa('Bezerro não encontrado.')
  if (calf.situacao !== 'Ficou na fazenda') throw new Recusa('Para incorporar, a situação do bezerro precisa ser "Ficou na fazenda".')
  if (!calf.sexo) throw new Recusa(`${calf.codigo}: falta informar o sexo.`)
  const brinco = brincoDefinitivo.trim()
  if (!brinco) throw new Recusa(`${calf.codigo}: sem brinco definitivo.`)
  if (animalAtivoComBrinco(fazenda, brinco)) throw new Recusa(`O brinco ${brinco} já está em uso por um animal ativo.`)
  const mae = fazenda.animais.find((item) => item.id === calf.mae_id)
  const created = cadastrarAnimal(fazenda, {
    brinco,
    sexo: calf.sexo,
    nascimento: calf.nascimento,
    observacoes: `Nascido na fazenda, filho da vaca ${mae ? rotuloBrinco(mae) : '?'} (bezerro ${calf.codigo}). ${calf.observacoes ?? ''}`.trim()
  })
  const insert = created.ops[0] as Extract<Op, { t: 'insert' }>
  insert.row.bezerro_id = calf.id
  const moved = fazenda.manejos
    .filter((item) => item.bezerro_id === calf.id)
    .map((item) => ({ t: 'update' as const, tabela: 'manejos' as const, id: item.id, patch: { bezerro_id: null, animal_id: created.id } }))
  return {
    animalId: created.id,
    ops: [
      ...created.ops,
      ...moved,
      { t: 'update', tabela: 'bezerros', id: calf.id, patch: { situacao: 'Incorporado ao rebanho', incorporado_em: hoje(), brinco_definitivo: brinco, animal_id: created.id } }
    ],
    mensagem: `Bezerro ${calf.codigo} incorporado ao rebanho como brinco ${brinco}.`
  }
}


/** Uma pendência só, resolvida pela lista de manejos (a coluna Status da aba Manejos). */
export function marcarManejoFeito(fazenda: Fazenda, manejoId: string, data: string): Resultado {
  const manejo = fazenda.manejos.find((item) => item.id === manejoId)
  if (!manejo) throw new Recusa('Manejo não encontrado.')
  if (manejo.status !== 'Pendente') throw new Recusa('Este manejo não está pendente.')
  const quando = lerData(data)
  if (!quando) throw new Recusa('Data inválida.')
  return { ops: [{ t: 'update', tabela: 'manejos', id: manejo.id, patch: { status: 'Feito depois', feito_em: quando } }], mensagem: 'Pendência marcada como feita.' }
}
