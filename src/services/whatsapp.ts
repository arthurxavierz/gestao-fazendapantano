import type { Animal, BreedingAttempt, FarmSettings, HealthEvent, Occurrence, ReproProtocol, Weighing } from '../types'
import { callFunction } from './functions'
import { isSupabaseConfigured, supabase } from './supabase'

/**
 * Canal do WhatsApp visto pelo sistema: registro de mensagens e lançamentos,
 * contatos autorizados e o simulador. A lógica de verdade roda no servidor
 * (netlify/lib/campo); aqui só lemos e mostramos.
 */

export type WaPermission = 'consulta' | 'lancamento'

export interface WaContact {
  id: string
  phone: string
  name: string
  profile_id: string | null
  permission: WaPermission
  active: boolean
  notes?: string | null
  last_seen_at?: string | null
  created_at: string
}

export interface WaTool {
  name: string
  input: Record<string, unknown>
  ok: boolean
  output?: unknown
}

export interface WaInterpretation {
  route?: 'assistente' | 'confirmacao' | 'lote' | 'lote_fechar'
  model?: string
  served_by?: string
  tools?: WaTool[]
  usage?: { input: number; output: number; cache_read: number; cache_write: number }
  turns?: number
  refusal?: unknown
  actions?: string[]
  transcription?: { model: string; confidence: string; doubts: string[] }
  button_id?: string
  profile_name?: string
  itens?: unknown[]
}

export interface WaMessage {
  id: string
  wamid: string | null
  direction: 'in' | 'out'
  phone: string
  contact_id: string | null
  kind: string
  body: string | null
  media_path: string | null
  transcription: string | null
  sent_at: string | null
  received_at: string
  status: string
  attempts: number
  error: string | null
  interpretation: WaInterpretation | null
  reply_to: string | null
  action_id: string | null
  simulated: boolean
}

export type WaActionStatus = 'pendente' | 'confirmada' | 'aplicada' | 'cancelada' | 'expirada' | 'erro' | 'desfeita'

export interface WaAction {
  id: string
  code: string
  contact_id: string | null
  message_id: string | null
  session_id: string | null
  kind: string
  payload: { input?: Record<string, unknown>; animalCount?: number; target_code?: string }
  summary: string
  warnings: string[]
  event_date: string
  status: WaActionStatus
  confirmed_at: string | null
  applied_at: string | null
  result_refs: { table: string; id: string; op: 'insert' | 'update' }[]
  error: string | null
  reminder_sent_at: string | null
  undone_at: string | null
  simulated: boolean
  created_at: string
}

export interface WaSession {
  id: string
  contact_id: string | null
  kind: string
  params: Record<string, unknown>
  entries: { number: string; value: unknown; at: string }[]
  status: 'aberta' | 'fechada' | 'cancelada'
  started_at: string
  closed_at: string | null
}

export interface WaStatus {
  whatsapp: boolean
  assinatura: boolean
  verificacao: boolean
  claude: boolean
  modelo: string
  transcricao: boolean
  banco: boolean
  modelo_aviso: boolean
  demonstracao: boolean
}

/** Estado do ensaio: a conversa inteira em memória, guardada no navegador entre uma mensagem e outra. */
export interface SimState {
  contacts: WaContact[]
  messages: WaMessage[]
  actions: WaAction[]
  sessions: WaSession[]
  herd: unknown
}

export interface SimReply {
  wamid: string
  type: 'text' | 'buttons' | 'template'
  text: string
  buttons?: { id: string; title: string }[]
  at: string
}

export interface SimResult {
  replies: SimReply[]
  inbound: WaMessage | null
  elapsed_ms: number
  mode: 'ensaio' | 'real'
  state: SimState | null
}

export interface SimMessage {
  kind: 'text' | 'audio' | 'image' | 'button'
  text?: string
  base64?: string
  mime?: string
  buttonId?: string
  sentAt?: string
}

export interface HerdForSim {
  animals: Animal[]
  attempts: BreedingAttempt[]
  health: HealthEvent[]
  weighings: Weighing[]
  occurrences: Occurrence[]
  protocols: ReproProtocol[]
  settings: FarmSettings
}

export const actionKindLabel: Record<string, string> = {
  protocolo_inicio: 'Início de protocolo',
  protocolo_etapa: 'Etapa de protocolo',
  inseminacao: 'Inseminação',
  diagnostico: 'Diagnóstico',
  parto: 'Parto',
  sanitario: 'Sanitário',
  pesagem: 'Pesagem',
  ocorrencia: 'Ocorrência',
  saida: 'Saída',
  lote: 'Troca de lote',
  contagem: 'Contagem',
  desfazer: 'Desfazer'
}

export const actionStatusLabel: Record<WaActionStatus, string> = {
  pendente: 'Aguardando confirmação',
  confirmada: 'Gravando',
  aplicada: 'Gravado',
  cancelada: 'Cancelado',
  expirada: 'Expirou',
  erro: 'Erro',
  desfeita: 'Desfeito'
}

