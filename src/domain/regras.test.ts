import { describe, expect, it } from 'vitest'
import type { Animal } from '../types'
import {
  Recusa,
  aplicar,
  cadastrarAnimal,
  confirmarLote,
  darBaixa,
  desfazerBaixa,
  incorporarBezerro,
  marcarPendenciasFeitas,
  registrarParto,
  salvarBezerro,
  salvarDados,
  salvarProtocolos
} from './operacoes'
import { lancarQuadro } from './quadro'
import {
  type Fazenda,
  avisoBezerro,
  codigoBezerro,
  compararBrincos,
  contagemDaFazenda,
  contagemVazia,
  faixaDe,
  lerColagem,
  lerData,
  listaDoLote,
  mesesCompletos,
  planoIma,
  primeiroDisponivel,
  quadroPorFaixa,
  situacaoDoAnimal
} from './regras'

const base = (): Fazenda => ({ animais: [], protocolos: [], ciclos: [], bezerros: [], manejos: [], numeros: [] })

function comAnimal(fazenda: Fazenda, brinco: string, extra: Partial<Animal> = {}) {
  const result = cadastrarAnimal(fazenda, { brinco })
  let next = aplicar(fazenda, result.ops)
  if (Object.keys(extra).length) next = { ...next, animais: next.animais.map((item) => (item.id === result.id ? { ...item, ...extra } : item)) }
  return { fazenda: next, id: result.id }
}

const sit = (fazenda: Fazenda, id: string) => situacaoDoAnimal(fazenda.animais.find((item) => item.id === id)!, fazenda).texto

const slot = (resultado: 'Prenha' | 'Vazia' | null, data = '2026-01-10') => ({ apta: 'S' as const, motivo: null, data_protocolo: data, data_confirmacao: resultado ? data.slice(0, 8) + '28' : null, resultado })
const empty = { apta: null, motivo: null, data_protocolo: null, data_confirmacao: null, resultado: null }

describe('datas e faixas', () => {
  it('conta só meses completos', () => {
    expect(mesesCompletos('2025-03-15', '2026-03-14')).toBe(11)
    expect(mesesCompletos('2025-03-15', '2026-03-15')).toBe(12)
  })
  it('classifica a faixa como a planilha (12 meses ainda é 0 a 12)', () => {
    expect(faixaDe('2025-03-15', '2026-03-15')).toBe('0 a 12')
    expect(faixaDe('2025-03-15', '2026-04-15')).toBe('13 a 24')
    expect(faixaDe('2023-03-15', '2026-03-15')).toBe('25 a 36')
    expect(faixaDe('2020-01-01', '2026-03-15')).toBe('Acima de 36')
  })
  it('lê datas brasileiras', () => {
    expect(lerData('10/03/2025')).toBe('2025-03-10')
    expect(lerData('31/02/2025')).toBeNull()
    expect(lerData('2025-03-10')).toBe('2025-03-10')
  })
  it('ordena brincos com letra', () => {
    expect(['10', '2-B', '3', '2-A', '2'].sort(compararBrincos)).toEqual(['2', '2-A', '2-B', '3', '10'])
  })
})

describe('situação', () => {
  it('segue a prioridade da planilha', () => {
    let { fazenda, id } = comAnimal(base(), '149')
    expect(sit(fazenda, id)).toBe('Falta informar o sexo')
    fazenda = aplicar(fazenda, salvarDados(fazenda, id, { sexo: 'M' }).ops)
    expect(sit(fazenda, id)).toBe('Ativo (destino: descarte)')

    const vaca = comAnimal(fazenda, '200', { sexo: 'F' })
    fazenda = vaca.fazenda
    expect(sit(fazenda, vaca.id)).toBe('Aguardando protocolo')
    fazenda = aplicar(fazenda, salvarProtocolos(fazenda, vaca.id, [slot('Vazia'), empty, empty]).ops)
    expect(sit(fazenda, vaca.id)).toBe('Vazia (aguardando próximo protocolo)')
    fazenda = aplicar(fazenda, salvarProtocolos(fazenda, vaca.id, [slot('Vazia'), slot('Prenha', '2026-03-01'), empty]).ops)
    expect(sit(fazenda, vaca.id)).toBe('Prenha')
    fazenda = aplicar(fazenda, salvarProtocolos(fazenda, vaca.id, [slot('Vazia'), slot('Vazia'), slot('Vazia')]).ops)
    expect(sit(fazenda, vaca.id)).toBe('Descarte (3 protocolos vazia)')
  })

  it('bloqueia trocar o sexo de fêmea com protocolo', () => {
    let { fazenda, id } = comAnimal(base(), '1', { sexo: 'F' })
    fazenda = aplicar(fazenda, salvarProtocolos(fazenda, id, [slot(null), empty, empty]).ops)
    expect(() => salvarDados(fazenda, id, { sexo: 'M' })).toThrow(Recusa)
  })

  it('recusa brinco repetido entre ativos', () => {
    const { fazenda } = comAnimal(base(), '10')
    expect(() => cadastrarAnimal(fazenda, { brinco: '10' })).toThrow(/em uso/)
  })
})

