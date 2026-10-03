import type { AiConfidence, SheetKind, SheetReadRow } from '../types'
import { loadExportImage } from '../utils/images'
import { callFunction, seeded, simulatedDelay } from './functions'
import { isSupabaseConfigured } from './supabase'

/**
 * Leitura de folha de campo por IA (netlify/functions/analisar-folha).
 *
 * A folha é impressa pelo sistema com os brincos já escritos. Mandar a lista de
 * números impressos faz a IA casar cada linha com o animal certo, em vez de
 * tentar decifrar dígitos manuscritos, que é a parte mais frágil.
 */
const explicitUrl = import.meta.env.VITE_SHEET_FUNCTION_URL as string | undefined

export interface ExpectedRow {
  number: string
  /** Valor provável, usado só na leitura simulada (ex.: peso esperado). */
  hint?: string
}

export interface SheetReadResult {
  linhas: SheetReadRow[]
  modelo: string
  simulated: boolean
}

export async function readFieldSheet(photoUrl: string, kind: SheetKind, expected: ExpectedRow[]): Promise<SheetReadResult> {
  const image = await loadExportImage(photoUrl, { maxSide: 1800 })
  if (!image) throw new Error('Não foi possível preparar a foto da folha.')
  const imageBase64 = image.dataUrl.slice(image.dataUrl.indexOf(',') + 1)

  const result = await callFunction<{ linhas: SheetReadRow[]; modelo: string }>(
    'analisar-folha',
    { imageBase64, mimeType: 'image/jpeg', kind, numeros: expected.map((item) => item.number) },
    explicitUrl || undefined
  )

  if (result.status === 'ok') {
    return { linhas: result.data.linhas ?? [], modelo: String(result.data.modelo ?? 'gemini'), simulated: false }
  }
  if (isSupabaseConfigured) {
    throw new Error('A leitura de folhas por IA ainda não foi ativada neste site. Cadastre a variável GEMINI_API_KEY no Netlify.')
  }
  await simulatedDelay(1800)
  return { linhas: simulateSheet(kind, expected, imageBase64), modelo: 'demonstração', simulated: true }
}

/**
 * Folha "lida" de exemplo: a maioria das linhas preenchida com segurança e
 * algumas com confiança média, para mostrar como a conferência funciona.
 */
function simulateSheet(kind: SheetKind, expected: ExpectedRow[], seedText: string): SheetReadRow[] {
  const rand = seeded(seedText.slice(0, 3000) + kind + expected.length)
  return expected.map((row, index) => {
    const doubt = rand() < 0.12
    const confidence: AiConfidence = doubt ? 'media' : 'alta'
    if (kind === 'diagnostico') {
      return { numero: row.number, numero_confianca: 'alta', marcado: rand() < 0.68, marcado_confianca: confidence, valor: '', observacao: index === 2 ? 'Rever em 15 dias' : '' }
    }
    if (kind === 'pesagem') {
      const base = Number(row.hint) || 380 + Math.round(rand() * 120)
      const value = Math.round(base + (rand() - 0.5) * 8)
      return { numero: row.number, numero_confianca: 'alta', marcado: true, marcado_confianca: 'alta', valor: String(value), observacao: '' }
    }
    return { numero: row.number, numero_confianca: 'alta', marcado: rand() > 0.08, marcado_confianca: confidence, valor: '', observacao: '' }
  })
}
