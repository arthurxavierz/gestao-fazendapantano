import type {
  Animal,
  AnimalCategory,
  BreedingAttempt,
  BreedingResult,
  CountSession,
  HealthEvent,
  Occurrence,
  Profile,
  PurchaseBatch,
  ReproProtocol,
  Weighing
} from '../types'
import { defaultProtocols } from '../domain/reproduction'

/**
 * Rebanho fictício do modo demonstração. Todas as datas são relativas a hoje,
 * para que a agenda, os partos previstos e os diagnósticos sempre tenham algo
 * a mostrar, não importa quando o app for aberto.
 */

const now = new Date()
const iso = (daysAgo = 0) => {
  const date = new Date(now)
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString()
}
/** Data sem horário, `daysAgo` dias atrás (negativo = futuro). */
const day = (daysAgo = 0) => {
  const date = new Date(now)
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() - daysAgo)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

// Gerador determinístico: o demo é o mesmo em toda abertura.
let seed = 42
const rand = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}
const between = (min: number, max: number) => Math.round(min + rand() * (max - min))

const users = ['u-admin', 'u-joao', 'u-marcos']
const author = () => users[between(0, 2)]

export const demoProfiles: Profile[] = [
  { id: 'u-admin', full_name: 'Administrador da fazenda', email: 'admin@fazenda.com.br', role: 'administrador', created_at: iso(400) },
  { id: 'u-joao', full_name: 'João do curral', email: 'joao@fazenda.com.br', role: 'operador', created_at: iso(300) },
  { id: 'u-marcos', full_name: 'Marcos do campo', email: 'marcos@fazenda.com.br', role: 'operador', created_at: iso(200) }
]

export const demoProtocols: ReproProtocol[] = defaultProtocols.map((item, index) => ({
  ...item,
  id: `p-${index + 1}`,
  created_at: iso(500)
}))

export const demoBatches: PurchaseBatch[] = [
  {
    id: 'b-1',
    code: 'C-2025-01',
    supplier: 'Fazenda Santa Rita',
    purchase_date: day(560),
    quantity: 14,
    total_value: 63000,
    avg_weight: 320,
    gta: '52-0019384',
    notes: 'Novilhas Nelore para formar a base de matrizes.',
    created_by: 'u-admin',
    created_at: iso(560)
  },
  {
    id: 'b-2',
    code: 'C-2026-02',
    supplier: 'Leilão Rural Uberaba',
    purchase_date: day(170),
    quantity: 12,
    total_value: 39600,
    avg_weight: 245,
    gta: '31-0477120',
    notes: 'Garrotes para engorda no confinamento.',
    created_by: 'u-admin',
    created_at: iso(170)
  }
]

const breeds = ['Nelore', 'Nelore', 'Nelore', 'Angus x Nelore', 'Brahman', 'Cruzamento']
const coats = ['branco', 'branco', 'cinza', 'vermelho', 'preto', 'pintado']
const lotsMatrizes = ['Pasto Matrizes', 'Pasto Matrizes', 'Maternidade']

function animal(
  number: string,
  data: Partial<Animal> & { sex: Animal['sex']; category: AnimalCategory }
): Animal {
  const createdDays = between(30, 500)
  return {
    id: `a-${number}`,
    number,
    name: null,
    photo_url: null,
    breed: breeds[between(0, breeds.length - 1)],
    coat: coats[between(0, coats.length - 1)],
    birth_date_approximate: false,
    status: 'normal',
    origin_type: 'nao_informado',
    notes: null,
    created_by: author(),
    created_at: iso(createdDays),
    updated_at: iso(between(0, 20)),
    ...data
  }
}

const animals: Animal[] = []

// Matrizes compradas no lote C-2025-01 (chegaram novilhas, hoje são vacas).
const purchasedCows = ['301', '302', '303', '304', '305', '306', '307', '308', '309', '310', '311', '312', '313', '314']
for (const number of purchasedCows) {
  animals.push(animal(number, {
    sex: 'femea',
    category: 'vaca',
    breed: 'Nelore',
    birth_date: day(between(1150, 1500)),
    birth_date_approximate: true,
    weight: between(430, 520),
    lot: lotsMatrizes[between(0, 2)],
    origin: 'Comprado',
    origin_type: 'comprado',
    purchase_batch_id: 'b-1',
    entry_date: day(560)
  }))
}

