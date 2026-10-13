import { CheckCircle2, Copy, GitMerge, ScanSearch, Split } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useFazenda } from '../AppContext'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { PhotoViewer } from '../components/PhotoViewer'
import { Foto, SituacaoPill } from '../components/rebanho'
import { Modal, PageHeading, Tabs } from '../components/ui'
import { salvarDados } from '../domain/operacoes'
import { ativo, mesmoBrinco } from '../domain/regras'
import { type ParSuspeito, baseDoBrinco, juntarAnimais, marcarConferido, marcarDiferentes, paresSuspeitos, precisaConferir } from '../domain/revisao'
import type { Animal } from '../types'

type Aba = 'pares' | 'conferir'

/**
 * Revisão do cadastro: possíveis duplicados (mesmo número com letra, fotos
 * iguais) e as fotos que a conferência mandou ver no curral. Nada é juntado ou
 * apagado sem a pessoa decidir, olhando as fotos lado a lado.
 */
export function Revisao() {
  const { dados, linhaDe, carregando } = useFazenda()
  const [params, setParams] = useSearchParams()
  const aba = (params.get('aba') as Aba) || 'pares'
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null)
  const [juntar, setJuntar] = useState<{ fica: Animal; sai: Animal } | null>(null)

  const pares = useMemo(() => paresSuspeitos(dados), [dados])
  const conferir = useMemo(() => dados.animais.filter(precisaConferir).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)), [dados.animais])

  if (carregando) return <Loading />

  return (
    <>
      <PageHeading
        eyebrow="Rebanho"
        title="Revisão do cadastro"
        text="Possíveis animais repetidos e fotos para conferir no curral. Compare as fotos e decida: é o mesmo animal (junta os registros) ou são diferentes."
        actions={<Link className="button button-secondary" to="/animais/importar">Importar animais</Link>}
      />
      <Tabs<Aba>
        value={aba}
        onChange={(value) => { params.set('aba', value); setParams(params, { replace: true }) }}
        items={[
          { value: 'pares', label: 'Possíveis duplicados', icon: Copy, count: pares.length },
          { value: 'conferir', label: 'Conferir no curral', icon: ScanSearch, count: conferir.length }
        ]}
      />

      {aba === 'pares' && (pares.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nenhum duplicado suspeito" text="Nenhum par com o mesmo número ou com a mesma foto. Ao importar animais novos, os suspeitos aparecem aqui." />
      ) : (
        <div className="pares">
          {pares.map((par) => (
            <ParCard key={`${par.a.id}-${par.b.id}`} par={par} onZoom={setZoom} onJuntar={(fica, sai) => setJuntar({ fica, sai })} />
          ))}
        </div>
      ))}

      {aba === 'conferir' && (conferir.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Tudo conferido" text="Nenhuma foto marcada para conferir no curral." />
      ) : (
        <div className="conferir-grade">
          {conferir.map((animal) => <ConferirCard key={animal.id} animal={animal} situacao={linhaDe(animal.id)?.situacao} onZoom={setZoom} />)}
        </div>
      ))}

      {zoom && <PhotoViewer src={zoom.src} alt={zoom.alt} caption={zoom.alt} onClose={() => setZoom(null)} />}
      {juntar && <JuntarModal fica={juntar.fica} sai={juntar.sai} onClose={() => setJuntar(null)} />}
    </>
  )
}

function ParCard({ par, onZoom, onJuntar }: { par: ParSuspeito; onZoom: (z: { src: string; alt: string }) => void; onJuntar: (fica: Animal, sai: Animal) => void }) {
  const { dados, executar } = useFazenda()
  const historico = (id: string) => dados.manejos.filter((item) => item.animal_id === id).length + dados.protocolos.filter((item) => item.animal_id === id).length
  const lado = (animal: Animal, outro: Animal) => (
    <div className="par-lado">
      <Foto src={animal.foto_url} alt={`Brinco ${animal.brinco}`} size="lg" onClick={animal.foto_url ? () => onZoom({ src: animal.foto_url!, alt: `Brinco ${animal.brinco}` }) : undefined} />
      <div className="par-info">
        <Link to={`/animais/${animal.id}`} className="par-brinco">{animal.brinco}</Link>
        <span>{[animal.sexo ?? 'sem sexo', animal.faixa ?? 'sem faixa', animal.raca].filter(Boolean).join(' · ')}</span>
        {animal.conferencia && <small>{animal.conferencia}</small>}
        {historico(animal.id) > 0 && <small>{historico(animal.id)} lançamento(s) no histórico</small>}
      </div>
      <button className="button button-secondary button-sm" onClick={() => onJuntar(animal, outro)}><GitMerge size={15} /> Mesmo animal: manter este</button>
    </div>
  )
  return (
    <article className="par panel">
      <div className="par-motivo">
        {par.motivo === 'mesmo-numero' ? `Mesmo número de brinco (${baseDoBrinco(par.a.brinco)})` : 'Fotos praticamente iguais'}
        <span className="muted"> · {par.motivo === 'mesmo-numero' ? 'compare as fotos: é o mesmo animal fotografado duas vezes?' : 'pode ser a mesma foto cadastrada em dois brincos'}</span>
      </div>
      <div className="par-lados">
        {lado(par.a, par.b)}
        {lado(par.b, par.a)}
      </div>
      <div className="par-rodape">
        <button className="button button-ghost" onClick={() => void executar((f) => marcarDiferentes(f, par.a.id, par.b.id))}><Split size={16} /> São animais diferentes</button>
      </div>
    </article>
  )
}

