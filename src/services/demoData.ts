import type { Animal, CountSession, Occurrence, Profile } from '../types'

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
