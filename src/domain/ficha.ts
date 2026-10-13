import type { ColunasFicha, Faixa, FichaCampo, LeituraFicha, MotivoSaida } from '../types'
import { type Op, Recusa, type Resultado, adicionarManejo, aplicar, darBaixa, salvarDados, salvarProtocolos } from './operacoes'
import { type Fazenda, FAIXAS, ativo, lerData, mesmoBrinco, protocolosDoCiclo, rotuloBrinco } from './regras'

/**
 * Ficha de campo: uma folha impressa com os animais e colunas de checklist
 * (presente, sexo, faixa, peso, prenha/vazia, saída, observação). No dia de
 * pesagem ou vacinação a equipe marca à caneta; a foto da folha é lida pela IA,
 * conferida na tela e só então aplicada.
 */

export const LINHAS_POR_PAGINA = 22

export const COLUNAS_PADRAO: ColunasFicha = { sexo: true, faixa: true, peso: true, diagnostico: true, saida: true }

export const colunasRotulo: Record<keyof ColunasFicha, string> = {
  sexo: 'Sexo (M/F)',
  faixa: 'Faixa etária',
  peso: 'Peso (kg)',
  diagnostico: 'Prenha / vazia',
  saida: 'Saída (morreu, vendeu, descarte)'
}

/** Código curto impresso no topo: F-0001, F-0002... */
export function proximoCodigo(fichas: FichaCampo[]): string {
  const max = fichas.reduce((value, item) => Math.max(value, Number(item.codigo.replace(/\D/g, '')) || 0), 0)
  return `F-${String(max + 1).padStart(4, '0')}`
}

export interface DadosFicha {
  titulo: string
  data: string
  manejo: string | null
  produtos: string | null
  colunas: ColunasFicha
  animal_ids: string[]
}

export function criarFicha(fazenda: Fazenda, dados: DadosFicha): Resultado & { ficha: FichaCampo } {
  if (!dados.animal_ids.length) throw new Recusa('Escolha ao menos um animal para a ficha.')
  const data = lerData(dados.data)
  if (!data) throw new Recusa('Informe a data da ficha.')
  const ficha: FichaCampo = {
    id: crypto.randomUUID(),
    codigo: proximoCodigo(fazenda.fichas),
    titulo: dados.titulo.trim() || 'Ficha de campo',
    data,
    manejo: dados.manejo?.trim() || null,
    produtos: dados.produtos?.trim() || null,
    colunas: dados.colunas,
    animal_ids: dados.animal_ids,
    aplicada_em: null,
    created_at: new Date().toISOString()
  }
  return { ficha, ops: [{ t: 'insert', tabela: 'fichas', row: ficha as never }], mensagem: `Ficha ${ficha.codigo} criada com ${dados.animal_ids.length} animais.` }
}

/** Faixa escrita na leitura ("2", "13 a 24", "13-24") para a faixa do sistema. */
export function lerFaixa(value: string): Faixa | null {
  const text = value.trim().toLowerCase()
  if (!text) return null
  if (/^[1-4]$/.test(text)) return FAIXAS[Number(text) - 1]
  if (text.includes('acima') || text.includes('36+') || text.includes('>36')) return 'Acima de 36'
  for (const faixa of FAIXAS) if (text.replace(/\s|-|a/g, '') === faixa.toLowerCase().replace(/\s|a/g, '')) return faixa
  return FAIXAS.find((faixa) => text.startsWith(faixa.split(' ')[0])) ?? null
}

export function lerPeso(value: string): number | null {
  const clean = value.replace(/[^\d,.]/g, '').replace(',', '.')
  if (!clean) return null
  const number = Number(clean)
  return Number.isFinite(number) && number > 0 && number < 2000 ? Math.round(number * 10) / 10 : null
}

/** A linha tem alguma coisa a lançar? (presença só conta quando a ficha tem manejo do dia) */
export function linhaTemConteudo(ficha: FichaCampo, linha: LeituraFicha) {
  return Boolean(
    (ficha.manejo && linha.presente != null)
    || linha.sexo || linha.faixa.trim() || linha.peso.trim() || linha.diagnostico || linha.saida || linha.observacao.trim()
  )
}

export interface ResultadoFicha {
  linha: LeituraFicha
  ok: boolean
  texto: string
}

