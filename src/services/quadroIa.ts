import type { LeituraQuadro } from '../types'
import { loadExportImage } from '../utils/images'
import { callFunction } from './functions'

/**
 * Leitura da foto do quadro de campo pela IA (netlify/functions/ler-quadro).
 * A lista de brincos ativos vai junto para a IA casar números manuscritos com
 * animais que existem. O resultado volta para a caixa de lançamento, onde a
 * pessoa confere antes de lançar: nada é gravado direto.
 */
export async function lerFotoDoQuadro(file: File, brincos: string[]): Promise<LeituraQuadro[]> {
  const url = URL.createObjectURL(file)
  try {
    const image = await loadExportImage(url, { maxSide: 2200 })
    if (!image) throw new Error('Não foi possível preparar a foto.')
    const imageBase64 = image.dataUrl.slice(image.dataUrl.indexOf(',') + 1)
    const result = await callFunction<{ linhas: LeituraQuadro[] }>('ler-quadro', { imageBase64, mimeType: 'image/jpeg', brincos: brincos.slice(0, 1500) })
    if (result.status === 'unavailable') {
      throw new Error(`A leitura por IA não está disponível aqui (${result.reason}). Use "Copiar instrução para outra IA" e cole a tabela que ela devolver.`)
    }
    return result.data.linhas ?? []
  } finally {
    URL.revokeObjectURL(url)
  }
}
