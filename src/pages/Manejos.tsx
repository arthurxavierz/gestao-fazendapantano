import { Check, Plus, Search, Syringe } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useFazenda } from '../AppContext'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { NovoManejo } from '../components/rebanho'
import { Modal, PageHeading, Tabs } from '../components/ui'
import { marcarManejoFeito } from '../domain/operacoes'
import { type Alvo, TIPOS_MANEJO, ativo, hoje, mesmoBrinco, rotuloBrinco } from '../domain/regras'
import type { StatusManejo } from '../types'
import { data } from '../utils/format'

type Filtro = 'todos' | StatusManejo

/** Aba Manejos: o histórico de todos os manejos, com as pendências em vermelho. */
export function Manejos() {
  const { dados, carregando, executar } = useFazenda()
  const [params, setParams] = useSearchParams()
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('todos')
  const [limite, setLimite] = useState(200)
  const status = (params.get('status') as Filtro) || 'todos'
  const novo = params.get('novo') === '1'

  const nomes = useMemo(() => {
    const map = new Map<string, { rotulo: string; to: string }>()
    for (const animal of dados.animais) map.set(`a:${animal.id}`, { rotulo: rotuloBrinco(animal), to: `/animais/${animal.id}` })
    for (const calf of dados.bezerros) map.set(`b:${calf.id}`, { rotulo: calf.codigo, to: calf.animal_id ? `/animais/${calf.animal_id}` : `/bezerros/${calf.id}` })
    return map
  }, [dados.animais, dados.bezerros])

  const todos = useMemo(() => [...dados.manejos].sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at)), [dados.manejos])
  const counts = {
    todos: todos.length,
    Pendente: todos.filter((item) => item.status === 'Pendente').length,
    Feito: todos.filter((item) => item.status === 'Feito').length,
    'Feito depois': todos.filter((item) => item.status === 'Feito depois').length
  }
  const term = busca.trim().toLowerCase()
  const lista = todos.filter((item) => {
    if (status !== 'todos' && item.status !== status) return false
    if (tipo !== 'todos' && item.manejo !== tipo) return false
    if (term) {
      const quem = nomes.get(item.animal_id ? `a:${item.animal_id}` : `b:${item.bezerro_id}`)?.rotulo ?? ''
      if (![quem, item.produtos, item.observacao, item.manejo].filter(Boolean).join(' ').toLowerCase().includes(term)) return false
    }
    return true
  })

  if (carregando) return <Loading />

  return (
    <>
      <PageHeading
        eyebrow="Manejo"
        title="Histórico de manejos"
        text="Tudo o que foi feito no rebanho. Quem faltou num manejo em lote fica pendente até ser feito."
        actions={<>
          <Link className="button button-secondary" to="/manejos/lote">Manejo em lote</Link>
          <button className="button button-primary" onClick={() => { params.set('novo', '1'); setParams(params) }}><Plus size={17} /> Manejo de um animal</button>
        </>}
      />
      <Tabs<Filtro>
        value={status}
        onChange={(value) => { if (value === 'todos') params.delete('status'); else params.set('status', value); setParams(params, { replace: true }) }}
        items={[
          { value: 'todos', label: 'Todos', count: counts.todos },
          { value: 'Pendente', label: 'Pendentes', count: counts.Pendente },
          { value: 'Feito', label: 'Feitos', count: counts.Feito },
          { value: 'Feito depois', label: 'Feitos depois', count: counts['Feito depois'] }
        ]}
      />
      <div className="filters-panel">
        <label className="search-box"><Search size={18} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Brinco, produto ou observação" /></label>
        <label className="select-box"><select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de manejo"><option value="todos">Todos os manejos</option>{TIPOS_MANEJO.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>

      {lista.length === 0 ? (
        <EmptyState icon={Syringe} title="Nenhum manejo aqui" text={todos.length ? 'Ajuste os filtros.' : 'Lance pelo manejo em lote ou pela ficha de cada animal.'} />
      ) : (
        <div className="panel table-panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Data</th><th>Animal</th><th>Manejo</th><th>Produtos</th><th>Observação</th><th>Status</th></tr></thead>
              <tbody>
                {lista.slice(0, limite).map((item) => {
                  const quem = nomes.get(item.animal_id ? `a:${item.animal_id}` : `b:${item.bezerro_id}`)
                  return (
                    <tr key={item.id} className={item.status === 'Pendente' ? 'linha-pendente' : ''}>
                      <td>{data(item.data)}</td>
                      <td>{quem ? <Link to={quem.to}><strong>{quem.rotulo}</strong></Link> : '—'}</td>
                      <td>{item.manejo}</td>
                      <td>{item.produtos ?? ''}</td>
                      <td className="celula-obs">{item.observacao ?? ''}</td>
                      <td>
                        {item.status === 'Pendente' ? (
                          <button className="button button-sm button-danger" onClick={() => void executar((f) => marcarManejoFeito(f, item.id, hoje()))} title="Marcar como feito hoje"><Check size={14} /> Pendente · marcar feito</button>
                        ) : item.status === 'Feito depois' ? `Feito em ${data(item.feito_em)}` : 'Feito'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {lista.length > limite && <div className="mais"><button className="button button-secondary" onClick={() => setLimite((value) => value + 300)}>Mostrar mais ({lista.length - limite})</button></div>}
        </div>
      )}
      {novo && <ManejoUmAnimal onClose={() => { params.delete('novo'); setParams(params, { replace: true }) }} />}
    </>
  )
}

/** Manejo de um animal sem abrir a ficha: digita o brinco e lança. */
function ManejoUmAnimal({ onClose }: { onClose: () => void }) {
  const { dados } = useFazenda()
  const [brinco, setBrinco] = useState('')
  const animal = brinco.trim() ? dados.animais.find((item) => ativo(item) && mesmoBrinco(item.brinco, brinco)) : undefined
  const calf = !animal && brinco.trim() ? dados.bezerros.find((item) => mesmoBrinco(item.codigo, brinco)) : undefined
  const alvo: Alvo | null = animal ? { tipo: 'animal', id: animal.id } : calf ? { tipo: 'bezerro', id: calf.id } : null

  return (
    <Modal title="Manejo de um animal" eyebrow="Manejo" onClose={onClose} size="lg">
      <label className="field">
        <span>Brinco do animal ou código do bezerro</span>
        <input value={brinco} onChange={(e) => setBrinco(e.target.value)} autoFocus placeholder="Ex.: 149 ou 87-B1" />
        {brinco.trim() && <small className="field-hint">{animal ? `Animal ${animal.brinco}${animal.sexo ? ` (${animal.sexo})` : ''}` : calf ? `Bezerro ${calf.codigo}` : 'Nenhum animal ativo com esse brinco.'}</small>}
      </label>
      {alvo && <NovoManejo alvo={alvo} />}
    </Modal>
  )
}
