import { Search, Dna } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useFazenda } from '../AppContext'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { Foto, SituacaoPill } from '../components/rebanho'
import { PageHeading, Tabs } from '../components/ui'
import { ativo, bezerrosDaMae, mamando, protocolosDoCiclo } from '../domain/regras'
import { dataCurta } from '../utils/format'

type Fase = 'todas' | 'aguardando' | 'protocolo' | 'prenha' | 'vazia' | 'bezerro' | 'descarte'

/** Aba Fêmeas da planilha: os 3 protocolos do ciclo atual na mesma linha. */
export function Femeas() {
  const { dados, linhas, carregando } = useFazenda()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const fase = (params.get('fase') as Fase) || 'todas'

  const femeas = useMemo(() => linhas.filter((item) => ativo(item.animal) && item.animal.sexo === 'F').map((item) => {
    const slots = protocolosDoCiclo(dados.protocolos, item.animal.id, item.animal.ciclo)
    const aberto = slots.some((slot) => slot?.data_protocolo && !slot.resultado)
    const filhos = bezerrosDaMae(dados.bezerros, item.animal.id)
    const t = item.situacao.texto
    const faseDe: Fase = t.startsWith('Descarte') ? 'descarte' : aberto ? 'protocolo' : t === 'Prenha' ? 'prenha' : t.startsWith('Vazia') ? 'vazia' : t === 'Com bezerro ao pé' ? 'bezerro' : 'aguardando'
    return { ...item, slots, aberto, filhos, ultimoParto: filhos[0]?.nascimento ?? null, aoPe: mamando(dados.bezerros, item.animal.id), fase: faseDe }
  }), [linhas, dados])

  const counts = useMemo(() => {
    const result: Record<Fase, number> = { todas: femeas.length, aguardando: 0, protocolo: 0, prenha: 0, vazia: 0, bezerro: 0, descarte: 0 }
    for (const item of femeas) result[item.fase] += 1
    return result
  }, [femeas])

  const lista = femeas.filter((item) => (fase === 'todas' || item.fase === fase) && (!busca.trim() || item.animal.brinco.toLowerCase().includes(busca.trim().toLowerCase())))

  if (carregando) return <Loading />

  return (
    <>
      <PageHeading eyebrow="Rebanho" title="Fêmeas e IATF" text="Os 3 protocolos do ciclo atual de cada vaca. Toque na vaca para lançar protocolo, resultado ou parto. Três vazias no ciclo levam ao descarte." />

      <Tabs<Fase>
        value={fase}
        onChange={(value) => { if (value === 'todas') params.delete('fase'); else params.set('fase', value); setParams(params, { replace: true }) }}
        items={[
          { value: 'todas', label: 'Todas', count: counts.todas },
          { value: 'aguardando', label: 'Aguardando protocolo', count: counts.aguardando },
          { value: 'protocolo', label: 'Em protocolo', count: counts.protocolo },
          { value: 'vazia', label: 'Vazias', count: counts.vazia },
          { value: 'prenha', label: 'Prenhas', count: counts.prenha },
          { value: 'bezerro', label: 'Com bezerro ao pé', count: counts.bezerro },
          { value: 'descarte', label: 'Descarte', count: counts.descarte }
        ]}
      />

      <div className="filters-panel filters-1">
        <label className="search-box"><Search size={18} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar brinco" inputMode="search" /></label>
      </div>

      {lista.length === 0 ? (
        <EmptyState icon={Dna} title={femeas.length ? 'Nenhuma vaca nesta fase' : 'Nenhuma fêmea cadastrada ainda'} text={femeas.length ? 'Escolha outra aba.' : 'Informe o sexo F dos animais (Animais > Sem sexo, ou Completar cadastro) e elas aparecem aqui.'} />
      ) : (
        <div className="panel table-panel">
          <div className="table-wrap">
            <table className="data-table tabela-femeas">
              <thead>
                <tr><th>Vaca</th><th>Situação</th><th>Ciclo</th><th>1º protocolo</th><th>2º protocolo</th><th>3º protocolo</th><th>Partos</th><th>Último parto</th><th>Ao pé</th></tr>
              </thead>
              <tbody>
                {lista.map((item) => (
                  <tr key={item.animal.id} onClick={() => navigate(`/animais/${item.animal.id}`)} className={item.fase === 'descarte' ? 'linha-descarte' : ''}>
                    <td><span className="celula-animal"><Foto src={item.animal.foto_url} alt={item.rotulo} size="xs" /><strong>{item.rotulo}</strong><small>{item.faixa ?? ''}</small></span></td>
                    <td><SituacaoPill situacao={item.situacao} curta /></td>
                    <td>{item.animal.ciclo}</td>
                    {item.slots.map((slot, index) => (
                      <td key={index}>
                        {slot ? (
                          <span className={`slot slot-${slot.resultado ? slot.resultado.toLowerCase() : slot.apta === 'N' ? 'inapta' : 'aberto'}`}>
                            {slot.resultado ?? (slot.apta === 'N' ? `não apta${slot.motivo ? `: ${slot.motivo}` : ''}` : 'aguardando')}
                            {slot.data_protocolo && <small>{dataCurta(slot.data_protocolo)}</small>}
                          </span>
                        ) : <span className="muted">—</span>}
                      </td>
                    ))}
                    <td>{item.filhos.length || '—'}</td>
                    <td>{item.ultimoParto ? dataCurta(item.ultimoParto) : '—'}</td>
                    <td>{item.aoPe || '—'}</td>
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
