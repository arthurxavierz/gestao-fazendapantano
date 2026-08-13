import type { BreedingAttempt } from '../types'

// Número de confirmações 'vazia' que sinaliza a matriz para descarte.
// Configurável pelo proprietário na tela de Reprodução; este é o padrão.
export const DEFAULT_MAX_ATTEMPTS = 3

export interface MatrizStatus {
  attempts: BreedingAttempt[]
  emptyCount: number
  pregnant: boolean
  pending: boolean
  shouldCull: boolean
  nextAttemptNumber: number
}

/**
 * Resume a situação reprodutiva de uma matriz a partir das tentativas.
 * A matriz é sinalizada para descarte quando acumula tentativas 'vazia' até o
 * limite sem nenhuma confirmação 'prenha'. É exatamente a regra da planilha do
 * curral: chegou na última tentativa sem emprenhar, vai para o abate.
 */
export function summarizeMatriz(
  attempts: BreedingAttempt[],
  maxAttempts = DEFAULT_MAX_ATTEMPTS
): MatrizStatus {
  const sorted = [...attempts].sort((a, b) => a.attempt_number - b.attempt_number)
  const pregnant = sorted.some((item) => item.result === 'prenha')
  const emptyCount = sorted.filter((item) => item.result === 'vazia').length
  const pending = sorted.some((item) => item.result === 'pendente')
  const shouldCull = !pregnant && emptyCount >= maxAttempts
  const highest = sorted.reduce((max, item) => Math.max(max, item.attempt_number), 0)
  return { attempts: sorted, emptyCount, pregnant, pending, shouldCull, nextAttemptNumber: highest + 1 }
}
