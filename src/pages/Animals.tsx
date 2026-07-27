import { Filter, Plus, Search, SlidersHorizontal, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { useAuth } from '../AuthContext'
import { AnimalCard } from '../components/AnimalCard'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import type { AnimalStatus } from '../types'
import { statusLabel } from '../utils/format'

export function Animals() {
  const { animals, loading } = useAppData()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialStatus = params.get('status') === 'atencao' ? 'atencao' : 'todos'
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string>(initialStatus)

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return animals.filter((animal) => {
      const matchesQuery = !normalized || [animal.number, animal.breed, animal.lot, animal.origin, animal.notes]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(normalized))
      const matchesStatus = status === 'todos'
        || (status === 'atencao' && ['doente', 'observacao'].includes(animal.status))
        || animal.status === status
      return matchesQuery && matchesStatus
    }).sort((a, b) => a.number.localeCompare(b.number, 'pt-BR', { numeric: true }))
  }, [animals, query, status])

  if (loading) return <Loading />

  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">Cadastro do rebanho</span><h1>Animais</h1><p>{filtered.length} de {animals.length} registros exibidos</p></div>
        <div className="heading-actions">
          {isAdmin && (
            <button className="button button-secondary" onClick={() => navigate('/animais/importar')}><Upload size={18} /> Importar planilha</button>
          )}
          <button className="button button-primary" onClick={() => navigate('/animais/novo')}><Plus size={18} /> Cadastrar animal</button>
        </div>
      </div>

      <div className="filters-panel">
        <label className="search-box"><Search size={20} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Digite o número, raça ou local" /></label>
        <label className="select-box"><Filter size={18} /><select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="todos">Todas as situações</option>
          <option value="atencao">Precisam de atenção</option>
          {(Object.keys(statusLabel) as AnimalStatus[]).map((key) => <option key={key} value={key}>{statusLabel[key]}</option>)}
        </select></label>
      </div>

      <div className="animal-list">
        {filtered.map((animal) => <AnimalCard key={animal.id} animal={animal} />)}
      </div>

      {!filtered.length && <EmptyState icon={SlidersHorizontal} title="Nenhum animal encontrado" text="Altere a pesquisa ou o filtro para visualizar outros registros." />}
    </>
  )
}