/** Uma linha da ficha: devolve as gravações e o resumo para a tela. */
function aplicarLinha(fazenda: Fazenda, ficha: FichaCampo, linha: LeituraFicha): { ops: Op[]; partes: string[] } {
  const animal = fazenda.animais.find((item) => ativo(item) && mesmoBrinco(item.brinco, linha.brinco))
  if (!animal) throw new Recusa(`brinco ${linha.brinco} não encontrado entre os animais ativos`)
  let state = fazenda
  const ops: Op[] = []
  const partes: string[] = []
  const run = (result: { ops: Op[] }) => { ops.push(...result.ops); state = aplicar(state, result.ops) }
  const alvo = { tipo: 'animal' as const, id: animal.id }
  const data = ficha.data

  const dados: { sexo?: 'M' | 'F'; faixa?: Faixa } = {}
  if (linha.sexo && linha.sexo !== animal.sexo) dados.sexo = linha.sexo
  const faixa = lerFaixa(linha.faixa)
  if (linha.faixa.trim() && !faixa) throw new Recusa(`faixa "${linha.faixa}" não entendida`)
  if (faixa && !animal.nascimento && faixa !== animal.faixa) dados.faixa = faixa
  if (Object.keys(dados).length) {
    run(salvarDados(state, animal.id, dados))
    if (dados.sexo) partes.push(`sexo ${dados.sexo}`)
    if (dados.faixa) partes.push(`faixa ${dados.faixa}`)
  }

  if (ficha.manejo && linha.presente != null) {
    run(adicionarManejo(state, alvo, { data, manejo: ficha.manejo, produtos: ficha.produtos, observacao: `Ficha ${ficha.codigo}${linha.presente ? '' : ' (faltou)'}` }, linha.presente ? 'Feito' : 'Pendente'))
    partes.push(linha.presente ? `${ficha.manejo.toLowerCase()} feito` : `${ficha.manejo.toLowerCase()} PENDENTE (faltou)`)
  }

  const peso = lerPeso(linha.peso)
  if (linha.peso.trim() && peso == null) throw new Recusa(`peso "${linha.peso}" não entendido`)
  if (peso != null) {
    run({ ops: [{ t: 'update', tabela: 'animais', id: animal.id, patch: { peso, data_avaliacao: animal.sexo === 'M' ? data : animal.data_avaliacao, updated_at: new Date().toISOString() } }] })
    if (ficha.manejo !== 'Pesagem') run(adicionarManejo(state, alvo, { data, manejo: 'Pesagem', observacao: `Peso: ${peso} kg (ficha ${ficha.codigo})` }))
    partes.push(`peso ${peso} kg`)
  }

  if (linha.diagnostico) {
    const current = state.animais.find((item) => item.id === animal.id)!
    if (current.sexo !== 'F') throw new Recusa('prenha/vazia marcado em animal que não é fêmea')
    const resultado = linha.diagnostico === 'prenha' ? 'Prenha' : 'Vazia'
    const slots = protocolosDoCiclo(state.protocolos, current.id, current.ciclo).map((item) => ({
      apta: item?.apta ?? null, motivo: item?.motivo ?? null, data_protocolo: item?.data_protocolo ?? null, data_confirmacao: item?.data_confirmacao ?? null, resultado: item?.resultado ?? null
    }))
    // Fecha o último protocolo aberto; sem protocolo aberto, usa o próximo vazio.
    let index = -1
    for (let i = slots.length - 1; i >= 0; i -= 1) if (slots[i].data_protocolo && !slots[i].resultado) { index = i; break }
    if (index < 0) index = slots.findIndex((item) => !item.resultado && !item.data_protocolo)
    if (index < 0) throw new Recusa('os 3 protocolos do ciclo já têm resultado')
    slots[index] = { ...slots[index], apta: slots[index].apta ?? 'S', data_confirmacao: data, resultado }
    run(salvarProtocolos(state, current.id, slots))
    partes.push(`${index + 1}º protocolo: ${resultado}`)
  }

  if (linha.observacao.trim()) {
    run(adicionarManejo(state, alvo, { data, manejo: 'Outro', observacao: `${linha.observacao.trim()} (ficha ${ficha.codigo})` }))
    partes.push('observação')
  }

  if (linha.saida) {
    const motivo: MotivoSaida = linha.saida === 'morte' ? 'Morte' : linha.saida === 'venda' ? 'Venda' : 'Descarte'
    run(darBaixa(state, animal.id, motivo, data))
    partes.push(`baixa por ${motivo.toLowerCase()} (agora ${rotuloBrinco({ brinco: animal.brinco, saida: motivo })})`)
  }

  return { ops, partes }
}

/** Aplica todas as linhas conferidas; uma linha com erro não impede as outras. */
export function aplicarFicha(fazenda: Fazenda, fichaId: string, linhas: LeituraFicha[]) {
  const ficha = fazenda.fichas.find((item) => item.id === fichaId)
  if (!ficha) throw new Recusa('Ficha não encontrada.')
  let state = fazenda
  const ops: Op[] = []
  const resultados: ResultadoFicha[] = []
  for (const linha of linhas) {
    if (!linhaTemConteudo(ficha, linha)) continue
    try {
      const result = aplicarLinha(state, ficha, linha)
      state = aplicar(state, result.ops)
      ops.push(...result.ops)
      resultados.push({ linha, ok: true, texto: result.partes.length ? `OK: ${result.partes.join(', ')}` : 'OK: nada mudou' })
    } catch (error) {
      resultados.push({ linha, ok: false, texto: `ERRO: ${error instanceof Error ? error.message : String(error)}` })
    }
  }
  const okCount = resultados.filter((item) => item.ok).length
  if (okCount) ops.push({ t: 'update', tabela: 'fichas', id: ficha.id, patch: { aplicada_em: new Date().toISOString() } })
  return { ops, resultados, estado: state, mensagem: `Ficha ${ficha.codigo}: ${okCount} animal(is) atualizado(s)${resultados.length - okCount ? `, ${resultados.length - okCount} com erro` : ''}.` }
}

/** Leitura em branco para cada animal da ficha (conferência manual, sem IA). */
export function leituraVazia(fazenda: Fazenda, ficha: FichaCampo): LeituraFicha[] {
  return ficha.animal_ids
    .map((id) => fazenda.animais.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((animal) => ({ brinco: animal.brinco, presente: null, sexo: '', faixa: '', peso: '', diagnostico: '', saida: '', observacao: '', confianca: 'alta' }))
}

