import type { Animal, Faixa, Sexo } from '../types'
import {
  type Op,
  Recusa,
  adicionarManejo,
  aplicar,
  darBaixa,
  registrarParto,
  salvarBezerro,
  salvarDados,
  salvarProtocolos
} from './operacoes'
import { type Fazenda, FAIXAS, type LinhaColada, ativo, lerData, mesmoBrinco, protocolosDoCiclo } from './regras'

/**
 * Lançar do quadro (VBA LancarQuadro_N): cada anotação do quadro de campo,
 * Data + Brinco + Código + Detalhe, vira um registro. As linhas são aplicadas
 * em sequência, cada uma enxergando o efeito das anteriores.
 */

export interface ResultadoLinha {
  linha: LinhaColada
  ok: boolean
  texto: string
}

function acharAnimal(fazenda: Fazenda, brinco: string): Animal | null {
  return fazenda.animais.find((item) => ativo(item) && mesmoBrinco(item.brinco, brinco)) ?? null
}

/** Uma linha: devolve as gravações e o texto que vai para a coluna Resultado. */
export function lancarLinha(fazenda: Fazenda, linha: LinhaColada, padrao: string): { ops: Op[]; texto: string } {
  const quando = linha.data ?? padrao
  const detalhe = linha.detalhe.trim()
  const animal = acharAnimal(fazenda, linha.brinco)
  const bezerro = animal ? null : fazenda.bezerros.find((item) => mesmoBrinco(item.codigo, linha.brinco)) ?? null
  if (!animal && !bezerro) throw new Recusa(`brinco ${linha.brinco} não encontrado`)

  switch (linha.codigo) {
    case 'N': {
      if (!animal || animal.sexo !== 'F') throw new Recusa(`o brinco ${linha.brinco} não é uma fêmea cadastrada (informe o sexo F antes)`)
      const lower = detalhe.toLowerCase()
      const sexo: Sexo | null = lower.startsWith('m') ? 'M' : lower.startsWith('f') ? 'F' : null
      const result = registrarParto(fazenda, animal.id, { data: quando, sexo, observacao: detalhe || null })
      return { ops: result.ops, texto: `OK: bezerro ${result.codigo} criado; protocolos da vaca reiniciados` }
    }
    case 'M':
    case 'S': {
      const motivo = linha.codigo === 'M' ? 'Morte' : /descart/i.test(detalhe) ? 'Descarte' : 'Venda'
      if (bezerro) {
        const situacao = motivo === 'Morte' ? 'Morto' : motivo === 'Venda' ? 'Vendido' : 'Descarte'
        const result = salvarBezerro(fazenda, bezerro.id, { situacao, data_destino: quando })
        return { ops: result.ops, texto: `OK: bezerro marcado como ${situacao}` }
      }
      const result = darBaixa(fazenda, animal!.id, motivo, quando)
      return { ops: result.ops, texto: `OK: baixa por ${motivo} (agora X${animal!.brinco})` }
    }
    case 'V':
    case 'F':
    case 'O': {
      const alvo = animal ? { tipo: 'animal' as const, id: animal.id } : { tipo: 'bezerro' as const, id: bezerro!.id }
      const dados = linha.codigo === 'V'
        ? { data: quando, manejo: 'Vacina', produtos: detalhe || null, observacao: 'Lançado do quadro' }
        : linha.codigo === 'F'
          ? { data: quando, manejo: detalhe || 'Manejo', observacao: 'Faltou (lançado do quadro)' }
          : { data: quando, manejo: 'Outro', observacao: detalhe || 'Lançado do quadro' }
      const status = linha.codigo === 'F' ? 'Pendente' : 'Feito'
      const result = adicionarManejo(fazenda, alvo, dados, status)
      return { ops: result.ops, texto: `OK: manejo '${dados.manejo}' lançado${status === 'Pendente' ? ' como PENDENTE' : ''}` }
    }
    case 'P': {
      if (!animal || animal.sexo !== 'F') throw new Recusa(`o brinco ${linha.brinco} não é uma fêmea cadastrada`)
      return protocoloDoQuadro(fazenda, animal, quando, detalhe)
    }
    case 'D': {
      if (!animal) throw new Recusa('dados só podem ser lançados em animais do rebanho')
      return dadoDoQuadro(fazenda, animal, detalhe)
    }
    default:
      throw new Recusa('código inválido (use N, M, S, V, F, P, D ou O)')
  }
}

