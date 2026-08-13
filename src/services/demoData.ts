import type { Animal, BreedingAttempt, CountSession, ManagementEvent, Occurrence, Profile } from '../types'

const now = new Date()
const iso = (daysAgo = 0) => {
  const date = new Date(now)
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString()
}

export const demoAnimals: Animal[] = [
  {
    id: 'a-142',
    number: '142',
    name: null,
    photo_url: null,
    sex: 'macho',
    breed: 'Nelore',
    birth_date: '2025-05-12',
    birth_date_approximate: false,
    weight: 412,
    lot: 'Curral 2',
    origin: 'Nascido na fazenda',
    status: 'observacao',
    notes: 'Leve dificuldade ao caminhar.',
    created_by: 'u-admin',
    created_at: iso(180),
    updated_at: iso(1)
  },
  {
    id: 'a-087',
    number: '087',
    name: null,
    photo_url: null,
    sex: 'femea',
    breed: 'Cruzamento',
    birth_date: '2025-03-22',
    birth_date_approximate: true,
    weight: 386,
    lot: 'Lote Norte',
    origin: 'Comprado',
    status: 'doente',
    notes: 'Menor apetite observado pela manhã.',
    created_by: 'u-joao',
    created_at: iso(210),
    updated_at: iso(0)
  },
  {
    id: 'a-214',
    number: '214',
    name: null,
    photo_url: null,
    sex: 'macho',
    breed: 'Nelore',
    birth_date: '2025-09-02',
    birth_date_approximate: false,
    weight: 338,
    lot: 'Curral 1',
    origin: 'Nascido na fazenda',
    status: 'normal',
    notes: null,
    mother_id: 'a-195',
    created_by: 'u-marcos',
    created_at: iso(120),
    updated_at: iso(4)
  },
  {
    id: 'a-031',
    number: '031',
    name: null,
    photo_url: null,
    sex: 'macho',
    breed: 'Nelore',
    birth_date: '2024-11-18',
    birth_date_approximate: false,
    weight: 478,
    lot: 'Lote Sul',
    origin: 'Comprado',
    status: 'normal',
    notes: null,
    created_by: 'u-joao',
    created_at: iso(260),
    updated_at: iso(9)
  },
  {
    id: 'a-195',
    number: '195',
    name: null,
    photo_url: null,
    sex: 'femea',
    breed: 'Cruzamento',
    birth_date: '2025-06-30',
    birth_date_approximate: true,
    weight: 354,
    lot: 'Lote Norte',
    origin: 'Nascido na fazenda',
    status: 'normal',
    notes: null,
    created_by: 'u-marcos',
    created_at: iso(160),
    updated_at: iso(5)
  }
]

export const demoOccurrences: Occurrence[] = [
  {
    id: 'o-1',
    animal_id: 'a-087',
    animal_number: '087',
    type: 'doenca',
    note: 'Animal com menor apetite e afastado do restante.',
    created_at: iso(0)
  },
  {
    id: 'o-2',
    animal_id: 'a-142',
    animal_number: '142',
    type: 'observacao',
    note: 'Leve dificuldade ao caminhar na pata traseira.',
    created_at: iso(1),
    created_by: 'u-marcos'
  }
]

export const demoCounts: CountSession[] = [
  {
    id: 'c-1',
    title: 'Contagem do Curral 2',
    mode: 'quantity',
    expected_total: 42,
    total_counted: 41,
    animal_numbers: [],
    notes: 'Um animal ficou separado para observação.',
    created_at: iso(2),
    created_by: 'u-joao'
  }
]

export const demoProfiles: Profile[] = [
  { id: 'u-admin', full_name: 'Administrador da fazenda', email: 'admin@fazenda.com.br', role: 'administrador', created_at: iso(120) },
  { id: 'u-joao', full_name: 'Joao do curral', email: 'joao@fazenda.com.br', role: 'operador', created_at: iso(60) },
  { id: 'u-marcos', full_name: 'Marcos do campo', email: 'marcos@fazenda.com.br', role: 'operador', created_at: iso(30) }
]

export const demoBreedingAttempts: BreedingAttempt[] = [
  // Matriz 195: emprenhou na segunda tentativa.
  {
    id: 'b-195-1',
    animal_id: 'a-195',
    animal_number: '195',
    attempt_number: 1,
    protocol_date: '2025-01-10',
    protocol_type: 'IATF',
    semen: 'Nelore PO',
    confirmation_date: '2025-02-09',
    result: 'vazia',
    notes: null,
    created_by: 'u-admin',
    created_at: iso(150)
  },
  {
    id: 'b-195-2',
    animal_id: 'a-195',
    animal_number: '195',
    attempt_number: 2,
    protocol_date: '2025-02-25',
    protocol_type: 'IATF',
    semen: 'Nelore PO',
    confirmation_date: '2025-03-27',
    result: 'prenha',
    notes: 'Confirmada por ultrassom.',
    created_by: 'u-admin',
    created_at: iso(120)
  },
  // Matriz 087: duas tentativas vazias, aguardando a terceira.
  {
    id: 'b-087-1',
    animal_id: 'a-087',
    animal_number: '087',
    attempt_number: 1,
    protocol_date: '2025-03-05',
    protocol_type: 'IATF',
    semen: 'Angus',
    confirmation_date: '2025-04-04',
    result: 'vazia',
    notes: null,
    created_by: 'u-admin',
    created_at: iso(100)
  },
  {
    id: 'b-087-2',
    animal_id: 'a-087',
    animal_number: '087',
    attempt_number: 2,
    protocol_date: '2025-04-20',
    protocol_type: 'IATF',
    semen: 'Angus',
    confirmation_date: '2025-05-20',
    result: 'vazia',
    notes: null,
    created_by: 'u-admin',
    created_at: iso(70)
  }
]

export const demoManagementEvents: ManagementEvent[] = [
  {
    id: 'm-1',
    date: '2025-06-15',
    type: 'vacinacao',
    title: 'Vacinação contra aftosa',
    products: [{ name: 'Vacina aftosa', dose: '5 ml' }],
    lot: 'Lote Norte',
    animal_count: 2,
    participants: [
      { animal_id: 'a-087', number: '087', present: true, done: true, weight: null, note: null },
      { animal_id: 'a-195', number: '195', present: true, done: true, weight: null, note: null }
    ],
    notes: 'Rebanho tranquilo, sem intercorrências.',
    created_by: 'u-joao',
    created_at: iso(20)
  },
  {
    id: 'm-2',
    date: '2025-06-28',
    type: 'vermifugacao',
    title: 'Vermifugação geral',
    products: [{ name: 'Vermífugo pour-on', dose: '1 ml/10 kg' }],
    lot: 'Curral 2',
    animal_count: 34,
    participants: [],
    notes: null,
    created_by: 'u-marcos',
    created_at: iso(8)
  }
]