function JuntarModal({ fica, sai, onClose }: { fica: Animal; sai: Animal; onClose: () => void }) {
  const { dados, executar } = useFazenda()
  const base = baseDoBrinco(fica.brinco)
  const baseLivre = !dados.animais.some((item) => ativo(item) && item.id !== fica.id && item.id !== sai.id && mesmoBrinco(item.brinco, base))
  const [brinco, setBrinco] = useState(base !== fica.brinco && baseLivre ? base : fica.brinco)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const result = await executar((f) => juntarAnimais(f, fica.id, sai.id, brinco))
    setSaving(false)
    if (result) onClose()
  }

  return (
    <Modal title="Juntar os dois registros" eyebrow="Mesmo animal" onClose={onClose} onSubmit={submit}
      footer={<><button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving || !brinco.trim()}>{saving ? 'Juntando…' : 'Juntar'}</button></>}>
      <div className="juntar-resumo">
        <div><Foto src={fica.foto_url} alt={fica.brinco} size="md" /><strong>{fica.brinco}</strong><span className="pill tone-emerald">fica</span></div>
        <GitMerge size={22} />
        <div><Foto src={sai.foto_url} alt={sai.brinco} size="md" /><strong>{sai.brinco}</strong><span className="pill tone-red">sai</span></div>
      </div>
      <p className="muted">O histórico do {sai.brinco} (manejos, protocolos, partos) passa para o {fica.brinco}. Campos vazios do {fica.brinco} são completados com os do {sai.brinco}, e o registro {sai.brinco} é apagado.</p>
      <label className="field required"><span>Brinco que fica</span><input value={brinco} onChange={(e) => setBrinco(e.target.value)} /></label>
    </Modal>
  )
}

function ConferirCard({ animal, situacao, onZoom }: { animal: Animal; situacao?: { texto: string; tom: 'verde' | 'ambar' | 'vermelho' | 'cinza' | 'azul' }; onZoom: (z: { src: string; alt: string }) => void }) {
  const { executar } = useFazenda()
  const [brinco, setBrinco] = useState(animal.brinco)
  const mudou = brinco.trim() !== animal.brinco

  async function confirmar() {
    if (mudou) {
      const ok = await executar((f) => salvarDados(f, animal.id, { brinco }), { silencioso: true })
      if (!ok) return
    }
    await executar((f) => marcarConferido(f, animal.id, mudou ? `brinco corrigido de ${animal.brinco} para ${brinco.trim()}` : undefined))
  }

  return (
    <article className="conferir-card panel">
      <Foto src={animal.foto_url} alt={`Brinco ${animal.brinco}`} size="lg" onClick={animal.foto_url ? () => onZoom({ src: animal.foto_url!, alt: `Brinco ${animal.brinco}` }) : undefined} />
      <p className="conferir-nota">{animal.conferencia?.replace(/^conferir no curral:\s*/i, '')}</p>
      <div className="conferir-acoes">
        <label className="field"><span>Brinco no curral</span><input value={brinco} onChange={(e) => setBrinco(e.target.value)} /></label>
        <button className="button button-primary" onClick={() => void confirmar()}><CheckCircle2 size={16} /> {mudou ? 'Corrigir e conferir' : 'Está certo'}</button>
      </div>
      <div className="conferir-rodape">
        {situacao && <SituacaoPill situacao={situacao} curta />}
        <Link className="text-button" to={`/animais/${animal.id}`}>Abrir ficha</Link>
      </div>
    </article>
  )
}
