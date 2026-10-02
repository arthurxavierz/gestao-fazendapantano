import {
  ArrowLeft,
  Baby,
  Camera,
  Edit3,
  FileDown,
  GitBranch,
  HeartPulse,
  LayoutList,
  Maximize2,
  Plus,
  Printer,
  Scale,
  ShoppingCart,
  Stethoscope,
  Syringe,
  Trash2,
  Dna
} from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { LineChart } from '../components/charts'
import { EmptyState } from '../components/EmptyState'
import { HealthModal, WeighingModal } from '../components/ManejoModals'
import { PhotoViewer } from '../components/PhotoViewer'
import { AttemptModal, CalvingModal, CompleteStepModal, DiagnosisModal, StartBreedingModal, eligibleForBreeding } from '../components/ReproModals'
import { ReproBadge, StatusBadge } from '../components/StatusBadge'
import { AttemptDots, Modal, Pill, Tabs } from '../components/ui'
import { byNumber, dailyGain, formatGain, originType, recentDailyGain, weighingsOf } from '../domain/herd'
import { inWithdrawal } from '../domain/health'
import { pendingAttempt, reproStateLabel } from '../domain/reproduction'
import { useHerd } from '../hooks/useHerd'
import type { BreedingAttempt, OccurrenceType } from '../types'
import { exportAnimalPdf, exportAnimalWord, printAnimal } from '../utils/exporters'
import {
  categoryLabel,
  formatAge,
  formatArroba,
  formatCoat,
  formatDate,
  formatDateTime,
  formatShortDate,
  formatWeight,
  healthKindLabel,
  methodLabel,
  occurrenceLabel,
  originLabel,
  relativeDay,
  resultLabel,
  sexLabel,
  todayISO
} from '../utils/format'

type Tab = 'resumo' | 'reproducao' | 'sanitario' | 'pesagens' | 'familia' | 'ocorrencias'

type Dialog =
  | { kind: 'occurrence' }
  | { kind: 'weigh' }
  | { kind: 'health' }
  | { kind: 'start' }
  | { kind: 'attempt'; attempt: BreedingAttempt }
  | { kind: 'step'; attemptId: string; stepIndex: number }
  | { kind: 'diagnosis'; attemptId: string }
  | { kind: 'calving'; attemptId: string }
  | null