// Matrizes antigas da fazenda e animais que já estavam no cadastro original.
const homeCows = ['087', '195', '118', '126', '133', '149', '157', '163']
for (const number of homeCows) {
  animals.push(animal(number, {
    sex: 'femea',
    category: 'vaca',
    birth_date: day(between(1300, 2400)),
    weight: between(410, 500),
    lot: lotsMatrizes[between(0, 2)],
    origin: 'Nascido na fazenda',
    origin_type: 'nascido',
    entry_date: undefined
  }))
}

// Novilhas nascidas na fazenda, entrando na primeira estação.
for (const number of ['221', '224', '227', '230']) {
  animals.push(animal(number, {
    sex: 'femea',
    category: 'novilha',
    birth_date: day(between(540, 700)),
    weight: between(320, 370),
    lot: 'Recria Fêmeas',
    origin: 'Nascido na fazenda',
    origin_type: 'nascido',
    mother_id: `a-${homeCows[between(2, homeCows.length - 1)]}`,
    sire: 'Touro 900 (Nelore PO)'
  }))
}

// Touros.
animals.push(animal('900', { sex: 'macho', category: 'touro', breed: 'Nelore PO', birth_date: day(1900), weight: 890, lot: 'Piquete Touros', origin: 'Comprado', origin_type: 'comprado', entry_date: day(1200) }))
animals.push(animal('901', { sex: 'macho', category: 'touro', breed: 'Angus', coat: 'preto', birth_date: day(1500), weight: 820, lot: 'Piquete Touros', origin: 'Comprado', origin_type: 'comprado', entry_date: day(700) }))

// Garrotes do lote C-2026-02, em engorda no confinamento.
const steers = ['401', '402', '403', '404', '405', '406', '407', '408', '409', '410', '411', '412']
for (const number of steers) {
  animals.push(animal(number, {
    sex: 'macho',
    category: 'garrote',
    breed: number <= '404' ? 'Angus x Nelore' : 'Nelore',
    birth_date: day(between(480, 560)),
    birth_date_approximate: true,
    weight: null,
    lot: number <= '406' ? 'Confinamento Baia 1' : 'Confinamento Baia 2',
    origin: 'Comprado',
    origin_type: 'comprado',
    purchase_batch_id: 'b-2',
    entry_date: day(170)
  }))
}

// Machos originais do cadastro antigo.
animals.push(animal('142', { sex: 'macho', category: 'boi', breed: 'Nelore', birth_date: day(510), weight: 412, lot: 'Confinamento Baia 2', origin: 'Nascido na fazenda', origin_type: 'nascido', status: 'observacao', notes: 'Leve dificuldade ao caminhar.' }))
animals.push(animal('214', { sex: 'macho', category: 'garrote', breed: 'Nelore', birth_date: day(390), weight: 338, lot: 'Recria Machos', origin: 'Nascido na fazenda', origin_type: 'nascido' }))
animals.push(animal('031', { sex: 'macho', category: 'boi', breed: 'Nelore', birth_date: day(680), weight: 478, lot: 'Confinamento Baia 1', origin: 'Comprado', origin_type: 'comprado' }))

// ============================================================
// Reprodução
// ============================================================
const iatf = demoProtocols[0]
const attempts: BreedingAttempt[] = []
let attemptSeq = 0

function attempt(
  animalId: string,
  startDaysAgo: number,
  result: BreedingResult,
  extra: Partial<BreedingAttempt> = {}
): BreedingAttempt {
  attemptSeq += 1
  const start = day(startDaysAgo)
  const insemination = extra.insemination_date !== undefined ? extra.insemination_date : startDaysAgo - 10 >= 0 || result !== 'pendente' ? day(startDaysAgo - 10) : null
  const stepsDone = iatf.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => startDaysAgo - step.day >= 0 && (result !== 'pendente' || step.kind !== 'diagnostico'))
    .map(({ step, index }) => ({ index, done_at: `${day(startDaysAgo - step.day)}T12:00:00` }))
  const item: BreedingAttempt = {
    id: `r-${attemptSeq}`,
    animal_id: animalId,
    method: 'iatf',
    protocol_id: iatf.id,
    protocol_name: iatf.name,
    steps: iatf.steps,
    steps_done: stepsDone,
    start_date: start,
    insemination_date: insemination,
    sire: rand() > 0.5 ? 'Sêmen Nelore · REM Usina' : 'Sêmen Angus · Hoff 2',
    technician: 'Dr. Paulo (veterinário)',
    diagnosis_date: result !== 'pendente' ? day(startDaysAgo - 40) : null,
    result,
    expected_calving_date: insemination && ['prenhe', 'parida'].includes(result) ? day(startDaysAgo - 10 - 290) : null,
    calving_date: null,
    calf_id: null,
    notes: null,
    created_by: author(),
    created_at: iso(startDaysAgo),
    ...extra
  }
  attempts.push(item)
  return item
}