describe('parto e bezerros', () => {
  it('cria o bezerro, arquiva o ciclo e reinicia os protocolos', () => {
    let { fazenda, id } = comAnimal(base(), '87', { sexo: 'F' })
    fazenda = aplicar(fazenda, salvarProtocolos(fazenda, id, [slot('Vazia'), slot('Prenha', '2025-03-01'), empty]).ops)
    const parto = registrarParto(fazenda, id, { data: '2026-01-20', sexo: 'F', observacao: 'parto normal' })
    fazenda = aplicar(fazenda, parto.ops)
    expect(parto.codigo).toBe('87-B1')
    const vaca = fazenda.animais.find((item) => item.id === id)!
    expect(vaca.ciclo).toBe(2)
    expect(fazenda.ciclos).toHaveLength(1)
    expect(sit(fazenda, id)).toBe('Com bezerro ao pé')
    expect(codigoBezerro('87', fazenda.bezerros, id)).toBe('87-B2')
  })

  it('avisa o destino do bezerro no 8º mês', () => {
    const calf = { situacao: 'Mamando', nascimento: '2025-01-10' } as never
    expect(avisoBezerro(calf, '2025-06-10')!.texto).toMatch(/faltam 3 meses/)
    expect(avisoBezerro(calf, '2025-09-10')!.semDestino).toBe(true)
    expect(avisoBezerro({ ...(calf as object), situacao: 'Ficou na fazenda' } as never, '2025-09-10')!.pronto).toBe(true)
  })

  it('incorpora com número disponível e leva os manejos', () => {
    let { fazenda, id } = comAnimal(base(), '50', { sexo: 'F' })
    const morto = comAnimal(fazenda, '901', { sexo: 'M' })
    fazenda = aplicar(morto.fazenda, darBaixa(morto.fazenda, morto.id, 'Morte', '2026-01-01').ops)
    const parto = registrarParto(fazenda, id, { data: '2025-01-05', sexo: 'M' })
    fazenda = aplicar(fazenda, parto.ops)
    fazenda = aplicar(fazenda, confirmarLote(fazenda, { data: '2025-05-01', manejo: 'Vacina' }, [{ alvo: { tipo: 'bezerro', id: parto.bezerroId }, faltou: false }]).ops)
    expect(() => incorporarBezerro(fazenda, parto.bezerroId, '700')).toThrow(/Ficou na fazenda/)
    fazenda = aplicar(fazenda, salvarBezerro(fazenda, parto.bezerroId, { situacao: 'Ficou na fazenda' }).ops)
    expect(primeiroDisponivel(fazenda)).toBe('901')
    const inc = incorporarBezerro(fazenda, parto.bezerroId, '901')
    fazenda = aplicar(fazenda, inc.ops)
    const novo = fazenda.animais.find((item) => item.id === inc.animalId)!
    expect(novo.sexo).toBe('M')
    expect(novo.observacoes).toMatch(/filho da vaca 50/)
    expect(fazenda.manejos.every((item) => item.animal_id === novo.id)).toBe(true)
    expect(fazenda.numeros[0].situacao).toBe('Reutilizado')
  })
})

