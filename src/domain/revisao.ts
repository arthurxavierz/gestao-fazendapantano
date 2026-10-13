import type { Animal, Revisao } from '../types'
import { type Op, Recusa, type Resultado } from './operacoes'
import { type Fazenda, ativo, hoje, mesmoBrinco } from './regras'

/**
 * Revisão de duplicados. A planilha inicial veio de fotos do brete, então o
 * mesmo animal pode ter entrado duas vezes (2-A e 2-B), um número pode ter sido
 * lido errado, ou dois registros podem ter a mesma foto. Aqui só se apontam
 * os suspeitos; quem decide é a pessoa, olhando as fotos.
 */

/** "2-A" e "2-B" têm a mesma base "2". */
export const baseDoBrinco = (brinco: string) => brinco.trim().replace(/^x/i, '').replace(/[-\s]?[a-z]$/i, '').replace(/^0+(?=\d)/, '')

/** Bits diferentes entre duas impressões digitais de foto (0 = idênticas). */
export function distanciaHash(a?: string | null, b?: string | null): number | null {
  if (!a || !b || a.length !== b.length) return null
  let bits = 0
  for (let i = 0; i < a.length; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16)
    while (x) { bits += x & 1; x >>= 1 }
  }
  return bits
}

/** Até aqui, as fotos são praticamente a mesma imagem (mesmo animal, mesma foto). */
export const FOTO_IGUAL = 6

export type MotivoSuspeita = 'mesmo-numero' | 'foto-igual'

export interface ParSuspeito {
  a: Animal
  b: Animal
  motivo: MotivoSuspeita
  distancia: number | null
}

const chavePar = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export function paresSuspeitos(fazenda: Pick<Fazenda, 'animais' | 'revisoes'>): ParSuspeito[] {
  const descartados = new Set(fazenda.revisoes.map((item) => chavePar(item.a_id, item.b_id)))
  const active = fazenda.animais.filter(ativo)
  const pares = new Map<string, ParSuspeito>()

  const porBase = new Map<string, Animal[]>()
  for (const animal of active) {
    const base = baseDoBrinco(animal.brinco)
    porBase.set(base, [...(porBase.get(base) ?? []), animal])
  }
  for (const group of porBase.values()) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const key = chavePar(group[i].id, group[j].id)
        if (!descartados.has(key)) pares.set(key, { a: group[i], b: group[j], motivo: 'mesmo-numero', distancia: distanciaHash(group[i].foto_hash, group[j].foto_hash) })
      }
    }
  }

  const comFoto = active.filter((item) => item.foto_hash)
  for (let i = 0; i < comFoto.length; i += 1) {
    for (let j = i + 1; j < comFoto.length; j += 1) {
      const d = distanciaHash(comFoto[i].foto_hash, comFoto[j].foto_hash)
      if (d == null || d > FOTO_IGUAL) continue
      const key = chavePar(comFoto[i].id, comFoto[j].id)
      if (!descartados.has(key) && !pares.has(key)) pares.set(key, { a: comFoto[i], b: comFoto[j], motivo: 'foto-igual', distancia: d })
    }
  }
  return [...pares.values()].sort((x, y) => (x.motivo === y.motivo ? (x.distancia ?? 99) - (y.distancia ?? 99) : x.motivo === 'mesmo-numero' ? -1 : 1))
}

/** Animais que a conferência das fotos mandou ver no curral. */
export const precisaConferir = (animal: Animal) => ativo(animal) && Boolean(animal.conferencia?.trim().toLowerCase().startsWith('conferir'))

export function marcarDiferentes(fazenda: Fazenda, aId: string, bId: string): Resultado {
  if (fazenda.revisoes.some((item) => chavePar(item.a_id, item.b_id) === chavePar(aId, bId))) return { ops: [], mensagem: 'Já estava marcado.' }
  const row: Revisao = { id: crypto.randomUUID(), a_id: aId, b_id: bId, decisao: 'diferentes', created_at: new Date().toISOString() }
  return { ops: [{ t: 'insert', tabela: 'revisoes', row: row as never }], mensagem: 'Marcados como animais diferentes.' }
}

export function marcarConferido(fazenda: Fazenda, animalId: string, nota?: string): Resultado {
  const animal = fazenda.animais.find((item) => item.id === animalId)
  if (!animal) throw new Recusa('Animal não encontrado.')
  const texto = `Conferido em ${hoje().split('-').reverse().join('/')}${nota?.trim() ? `: ${nota.trim()}` : ''}`
  return { ops: [{ t: 'update', tabela: 'animais', id: animal.id, patch: { conferencia: texto, updated_at: new Date().toISOString() } }], mensagem: `Brinco ${animal.brinco} conferido.` }
}