// Prenhes com parto previsto ao longo dos próximos meses.
const pregnant: [string, number][] = [
  ['301', 290], ['302', 284], ['305', 268], ['306', 230], ['308', 205],
  ['309', 180], ['311', 150], ['118', 262], ['126', 120], ['133', 95]
]
for (const [number, startDaysAgo] of pregnant) attempt(`a-${number}`, startDaysAgo, 'prenhe')

// Vacas que já pariram. Os bezerros estão cadastrados com a mãe.
const calved: [string, string, Animal['sex']][] = [
  ['303', '501', 'macho'], ['304', '502', 'femea'], ['307', '503', 'macho'],
  ['149', '504', 'femea'], ['157', '505', 'macho'], ['310', '506', 'femea']
]
calved.forEach(([cow, calf, sex], index) => {
  const startDaysAgo = 300 + 12 + index * 9
  const calvingDaysAgo = startDaysAgo - 10 - 290 + 2
  const item = attempt(`a-${cow}`, startDaysAgo, 'parida', { calving_date: day(calvingDaysAgo), calf_id: `a-${calf}` })
  animals.push(animal(calf, {
    sex,
    category: sex === 'macho' ? 'bezerro' : 'bezerra',
    breed: item.sire?.includes('Angus') ? 'Angus x Nelore' : 'Nelore',
    birth_date: day(calvingDaysAgo),
    weight: Math.round(between(32, 38) + Math.max(0, calvingDaysAgo) * 0.75),
    lot: 'Maternidade',
    origin: 'Nascido na fazenda',
    origin_type: 'nascido',
    mother_id: `a-${cow}`,
    sire: item.sire,
    entry_date: day(calvingDaysAgo),
    created_at: iso(Math.max(0, calvingDaysAgo))
  }))
})

// Lote em protocolo agora: começou há 5 dias, retirada do implante daqui a 3.
for (const number of ['312', '313', '314', '163', '221', '224']) attempt(`a-${number}`, 5, 'pendente', { insemination_date: null })

// Inseminadas há 26 dias: diagnóstico nos próximos dias.
for (const number of ['227', '230', '195']) attempt(`a-${number}`, 36, 'pendente')

// Matriz 087: três tentativas sem prenhez, a quarta aguardando diagnóstico.
attempt('a-087', 220, 'vazia')
attempt('a-087', 160, 'vazia')
attempt('a-087', 100, 'vazia')
attempt('a-087', 37, 'pendente')

// Matriz 133 teve uma falha antes de emprenhar.
attempt('a-133', 155, 'vazia')

// Vazia aguardando nova estação.
attempt('a-157', 140, 'vazia')

// Já foi para descarte depois de quatro tentativas.
animals.push(animal('112', { sex: 'femea', category: 'vaca', breed: 'Cruzamento', birth_date: day(2900), weight: 455, lot: 'Pasto Descarte', origin: 'Nascido na fazenda', origin_type: 'nascido', status: 'descarte', notes: 'Quatro tentativas sem prenhez. Separada para abate.' }))
for (const startDaysAgo of [320, 260, 200, 140]) attempt('a-112', startDaysAgo, 'vazia')

// Datas de nascimento dos bezerros que constam como parto.
const sortedAttempts = attempts.sort((a, b) => b.start_date.localeCompare(a.start_date))

