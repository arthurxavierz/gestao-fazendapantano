import { ClipboardCheck, History } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useFazenda } from '../AppContext'
import { Loading } from '../components/Loading'
import { PageHeading } from '../components/ui'
import { FAIXAS, contagemDaFazenda, contagemVazia, foraDaComparacao, planoIma } from '../domain/regras'
import type { ContagemIma, RelatorioIma, Sexo } from '../types'
import { data } from '../utils/format'

/** Aba IMA: compara o consolidado do IMA com a fazenda e gera o plano de ação. */
export function Ima() {
  const { carregando } = useFazenda()
  return carregando ? <Loading /> : <ImaConteudo />
}

function ImaConteudo() {
  const { dados, salvarExtra } = useFazenda()
  const [ima, setIma] = useState<ContagemIma>(() => dados.ima[0]?.contagem ?? contagemVazia())
  const [dataRelatorio, setDataRelatorio] = useState(dados.ima[0]?.data_relatorio ?? '')
  const [plano, setPlano] = useState<ReturnType<typeof planoIma> | null>(null)

  const fazenda = useMemo(() => contagemDaFazenda(dados), [dados])
  const fora = useMemo(() => foraDaComparacao(dados.animais), [dados.animais])

  const set = (faixa: (typeof FAIXAS)[number], sexo: Sexo, value: string) =>
    setIma((current) => ({ ...current, [faixa]: { ...current[faixa], [sexo]: Math.max(0, Number(value.replace(/\D/g, '')) || 0) } }))

  const tot = (c: ContagemIma, sexo?: Sexo) => FAIXAS.reduce((sum, faixa) => sum + (sexo ? c[faixa][sexo] : c[faixa].M + c[faixa].F), 0)

  async function gerar() {
    const lines = planoIma(ima, fazenda, fora, dataRelatorio || null)
    setPlano(lines)
    if (tot(ima) > 0) {
      const row: RelatorioIma = { id: crypto.randomUUID(), data_relatorio: dataRelatorio || null, contagem: ima, created_at: new Date().toISOString() }
      await salvarExtra('ima', row)
    }
  }

  const dif = (faixa: (typeof FAIXAS)[number], sexo: Sexo) => fazenda[faixa][sexo] - ima[faixa][sexo]
  const cls = (value: number) => (value > 0 ? 'dif-mais' : value < 0 ? 'dif-menos' : 'dif-zero')

  return (
    <>
      <PageHeading eyebrow="Campo e IMA" title="Comparar com o IMA" text="Digite o consolidado do IMA (machos e fêmeas por faixa). A comparação usa os animais ativos mais os bezerros ao pé, na faixa de 0 a 12 meses." />

      <section className="panel ima-panel">
        <div className="ima-data">
          <label className="field"><span>Data do relatório do IMA</span><input type="date" value={dataRelatorio} onChange={(e) => setDataRelatorio(e.target.value)} /></label>
        </div>
        <div className="table-wrap">
          <table className="data-table tabela-ima">
            <thead>
              <tr><th rowSpan={2}>Faixa (meses)</th><th colSpan={3} className="grupo">No IMA (declarado)</th><th colSpan={3} className="grupo">Na fazenda</th><th colSpan={3} className="grupo">Diferença (fazenda − IMA)</th></tr>
              <tr><th>Machos</th><th>Fêmeas</th><th>Total</th><th>Machos</th><th>Fêmeas</th><th>Total</th><th>Machos</th><th>Fêmeas</th><th>Total</th></tr>
            </thead>
            <tbody>
              {FAIXAS.map((faixa) => (
                <tr key={faixa}>
                  <th scope="row">{faixa}</th>
                  <td><input className="ima-input" inputMode="numeric" value={ima[faixa].M || ''} onChange={(e) => set(faixa, 'M', e.target.value)} placeholder="0" aria-label={`Machos ${faixa} no IMA`} /></td>
                  <td><input className="ima-input" inputMode="numeric" value={ima[faixa].F || ''} onChange={(e) => set(faixa, 'F', e.target.value)} placeholder="0" aria-label={`Fêmeas ${faixa} no IMA`} /></td>
                  <td>{ima[faixa].M + ima[faixa].F}</td>
                  <td>{fazenda[faixa].M}</td>
                  <td>{fazenda[faixa].F}</td>
                  <td>{fazenda[faixa].M + fazenda[faixa].F}</td>
                  <td className={cls(dif(faixa, 'M'))}>{dif(faixa, 'M')}</td>
                  <td className={cls(dif(faixa, 'F'))}>{dif(faixa, 'F')}</td>
                  <td className={cls(dif(faixa, 'M') + dif(faixa, 'F'))}>{dif(faixa, 'M') + dif(faixa, 'F')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td>{tot(ima, 'M')}</td><td>{tot(ima, 'F')}</td><td>{tot(ima)}</td>
                <td>{tot(fazenda, 'M')}</td><td>{tot(fazenda, 'F')}</td><td>{tot(fazenda)}</td>
                <td className={cls(tot(fazenda, 'M') - tot(ima, 'M'))}>{tot(fazenda, 'M') - tot(ima, 'M')}</td>
                <td className={cls(tot(fazenda, 'F') - tot(ima, 'F'))}>{tot(fazenda, 'F') - tot(ima, 'F')}</td>
                <td className={cls(tot(fazenda) - tot(ima))}>{tot(fazenda) - tot(ima)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {fora > 0 && <p className="muted ima-fora">{fora} animal(is) da fazenda sem sexo ou sem faixa ficam fora da comparação.</p>}
        <div className="form-actions"><button className="button button-primary" onClick={() => void gerar()}><ClipboardCheck size={17} /> Gerar plano de ação</button></div>
      </section>

      {plano && (
        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Plano de ação</span><h2>O que declarar no IMA</h2></div></div>
          <ul className="plano-lista">{plano.map((line, index) => <li key={index} className={`plano-${line.tom}`}>{line.texto}</li>)}</ul>
          <p className="muted">Diferença entre faixas vizinhas costuma ser só mudança de idade.</p>
        </section>
      )}

      {dados.ima.length > 0 && (
        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow"><History size={12} /> Histórico</span><h2>Comparações anteriores</h2></div></div>
          <ul className="ima-historico">
            {dados.ima.slice(0, 8).map((row) => (
              <li key={row.id}>
                <button type="button" className="text-button" onClick={() => { setIma(row.contagem); setDataRelatorio(row.data_relatorio ?? ''); setPlano(null) }}>
                  {new Date(row.created_at).toLocaleDateString('pt-BR')} · relatório de {row.data_relatorio ? data(row.data_relatorio) : 'data não informada'} · {tot(row.contagem)} animais no IMA
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