const CAMPOS_COPIAVEIS = ['sexo', 'nascimento', 'faixa', 'raca', 'cor', 'no_ima', 'foto_url', 'foto_hash', 'avaliacao', 'data_avaliacao', 'peso'] as const

/**
 * Juntar dois registros do mesmo animal: o histórico do que sai (manejos,
 * protocolos, ciclos, bezerros, números) passa para o que fica; campos vazios
 * do que fica são completados; o registro duplicado é apagado.
 */
export function juntarAnimais(fazenda: Fazenda, ficaId: string, saiId: string, brincoFinal?: string): Resultado {
  const fica = fazenda.animais.find((item) => item.id === ficaId)
  const sai = fazenda.animais.find((item) => item.id === saiId)
  if (!fica || !sai || fica.id === sai.id) throw new Recusa('Escolha dois animais diferentes.')
  if (fica.saida || sai.saida) throw new Recusa('Só dá para juntar animais ativos. Desfaça a baixa antes.')
  if (fica.sexo && sai.sexo && fica.sexo !== sai.sexo) throw new Recusa(`Os dois estão com sexos diferentes (${fica.sexo} e ${sai.sexo}). Confira antes de juntar.`)
  const protocolosSai = fazenda.protocolos.filter((item) => item.animal_id === sai.id)
  const protocolosFica = fazenda.protocolos.filter((item) => item.animal_id === fica.id)
  if (protocolosSai.length && protocolosFica.length) throw new Recusa('Os dois têm protocolos de IATF lançados. Confira na ficha de cada um antes de juntar.')

  const patch: Record<string, unknown> = {}
  for (const key of CAMPOS_COPIAVEIS) {
    if ((fica[key] == null || fica[key] === '') && sai[key] != null && sai[key] !== '') patch[key] = sai[key]
  }
  if (protocolosSai.length) patch.ciclo = sai.ciclo
  const brinco = (brincoFinal ?? fica.brinco).trim()
  if (!brinco) throw new Recusa('Informe o brinco que fica.')
  if (!mesmoBrinco(brinco, fica.brinco)) {
    const taken = fazenda.animais.find((item) => ativo(item) && item.id !== fica.id && item.id !== sai.id && mesmoBrinco(item.brinco, brinco))
    if (taken) throw new Recusa(`O brinco ${brinco} já está em uso por outro animal.`)
    patch.brinco = brinco
  }
  const notas = [fica.observacoes, sai.observacoes, `Registro juntado com o antigo brinco ${sai.brinco} em ${hoje().split('-').reverse().join('/')}.`].filter(Boolean)
  patch.observacoes = notas.join(' ')
  patch.conferencia = `Conferido em ${hoje().split('-').reverse().join('/')}: era o mesmo animal que o ${sai.brinco}`
  patch.ordem = Math.min(fica.ordem ?? Number.MAX_SAFE_INTEGER, sai.ordem ?? Number.MAX_SAFE_INTEGER)
  if (patch.ordem === Number.MAX_SAFE_INTEGER) delete patch.ordem
  patch.updated_at = new Date().toISOString()

  const move = <T extends { id: string }>(tabela: Op['tabela'], rows: T[], campo: string): Op[] =>
    rows.map((row) => ({ t: 'update' as const, tabela, id: row.id, patch: { [campo]: fica.id } }))

  const ops: Op[] = [
    // O brinco precisa ser liberado antes de o outro registro poder usá-lo.
    ...move('manejos', fazenda.manejos.filter((item) => item.animal_id === sai.id), 'animal_id'),
    ...move('protocolos', protocolosSai, 'animal_id'),
    ...move('ciclos', fazenda.ciclos.filter((item) => item.animal_id === sai.id), 'animal_id'),
    ...move('bezerros', fazenda.bezerros.filter((item) => item.mae_id === sai.id), 'mae_id'),
    ...move('numeros', fazenda.numeros.filter((item) => item.animal_id === sai.id), 'animal_id'),
    ...fazenda.revisoes.filter((item) => item.a_id === sai.id || item.b_id === sai.id).map((item) => ({ t: 'delete' as const, tabela: 'revisoes' as const, id: item.id })),
    { t: 'delete', tabela: 'animais', id: sai.id },
    { t: 'update', tabela: 'animais', id: fica.id, patch }
  ]
  return { ops, mensagem: `Registros juntados: ficou o brinco ${brinco}, com o histórico dos dois.` }
}
