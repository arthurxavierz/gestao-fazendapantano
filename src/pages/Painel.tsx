import { AlertTriangle, ArrowRight, Baby, CircleHelp, ClipboardList, Hash, ListChecks, Shield, Sparkles, Dna } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFazenda } from '../AppContext'
import { useAuth } from '../AuthContext'
import { brand } from '../brand'
import { Loading } from '../components/Loading'
import { paresSuspeitos } from '../domain/revisao'
import { avisoBezerro, ativo, FAIXAS, quadroPorFaixa } from '../domain/regras'
import { plural } from '../utils/format'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Painel: o quadro do topo da aba Geral, com o que precisa de ação em destaque. */
export function Painel() {
  const { dados, linhas, carregando, erro } = useFazenda()
  const { displayName } = useAuth()
  const navigate = useNavigate()

  const resumo = useMemo(() => {
    const active = linhas.filter((item) => ativo(item.animal))
    const femeas = active.filter((item) => item.animal.sexo === 'F')
    return {
      ativos: active.length,
      semSexo: active.filter((item) => !item.animal.sexo).length,
      semFaixa: active.filter((item) => !item.faixa).length,
      conferir: active.filter((item) => item.animal.conferencia?.startsWith('Conferir')).length,
      duplicados: paresSuspeitos(dados).length,
      prenhas: femeas.filter((item) => item.situacao.texto === 'Prenha').length,
      descarte: femeas.filter((item) => item.situacao.texto.startsWith('Descarte')).length,
      aguardando: femeas.filter((item) => item.situacao.texto === 'Aguardando protocolo' || item.situacao.texto.startsWith('Vazia')).length,
      femeas: femeas.length,
      mamando: dados.bezerros.filter((item) => item.situacao === 'Mamando').length,
      semDestino: dados.bezerros.filter((item) => avisoBezerro(item)?.semDestino).length,
      prontos: dados.bezerros.filter((item) => avisoBezerro(item)?.pronto).length,
      numeros: dados.numeros.filter((item) => item.situacao === 'Disponível').length,
      pendentes: dados.manejos.filter((item) => item.status === 'Pendente').length,
      quadro: quadroPorFaixa(dados.animais)
    }
  }, [dados, linhas])

  if (carregando) return <Loading />
  if (erro) return <div className="alert alert-error">{erro}</div>

  const firstName = displayName.split(' ')[0]
  const acoes = [
    resumo.semSexo > 0 && { tom: 'amber', icon: Sparkles, texto: `${plural(resumo.semSexo, 'animal', 'animais')} sem sexo informado`, to: '/animais/completar' },
    resumo.descarte > 0 && { tom: 'red', icon: AlertTriangle, texto: `${plural(resumo.descarte, 'vaca', 'vacas')} com 3 protocolos vazios: descarte`, to: '/femeas?fase=descarte' },
    resumo.pendentes > 0 && { tom: 'red', icon: ListChecks, texto: `${plural(resumo.pendentes, 'manejo pendente', 'manejos pendentes')} (faltaram)`, to: '/manejos?status=Pendente' },
    resumo.semDestino > 0 && { tom: 'red', icon: Baby, texto: `${plural(resumo.semDestino, 'bezerro', 'bezerros')} com 8+ meses sem destino`, to: '/bezerros?filtro=sem-destino' },
    resumo.prontos > 0 && { tom: 'emerald', icon: Baby, texto: `${plural(resumo.prontos, 'bezerro pronto', 'bezerros prontos')} para incorporar`, to: '/bezerros?filtro=prontos' },
    resumo.duplicados > 0 && { tom: 'amber', icon: CircleHelp, texto: `${plural(resumo.duplicados, 'possível animal repetido', 'possíveis animais repetidos')}`, to: '/revisao' },
    resumo.conferir > 0 && { tom: 'amber', icon: CircleHelp, texto: `${plural(resumo.conferir, 'foto', 'fotos')} para conferir no curral`, to: '/revisao?aba=conferir' },
    resumo.semFaixa - resumo.semSexo > 0 && { tom: 'slate', icon: CircleHelp, texto: `${plural(resumo.semFaixa - resumo.semSexo, 'animal', 'animais')} com sexo mas sem faixa`, to: '/animais?filtro=sem-faixa' }
  ].filter(Boolean) as { tom: string; icon: typeof Sparkles; texto: string; to: string }[]

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">{greeting()}{firstName && firstName !== 'Demonstração' ? `, ${firstName}` : ''}</span>
          <h1>{brand.heroTitle}</h1>
          <p>
            {plural(resumo.ativos, 'animal ativo', 'animais ativos')}, {plural(resumo.mamando, 'bezerro ao pé', 'bezerros ao pé')}
            {resumo.femeas ? ` e ${plural(resumo.prenhas, 'vaca prenha', 'vacas prenhas')}.` : '.'}
          </p>
          <div className="hero-actions">
            <button className="button button-mint" onClick={() => navigate(resumo.semSexo ? '/animais/completar' : '/animais')}>
              <Sparkles size={18} /> {resumo.semSexo ? 'Completar cadastro' : 'Ver animais'}
            </button>
            <button className="button button-glass" onClick={() => navigate('/manejos/lote')}><ListChecks size={18} /> Manejo em lote</button>
            <button className="button button-glass" onClick={() => navigate('/quadro')}><ClipboardList size={18} /> Quadro de campo</button>
          </div>
        </div>
        <div className="hero-stats">
          <div><strong>{resumo.ativos}</strong><span>animais ativos</span></div>
          <div><strong>{resumo.femeas}</strong><span>fêmeas</span></div>
          <div><strong>{resumo.mamando}</strong><span>bezerros ao pé</span></div>
        </div>
        <svg className="hero-art" viewBox="0 0 400 400" aria-hidden="true"><circle cx="300" cy="120" r="220" /><circle cx="330" cy="330" r="140" /></svg>
      </section>

      {acoes.length > 0 && (
        <div className="acoes-painel">
          {acoes.map((item) => (
            <Link key={item.texto} to={item.to} className={`acao-chip tone-${item.tom}`}>
              <item.icon size={16} />
              <span>{item.texto}</span>
              <ArrowRight size={15} />
            </Link>
          ))}
        </div>
      )}

      <div className="painel-grid">
        <section className="panel painel-faixas">
          <div className="panel-head">
            <div><span className="eyebrow">Rebanho ativo</span><h2>Animais por faixa etária (meses)</h2></div>
            <Link className="panel-link" to="/ima">Comparar com o IMA</Link>
          </div>
          <div className="table-wrap">
            <table className="data-table tabela-faixas">
              <thead>
                <tr><th>Animais</th>{FAIXAS.map((faixa) => <th key={faixa}>{faixa}</th>)}<th>Sem faixa</th><th>Total</th></tr>
              </thead>
              <tbody>
                {resumo.quadro.linhas.map((row) => (
                  <tr key={row.rotulo} className={row.rotulo === 'Sem sexo' && row.total ? 'linha-alerta' : ''}>
                    <th scope="row">{row.rotulo}</th>
                    {row.porFaixa.map((value, index) => <td key={index}>{value || '·'}</td>)}
                    <td>{row.semFaixa || '·'}</td>
                    <td><strong>{row.total}</strong></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><th scope="row">Total</th>{resumo.quadro.totais.map((value, index) => <td key={index}>{value}</td>)}<td>{resumo.quadro.semFaixa}</td><td><strong>{resumo.quadro.total}</strong></td></tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="panel painel-numeros">
          <div className="panel-head"><div><span className="eyebrow">Controle</span><h2>Resumo</h2></div></div>
          <ul className="resumo-lista">
            <li><Link to="/femeas"><Dna size={17} /><span>Vacas prenhas</span><strong>{resumo.prenhas}</strong></Link></li>
            <li><Link to="/femeas?fase=aguardando"><Dna size={17} /><span>Vacas aguardando protocolo</span><strong>{resumo.aguardando}</strong></Link></li>
            <li><Link to="/bezerros"><Baby size={17} /><span>Bezerros ao pé (mamando)</span><strong>{resumo.mamando}</strong></Link></li>
            <li className={resumo.semDestino ? 'is-alerta' : ''}><Link to="/bezerros?filtro=sem-destino"><Baby size={17} /><span>Bezerros com 8+ meses sem destino</span><strong>{resumo.semDestino}</strong></Link></li>
            <li><Link to="/numeros"><Hash size={17} /><span>Números disponíveis</span><strong>{resumo.numeros}</strong></Link></li>
            <li className={resumo.pendentes ? 'is-alerta' : ''}><Link to="/manejos?status=Pendente"><ListChecks size={17} /><span>Manejos pendentes (faltaram)</span><strong>{resumo.pendentes}</strong></Link></li>
            <li><Link to="/ima"><Shield size={17} /><span>Última comparação com o IMA</span><strong>{dados.ima[0] ? new Date(dados.ima[0].created_at).toLocaleDateString('pt-BR') : '—'}</strong></Link></li>
          </ul>
        </section>
      </div>
    </>
  )
}