export function AnimalDetail() {
  const { id } = useParams()
  const { animals, occurrences, batches, healthEvents, weighings, settings, addOccurrence, deleteAnimal } = useAppData()
  const herd = useHerd()
  const navigate = useNavigate()
  const info = id ? herd.get(id) : undefined
  const animal = info?.animal
  const [tab, setTab] = useState<Tab>('resumo')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [type, setType] = useState<OccurrenceType>('observacao')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState<'pdf' | 'word' | 'print' | null>(null)
  const [viewingPhoto, setViewingPhoto] = useState(false)

  const animalOccurrences = useMemo(() => occurrences.filter((item) => item.animal_id === id), [occurrences, id])
  const animalHealth = useMemo(() => healthEvents.filter((item) => item.animal_id === id).sort((a, b) => b.applied_at.localeCompare(a.applied_at)), [healthEvents, id])
  const animalWeighings = useMemo(() => (id ? weighingsOf(id, weighings).map((w) => ({ ...w, weight: Number(w.weight) })) : []), [weighings, id])
  const children = useMemo(() => animals.filter((item) => item.mother_id === id).sort(byNumber), [animals, id])

  if (!animal || !info) return <EmptyState icon={Stethoscope} title="Animal não encontrado" text="O cadastro pode ter sido removido ou ainda não foi carregado." />

  const mother = animal.mother_id ? animals.find((item) => item.id === animal.mother_id) : undefined
  const siblings = mother ? animals.filter((item) => item.mother_id === mother.id && item.id !== animal.id) : []
  const batch = animal.purchase_batch_id ? batches.find((item) => item.id === animal.purchase_batch_id) : undefined
  const origin = originType(animal)
  const isFemale = animal.sex === 'femea'
  const showRepro = isFemale && (info.breeding || info.attempts.length > 0 || info.state === 'descarte')
  const pending = pendingAttempt(info.attempts)
  const lastAttempt = info.attempts[info.attempts.length - 1]
  const gain = recentDailyGain(animalWeighings)
  const totalGain = dailyGain(animalWeighings)
  const withdrawal = inWithdrawal(animal.id, healthEvents, todayISO())

  const submitOccurrence = async (event: FormEvent) => {
    event.preventDefault()
    if (!note.trim()) return
    setSaving(true)
    try {
      await addOccurrence({ animal_id: animal.id, animal_number: animal.number, type, note: note.trim() })
      setNote('')
      setDialog(null)
    } finally {
      setSaving(false)
    }
  }

  // A foto é baixada e convertida antes de montar o documento, por isso a espera.
  const generate = async (kind: 'pdf' | 'word' | 'print') => {
    if (generating) return
    setGenerating(kind)
    try {
      if (kind === 'pdf') await exportAnimalPdf(animal)
      else if (kind === 'word') await exportAnimalWord(animal)
      else await printAnimal(animal)
    } finally {
      setGenerating(null)
    }
  }

  const confirmDelete = async () => {
    const confirmed = window.confirm(`Deseja realmente excluir o animal ${animal.number}? O histórico de reprodução, vacinas e pesagens dele também será removido.`)
    if (!confirmed) return
    await deleteAnimal(animal.id)
    navigate('/animais')
  }

  const tabs = [
    { value: 'resumo' as Tab, label: 'Resumo', icon: LayoutList },
    ...(showRepro ? [{ value: 'reproducao' as Tab, label: 'Reprodução', icon: Dna, count: info.attempts.length }] : []),
    { value: 'sanitario' as Tab, label: 'Sanitário', icon: Syringe, count: animalHealth.length },
    { value: 'pesagens' as Tab, label: 'Pesagens', icon: Scale, count: animalWeighings.length },
    { value: 'familia' as Tab, label: 'Família', icon: GitBranch },
    { value: 'ocorrencias' as Tab, label: 'Ocorrências', icon: HeartPulse, count: animalOccurrences.length }
  ]

  return (
    <>
      <button className="back-button" onClick={() => navigate('/animais')}><ArrowLeft size={18} /> Voltar para animais</button>

      <section className="profile-card">
        {animal.photo_url ? (
          <button type="button" className="animal-profile-photo is-clickable" onClick={() => setViewingPhoto(true)} title="Clique para ver em tela cheia">
            <img src={animal.photo_url} alt={`Animal ${animal.number}`} />
            <span className="photo-preview-hint"><Maximize2 size={16} /></span>
          </button>
        ) : (
          <div className="animal-profile-photo"><Camera size={40} /></div>
        )}
        <div className="profile-main">
          <div className="profile-tags">
            {info.category && <Pill tone="blue">{categoryLabel[info.category]}</Pill>}
            <StatusBadge status={animal.status} />
            {showRepro && info.state !== 'descarte' && <ReproBadge state={info.state} />}
            {withdrawal && <Pill tone="slate">Em carência</Pill>}
          </div>
          <h1><span>Brinco</span> {animal.number}</h1>
          <p>{[sexLabel[animal.sex], animal.breed, formatCoat(animal.coat), animal.lot].filter(Boolean).join(' · ') || 'Dados básicos não informados'}</p>
        </div>
        <div className="profile-actions">
          <button className="button button-primary" onClick={() => setDialog({ kind: 'occurrence' })}><Stethoscope size={18} /> Registrar situação</button>
          <button className="button button-secondary" onClick={() => navigate(`/animais/${animal.id}/editar`)}><Edit3 size={18} /> Editar</button>
        </div>
        <div className="profile-stats">
          <div><span>Peso atual</span><strong>{formatWeight(animal.weight)}</strong><small>{animal.weight ? formatArroba(Number(animal.weight)) : ''}</small></div>
          <div><span>GMD recente</span><strong>{formatGain(gain)}</strong><small>{animalWeighings.length} pesagens</small></div>
          <div><span>Idade</span><strong>{formatAge(animal.birth_date)}</strong><small>{animal.birth_date ? formatDate(animal.birth_date) : ''}</small></div>
          <div>
            <span>Origem</span>
            <strong>{originLabel[origin]}</strong>
            <small>
              {origin === 'nascido' && mother ? <Link to={`/animais/${mother.id}`}>Mãe {mother.number}</Link> : null}
              {origin === 'comprado' && batch ? <Link to={`/compras/${batch.id}`}>{batch.code}</Link> : null}
              {animal.entry_date ? ` · entrada ${formatShortDate(animal.entry_date)}` : ''}
            </small>
          </div>
        </div>
        <div className="profile-quick">
          <button onClick={() => setDialog({ kind: 'weigh' })}><Scale size={17} /> Pesar</button>
          <button onClick={() => setDialog({ kind: 'health' })}><Syringe size={17} /> Vacinar / medicar</button>
          {showRepro && eligibleForBreeding(info) && <button onClick={() => setDialog({ kind: 'start' })}><Dna size={17} /> Iniciar protocolo</button>}
          {info.state === 'prenhe' && lastAttempt && <button onClick={() => setDialog({ kind: 'calving', attemptId: lastAttempt.id })}><Baby size={17} /> Registrar parto</button>}
          {isFemale && <button onClick={() => navigate(`/animais/novo?mae=${animal.id}`)}><Plus size={17} /> Cadastrar cria</button>}
        </div>
      </section>

      <Tabs value={tab} onChange={setTab} items={tabs} />

      {tab === 'resumo' && (
        <div className="detail-grid">
          <section className="panel">
            <div className="panel-head"><div><span className="eyebrow">Informações</span><h2>Dados do animal</h2></div></div>
            <dl className="detail-list">
              <div><dt>Brinco</dt><dd>{animal.number}</dd></div>
              <div><dt>Sexo</dt><dd>{sexLabel[animal.sex]}</dd></div>
              <div><dt>Categoria</dt><dd>{info.category ? categoryLabel[info.category] : 'Não informado'}{!animal.category && info.category ? <small className="dd-hint">pela idade</small> : null}</dd></div>
              <div><dt>Raça</dt><dd>{animal.breed || 'Não informado'}</dd></div>
              <div><dt>Pelagem</dt><dd>{formatCoat(animal.coat) || 'Não informado'}</dd></div>
              <div><dt>Nascimento</dt><dd>{formatDate(animal.birth_date)}{animal.birth_date_approximate ? ' (aproximada)' : ''}</dd></div>
              <div><dt>Peso atual</dt><dd>{formatWeight(animal.weight)}</dd></div>
              <div><dt>Local ou lote</dt><dd>{animal.lot || 'Não informado'}</dd></div>
              <div><dt>Origem</dt><dd>{originLabel[origin]}</dd></div>
              <div><dt>Entrada no rebanho</dt><dd>{formatDate(animal.entry_date)}</dd></div>
              {animal.sire && <div><dt>Pai (touro / sêmen)</dt><dd>{animal.sire}</dd></div>}
              {animal.exit_date && <div><dt>Saída</dt><dd>{formatDate(animal.exit_date)}{animal.exit_reason ? ` · ${animal.exit_reason}` : ''}</dd></div>}
              <div className="detail-notes"><dt>Observações</dt><dd>{animal.notes || 'Sem observações cadastradas.'}</dd></div>
            </dl>
          </section>

          <section className="panel document-card">
            <div><span className="eyebrow">Papel e arquivo</span><h2>Ficha deste animal</h2><p>Gere um documento pronto para guardar, enviar ou imprimir.</p></div>
            <div className="document-actions">
              <button disabled={Boolean(generating)} onClick={() => void generate('pdf')}><FileDown size={19} /><span><strong>{generating === 'pdf' ? 'Gerando PDF' : 'Baixar em PDF'}</strong><small>Formato fixo para impressão, com a foto</small></span></button>
              <button disabled={Boolean(generating)} onClick={() => void generate('word')}><FileDown size={19} /><span><strong>{generating === 'word' ? 'Gerando Word' : 'Baixar em Word'}</strong><small>Documento que pode ser editado</small></span></button>
              <button disabled={Boolean(generating)} onClick={() => void generate('print')}><Printer size={19} /><span><strong>{generating === 'print' ? 'Preparando' : 'Imprimir agora'}</strong><small>Abre a tela de impressão</small></span></button>
            </div>
          </section>
        </div>
      )}

      {tab === 'reproducao' && showRepro && (
        <section className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Histórico reprodutivo</span><h2>{reproStateLabel[info.state]}</h2></div>
            <div className="repro-head-right">
              <span className="muted">Tentativas sem prenhez</span>
              <AttemptDots used={info.streak} max={settings.max_breeding_attempts} />
              <strong>{info.streak} de {settings.max_breeding_attempts}</strong>
            </div>
          </div>
          {pending && (
            <div className="attempt-cta">
              <span>{pending.protocol_name ?? methodLabel[pending.method]} em andamento desde {formatDate(pending.start_date)}</span>
              <button className="button button-primary" onClick={() => setDialog({ kind: 'attempt', attempt: pending })}>Ver etapas</button>
            </div>
          )}
          {info.attempts.length ? (
            <div className="repro-history">
              {[...info.attempts].reverse().map((attempt, index) => (
                <button key={attempt.id} className={`repro-row result-${attempt.result}`} onClick={() => setDialog({ kind: 'attempt', attempt })}>
                  <span className="repro-index">{info.attempts.length - index}ª</span>
                  <div>
                    <strong>{attempt.protocol_name ?? methodLabel[attempt.method]}</strong>
                    <small>
                      Início {formatShortDate(attempt.start_date)}
                      {attempt.insemination_date ? ` · IA ${formatShortDate(attempt.insemination_date)}` : ''}
                      {attempt.sire ? ` · ${attempt.sire}` : ''}
                    </small>
                    {attempt.result === 'prenhe' && attempt.expected_calving_date && <small>Parto previsto {formatDate(attempt.expected_calving_date)} ({relativeDay(attempt.expected_calving_date)})</small>}
                    {attempt.result === 'parida' && attempt.calf_id && <small>Cria: <Link to={`/animais/${attempt.calf_id}`} onClick={(e) => e.stopPropagation()}>{animals.find((a) => a.id === attempt.calf_id)?.number ?? 'ver'}</Link></small>}
                  </div>
                  <span className={`status result-${attempt.result}`}>{resultLabel[attempt.result]}</span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={Dna} title="Sem histórico reprodutivo" text="Inicie um protocolo para acompanhar esta matriz." action={eligibleForBreeding(info) ? <button className="button button-primary" onClick={() => setDialog({ kind: 'start' })}><Dna size={17} /> Iniciar protocolo</button> : undefined} />
          )}
        </section>
      )}

      {tab === 'sanitario' && (
        <section className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Vacinas e medicamentos</span><h2>Histórico sanitário</h2></div>
            <button className="button button-primary button-sm" onClick={() => setDialog({ kind: 'health' })}><Plus size={15} /> Aplicar</button>
          </div>
          {animalHealth.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Dose</th><th>Próxima</th><th>Carência</th></tr></thead>
                <tbody>
                  {animalHealth.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.applied_at)}</td>
                      <td><strong>{item.product}</strong></td>
                      <td>{healthKindLabel[item.kind]}</td>
                      <td>{item.dose || '—'}</td>
                      <td>{item.next_due_date ? <span className={item.next_due_date < todayISO() ? 'text-late' : ''}>{formatDate(item.next_due_date)}</span> : '—'}</td>
                      <td>{item.withdrawal_until ? formatDate(item.withdrawal_until) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon={Syringe} title="Nenhuma aplicação" text="As vacinas e medicamentos deste animal aparecerão aqui." />}
        </section>
      )}

      {tab === 'pesagens' && (
        <section className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Desempenho</span><h2>Evolução de peso</h2></div>
            <button className="button button-primary button-sm" onClick={() => setDialog({ kind: 'weigh' })}><Plus size={15} /> Nova pesagem</button>
          </div>
          {animalWeighings.length ? (
            <>
              <LineChart data={animalWeighings.map((w) => ({ x: formatShortDate(w.weighed_at), y: w.weight }))} unit=" kg" />
              <div className="mini-stats">
                <div><span>GMD recente</span><strong>{formatGain(gain)}</strong></div>
                <div><span>GMD no período</span><strong>{formatGain(totalGain)}</strong></div>
                <div><span>Ganho total</span><strong>{animalWeighings.length > 1 ? `${Math.round(animalWeighings[animalWeighings.length - 1].weight - animalWeighings[0].weight)} kg` : '—'}</strong></div>
              </div>
              <div className="table-wrap compact">
                <table className="data-table">
                  <thead><tr><th>Data</th><th>Peso</th><th>@ estimada</th><th>Ganho desde a anterior</th></tr></thead>
                  <tbody>
                    {[...animalWeighings].reverse().map((item, index, list) => {
                      const prev = list[index + 1]
                      const g = prev ? dailyGain([prev, item]) : null
                      return (
                        <tr key={item.id}><td>{formatDate(item.weighed_at)}</td><td><strong>{item.weight} kg</strong></td><td>{formatArroba(item.weight)}</td><td>{prev ? `${Math.round(item.weight - prev.weight)} kg · ${formatGain(g)}` : '—'}</td></tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : <EmptyState icon={Scale} title="Nenhuma pesagem" text="Registre a primeira pesagem para acompanhar o ganho de peso." />}
        </section>
      )}

      {tab === 'familia' && (
        <div className="family-grid">
          <section className="panel">
            <div className="panel-head"><div><span className="eyebrow">Ascendência</span><h2>Pais</h2></div></div>
            <div className="family-tree">
              <div className={`family-node ${mother ? '' : 'is-empty'}`}>
                <span>Mãe</span>
                {mother ? <Link to={`/animais/${mother.id}`}><strong>{mother.number}</strong><small>{mother.breed}</small></Link> : <strong>{origin === 'comprado' ? 'Comprado' : 'Não informada'}</strong>}
              </div>
              <div className={`family-node ${animal.sire ? '' : 'is-empty'}`}>
                <span>Pai</span>
                <strong>{animal.sire || 'Não informado'}</strong>
              </div>
              <div className="family-node is-self"><span>Animal</span><strong>{animal.number}</strong></div>
            </div>
            {batch && (
              <Link to={`/compras/${batch.id}`} className="batch-link"><ShoppingCart size={17} /> Veio na compra <strong>{batch.code}</strong> · {batch.supplier || 'sem fornecedor'} · {formatDate(batch.purchase_date)}</Link>
            )}
            {siblings.length > 0 && (
              <>
                <span className="field-label">Irmãos por parte de mãe</span>
                <div className="chip-links">{siblings.map((item) => <Link key={item.id} to={`/animais/${item.id}`}>{item.number}</Link>)}</div>
              </>
            )}
          </section>
          <section className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Descendência</span><h2>Crias ({children.length})</h2></div>
              {isFemale && <button className="button button-secondary button-sm" onClick={() => navigate(`/animais/novo?mae=${animal.id}`)}><Plus size={15} /> Cadastrar cria</button>}
            </div>
            {children.length ? (
              <div className="children-list">
                {children.map((child) => (
                  <Link key={child.id} to={`/animais/${child.id}`} className="child-row">
                    <strong>{child.number}</strong>
                    <span>{sexLabel[child.sex]} · nascido em {formatDate(child.birth_date)}</span>
                    <span>{formatWeight(child.weight)}</span>
                  </Link>
                ))}
              </div>
            ) : <p className="muted">{isFemale ? 'Nenhuma cria registrada. Partos lançados na reprodução aparecem aqui automaticamente.' : 'Machos não têm crias vinculadas por aqui; o pai fica registrado como texto na cria.'}</p>}
          </section>
        </div>
      )}

      {tab === 'ocorrencias' && (
        <section className="panel occurrence-history">
          <div className="panel-head"><div><span className="eyebrow">Acompanhamento</span><h2>Registros deste animal</h2></div><button className="button button-secondary" onClick={() => setDialog({ kind: 'occurrence' })}>Novo registro</button></div>
          {animalOccurrences.length ? (
            <div className="history-list">
              {animalOccurrences.map((item) => (
                <article key={item.id}><div className={`history-dot occurrence-${item.type}`} /><div><strong>{occurrenceLabel[item.type]}</strong><p>{item.note}</p><small>{formatDateTime(item.created_at)}</small></div></article>
              ))}
            </div>
          ) : <p className="muted">Este animal ainda não possui ocorrências registradas.</p>}
        </section>
      )}

      <div className="danger-zone"><button className="text-button danger" onClick={confirmDelete}><Trash2 size={17} /> Excluir cadastro do animal</button></div>

      {viewingPhoto && animal.photo_url && (
        <PhotoViewer src={animal.photo_url} alt={`Foto do animal ${animal.number}`} caption={`Animal ${animal.number}`} onClose={() => setViewingPhoto(false)} />
      )}

      {dialog?.kind === 'occurrence' && (
        <Modal
          title="Registrar situação"
          eyebrow={`Animal ${animal.number}`}
          onClose={() => setDialog(null)}
          onSubmit={submitOccurrence}
          footer={<><button type="button" className="button button-ghost" onClick={() => setDialog(null)}>Cancelar</button><button className="button button-primary" disabled={saving || !note.trim()}>{saving ? 'Salvando' : 'Registrar'}</button></>}
        >
          <label className="field"><span>Tipo do registro</span><select value={type} onChange={(e) => setType(e.target.value as OccurrenceType)}><option value="observacao">Em observação</option><option value="doenca">Doente</option><option value="recuperado">Recuperado</option><option value="descarte">Descarte (separar para abate)</option><option value="morte">Morte</option><option value="outro">Outro registro</option></select></label>
          <label className="field"><span>O que aconteceu?</span><textarea rows={5} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Escreva uma observação curta e objetiva." autoFocus /></label>
        </Modal>
      )}
      {dialog?.kind === 'weigh' && <WeighingModal preselected={[animal.id]} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'health' && <HealthModal preselected={[animal.id]} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'start' && <StartBreedingModal preselected={[animal.id]} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'attempt' && (
        <AttemptModal
          attempt={dialog.attempt}
          onClose={() => setDialog(null)}
          onAction={(action, stepIndex) => {
            const attemptId = dialog.attempt.id
            if (action === 'step' && stepIndex != null) setDialog({ kind: 'step', attemptId, stepIndex })
            else if (action === 'diagnosis') setDialog({ kind: 'diagnosis', attemptId })
            else setDialog({ kind: 'calving', attemptId })
          }}
        />
      )}
      {dialog?.kind === 'step' && <CompleteStepModal attemptIds={[dialog.attemptId]} stepIndex={dialog.stepIndex} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'diagnosis' && <DiagnosisModal attemptIds={[dialog.attemptId]} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'calving' && <CalvingModal attemptId={dialog.attemptId} onClose={() => setDialog(null)} />}
    </>
  )
}
