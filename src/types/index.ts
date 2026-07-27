export type AnimalStatus = 'normal' | 'observacao' | 'doente' | 'morto' | 'vendido'
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

export interface DashboardSummary {
  total: number
  normal: number
  observacao: number
  doente: number
  morto: number
  vendido: number
}
