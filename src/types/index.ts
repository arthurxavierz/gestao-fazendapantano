/**
 * Modelo de dados do rebanho, espelhando a planilha Gado_Rebanho_Fazenda (v11).
 * As regras que operam sobre estes tipos estão em src/domain/regras.ts e a
 * descrição completa em docs/REGRAS-DA-PLANILHA.md.
 */

export type UserRole = 'administrador' | 'operador'

/** Conta de acesso ao sistema. O papel é definido no banco, nunca pelo navegador. */
export interface Profile {
  id: string
  full_name: string | null
  email: string | null
  role: UserRole
  created_at: string
}

export type Sexo = 'M' | 'F'
export type Faixa = '0 a 12' | '13 a 24' | '25 a 36' | 'Acima de 36'
export type MotivoSaida = 'Venda' | 'Morte' | 'Descarte'
export type ResultadoProtocolo = 'Prenha' | 'Vazia'

/** Um animal do rebanho (aba Geral, com os dados das abas Machos e Fêmeas). */
export interface Animal {
  id: string
  /** Brinco. Único entre os ativos; volta a ficar livre quando o animal sai. */
  brinco: string
  sexo: Sexo | null
  nascimento: string | null
  /** Faixa informada à mão. Com nascimento, vale a faixa calculada. */
  faixa: Faixa | null
  raca: string | null
  cor: string | null
  no_ima: boolean | null
  observacoes: string | null
  /** Conferência da foto do cadastro inicial ("Conferir no curral: ..."). */
  conferencia: string | null
  foto_url: string | null
  /** Impressão digital da foto (dHash de 64 bits, em hexadecimal), para achar fotos repetidas. */
  foto_hash?: string | null
  /** Ordem original da planilha, para a lista abrir igual. */
  ordem: number | null
  /** Fêmea: número do ciclo de IATF atual (começa em 1, sobe a cada parto). */
  ciclo: number
  /** Macho: avaliação, data da avaliação e peso. */
  avaliacao: string | null
  data_avaliacao: string | null
  peso: number | null
  /** Saída do rebanho. Preenchida = animal baixado (aparece como X + brinco). */
  saida: MotivoSaida | null
  data_saida: string | null
  /** Quando veio de um bezerro incorporado, o id do bezerro. */
  bezerro_id: string | null
  created_by?: string | null
  created_at: string
  updated_at?: string | null
}

/** Um protocolo de IATF de uma fêmea: 1º, 2º ou 3º do ciclo. */
export interface Protocolo {
  id: string
  animal_id: string
  ciclo: number
  /** 1, 2 ou 3. */
  numero: number
  apta: 'S' | 'N' | null
  motivo: string | null
  data_protocolo: string | null
  data_confirmacao: string | null
  resultado: ResultadoProtocolo | null
  created_by?: string | null
  created_at: string
}

/** Ciclo encerrado pelo parto (aba Protocolos anteriores). */
export interface CicloEncerrado {
  id: string
  animal_id: string
  ciclo: number
  data_parto: string | null
  bezerro_codigo: string | null
  encerrado_em: string
  created_by?: string | null
  created_at: string
}

export type SituacaoBezerro = 'Mamando' | 'Ficou na fazenda' | 'Vendido' | 'Morto' | 'Descarte' | 'Incorporado ao rebanho'

export interface Bezerro {
  id: string
  /** Código provisório: <brinco da mãe>-B<n>. */
  codigo: string
  mae_id: string
  nascimento: string | null
  sexo: Sexo | null
  situacao: SituacaoBezerro
  data_destino: string | null
  brinco_definitivo: string | null
  observacoes: string | null
  incorporado_em: string | null
  /** Animal criado ao incorporar. */
  animal_id: string | null
  created_by?: string | null
  created_at: string
}

export type StatusManejo = 'Feito' | 'Pendente' | 'Feito depois'

/** Uma linha do histórico de manejos (aba Manejos). */
export interface Manejo {
  id: string
  data: string
  /** Animal ou bezerro: exatamente um dos dois. */
  animal_id: string | null
  bezerro_id: string | null
  manejo: string
  produtos: string | null
  observacao: string | null
  status: StatusManejo
  feito_em: string | null
  /** Manejos lançados juntos (manejo em lote) compartilham o mesmo lote_id. */
  lote_id: string | null
  created_by?: string | null
  created_at: string
}

export type SituacaoNumero = 'Disponível' | 'Reutilizado' | 'Baixa desfeita'

/** Número de brinco liberado por uma saída (aba Números disponíveis). */
export interface NumeroLiberado {
  id: string
  numero: string
  animal_id: string
  liberado_em: string
  /** Como o registro ficou guardado: X149. */
  registro_antigo: string
  situacao: SituacaoNumero
  motivo: string | null
  reutilizado_em: string | null
  created_by?: string | null
  created_at: string
}

export type ContagemIma = Record<Faixa, { M: number; F: number }>

/** Consolidado do IMA digitado para comparação. */
export interface RelatorioIma {
  id: string
  data_relatorio: string | null
  contagem: ContagemIma
  created_by?: string | null
  created_at: string
}

export type CodigoQuadro = 'N' | 'M' | 'S' | 'V' | 'F' | 'P' | 'D' | 'O'

/** Linha lançada a partir do quadro de campo (aba Lançar do quadro). */
export interface LancamentoQuadro {
  id: string
  data: string | null
  brinco: string
  codigo: string
  detalhe: string | null
  resultado: string
  ok: boolean
  created_by?: string | null
  created_at: string
}

/** Par de animais que alguém conferiu e disse que são diferentes (some da revisão de duplicados). */
export interface Revisao {
  id: string
  a_id: string
  b_id: string
  decisao: 'diferentes'
  created_by?: string | null
  created_at: string
}

/** Colunas de checklist que a ficha de campo traz. */
export interface ColunasFicha {
  sexo: boolean
  faixa: boolean
  peso: boolean
  diagnostico: boolean
  saida: boolean
}

/**
 * Ficha de campo impressa: a lista de animais (na ordem impressa) com as
 * colunas de checklist. O código vai impresso no topo para a IA saber qual é.
 */
export interface FichaCampo {
  id: string
  codigo: string
  titulo: string
  data: string
  /** Manejo do dia (vacina, pesagem...). Presente = feito; ausente = pendente. */
  manejo: string | null
  produtos: string | null
  colunas: ColunasFicha
  animal_ids: string[]
  aplicada_em: string | null
  created_by?: string | null
  created_at: string
}

/** Uma linha da ficha lida pela IA (ou digitada na conferência). */
export interface LeituraFicha {
  brinco: string
  presente: boolean | null
  sexo: 'M' | 'F' | ''
  faixa: string
  peso: string
  diagnostico: 'prenha' | 'vazia' | ''
  saida: 'morte' | 'venda' | 'descarte' | ''
  observacao: string
  confianca: AiConfidence
}

/** Quanto a IA confia na própria leitura. 'ilegivel' significa que ela não conseguiu ler. */
export type AiConfidence = 'alta' | 'media' | 'baixa' | 'ilegivel'

/** O que a IA interpretou a partir da foto do animal. Nada disso é salvo sem confirmação. */
export interface AiPhotoAnalysis {
  numero: string
  numero_confianca: AiConfidence
  pelagem: string
  raca_sugerida: string
  raca_confianca: AiConfidence
  observacao: string
}

/** Uma anotação do quadro de campo lida pela IA a partir da foto. */
export interface LeituraQuadro {
  data: string
  brinco: string
  codigo: string
  detalhe: string
  confianca: AiConfidence
}
