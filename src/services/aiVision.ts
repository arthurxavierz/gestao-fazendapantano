import type { AiConfidence, AiPhotoAnalysis } from '../types'
import { loadExportImage } from '../utils/images'
import { callFunction, seeded, simulatedDelay } from './functions'
import { isSupabaseConfigured } from './supabase'

/**
 * A leitura do brinco roda numa função do Netlify (netlify/functions/analisar-foto),
 * com a chave do Gemini guardada no servidor. Funciona com ou sem banco.
 *
 * Para usar a Edge Function antiga do Supabase, informe VITE_AI_FUNCTION_URL.
 */
const explicitUrl = import.meta.env.VITE_AI_FUNCTION_URL as string | undefined

/** O botão de leitura sempre aparece: sem IA configurada, a demonstração simula. */
export const isAiVisionConfigured = true

export interface AiVisionResult {
  analysis: AiPhotoAnalysis
  modelo: string
  /** Leitura de exemplo, feita sem IA (modo demonstração sem chave configurada). */
  simulated: boolean
}

/**
 * Comprime a foto no navegador e pede a leitura ao servidor. A compressão
 * reduz vários MB para algumas centenas de KB, o que faz diferença no 4G.
 */
export async function analyzeAnimalPhoto(photoUrl: string, takenNumbers: string[] = []): Promise<AiVisionResult> {
  const image = await loadExportImage(photoUrl, { maxSide: 1280 })
  if (!image) throw new Error('Não foi possível preparar a foto para análise.')
  const imageBase64 = image.dataUrl.slice(image.dataUrl.indexOf(',') + 1)

  const result = await callFunction<{ analysis: AiPhotoAnalysis; modelo: string }>(
    'analisar-foto',
    { imageBase64, mimeType: 'image/jpeg' },
    explicitUrl || undefined
  )

  if (result.status === 'ok') {
    if (!result.data?.analysis) throw new Error('O serviço não devolveu uma leitura para esta foto.')
    return { analysis: result.data.analysis, modelo: String(result.data.modelo ?? 'gemini'), simulated: false }
  }

  // Com banco ligado, é um sistema em uso: não inventa leitura, avisa o que falta.
  if (isSupabaseConfigured) {
    throw new Error('A leitura por IA ainda não foi ativada neste site. Cadastre a variável GEMINI_API_KEY no Netlify.')
  }
  await simulatedDelay()
  return { analysis: simulatePhoto(imageBase64, takenNumbers), modelo: 'demonstração', simulated: true }
}

/**
 * Leitura de exemplo para a demonstração: um brinco livre no rebanho, com
 * pelagem e raça comuns. Varia com a foto, mas é sempre a mesma para a mesma foto.
 */
function simulatePhoto(imageBase64: string, taken: string[]): AiPhotoAnalysis {
  const rand = seeded(imageBase64.slice(0, 4000) + imageBase64.length)
  const used = new Set(taken)
  const numeric = taken.map((n) => Number(n)).filter((n) => Number.isFinite(n))
  let next = (numeric.length ? Math.max(...numeric) : 500) + 1 + Math.floor(rand() * 3)
  while (used.has(String(next))) next += 1
  const options: [string, string, AiConfidence][] = [
    ['branca', 'Nelore', 'alta'],
    ['branca acinzentada', 'Nelore', 'media'],
    ['vermelha', 'Cruzamento (Nelore x Angus)', 'media'],
    ['preta', 'Angus', 'alta'],
    ['pintada', 'Cruzamento', 'baixa']
  ]
  const [pelagem, raca, racaConfianca] = options[Math.floor(rand() * options.length)]
  return {
    numero: String(next),
    numero_confianca: rand() > 0.3 ? 'alta' : 'media',
    pelagem,
    raca_sugerida: raca,
    raca_confianca: racaConfianca,
    observacao: ''
  }
}