/** P: vazio abre o próximo protocolo; "prenha"/"vazia" fecha o último aberto (VBA ProtocoloDe). */
function protocoloDoQuadro(fazenda: Fazenda, vaca: Animal, quando: string, detalhe: string) {
  const slots = protocolosDoCiclo(fazenda.protocolos, vaca.id, vaca.ciclo)
  const dados = slots.map((item) => ({
    apta: item?.apta ?? null,
    motivo: item?.motivo ?? null,
    data_protocolo: item?.data_protocolo ?? null,
    data_confirmacao: item?.data_confirmacao ?? null,
    resultado: item?.resultado ?? null
  }))
  const lower = detalhe.toLowerCase()
  const resultado = lower.includes('prenh') ? 'Prenha' : lower.includes('vazi') ? 'Vazia' : null
  if (resultado) {
    for (let index = dados.length - 1; index >= 0; index -= 1) {
      if (dados[index].data_protocolo && !dados[index].resultado) {
        dados[index].data_confirmacao = quando
        dados[index].resultado = resultado
        return { ops: salvarProtocolos(fazenda, vaca.id, dados).ops, texto: `OK: ${index + 1}º protocolo deu ${resultado}` }
      }
    }
    throw new Recusa(`não há protocolo aberto (com data e sem resultado) para lançar ${resultado}`)
  }
  const free = dados.findIndex((item) => !item.data_protocolo)
  if (free < 0) throw new Recusa('os 3 protocolos do ciclo já estão preenchidos')
  dados[free].apta = 'S'
  dados[free].data_protocolo = quando
  return { ops: salvarProtocolos(fazenda, vaca.id, dados).ops, texto: `OK: ${free + 1}º protocolo lançado` }
}

/** D: "sexo M", "faixa 13 a 24", "nasc 10/03/2025" (VBA DadoDe). */
function dadoDoQuadro(fazenda: Fazenda, animal: Animal, detalhe: string) {
  const lower = detalhe.toLowerCase().trim()
  const patch: { sexo?: Sexo; faixa?: Faixa; nascimento?: string } = {}
  const feito: string[] = []
  if (lower === 'm' || /\bmacho\b/.test(lower) || /sexo\s*m\b/.test(lower)) { patch.sexo = 'M'; feito.push('sexo M') }
  if (lower === 'f' || /f[êe]mea/.test(lower) || /sexo\s*f\b/.test(lower)) { patch.sexo = 'F'; feito.push('sexo F') }
  for (const faixa of FAIXAS) {
    if (lower.includes(faixa.toLowerCase())) { patch.faixa = faixa; feito.push(`faixa ${faixa}`) }
  }
  for (const part of lower.replace(/,/g, ' ').split(/\s+/)) {
    const date = /\d+\/\d+/.test(part) ? lerData(part) : null
    if (date) { patch.nascimento = date; feito.push(`nascimento ${part}`) }
  }
  if (!feito.length) throw new Recusa('não entendi o dado (use: sexo M, faixa 13 a 24, nasc 10/03/2025)')
  return { ops: salvarDados(fazenda, animal.id, patch).ops, texto: `OK: ${feito.join(', ')}` }
}

/** Lança todas as linhas em sequência; uma linha com erro não impede as outras. */
export function lancarQuadro(fazenda: Fazenda, linhas: LinhaColada[], padrao: string) {
  let state = fazenda
  const ops: Op[] = []
  const resultados: ResultadoLinha[] = []
  for (const linha of linhas) {
    try {
      const result = lancarLinha(state, linha, padrao)
      state = aplicar(state, result.ops)
      ops.push(...result.ops)
      resultados.push({ linha, ok: true, texto: result.texto })
    } catch (error) {
      const message = error instanceof Recusa || error instanceof Error ? error.message : String(error)
      resultados.push({ linha, ok: false, texto: `ERRO: ${message}` })
    }
  }
  return { ops, resultados, estado: state }
}
