import { AlertTriangle, ClipboardCheck, FileText, HeartPulse, Plus, Search, Users } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { Loading } from '../components/Loading'
import { StatusBadge } from '../components/StatusBadge'
import { formatDateTime, occurrenceLabel } from '../utils/format'

export function Dashboard() {
  const { animals, occurrences, counts, loading, error } = useAppData()
  const navigate = useNavigate()

  if (loading) return <Loading />

  const summary = {
    total: animals.filter((item) => item.status !== 'vendido' && item.status !== 'morto').length,
    normal: animals.filter((item) => item.status === 'normal').length,
    observacao: animals.filter((item) => item.status === 'observacao').length,
    doente: animals.filter((item) => item.status === 'doente').length,
    morto: animals.filter((item) => item.status === 'morto').length
  }

  return (
    <>
      <section className="hero-panel">
        <div>
          <span className="eyebrow">Visão geral da fazenda</span>
          <h1>O controle do rebanho, sem complicação.</h1>
          <p>Consulte animais, registre ocorrências e prepare folhas para o manejo em poucos passos.</p>
        </div>
        <div className="hero-actions">
          <button className="button button-light" onClick={() => navigate('/animais/novo')}><Plus size={18} /> Novo animal</button>
          <button className="button button-outline-light" onClick={() => navigate('/ocorrencias')}><HeartPulse size={18} /> Registrar ocorrência</button>
        </div>
      </section>

      {error && <div className="alert alert-error"><AlertTriangle size={18} /> {error}</div>}

      <section className="summary-grid">
        <article className="summary-card summary-main">
          <span>Animais ativos</span><strong>{summary.total}</strong><small>exclui vendidos e mortos</small>
        </article>
        <article className="summary-card"><span>Normais</span><strong>{summary.normal}</strong><div className="summary-line normal" /></article>
        <article className="summary-card"><span>Em observação</span><strong>{summary.observacao}</strong><div className="summary-line observacao" /></article>
        <article className="summary-card"><span>Doentes</span><strong>{summary.doente}</strong><div className="summary-line doente" /></article>
        <article className="summary-card"><span>Mortos</span><strong>{summary.morto}</strong><div className="summary-line morto" /></article>
      </section>

      <section className="quick-actions">
        <Link to="/animais" className="quick-action"><Search /><div><strong>Consultar animal</strong><span>Pesquise pelo número, raça ou situação</span></div></Link>
        <Link to="/contagens" className="quick-action"><ClipboardCheck /><div><strong>Nova contagem</strong><span>Registre a quantidade ou os números encontrados</span></div></Link>
        <Link to="/relatorios" className="quick-action"><FileText /><div><strong>Preparar documento</strong><span>PDF, Word ou folha pronta para imprimir</span></div></Link>
      </section>

      <section className="dashboard-columns">
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Atenção</span><h2>Animais que precisam de acompanhamento</h2></div><Link to="/animais?status=atencao">Ver todos</Link></div>
          <div className="attention-list">
            {animals.filter((item) => item.status === 'doente' || item.status === 'observacao').slice(0, 5).map((animal) => (
              <Link to={`/animais/${animal.id}`} key={animal.id} className="attention-row">
                <div className="animal-number-mini">{animal.number}</div>
                <div><strong>Animal {animal.number}</strong><span>{animal.notes || animal.breed || 'Sem observação informada'}</span></div>
                <StatusBadge status={animal.status} />
              </Link>
            ))}
            {!animals.some((item) => item.status === 'doente' || item.status === 'observacao') && <p className="muted">Nenhum animal exige atenção neste momento.</p>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Registros recentes</span><h2>Últimas movimentações</h2></div></div>
          <div className="timeline">
            {occurrences.slice(0, 4).map((item) => (
              <div className="timeline-row" key={item.id}>
                <div className="timeline-icon"><HeartPulse size={17} /></div>
                <div><strong>Animal {item.animal_number || 'não identificado'}</strong><span>{occurrenceLabel[item.type]}: {item.note}</span><small>{formatDateTime(item.created_at)}</small></div>
              </div>
            ))}
            {counts.slice(0, 2).map((item) => (
              <div className="timeline-row" key={item.id}>
                <div className="timeline-icon"><Users size={17} /></div>
                <div><strong>{item.title}</strong><span>{item.total_counted} animais contados</span><small>{formatDateTime(item.created_at)}</small></div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  )
}
