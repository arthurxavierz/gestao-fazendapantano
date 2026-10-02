import { Filter, LayoutGrid, Layers, List, MapPin, Plus, Search, SlidersHorizontal, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { useAuth } from '../AuthContext'
import { AnimalCard } from '../components/AnimalCard'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { ReproBadge, StatusBadge } from '../components/StatusBadge'
import { PageHeading } from '../components/ui'
import { byNumber, isActive, originType } from '../domain/herd'
import { useHerd } from '../hooks/useHerd'
import type { AnimalCategory, AnimalStatus } from '../types'
import { categoryLabel, formatAge, formatWeight, originLabel, sexLabel, statusLabel } from '../utils/format'

const VIEW_KEY = 'pantano.animalsView'

function readView(): 'cards' | 'table' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'cards'
  } catch {
    return 'cards'
  }
}

export function Animals() {
  const { animals, loading } = useAppData()
  const { isAdmin } = useAuth()
  const herd = useHerd()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialStatus = params.get('status') === 'atencao' ? 'atencao' : 'ativos'
  const [query, setQuery] = useState(params.get('busca') ?? '')
  const [status, setStatus] = useState<string>(initialStatus)
  const [category, setCategory] = useState<AnimalCategory | 'todas'>('todas')
  const [lot, setLot] = useState('todos')
  const [view, setView] = useState<'cards' | 'table'>(readView)

  const lots = useMemo(() => [...new Set(animals.map((item) => item.lot).filter(Boolean) as string[])].sort(), [animals])

  const categoryCounts = useMemo(() => {
    const counts = new Map<AnimalCategory, number>()
    for (const animal of animals.filter(isActive)) {
      const cat = herd.get(animal.id)?.category
      if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1)
    }
    return counts
  }, [animals, herd])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return animals.filter((animal) => {
      const info = herd.get(animal.id)
      const matchesQuery = !normalized || [animal.number, animal.breed, animal.lot, animal.origin, animal.notes, animal.sire]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(normalized))
      const matchesStatus = status === 'todos'
        || (status === 'ativos' && isActive(animal))
        || (status === 'atencao' && ['doente', 'observacao'].includes(animal.status))
        || animal.status === status
      const matchesCategory = category === 'todas' || info?.category === category
      const matchesLot = lot === 'todos' || animal.lot === lot
      return matchesQuery && matchesStatus && matchesCategory && matchesLot
    }).sort(byNumber)
  }, [animals, herd, query, status, category, lot])

  function changeView(next: 'cards' | 'table') {
    setView(next)
    try { localStorage.setItem(VIEW_KEY, next) } catch { /* preferência só deste aparelho */ }
  }

  if (loading) return <Loading />

  return (
    <>
      <PageHeading
        eyebrow="Cadastro do rebanho"
        title="Animais"
        text={`${filtered.length} de ${animals.length} registros exibidos`}
        actions={<>
          {isAdmin && <button className="button button-secondary" onClick={() => navigate('/animais/importar')}><Upload size={18} /> Importar planilha</button>}
          <button className="button button-secondary" onClick={() => navigate('/animais/lote')}><Layers size={18} /> Vários de uma vez</button>
          <button className="button button-primary" onClick={() => navigate('/animais/novo')}><Plus size={18} /> Cadastrar animal</button>
        </>}
      />

      <div className="category-chips">
        <button className={category === 'todas' ? 'selected' : ''} onClick={() => setCategory('todas')}>Todas <em>{animals.filter(isActive).length}</em></button>
        {(Object.keys(categoryLabel) as AnimalCategory[]).filter((key) => categoryCounts.get(key)).map((key) => (
          <button key={key} className={category === key ? 'selected' : ''} onClick={() => setCategory(key)}>{categoryLabel[key]} <em>{categoryCounts.get(key)}</em></button>
        ))}
      </div>

      <div className="filters-panel filters-4">
        <label className="search-box"><Search size={20} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Brinco, raça, local ou pai" /></label>
        <label className="select-box"><Filter size={18} /><select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ativos">Animais ativos</option>
          <option value="todos">Todas as situações</option>
          <option value="atencao">Precisam de atenção</option>
          {(Object.keys(statusLabel) as AnimalStatus[]).map((key) => <option key={key} value={key}>{statusLabel[key]}</option>)}
        </select></label>
        {lots.length > 0 && (
          <label className="select-box"><MapPin size={18} /><select value={lot} onChange={(e) => setLot(e.target.value)}>
            <option value="todos">Todos os lotes</option>
            {lots.map((item) => <option key={item} value={item}>{item}</option>)}
          </select></label>
        )}
        <div className="view-toggle" role="group" aria-label="Forma de exibição">
          <button className={view === 'cards' ? 'selected' : ''} onClick={() => changeView('cards')} aria-label="Cartões"><LayoutGrid size={18} /></button>
          <button className={view === 'table' ? 'selected' : ''} onClick={() => changeView('table')} aria-label="Tabela"><List size={18} /></button>
        </div>
      </div>

      {view === 'cards' ? (
        <div className="animal-list">
          {filtered.map((animal) => <AnimalCard key={animal.id} animal={animal} />)}
        </div>
      ) : (
        <div className="panel table-panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Brinco</th><th>Categoria</th><th>Sexo</th><th>Raça</th><th>Idade</th><th>Peso</th><th>Lote</th><th>Origem</th><th>Situação</th></tr></thead>
              <tbody>
                {filtered.map((animal) => {
                  const info = herd.get(animal.id)
                  return (
                    <tr key={animal.id} onClick={() => navigate(`/animais/${animal.id}`)}>
                      <td><strong>{animal.number}</strong></td>
                      <td>{info?.category ? categoryLabel[info.category] : '—'}</td>
                      <td>{sexLabel[animal.sex]}</td>
                      <td>{animal.breed || '—'}</td>
                      <td>{formatAge(animal.birth_date)}</td>
                      <td>{formatWeight(animal.weight)}</td>
                      <td>{animal.lot || '—'}</td>
                      <td>{originLabel[originType(animal)]}</td>
                      <td className="cell-badges"><StatusBadge status={animal.status} />{info && info.breeding && info.state !== 'descarte' && <ReproBadge state={info.state} />}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!filtered.length && <EmptyState icon={SlidersHorizontal} title="Nenhum animal encontrado" text="Altere a pesquisa ou o filtro para visualizar outros registros." />}
    </>
  )
}
