import type { AiPhotoAnalysis } from '../types'
import { loadExportImage } from '../utils/images'
import { isSupabaseConfigured, supabase } from './supabase'

const explicitUrl = import.meta.env.VITE_AI_FUNCTION_URL as string | undefined
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** URL da Edge Function. Deriva do Supabase quando não é informada explicitamente. */
const functionUrl = explicitUrl
  || (supabaseUrl ? `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/analisar-foto` : undefined)

/**
 * A análise só é oferecida quando há para onde enviar a foto. Em modo de
 * demonstração puro o botão simplesmente não aparece.
 */
export const isAiVisionConfigured = Boolean(functionUrl && (explicitUrl || isSupabaseConfigured))

export interface AiVisionResult {
  analysis: AiPhotoAnalysis
  modelo: string
}

async function authorizationHeader() {
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) return token
  }
  return anonKey ?? ''
}

/**
 * Comprime a foto no navegador e pede a leitura à Edge Function.
 * A compressão reduz o envio de vários MB para algumas centenas de KB, o que
 * economiza cota gratuita e faz muita diferença no 4G da fazenda.
 */
export async function analyzeAnimalPhoto(photoUrl: string): Promise<AiVisionResult> {
  if (!functionUrl) throw new Error('A análise por IA não está configurada neste ambiente.')

  const image = await loadExportImage(photoUrl, { maxSide: 1280 })
  if (!image) throw new Error('Não foi possível preparar a foto para análise.')

  const imageBase64 = image.dataUrl.slice(image.dataUrl.indexOf(',') + 1)
  const token = await authorizationHeader()

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(anonKey ? { apikey: anonKey } : {})
    },
    body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg' })
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const base = payload?.error || 'Não foi possível analisar a foto agora.'
    // O detalhe vem do provedor e ajuda a diagnosticar a configuração.
    throw new Error(payload?.detail ? `${base} (${payload.detail})` : base)
  }
  if (!payload?.analysis) {
    throw new Error('O serviço não devolveu uma leitura para esta foto.')
  }

  return { analysis: payload.analysis as AiPhotoAnalysis, modelo: String(payload.modelo ?? 'gemini') }
}
