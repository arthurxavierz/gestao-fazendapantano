import { Hash } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useFazenda } from '../AppContext'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { PageHeading, Tabs } from '../components/ui'
import { animalAtivoComBrinco, compararBrincos } from '../domain/regras'
import { data } from '../utils/format'

/** Aba Números disponíveis: brincos liberados por venda, morte ou descarte. */
export function Numeros() {
  const { dados, carregando } = useFazenda()
  const [aba, setAba] = useState<'disponiveis' | 'todos'>('disponiveis')
  if (carregando) return <Loading />

  const todos = [...dados.numeros].sort((a, b) => compararBrincos(a.numero, b.numero))
  const disponiveis = todos.filter((item) => item.situacao === 'Disponível' && !animalAtivoComBrinco(dados, item.numero))
  const lista = aba === 'disponiveis' ? disponiveis : todos

  return (
    <>
      <PageHeading eyebrow="Rebanho" title="Números disponíveis" text="Brincos liberados por animais que saíram. Use-os em lotes novos ou em bezerros incorporados: ao cadastrar o número, ele sai desta lista sozinho." />
      <Tabs value={aba} onChange={setAba} items={[{ value: 'disponiveis', label: 'Disponíveis', count: disponiveis.length }, { value: 'todos', label: 'Histórico completo', count: todos.length }]} />
      {lista.length === 0 ? (
        <EmptyState icon={Hash} title="Nenhum número liberado" text="Quando um animal sair (venda, morte ou descarte), o número dele aparece aqui." />
      ) : (
        <div className="panel table-panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Número</th><th>Liberado em</th><th>Registro antigo</th><th>Situação</th><th>Motivo da saída</th><th>Reutilizado em</th></tr></thead>
              <tbody>
                {lista.map((item) => (
                  <tr key={item.id}>
                    <td><strong className="numero-grande">{item.numero}</strong></td>
                    <td>{data(item.liberado_em)}</td>
                    <td>{item.animal_id ? <Link to={`/animais/${item.animal_id}`}>{item.registro_antigo}</Link> : item.registro_antigo}</td>
                    <td><span className={`pill tone-${item.situacao === 'Disponível' ? 'emerald' : 'slate'}`}>{item.situacao}</span></td>
                    <td>{item.motivo}</td>
                    <td>{data(item.reutilizado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