describe('saída', () => {
  it('libera o número e desfaz a baixa', () => {
    let { fazenda, id } = comAnimal(base(), '149', { sexo: 'M' })
    fazenda = aplicar(fazenda, darBaixa(fazenda, id, 'Venda', '2026-02-01').ops)
    expect(fazenda.numeros[0]).toMatchObject({ numero: '149', registro_antigo: 'X149', situacao: 'Disponível' })
    const undo = desfazerBaixa(fazenda, id)
    expect(undo.precisaNumero).toBe(false)
    fazenda = aplicar(fazenda, undo.ops)
    expect(fazenda.animais[0].saida).toBeNull()
    expect(fazenda.numeros[0].situacao).toBe('Baixa desfeita')
  })

  it('pede outro número quando o original foi reutilizado', () => {
    let { fazenda, id } = comAnimal(base(), '149', { sexo: 'M' })
    fazenda = aplicar(fazenda, darBaixa(fazenda, id, 'Venda').ops)
    fazenda = comAnimal(fazenda, '149').fazenda
    expect(desfazerBaixa(fazenda, id).precisaNumero).toBe(true)
    const undo = desfazerBaixa(fazenda, id, '1500')
    fazenda = aplicar(fazenda, undo.ops)
    expect(fazenda.animais.find((item) => item.id === id)!.brinco).toBe('1500')
  })
})

describe('manejo em lote', () => {
  it('monta a lista e deixa pendente quem faltou', () => {
    let fazenda = base()
    const a = comAnimal(fazenda, '1', { sexo: 'F' }); fazenda = a.fazenda
    const b = comAnimal(fazenda, '2', { sexo: 'M' }); fazenda = b.fazenda
    expect(listaDoLote(fazenda, 'Fêmeas')).toHaveLength(1)
    expect(listaDoLote(fazenda, 'Todo o rebanho')).toHaveLength(2)
    const lote = confirmarLote(fazenda, { data: '2026-03-01', manejo: 'Vacina', produtos: 'Aftosa' }, [
      { alvo: { tipo: 'animal', id: a.id }, faltou: false },
      { alvo: { tipo: 'animal', id: b.id }, faltou: true }
    ])
    fazenda = aplicar(fazenda, lote.ops)
    expect(lote.pendentes).toBe(1)
    fazenda = aplicar(fazenda, marcarPendenciasFeitas(fazenda, { tipo: 'animal', id: b.id }, '2026-03-05').ops)
    expect(fazenda.manejos.find((item) => item.animal_id === b.id)).toMatchObject({ status: 'Feito depois', feito_em: '2026-03-05' })
  })
})

describe('painel e IMA', () => {
  it('soma por faixa e casa faixas vizinhas no plano', () => {
    let fazenda = base()
    fazenda = comAnimal(fazenda, '1', { sexo: 'M', faixa: '13 a 24' }).fazenda
    fazenda = comAnimal(fazenda, '2', { sexo: 'F', faixa: '25 a 36' }).fazenda
    fazenda = comAnimal(fazenda, '3').fazenda
    const quadro = quadroPorFaixa(fazenda.animais)
    expect(quadro.total).toBe(3)
    expect(quadro.linhas[2].semFaixa).toBe(1)

    const ima = contagemVazia()
    ima['0 a 12'].M = 1
    ima['25 a 36'].F = 2
    const plano = planoIma(ima, contagemDaFazenda(fazenda), 1)
    const textos = plano.map((item) => item.texto).join('\n')
    expect(textos).toMatch(/Mudança de faixa: 1 macho/)
    expect(textos).toMatch(/O IMA tem 1 fêmea\(s\) de 25 a 36/)
  })
})

describe('lançar do quadro', () => {
  it('lê a colagem e aplica cada código', () => {
    let fazenda = base()
    const vaca = comAnimal(fazenda, '74', { sexo: 'F' }); fazenda = vaca.fazenda
    const boi = comAnimal(fazenda, '30', { sexo: 'M' }); fazenda = boi.fazenda
    fazenda = comAnimal(fazenda, '12').fazenda
    const linhas = lerColagem([
      '| Data | Brinco | Código | Detalhe |',
      '|---|---|---|---|',
      '| 01/03/2026 | 074 | P | |',
      '| 01/04/2026 | 74 | P | prenha |',
      '| 02/04/2026 | 30 | S | venda |',
      '| 02/04/2026 | 12 | D | sexo F, nasc 10/03/2025 |',
      '| 02/04/2026 | 999 | V | aftosa |'
    ].join('\n'))
    expect(linhas).toHaveLength(5)
    const result = lancarQuadro(fazenda, linhas, '2026-04-02')
    expect(result.resultados.map((item) => item.ok)).toEqual([true, true, true, true, false])
    fazenda = result.estado
    expect(sit(fazenda, vaca.id)).toBe('Prenha')
    expect(fazenda.animais.find((item) => item.id === boi.id)!.saida).toBe('Venda')
    expect(fazenda.animais.find((item) => item.brinco === '12')!.faixa).toBe('13 a 24')
  })
})
