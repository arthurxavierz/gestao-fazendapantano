/**
 * Situação geral do animal.
 * 'descarte' significa que ele foi separado para abate (por exemplo, a matriz
 * que esgotou as tentativas de prenhez). 'abatido' é a saída efetiva.
 */
export type AnimalStatus = 'normal' | 'observacao' | 'doente' | 'descarte' | 'morto' | 'vendido' | 'abatido'
export type AnimalSex = 'macho' | 'femea' | 'nao_informado'

/** Categoria zootécnica. Quando não informada, é deduzida pelo sexo e pela idade. */
export type AnimalCategory = 'bezerro' | 'bezerra' | 'garrote' | 'novilha' | 'vaca' | 'touro' | 'boi'

/** De onde o animal veio. Nascido aponta para a mãe; comprado aponta para o lote de compra. */
export type OriginType = 'nascido' | 'comprado' | 'nao_informado'

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
  category?: AnimalCategory | null
  breed?: string | null
  coat?: string | null
  birth_date?: string | null
  birth_date_approximate?: boolean
  weight?: number | null
  lot?: string | null
  /** Texto livre herdado das versões anteriores. O vínculo real fica em origin_type. */
  origin?: string | null
  origin_type?: OriginType | null
  /** Mãe, quando o animal nasceu na fazenda. */
  mother_id?: string | null
  /** Touro ou sêmen usado. Texto porque o pai raramente está cadastrado. */
  sire?: string | null
  /** Lote de compra, quando o animal foi comprado. */
  purchase_batch_id?: string | null
  /** Data em que o animal entrou no rebanho (nascimento ou chegada). */
  entry_date?: string | null
  exit_date?: string | null
  exit_reason?: string | null
  status: AnimalStatus
  notes?: string | null
  ai_analysis?: AiAnalysisRecord | null
  created_by?: string | null
  updated_by?: string | null
  created_at: string
  updated_at: string
}

export type OccurrenceType = 'observacao' | 'doenca' | 'morte' | 'recuperado' | 'descarte' | 'outro'

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

/** Compra de um grupo de animais. Todo animal comprado aponta para uma destas. */
export interface PurchaseBatch {
  id: string
  code: string
  supplier?: string | null
  purchase_date: string
  quantity?: number | null
  total_value?: number | null
  avg_weight?: number | null
  gta?: string | null
  notes?: string | null
  created_by?: string | null
  created_at: string
}

export type ProtocolStepKind = 'aplicacao' | 'retirada' | 'inseminacao' | 'diagnostico' | 'outro'

export interface ProtocolStep {
  /** Dia relativo ao início do protocolo (D0, D8, D10...). */
  day: number
  title: string
  description?: string
  kind: ProtocolStepKind
}

export type BreedingMethod = 'iatf' | 'ia' | 'monta' | 'te'
export type BreedingResult = 'pendente' | 'prenhe' | 'vazia' | 'aborto' | 'parida'

/** Modelo de protocolo reprodutivo (IATF, repasse com touro etc). */
export interface ReproProtocol {
  id: string
  name: string
  description?: string | null
  method: BreedingMethod
  steps: ProtocolStep[]
  active: boolean
  created_by?: string | null
  created_at: string
}

/**
 * Uma tentativa de prenhez de uma matriz. Cada protocolo iniciado é uma linha.
 * A sequência de tentativas sem sucesso é o que leva ao descarte.
 */
export interface BreedingAttempt {
  id: string
  animal_id: string
  method: BreedingMethod
  protocol_id?: string | null
  protocol_name?: string | null
  /** Cópia dos passos no momento do início, para o histórico não mudar se o modelo for editado. */
  steps: ProtocolStep[]
  /** Índices dos passos concluídos e quando. */
  steps_done: { index: number; done_at: string }[]
  start_date: string
  insemination_date?: string | null
  sire?: string | null
  technician?: string | null
  diagnosis_date?: string | null
  result: BreedingResult
  expected_calving_date?: string | null
  calving_date?: string | null
  calf_id?: string | null
  notes?: string | null
  created_by?: string | null
  created_at: string
}

export type HealthKind = 'vacina' | 'vermifugo' | 'carrapaticida' | 'medicamento' | 'exame' | 'outro'

/** Aplicação sanitária em um animal. Aplicações em lote geram uma linha por animal. */
export interface HealthEvent {
  id: string
  animal_id: string
  kind: HealthKind
  product: string
  dose?: string | null
  applied_at: string
  next_due_date?: string | null
  /** Fim da carência: o animal não deve ir para abate antes desta data. */
  withdrawal_until?: string | null
  product_batch?: string | null
  notes?: string | null
  created_by?: string | null
  created_at: string
}

export interface Weighing {
  id: string
  animal_id: string
  weighed_at: string
  weight: number
  notes?: string | null
  created_by?: string | null
  created_at: string
}

/** Regras que mudam de fazenda para fazenda. Ficam numa única linha no banco. */
export interface FarmSettings {
  /** Tentativas seguidas sem prenhez até a matriz ir para descarte. */
  max_breeding_attempts: number
  /** Duração média da gestação, em dias, para prever o parto. */
  gestation_days: number
  /** Dias após a inseminação para o diagnóstico de gestação. */
  diagnosis_days: number
  /** Idade mínima, em meses, para uma fêmea entrar em reprodução. */
  min_breeding_age_months: number
}

export interface DashboardSummary {
  total: number
  normal: number
  observacao: number
  doente: number
  morto: number
  vendido: number
}
