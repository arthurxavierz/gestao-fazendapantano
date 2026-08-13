import type { SheetKind, SheetReadResult } from '../types'
import { loadExportImage } from '../utils/images'
import { isSupabaseConfigured, supabase } from './supabase'

const explicitUrl = import.meta.env.VITE_SHEET_FUNCTION_URL as string | undefined
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** URL da Edge Function. Deriva do Supabase quando não é informada explicitamente. */
const functionUrl = explicitUrl
  || (supabaseUrl ? `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/analisar-folha` : undefined)

/**
 * A leitura de ficha só é oferecida quando há para onde enviar a foto. Em modo
 * de demonstração puro o botão simplesmente não aparece.
 */
export const isSheetVisionConfigured = Boolean(functionUrl && (explicitUrl || isSupabaseConfigured))

async function authorizationHeader() {
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) return token
  }
  return anonKey ?? ''
}

/**
 * Comprime a foto da folha preenchida e pede a leitura à Edge Function.
 * Enviar os números esperados (impressos na folha) ajuda a IA a casar cada
 * linha com o animal certo, em vez de tentar adivinhar dígitos escritos à mão.
 */
export async function readFieldSheet(
  photoUrl: string,
  kind: SheetKind,
  expectedNumbers: string[]
): Promise<SheetReadResult> {
  if (!functionUrl) throw new Error('A leitura de fichas por IA não está configurada neste ambiente.')

  const image = await loadExportImage(photoUrl, { maxSide: 1600 })
  if (!image) throw new Error('Não foi possível preparar a foto para leitura.')

  const imageBase64 = image.dataUrl.slice(image.dataUrl.indexOf(',') + 1)
  const token = await authorizationHeader()

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(anonKey ? { apikey: anonKey } : {})
    },
    body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg', kind, numeros: expectedNumbers })
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const base = payload?.error || 'Não foi possível ler a folha agora.'
    throw new Error(payload?.detail ? `${base} (${payload.detail})` : base)
  }
  if (!Array.isArray(payload?.linhas)) {
    throw new Error('O serviço não devolveu uma leitura para esta folha.')
  }

  return { linhas: payload.linhas, modelo: String(payload.modelo ?? 'gemini') }
}