export async function getWhatsappStatus(): Promise<WaStatus | null> {
  const result = await callFunction<WaStatus>('whatsapp-painel', { action: 'status' })
  return result.status === 'ok' ? result.data : null
}

export async function simulate(input: {
  message: SimMessage
  state: SimState | null
  mode: 'ensaio' | 'real'
  name: string
  permission: WaPermission
  contactId?: string
  herd?: HerdForSim
}) {
  return callFunction<SimResult>('whatsapp-painel', { action: 'simular', ...input })
}

// ------------------------------------------------------------------
// Banco (só administrador enxerga, pelas políticas do Supabase)
// ------------------------------------------------------------------

export const whatsappDatabase = isSupabaseConfigured

export async function listWaMessages(sinceIso: string): Promise<WaMessage[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('whatsapp_messages').select('*').gte('received_at', sinceIso).order('received_at', { ascending: false }).limit(500)
  if (error) throw error
  return (data ?? []) as WaMessage[]
}

export async function listWaActions(sinceIso: string): Promise<WaAction[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('whatsapp_actions').select('*').gte('created_at', sinceIso).order('created_at', { ascending: false }).limit(300)
  if (error) throw error
  return (data ?? []) as WaAction[]
}

export async function listWaContacts(): Promise<WaContact[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('whatsapp_contacts').select('*').order('name')
  if (error) throw error
  return (data ?? []) as WaContact[]
}

export async function saveWaContact(contact: Partial<WaContact> & Pick<WaContact, 'phone' | 'name'>) {
  if (!supabase) throw new Error('Os contatos ficam no banco. Configure o Supabase para cadastrar.')
  const body = {
    phone: normalizePhone(contact.phone),
    name: contact.name.trim(),
    profile_id: contact.profile_id || null,
    permission: contact.permission ?? 'lancamento',
    active: contact.active ?? true,
    notes: contact.notes || null
  }
  const query = contact.id ? supabase.from('whatsapp_contacts').update(body).eq('id', contact.id) : supabase.from('whatsapp_contacts').insert(body)
  const { error } = await query
  if (error) {
    if (error.code === '23505') throw new Error('Esse número já está cadastrado.')
    if (error.code === '23514') throw new Error('Número inválido. Use DDI + DDD + número, ex.: 55 34 99999-8888.')
    throw error
  }
}

export async function deleteWaContact(id: string) {
  if (!supabase) return
  const { error } = await supabase.from('whatsapp_contacts').delete().eq('id', id)
  if (error) throw error
}

/** Link temporário para ouvir o áudio original guardado no bucket privado. */
export async function mediaUrl(path: string) {
  if (!supabase) return null
  const { data } = await supabase.storage.from('whatsapp-media').createSignedUrl(path, 600)
  return data?.signedUrl ?? null
}

/** Celular no formato da Meta: só dígitos, com 55 na frente quando faltar. */
export function normalizePhone(value: string) {
  const digits = value.replace(/\D+/g, '')
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

export function formatPhone(value: string) {
  const m = value.match(/^55(\d{2})(\d{4,5})(\d{4})$/)
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${value}`
}

// ------------------------------------------------------------------
// Gravação de áudio no navegador
// ------------------------------------------------------------------

/**
 * O navegador grava em WebM, que o serviço de transcrição não aceita. Antes de
 * enviar, o áudio é convertido para WAV mono de 16 kHz (tamanho pequeno e
 * qualidade suficiente para voz).
 */
export async function toWav16k(blob: Blob): Promise<{ base64: string; seconds: number }> {
  const buffer = await blob.arrayBuffer()
  const ctx = new AudioContext()
  const decoded = await ctx.decodeAudioData(buffer)
  await ctx.close()
  const rate = 16000
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  const samples = rendered.getChannelData(0)
  const wav = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) wav.setUint8(offset + i, text.charCodeAt(i)) }
  write(0, 'RIFF'); wav.setUint32(4, 36 + samples.length * 2, true); write(8, 'WAVE')
  write(12, 'fmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true)
  wav.setUint32(24, rate, true); wav.setUint32(28, rate * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true)
  write(36, 'data'); wav.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) wav.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true)
  const bytes = new Uint8Array(wav.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { base64: btoa(binary), seconds: decoded.duration }
}

export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// ------------------------------------------------------------------
// Custo estimado por mensagem (preços de tabela por milhão de tokens, em US$)
// ------------------------------------------------------------------

const PRICES: Record<string, [number, number]> = {
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5': [4, 20]
}
export const USD_BRL = 5.5

export function estimateCostBRL(model: string | undefined, usage: WaInterpretation['usage']) {
  if (!usage) return null
  const [inp, out] = PRICES[model ?? ''] ?? PRICES['claude-sonnet-5-5']
  const usd = (usage.input * inp + usage.cache_write * inp * 1.25 + usage.cache_read * inp * 0.1 + usage.output * out) / 1_000_000
  return usd * USD_BRL
}