// ============================================================
// Sanitário
// ============================================================
const health: HealthEvent[] = []
let healthSeq = 0
function apply(animalId: string, product: string, kind: HealthEvent['kind'], daysAgo: number, nextInDays?: number, withdrawal?: number) {
  healthSeq += 1
  health.push({
    id: `h-${healthSeq}`,
    animal_id: animalId,
    kind,
    product,
    dose: kind === 'vacina' ? '5 ml' : kind === 'vermifugo' ? '1 ml / 50 kg' : null,
    applied_at: day(daysAgo),
    next_due_date: nextInDays ? day(daysAgo - nextInDays) : null,
    withdrawal_until: withdrawal ? day(daysAgo - withdrawal) : null,
    product_batch: `L${2400 + healthSeq}`,
    notes: null,
    created_by: author(),
    created_at: iso(daysAgo)
  })
}

const adults = animals.filter((item) => !['bezerro', 'bezerra'].includes(item.category ?? ''))
for (const item of adults) apply(item.id, 'Clostridioses', 'vacina', 300, 365)
for (const item of adults.filter((a) => a.sex === 'femea')) apply(item.id, 'Leptospirose', 'vacina', 172, 180)
for (const item of adults) apply(item.id, 'Raiva', 'vacina', 340, 365)
for (const number of steers) apply(`a-${number}`, 'Ivermectina', 'vermifugo', 86, 90, 35)
for (const item of animals.filter((a) => a.category === 'bezerra')) apply(item.id, 'Brucelose (B19 / RB51)', 'vacina', 10)
apply('a-087', 'Oxitetraciclina', 'medicamento', 3, undefined, 28)

// ============================================================
// Pesagens
// ============================================================
const weighings: Weighing[] = []
let weighSeq = 0
for (const number of steers) {
  let weight = between(232, 262)
  const gain = 0.85 + rand() * 0.6
  for (let daysAgo = 168; daysAgo >= 0; daysAgo -= 28) {
    weighSeq += 1
    weighings.push({
      id: `w-${weighSeq}`,
      animal_id: `a-${number}`,
      weighed_at: day(daysAgo),
      weight: Math.round(weight),
      notes: null,
      created_by: author(),
      created_at: iso(daysAgo)
    })
    weight += gain * 28 + (rand() - 0.5) * 6
  }
  const last = weighings[weighings.length - 1]
  const target = animals.find((item) => item.id === `a-${number}`)
  if (target) target.weight = last.weight
}
for (const item of animals.filter((a) => a.category === 'vaca').slice(0, 10)) {
  for (const daysAgo of [180, 90, 10]) {
    weighSeq += 1
    weighings.push({
      id: `w-${weighSeq}`,
      animal_id: item.id,
      weighed_at: day(daysAgo),
      weight: Math.round((item.weight ?? 450) - daysAgo * 0.08 + (rand() - 0.5) * 10),
      notes: null,
      created_by: author(),
      created_at: iso(daysAgo)
    })
  }
}

export const demoAnimals: Animal[] = animals
export const demoAttempts: BreedingAttempt[] = sortedAttempts
export const demoHealthEvents: HealthEvent[] = health
export const demoWeighings: Weighing[] = weighings

export const demoOccurrences: Occurrence[] = [
  {
    id: 'o-1',
    animal_id: 'a-087',
    animal_number: '087',
    type: 'doenca',
    note: 'Menor apetite e afastada do restante. Iniciado tratamento com oxitetraciclina.',
    created_by: 'u-joao',
    created_at: iso(3)
  },
  {
    id: 'o-2',
    animal_id: 'a-142',
    animal_number: '142',
    type: 'observacao',
    note: 'Leve dificuldade ao caminhar na pata traseira.',
    created_at: iso(1),
    created_by: 'u-marcos'
  },
  {
    id: 'o-3',
    animal_id: 'a-112',
    animal_number: '112',
    type: 'descarte',
    note: 'Descarte reprodutivo: 4 tentativas seguidas sem prenhez. Separada para abate.',
    created_at: iso(100),
    created_by: 'u-admin'
  }
]

export const demoCounts: CountSession[] = [
  {
    id: 'c-1',
    title: 'Contagem do confinamento',
    mode: 'quantity',
    expected_total: 15,
    total_counted: 15,
    animal_numbers: [],
    notes: 'Baias 1 e 2 conferidas.',
    created_at: iso(2),
    created_by: 'u-joao'
  },
  {
    id: 'c-2',
    title: 'Pasto das matrizes',
    mode: 'quantity',
    expected_total: 24,
    total_counted: 23,
    animal_numbers: [],
    notes: 'Uma vaca na maternidade.',
    created_at: iso(9),
    created_by: 'u-marcos'
  }
]
