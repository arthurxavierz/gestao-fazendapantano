import { describe, expect, it } from 'vitest'
import { aplicar, cadastrarAnimal, salvarProtocolos } from './operacoes'
import { aplicarFicha, criarFicha, COLUNAS_PADRAO, lerFaixa, lerPeso } from './ficha'
import { adivinharColunas, brincoDoArquivo, importar, previa } from './importacao'
import { baseDoBrinco, distanciaHash, juntarAnimais, marcarDiferentes, paresSuspeitos } from './revisao'
import type { Fazenda } from './regras'

const base = (): Fazenda => ({ animais: [], protocolos: [], ciclos: [], bezerros: [], manejos: [], numeros: [], revisoes: [], fichas: [] })
function com(f: Fazenda, brinco: string, extra: Record<string, unknown> = {}) {
  const r = cadastrarAnimal(f, { brinco })
  let next = aplicar(f, r.ops)
  next = { ...next, animais: next.animais.map((a) => (a.id === r.id ? { ...a, ...extra } : a)) }
  return { f: next, id: r.id }
}

describe('revisão de duplicados', () => {
  it('acha 2-A e 2-B e some depois de marcar diferentes', () => {
    let f = base()
    const a = com(f, '2-A'); f = a.f
    const b = com(f, '2-B'); f = b.f
    f = com(f, '3').f
    expect(baseDoBrinco('2-B')).toBe('2')
    expect(paresSuspeitos(f)).toHaveLength(1)
    f = aplicar(f, marcarDiferentes(f, a.id, b.id).ops)
    expect(paresSuspeitos(f)).toHaveLength(0)
  })
  it('fotos iguais pelo hash', () => {
    expect(distanciaHash('ff00ff00ff00ff00', 'ff00ff00ff00ff01')).toBe(1)
    let f = base()
    f = com(f, '10', { foto_hash: 'ff00ff00ff00ff00' }).f
    f = com(f, '99', { foto_hash: 'ff00ff00ff00ff03' }).f
    expect(paresSuspeitos(f)[0].motivo).toBe('foto-igual')
  })
  it('junta o histórico e libera o brinco', () => {
    let f = base()
    const a = com(f, '2-A', { sexo: 'F' }); f = a.f
    const b = com(f, '2-B', { raca: 'Nelore', sexo: 'F' }); f = b.f
    f = aplicar(f, salvarProtocolos(f, b.id, [{ apta: 'S', motivo: null, data_protocolo: '2026-01-01', data_confirmacao: null, resultado: null }]).ops)
    f = aplicar(f, juntarAnimais(f, a.id, b.id, '2').ops)
    expect(f.animais).toHaveLength(1)
    expect(f.animais[0]).toMatchObject({ brinco: '2', sexo: 'F', raca: 'Nelore' })
    expect(f.protocolos[0].animal_id).toBe(a.id)
  })
})

describe('ficha de campo', () => {
  it('lê faixa e peso escritos à mão', () => {
    expect(lerFaixa('2')).toBe('13 a 24')
    expect(lerFaixa('25-36')).toBe('25 a 36')
    expect(lerPeso('412,5 kg')).toBe(412.5)
  })
  it('aplica presença, sexo, peso, diagnóstico e saída', () => {
    let f = base()
    const v = com(f, '87'); f = v.f
    const m = com(f, '30'); f = m.f
    const ficha = criarFicha(f, { titulo: 'Pesagem', data: '2026-10-10', manejo: 'Vacina', produtos: 'Aftosa', colunas: COLUNAS_PADRAO, animal_ids: [v.id, m.id] })
    f = aplicar(f, ficha.ops)
    expect(ficha.ficha.codigo).toBe('F-0001')
    const r = aplicarFicha(f, ficha.ficha.id, [
      { brinco: '87', presente: true, sexo: 'F', faixa: '4', peso: '450', diagnostico: 'prenha', saida: '', observacao: 'mancando', confianca: 'alta' },
      { brinco: '30', presente: false, sexo: 'M', faixa: '', peso: '', diagnostico: '', saida: 'venda', observacao: '', confianca: 'alta' }
    ])
    expect(r.resultados.map((x) => x.ok)).toEqual([true, true])
    f = r.estado
    const vaca = f.animais.find((a) => a.id === v.id)!
    expect(vaca).toMatchObject({ sexo: 'F', faixa: 'Acima de 36', peso: 450 })
    expect(f.protocolos[0].resultado).toBe('Prenha')
    expect(f.manejos.filter((x) => x.status === 'Pendente')).toHaveLength(1)
    expect(f.animais.find((a) => a.id === m.id)!.saida).toBe('Venda')
  })
})

describe('importação em massa', () => {
  it('separa novos, atualizações, iguais e erros', () => {
    let f = base()
    f = com(f, '1', { sexo: 'F' }).f
    f = com(f, '2-A').f
    const headers = ['Brinco', 'Sexo', 'Data nasc.', 'Faixa etária (meses)', 'Raça', 'Observações']
    const map = adivinharColunas(headers)
    expect(map.brinco).toBe(0)
    expect(map.nascimento).toBe(2)
    const rows = [
      ['1', 'F', '', '25 a 36', 'nelore', ''],
      ['2', 'M', '', '', '', ''],
      ['500', 'macho', '10/03/2025', '', '', 'comprado'],
      ['501', 'X', '', '', '', ''],
      ['500', 'M', '', '', '', '']
    ]
    const p = previa(f, rows, map, false)
    expect(p.map((x) => x.tipo)).toEqual(['atualiza', 'novo', 'novo', 'erro', 'erro'])
    expect(p[1].avisos[0]).toMatch(/possível duplicado/)
    const r = importar(f, p, false)
    f = aplicar(f, r.ops)
    expect(f.animais).toHaveLength(4)
    expect(f.animais.find((a) => a.brinco === '1')).toMatchObject({ raca: 'Nelore', faixa: '25 a 36' })
    expect(f.animais.find((a) => a.brinco === '500')).toMatchObject({ sexo: 'M', faixa: '13 a 24' })
  })
  it('acha o brinco pelo nome da foto', () => {
    let f = base()
    f = com(f, '149').f
    f = com(f, '2-A').f
    expect(brincoDoArquivo('149.jpg', f)?.brinco).toBe('149')
    expect(brincoDoArquivo('028_149.jpg', f)?.brinco).toBe('149')
    expect(brincoDoArquivo('0149.JPG', f)?.brinco).toBe('149')
    expect(brincoDoArquivo('2-A.jpeg', f)?.brinco).toBe('2-A')
    expect(brincoDoArquivo('foto.jpg', f)).toBeNull()
  })
})
