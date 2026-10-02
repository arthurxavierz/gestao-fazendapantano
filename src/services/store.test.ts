import { describe, expect, it } from 'vitest'
import { fetchAll } from './store'

describe('paginação das consultas', () => {
  it('junta todas as páginas até vir uma incompleta', async () => {
    const total = 2350
    const calls: [number, number][] = []
    const { rows, error } = await fetchAll<number>(async (from, to) => {
      calls.push([from, to])
      const data = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i)
      return { data, error: null }
    })
    expect(error).toBeNull()
    expect(rows).toHaveLength(total)
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('para no erro e devolve o erro', async () => {
    const { rows, error } = await fetchAll<number>(async () => ({ data: null, error: { code: '42P01', message: 'sem tabela' } }))
    expect(rows).toEqual([])
    expect(error?.code).toBe('42P01')
  })
})
