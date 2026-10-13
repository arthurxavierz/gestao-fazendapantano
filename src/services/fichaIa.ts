import { LINHAS_POR_PAGINA } from '../domain/ficha'
import type { AiConfidence, FichaCampo, LeituraFicha } from '../types'
import { loadExportImage } from '../utils/images'
import { callFunction, seeded, simulatedDelay } from './functions'
import { isSupabaseConfigured } from './supabase'

export interface LeituraPagina {
  linhas: LeituraFicha[]
  codigo: string
  simulada: boolean
}

/**
 * Lê a foto de uma página da ficha (netlify/functions/ler-ficha). Vai junto a
 * lista de brincos impressos, para a IA casar cada linha com o animal certo em
 * vez de tentar ler números à mão.
 */
export async function lerPaginaDaFicha(file: File, ficha: FichaCampo, brincos: string[], naoLidos: string[] = brincos): Promise<LeituraPagina> {
  const url = URL.createObjectURL(file)
  try {
    const image = await loadExportImage(url, { maxSide: 2400 })
    if (!image) throw new Error('Não foi possível preparar a foto.')
    const imageBase64 = image.dataUrl.slice(image.dataUrl.indexOf(',') + 1)
    const result = await callFunction<{ linhas: LeituraFicha[]; codigo: string }>('ler-ficha', {
      imageBase64, mimeType: 'image/jpeg', codigo: ficha.codigo, brincos, colunas: ficha.colunas, manejo: ficha.manejo
    })
    if (result.status === 'ok') {
      return { linhas: (result.data.linhas ?? []).map(normalizar), codigo: result.data.codigo ?? '', simulada: false }
    }
    if (isSupabaseConfigured) throw new Error(`A leitura por IA não está disponível (${result.reason}). Preencha a conferência à mão.`)
    await simulatedDelay(1600)
    // Na demonstração, cada foto "lê" a próxima folha (22 linhas) ainda não lida.
    return { linhas: simular(ficha, naoLidos.slice(0, LINHAS_POR_PAGINA), imageBase64), codigo: ficha.codigo, simulada: true }
  } finally {
    URL.revokeObjectURL(url)
  }
}

const levels: AiConfidence[] = ['alta', 'media', 'baixa', 'ilegivel']

function normalizar(row: Partial<LeituraFicha>): LeituraFicha {
  return {
    brinco: String(row.brinco ?? '').trim(),
    presente: typeof row.presente === 'boolean' ? row.presente : null,
    sexo: row.sexo === 'M' || row.sexo === 'F' ? row.sexo : '',
    faixa: String(row.faixa ?? '').trim(),
    peso: String(row.peso ?? '').trim(),
    diagnostico: row.diagnostico === 'prenha' || row.diagnostico === 'vazia' ? row.diagnostico : '',
    saida: row.saida === 'morte' || row.saida === 'venda' || row.saida === 'descarte' ? row.saida : '',
    observacao: String(row.observacao ?? '').trim(),
    confianca: levels.includes(row.confianca as AiConfidence) ? (row.confianca as AiConfidence) : 'media'
  }
}

/** Leitura de exemplo (demonstração sem IA): quase todos vieram, alguns com sexo e peso. */
function simular(ficha: FichaCampo, brincos: string[], seedText: string): LeituraFicha[] {
  const rand = seeded(seedText.slice(0, 3000) + ficha.codigo)
  return brincos.map((brinco) => ({
    brinco,
    presente: ficha.manejo ? rand() > 0.1 : null,
    sexo: ficha.colunas.sexo && rand() < 0.5 ? (rand() < 0.6 ? 'F' : 'M') : '',
    faixa: ficha.colunas.faixa && rand() < 0.4 ? String(1 + Math.floor(rand() * 4)) : '',
    peso: ficha.colunas.peso && rand() < 0.6 ? String(300 + Math.round(rand() * 180)) : '',
    diagnostico: '',
    saida: '',
    observacao: rand() < 0.06 ? 'mancando da pata traseira' : '',
    confianca: rand() < 0.12 ? 'media' : 'alta'
  }))
}
