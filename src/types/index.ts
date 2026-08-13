export type AnimalStatus = 'normal' | 'observacao' | 'doente' | 'descarte' | 'morto' | 'vendido'
export type AnimalSex = 'macho' | 'femea' | 'nao_informado'

export type UserRole = 'administrador' | 'operador'

/** Conta de acesso ao sistema. O papel é definido no banco, nunca pelo navegador. */
export interface Profile {
  id: string
  full_name: string | null
  email: string | null
  role: UserRole
  created_at: string
}

/** Quanto a IA confia na própria leitura. 'ilegivel' significa que ela não conseguiu ler. */
export type AiConfidence = 'alta' | 'media' | 'baixa' | 'ilegivel'

/** O que a IA interpretou a partir da foto. Nada disso é salvo sem confirmação do usuário. */
export interface AiPhotoAnalysis {
  numero: string
  numero_confianca: AiConfidence
  pelagem: string
  raca_sugerida: string
  raca_confianca: AiConfidence
  observacao: string
}

/** Registro do que a IA sugeriu e do que o usuário de fato aceitou, para medir o acerto ao longo do tempo. */
export interface AiAnalysisRecord {
  analisado_em: string
  modelo: string
  sugestao: AiPhotoAnalysis
  campos_aceitos: string[]
}

export interface Animal {
  id: string
  number: string
  name?: string | null
  photo_url?: string | null
  sex: AnimalSex
  breed?: string | null
  coat?: string | null
  birth_date?: string | null
  birth_date_approximate?: boolean
  weight?: number | null
  lot?: string | null
  origin?: string | null
  status: AnimalStatus
  notes?: string | null
  // Genealogia: aponta para a matriz (mãe) quando o animal nasceu na fazenda.
  mother_id?: string | null
  ai_analysis?: AiAnalysisRecord | null
  created_by?: string | null
  updated_by?: string | null
  created_at: string
  updated_at: string
}

export type OccurrenceType = 'observacao' | 'doenca' | 'morte' | 'recuperado' | 'outro'

export interface Occurrence {
  id: string
  animal_id: string
  animal_number?: string
  type: OccurrenceType
  note: string
  photo_url?: string | null
  created_at: string
  created_by?: string | null
}

export interface CountSession {
  id: string
  title: string
  mode: 'individual' | 'quantity'
  expected_total?: number | null
  total_counted: number
  animal_numbers: string[]
  notes?: string | null
  created_by?: string | null
  created_at: string
}

// ============================================================
// Reprodução (IATF / estação de monta)
// ============================================================
// Resultado do diagnóstico de gestação de uma tentativa de protocolo.
export type ConfirmationResult = 'pendente' | 'prenha' | 'vazia'

/**
 * Uma tentativa de protocolo reprodutivo de uma matriz (1ª, 2ª, 3ª...).
 * Acumular tentativas 'vazia' até o limite sinaliza a matriz para descarte.
 */
export interface BreedingAttempt {
  id: string
  animal_id: string
  animal_number?: string
  attempt_number: number
  protocol_date: string
  protocol_type?: string | null
  semen?: string | null
  confirmation_date?: string | null
  result: ConfirmationResult
  notes?: string | null
  created_by?: string | null
  created_at: string
}

// ============================================================
// Manejos do rebanho
// ============================================================
export type ManagementType =
  | 'vacinacao'
  | 'vermifugacao'
  | 'protocolo'
  | 'pesagem'
  | 'suplementacao'
  | 'outro'

export interface ManagementProduct {
  name: string
  dose?: string | null
}

/** Participação de um animal específico em um manejo (vem da folha de campo). */
export interface ManagementParticipant {
  animal_id: string
  number: string
  present: boolean
  done: boolean
  weight?: number | null
  note?: string | null
}

export interface ManagementEvent {
  id: string
  date: string
  type: ManagementType
  title: string
  products: ManagementProduct[]
  lot?: string | null
  // Quantidade de cabeças. No modo detalhado, deriva dos participantes.
  animal_count: number
  participants: ManagementParticipant[]
  notes?: string | null
  created_by?: string | null
  created_at: string
}

// ============================================================
// Leitura de fichas de campo preenchidas à mão (agente integrado)
// ============================================================
// Contrato genérico devolvido pela IA ao ler uma folha impressa e preenchida.
// Cada linha traz o número do animal (impresso), se a marca principal foi feita
// à caneta, um valor escrito à mão e uma observação, com nível de confiança.
export type SheetKind = 'manejo' | 'reproducao'

export interface SheetReadRow {
  numero: string
  numero_confianca: AiConfidence
  marcado: boolean
  marcado_confianca: AiConfidence
  valor: string
  observacao: string
}

export interface SheetReadResult {
  linhas: SheetReadRow[]
  modelo: string
}

export interface DashboardSummary {
  total: number
  normal: number
  observacao: number
  doente: number
  descarte: number
  morto: number
  vendido: number
}
