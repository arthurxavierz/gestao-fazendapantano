import {
  AudioLines, Bot, CheckCheck, CircleAlert, CircleCheck, Clock3, Copy, ImagePlus, KeyRound, ListChecks, Mic, MessageCircle,
  Pencil, Phone, Plus, RadioTower, RotateCcw, Send, ShieldCheck, Signal, SignalLow, Square, Trash2, Undo2, UserRound, WifiOff, Wrench
} from 'lucide-react'
import { FormEvent, Fragment, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useAppData } from '../AppContext'
import { EmptyState } from '../components/EmptyState'
import { Alert, Field, Kpi, Modal, PageHeading, PanelHead, Pill, Tabs, type Tone } from '../components/ui'
import { listProfiles } from '../services/repository'
import { isSupabaseConfigured } from '../services/supabase'
import {
  actionKindLabel, actionStatusLabel, deleteWaContact, estimateCostBRL, fileToBase64, formatPhone, getWhatsappStatus, listWaActions,
  listWaContacts, listWaMessages, mediaUrl, saveWaContact, simulate, toWav16k, whatsappDatabase,
  type SimMessage, type SimState, type WaAction, type WaContact, type WaMessage, type WaPermission, type WaStatus
} from '../services/whatsapp'
import type { Profile } from '../types'
import { formatDateTime } from '../utils/format'

type Tab = 'simulador' | 'registro' | 'contatos' | 'configuracao'

const SIM_KEY = 'pantano.whatsapp.simulador'

function loadSim(): { state: SimState | null; chat: ChatItem[] } {
  try {
    const raw = sessionStorage.getItem(SIM_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* sem armazenamento: começa vazio */ }
  return { state: null, chat: [] }
}

function saveSim(value: { state: SimState | null; chat: ChatItem[] }) {
  try {
    // Áudio e foto não vão para o armazenamento: só o texto da conversa.
    sessionStorage.setItem(SIM_KEY, JSON.stringify({ ...value, chat: value.chat.map(({ mediaUrl: _m, ...rest }) => rest) }))
  } catch { /* conversa longa demais para guardar: segue só em memória */ }
}

export function WhatsApp() {
  const [tab, setTab] = useState<Tab>('simulador')
  const [status, setStatus] = useState<WaStatus | null | undefined>(undefined)
  const [sim, setSim] = useState(loadSim)

  useEffect(() => {
    let alive = true
    getWhatsappStatus().then((s) => alive && setStatus(s)).catch(() => alive && setStatus(null))
    return () => { alive = false }
  }, [])

  useEffect(() => saveSim(sim), [sim])

  const ready = status?.claude
  return (
    <div className="wa-page">
      <PageHeading
        eyebrow="Assistente de campo"
        title="WhatsApp com IA"
        text="O peão manda áudio, texto ou foto do curral. A IA entende, confere com o rebanho e pede confirmação antes de gravar. Cada registro guarda o áudio, a transcrição, quem mandou e quem confirmou."
        actions={<StatusChips status={status} />}
      />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { value: 'simulador', label: 'Simulador', icon: MessageCircle },
          { value: 'registro', label: 'Registro', icon: ListChecks },
          { value: 'contatos', label: 'Números autorizados', icon: Phone },
          { value: 'configuracao', label: 'Configuração', icon: Wrench }
        ]}
      />
      {tab === 'simulador' && <Simulator status={status} ready={Boolean(ready)} sim={sim} setSim={setSim} onSetup={() => setTab('configuracao')} />}
      {tab === 'registro' && <AuditLog simState={sim.state} />}
      {tab === 'contatos' && <Contacts />}
      {tab === 'configuracao' && <Setup status={status} />}
    </div>
  )
}

function StatusChips({ status }: { status: WaStatus | null | undefined }) {
  if (status === undefined) return <Pill tone="slate">Verificando…</Pill>
  if (status === null) return <Pill tone="amber" icon={CircleAlert}>Servidor indisponível neste ambiente</Pill>
  return (
    <div className="wa-chips">
      <Pill tone={status.whatsapp ? 'emerald' : 'slate'} icon={RadioTower}>{status.whatsapp ? 'WhatsApp ligado' : 'WhatsApp pendente'}</Pill>
      <Pill tone={status.claude ? 'emerald' : 'amber'} icon={Bot}>{status.claude ? status.modelo.replace('claude-', 'Claude ').replace(/-(\d)-(\d)$/, ' $1.$2') : 'IA pendente'}</Pill>
      <Pill tone={status.transcricao ? 'emerald' : 'amber'} icon={AudioLines}>{status.transcricao ? 'Áudio ligado' : 'Áudio pendente'}</Pill>
    </div>
  )
}

/** Negrito e itálico do WhatsApp (*assim* e _assim_) com quebras de linha. */
export function WaText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {line.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part, j) => {
            if (/^\*[^*]+\*$/.test(part)) return <strong key={j}>{part.slice(1, -1)}</strong>
            if (/^_[^_]+_$/.test(part)) return <em key={j}>{part.slice(1, -1)}</em>
            return <Fragment key={j}>{part}</Fragment>
          })}
          {i < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </>
  )
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

// ------------------------------------------------------------------
// Simulador
// ------------------------------------------------------------------

interface ChatItem {
  id: string
  side: 'in' | 'out'
  kind: 'text' | 'audio' | 'image' | 'buttons' | 'notice'
  text: string
  at: string
  sentAt?: string
  buttons?: { id: string; title: string }[]
  mediaUrl?: string
  seconds?: number
  transcription?: string
  used?: boolean
  inboundId?: string
}

const SIGNAL = [
  { value: 0, label: 'Sinal bom', icon: Signal },
  { value: 40, label: '40 min sem sinal', icon: SignalLow },
  { value: 180, label: '3 h sem sinal', icon: SignalLow },
  { value: 1560, label: 'Ontem (26 h)', icon: WifiOff }
]

const EXAMPLES = [
  'Coloquei a 401, 402 e 403 no protocolo IATF de 3 manejos hoje',
  'Quantas vacas estão prenhes?',
  'Vou vacinar o lote Matrizes contra aftosa',
  '401 402 403',
  'fechar',
  'A 405 pariu um macho de 32 quilos',
  'O que eu lancei hoje?',
  'O que tem de manejo essa semana?'
]

function Simulator({ status, ready, sim, setSim, onSetup }: {
  status: WaStatus | null | undefined
  ready: boolean
  sim: { state: SimState | null; chat: ChatItem[] }
  setSim: (fn: (prev: { state: SimState | null; chat: ChatItem[] }) => { state: SimState | null; chat: ChatItem[] }) => void
  onSetup: () => void
}) {
  const { animals, attempts, healthEvents, weighings, occurrences, protocols, settings } = useAppData()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [delay, setDelay] = useState(0)
  const [mode, setMode] = useState<'ensaio' | 'real'>('ensaio')
  const [name, setName] = useState('Zé do curral')
  const [permission, setPermission] = useState<WaPermission>('lancamento')
  const [contacts, setContacts] = useState<WaContact[]>([])
  const [contactId, setContactId] = useState('')
  const [recording, setRecording] = useState(false)
  const [inspect, setInspect] = useState<WaMessage | null>(null)
  const [elapsed, setElapsed] = useState<number | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const startedAt = useRef(0)
  const scroller = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (whatsappDatabase) listWaContacts().then(setContacts).catch(() => setContacts([]))
  }, [])
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [sim.chat.length, busy])

  const lastInbound = inspect ?? [...(sim.state?.messages ?? [])].reverse().find((m) => m.direction === 'in') ?? null
  const actions = sim.state?.actions ?? []
  const openSession = sim.state?.sessions?.find((s) => s.status === 'aberta')

  async function send(message: SimMessage, bubble: Omit<ChatItem, 'id' | 'side' | 'at'>) {
    if (busy) return
    setError(null)
    const sentAt = new Date(Date.now() - delay * 60000).toISOString()
    const localId = crypto.randomUUID()
    setSim((prev) => ({ ...prev, chat: [...prev.chat, { ...bubble, id: localId, side: 'in', at: new Date().toISOString(), sentAt }] }))
    setBusy(true)
    const started = performance.now()
    try {
      const result = await simulate({
        message: { ...message, sentAt },
        state: mode === 'ensaio' ? sim.state : null,
        mode,
        name,
        permission,
        contactId: contactId || undefined,
        herd: isSupabaseConfigured ? undefined : { animals, attempts, health: healthEvents, weighings, occurrences, protocols, settings }
      })
      if (result.status === 'unavailable') {
        setError(result.reason)
        setSim((prev) => ({ ...prev, chat: prev.chat.filter((c) => c.id !== localId) }))
        return
      }
      const r = result.data
      setElapsed(Math.round(performance.now() - started))
      setInspect(null)
      setSim((prev) => ({
        state: r.state ?? prev.state,
        chat: [
          ...prev.chat.map((c) => (c.id === localId ? { ...c, transcription: r.inbound?.transcription ?? undefined, inboundId: r.inbound?.id } : c)),
          ...r.replies.map((reply): ChatItem => ({
            id: reply.wamid, side: 'out', kind: reply.type === 'buttons' ? 'buttons' : 'text', text: reply.text, buttons: reply.buttons, at: reply.at
          }))
        ]
      }))
      if (r.mode === 'real' && r.inbound) setInspect(r.inbound)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao simular.')
      setSim((prev) => ({ ...prev, chat: prev.chat.filter((c) => c.id !== localId) }))
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const value = text.trim()
    if (!value) return
    setText('')
    void send({ kind: 'text', text: value }, { kind: 'text', text: value })
  }

  function tapButton(item: ChatItem, button: { id: string; title: string }) {
    setSim((prev) => ({ ...prev, chat: prev.chat.map((c) => (c.id === item.id ? { ...c, used: true } : c)) }))
    void send({ kind: 'button', buttonId: button.id, text: button.title }, { kind: 'text', text: button.title })
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop()
      return
    }
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunks.current = []
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setRecording(false)
        const blob = new Blob(chunks.current, { type: rec.mimeType })
        if (Date.now() - startedAt.current < 700) return
        try {
          const { base64, seconds } = await toWav16k(blob)
          void send({ kind: 'audio', base64, mime: 'audio/wav' }, { kind: 'audio', text: '', mediaUrl: URL.createObjectURL(blob), seconds })
        } catch {
          setError('Não consegui converter o áudio gravado.')
        }
      }
      recorder.current = rec
      startedAt.current = Date.now()
      rec.start()
      setRecording(true)
    } catch {
      setError('O navegador não liberou o microfone.')
    }
  }

  async function pickImage(file: File | undefined) {
    if (!file) return
    const base64 = await fileToBase64(file)
    const caption = text.trim()
    setText('')
    void send({ kind: 'image', base64, mime: file.type || 'image/jpeg', text: caption }, { kind: 'image', text: caption, mediaUrl: URL.createObjectURL(file) })
  }

  function reset() {
    setSim(() => ({ state: null, chat: [] }))
    setInspect(null)
    setError(null)
  }

  const canReal = whatsappDatabase && contacts.length > 0
  return (
    <div className="wa-sim">
      <div className="wa-phone-wrap">
        <div className="wa-controls panel">
          <div className="wa-control-row">
            <div className="segmented-inline" role="group" aria-label="Modo">
              <button type="button" className={mode === 'ensaio' ? 'selected' : ''} onClick={() => setMode('ensaio')} title="Roda tudo, mas não grava nada no banco">Ensaio</button>
              <button type="button" className={mode === 'real' ? 'selected' : ''} disabled={!canReal} title={canReal ? '' : 'Precisa do banco ligado e de um número cadastrado'} onClick={() => setMode('real')}>Real (grava)</button>
            </div>
            <button type="button" className="button button-ghost button-sm" onClick={reset}><RotateCcw size={14} /> Nova conversa</button>
          </div>
          <div className="wa-control-row">
            {mode === 'real' ? (
              <select className="select-compact" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">Escolha o número…</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} · {formatPhone(c.phone)}</option>)}
              </select>
            ) : (
              <>
                <input className="wa-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome de quem fala" />
                <select className="select-compact" value={permission} onChange={(e) => setPermission(e.target.value as WaPermission)}>
                  <option value="lancamento">Pode lançar</option>
                  <option value="consulta">Só consulta</option>
                </select>
              </>
            )}
          </div>
          <div className="wa-signal" role="group" aria-label="Simular sinal">
            {SIGNAL.map(({ value, label, icon: Icon }) => (
              <button key={value} type="button" className={`chip ${delay === value ? 'selected' : ''}`} onClick={() => setDelay(value)}><Icon size={13} /> {label}</button>
            ))}
          </div>
        </div>

        <div className="wa-phone">
          <header className="wa-phone-head">
            <span className="wa-avatar"><Bot size={18} /></span>
            <div>
              <strong>Assistente da fazenda</strong>
              <small>{busy ? 'digitando…' : openSession ? `lote aberto · ${openSession.entries.length} animais` : 'online'}</small>
            </div>
          </header>
          <div className="wa-chat" ref={scroller}>
            {!sim.chat.length && (
              <div className="wa-empty">
                <p>Fale como o peão falaria. Grave um áudio, mande texto ou foto de um brinco.</p>
                <div className="wa-examples">
                  {EXAMPLES.map((example) => (
                    <button key={example} type="button" className="chip" disabled={!ready || busy} onClick={() => void send({ kind: 'text', text: example }, { kind: 'text', text: example })}>{example}</button>
                  ))}
                </div>
              </div>
            )}
            {sim.chat.map((item) => (
              <div key={item.id} className={`wa-bubble ${item.side} ${item.kind}`}>
                {item.kind === 'audio' && (
                  <div className="wa-audio">
                    <Mic size={15} />
                    {item.mediaUrl ? <audio controls src={item.mediaUrl} /> : <span>Áudio de {Math.round(item.seconds ?? 0)} s</span>}
                  </div>
                )}
                {item.kind === 'image' && item.mediaUrl && <img src={item.mediaUrl} alt="Foto enviada" />}
                {item.text && <div className="wa-text"><WaText text={item.text} /></div>}
                {item.transcription && <div className="wa-transcript"><AudioLines size={12} /> “{item.transcription}”</div>}
                <span className="wa-time">
                  {item.sentAt && Math.abs(new Date(item.at).getTime() - new Date(item.sentAt).getTime()) > 60000 && <em title="Gravada sem sinal">gravada {hhmm(item.sentAt)} · </em>}
                  {hhmm(item.at)} {item.side === 'in' && <CheckCheck size={13} />}
                </span>
                {item.buttons && (
                  <div className="wa-buttons">
                    {item.buttons.map((b) => <button key={b.id} type="button" disabled={busy || item.used} onClick={() => tapButton(item, b)}>{b.title}</button>)}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="wa-bubble out typing"><i /><i /><i /></div>}
          </div>
          <form className="wa-input" onSubmit={submit}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={recording ? 'Gravando… toque no quadrado para enviar' : 'Mensagem'} disabled={!ready || recording} />
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = '' }} />
            <button type="button" className="wa-round ghost" disabled={!ready || busy || recording} onClick={() => fileInput.current?.click()} aria-label="Enviar foto"><ImagePlus size={18} /></button>
            {text.trim() ? (
              <button type="submit" className="wa-round" disabled={!ready || busy} aria-label="Enviar"><Send size={18} /></button>
            ) : (
              <button type="button" className={`wa-round ${recording ? 'rec' : ''}`} disabled={!ready || busy} onClick={() => void toggleRecording()} aria-label={recording ? 'Parar e enviar' : 'Gravar áudio'}>
                {recording ? <Square size={16} /> : <Mic size={18} />}
              </button>
            )}
          </form>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {status && !status.claude && (
          <Alert tone="info">
            A IA ainda não foi ligada neste site. Falta cadastrar a <code>ANTHROPIC_API_KEY</code> no Netlify.{' '}
            <button type="button" className="text-button" onClick={onSetup}>Ver o passo a passo</button>
          </Alert>
        )}
        {status === null && <Alert tone="warning">As funções do servidor não respondem neste ambiente (rodando localmente). Publique no Netlify ou use <code>netlify dev</code> para simular.</Alert>}
      </div>

      <aside className="wa-inspector">
        <Inspector message={lastInbound} elapsed={elapsed} />
        {mode === 'ensaio' && actions.length > 0 && (
          <section className="panel">
            <PanelHead eyebrow="Nesta conversa" title="Lançamentos" />
            <div className="wa-action-list">
              {[...actions].reverse().map((a) => <ActionRow key={a.id} action={a} compact />)}
            </div>
            <p className="panel-note">No ensaio nada vai para o banco. No modo real, o "Confirmar" grava de verdade.</p>
          </section>
        )}
      </aside>
    </div>
  )
}

const ROUTE_LABEL: Record<string, { label: string; tone: Tone }> = {
  assistente: { label: 'Interpretado pela IA', tone: 'violet' },
  confirmacao: { label: 'Confirmação direta (sem IA)', tone: 'emerald' },
  lote: { label: 'Modo lote (sem IA)', tone: 'teal' },
  lote_fechar: { label: 'Fechamento do lote', tone: 'teal' }
}

function Inspector({ message, elapsed }: { message: WaMessage | null; elapsed: number | null }) {
  if (!message) {
    return (
      <section className="panel wa-xray">
        <PanelHead eyebrow="Raio-x" title="Como a IA pensou" />
        <p className="muted">Mande uma mensagem para ver aqui a transcrição, as consultas que a IA fez ao rebanho, o que ela propôs e quanto custou.</p>
      </section>
    )
  }
  const it = message.interpretation ?? {}
  const route = it.route ? ROUTE_LABEL[it.route] : null
  const cost = estimateCostBRL(it.served_by ?? it.model, it.usage)
  const delayMin = message.sent_at ? Math.round((new Date(message.received_at).getTime() - new Date(message.sent_at).getTime()) / 60000) : 0
  return (
    <section className="panel wa-xray">
      <PanelHead eyebrow="Raio-x da última mensagem" title="Como a IA pensou" action={route && <Pill tone={route.tone}>{route.label}</Pill>} />
      <dl className="wa-facts">
        <div><dt>Gravada</dt><dd>{message.sent_at ? formatDateTime(message.sent_at) : '-'}</dd></div>
        <div><dt>Chegou</dt><dd>{formatDateTime(message.received_at)}{delayMin > 1 && <Pill tone="amber" icon={WifiOff}>{delayMin} min sem sinal</Pill>}</dd></div>
        {elapsed != null && <div><dt>Resposta em</dt><dd>{(elapsed / 1000).toFixed(1).replace('.', ',')} s</dd></div>}
        {it.model && <div><dt>Modelo</dt><dd>{it.served_by ?? it.model}</dd></div>}
        {it.usage && <div><dt>Tokens</dt><dd>{it.usage.input + it.usage.cache_read + it.usage.cache_write} entrada ({it.usage.cache_read} do cache) · {it.usage.output} saída</dd></div>}
        {cost != null && <div><dt>Custo estimado</dt><dd>R$ {cost.toFixed(3).replace('.', ',')}</dd></div>}
      </dl>
      {message.transcription && (
        <div className="wa-xray-block">
          <span className="eyebrow">Transcrição {it.transcription && `· confiança ${it.transcription.confidence}`}</span>
          <blockquote>“{message.transcription}”</blockquote>
          {it.transcription?.doubts?.length ? <small className="muted">Dúvidas: {it.transcription.doubts.join('; ')}</small> : null}
        </div>
      )}
      {it.tools?.length ? (
        <div className="wa-xray-block">
          <span className="eyebrow">Ferramentas chamadas ({it.tools.length})</span>
          <ol className="wa-tools">
            {it.tools.map((tool, i) => (
              <li key={i} className={tool.ok ? 'ok' : 'fail'}>
                <code>{tool.name}</code>
                <span>{compactJson(tool.input)}</span>
                {!tool.ok && <small>{problemsOf(tool.output)}</small>}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {message.error && <Alert tone="error">{message.error}</Alert>}
    </section>
  )
}

function compactJson(value: unknown) {
  const text = JSON.stringify(value)
  return text.length > 160 ? `${text.slice(0, 160)}…` : text
}

function problemsOf(output: unknown) {
  const o = output as { problemas?: string[]; erro?: string } | undefined
  return o?.problemas?.join(' ') ?? o?.erro ?? ''
}

const STATUS_TONE: Record<string, Tone> = {
  pendente: 'amber', confirmada: 'blue', aplicada: 'emerald', cancelada: 'slate', expirada: 'slate', erro: 'red', desfeita: 'violet'
}

function ActionRow({ action, compact, contactName, source, onOpen }: { action: WaAction; compact?: boolean; contactName?: string; source?: WaMessage | null; onOpen?: () => void }) {
  return (
    <article className={`wa-action ${compact ? 'compact' : ''}`} onClick={onOpen} role={onOpen ? 'button' : undefined}>
      <div className="wa-action-top">
        <span className="wa-code">{action.code}</span>
        <strong>{actionKindLabel[action.kind] ?? action.kind}</strong>
        <Pill tone={STATUS_TONE[action.status] ?? 'slate'}>{actionStatusLabel[action.status] ?? action.status}</Pill>
        {action.simulated && <Pill tone="slate">simulação</Pill>}
      </div>
      <div className="wa-action-body"><WaText text={action.summary.split('\n').slice(compact ? 1 : 1).join('\n')} /></div>
      {!compact && action.warnings?.length > 0 && <ul className="wa-warnings">{action.warnings.map((w) => <li key={w}>{w.replace(/^⚠\s*/, '')}</li>)}</ul>}
      {!compact && (
        <div className="wa-timeline">
          {contactName && <span><UserRound size={13} /> {contactName}</span>}
          {source?.sent_at && <span><Mic size={13} /> gravada {formatDateTime(source.sent_at)}</span>}
          {source?.sent_at && new Date(source.received_at).getTime() - new Date(source.sent_at).getTime() > 20 * 60000 && <span className="late"><WifiOff size={13} /> chegou {formatDateTime(source.received_at)}</span>}
          <span><Clock3 size={13} /> proposta {formatDateTime(action.created_at)}</span>
          {action.applied_at && <span className="good"><CircleCheck size={13} /> gravada {formatDateTime(action.applied_at)} · {action.result_refs.length} registros</span>}
          {action.undone_at && <span><Undo2 size={13} /> desfeita {formatDateTime(action.undone_at)}</span>}
          {action.error && <span className="bad"><CircleAlert size={13} /> {action.error}</span>}
        </div>
      )}
    </article>
  )
}

// ------------------------------------------------------------------
// Registro (auditoria)
// ------------------------------------------------------------------

function AuditLog({ simState }: { simState: SimState | null }) {
  const [period, setPeriod] = useState(7)
  const [messages, setMessages] = useState<WaMessage[]>([])
  const [actions, setActions] = useState<WaAction[]>([])
  const [contacts, setContacts] = useState<WaContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('todos')
  const [open, setOpen] = useState<WaAction | null>(null)
  const fromDb = whatsappDatabase

  useEffect(() => {
    let alive = true
    if (!fromDb) {
      setMessages(simState?.messages ?? [])
      setActions(simState?.actions ?? [])
      setContacts(simState?.contacts ?? [])
      setLoading(false)
      return
    }
    setLoading(true)
    const since = new Date(Date.now() - period * 86400000).toISOString()
    Promise.all([listWaMessages(since), listWaActions(since), listWaContacts()])
      .then(([m, a, c]) => { if (alive) { setMessages(m); setActions(a); setContacts(c); setError(null) } })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Não foi possível carregar o registro. O schema.sql novo já foi executado?'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [period, fromDb, simState])

  const nameOf = useMemo(() => new Map(contacts.map((c) => [c.id, c.name])), [contacts])
  const msgById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages])
  const inbound = messages.filter((m) => m.direction === 'in')
  const late = inbound.filter((m) => m.sent_at && new Date(m.received_at).getTime() - new Date(m.sent_at).getTime() > 20 * 60000)
  const applied = actions.filter((a) => a.status === 'aplicada' && a.kind !== 'desfazer')
  const pending = actions.filter((a) => a.status === 'pendente')
  const failed = inbound.filter((m) => m.status === 'erro')
  const filtered = actions.filter((a) => statusFilter === 'todos' || a.status === statusFilter)

  return (
    <div className="wa-audit">
      {!fromDb && <Alert tone="info">Modo demonstração: o registro abaixo mostra a conversa do simulador. Com o banco ligado, aparecem aqui todas as mensagens reais da equipe.</Alert>}
      <div className="kpi-grid">
        <Kpi label="Mensagens recebidas" value={inbound.length} icon={MessageCircle} tone="blue" hint={`${inbound.filter((m) => m.kind === 'audio').length} em áudio`} />
        <Kpi label="Lançamentos gravados" value={applied.length} icon={CircleCheck} tone="emerald" hint={`${applied.reduce((s, a) => s + (a.payload?.animalCount ?? 0), 0)} animais`} />
        <Kpi label="Aguardando confirmação" value={pending.length} icon={Clock3} tone="amber" />
        <Kpi label="Chegaram sem sinal" value={late.length} icon={WifiOff} tone="violet" hint={failed.length ? `${failed.length} com erro para reprocessar` : 'nenhuma se perdeu'} />
      </div>

      <section className="panel">
        <PanelHead
          eyebrow="Rastreabilidade"
          title="Lançamentos pelo WhatsApp"
          action={
            <div className="wa-filters">
              <select className="select-compact" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="todos">Todas as situações</option>
                {Object.entries(actionStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {fromDb && (
                <select className="select-compact" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
                  <option value={1}>Hoje e ontem</option>
                  <option value={7}>7 dias</option>
                  <option value={30}>30 dias</option>
                  <option value={90}>90 dias</option>
                </select>
              )}
            </div>
          }
        />
        {error && <Alert tone="error">{error}</Alert>}
        {loading ? <p className="muted">Carregando…</p> : !filtered.length ? (
          <EmptyState icon={ListChecks} title="Nenhum lançamento no período" text="Quando a equipe mandar mensagens, cada lançamento aparece aqui com o áudio, a transcrição e quem confirmou." />
        ) : (
          <div className="wa-action-list">
            {filtered.map((a) => (
              <ActionRow key={a.id} action={a} contactName={a.contact_id ? nameOf.get(a.contact_id) : undefined} source={a.message_id ? msgById.get(a.message_id) : null} onOpen={() => setOpen(a)} />
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <PanelHead eyebrow="Livro de mensagens" title="Tudo que entrou e saiu" />
        {!messages.length ? <p className="muted">Nenhuma mensagem no período.</p> : (
          <div className="table-wrap">
            <table className="data-table wa-log">
              <thead><tr><th>Quando</th><th>Quem</th><th>Mensagem</th><th>Situação</th></tr></thead>
              <tbody>
                {messages.slice(0, 200).map((m) => (
                  <tr key={m.id} className={m.direction}>
                    <td>{formatDateTime(m.direction === 'in' ? m.sent_at ?? m.received_at : m.received_at)}</td>
                    <td>{m.direction === 'in' ? (m.contact_id ? nameOf.get(m.contact_id) ?? formatPhone(m.phone) : formatPhone(m.phone)) : <span className="muted">Assistente</span>}</td>
                    <td className="wa-log-text">
                      {m.kind === 'audio' && <Pill tone="violet" icon={Mic}>áudio</Pill>} {m.kind === 'image' && <Pill tone="blue">foto</Pill>}{' '}
                      {(m.transcription ?? m.body ?? '').slice(0, 180)}
                    </td>
                    <td><DeliveryStatus message={m} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && <ActionDetail action={open} source={open.message_id ? msgById.get(open.message_id) ?? null : null} contactName={open.contact_id ? nameOf.get(open.contact_id) : undefined} onClose={() => setOpen(null)} />}
    </div>
  )
}

function DeliveryStatus({ message }: { message: WaMessage }) {
  const map: Record<string, { label: string; tone: Tone }> = {
    recebido: { label: 'Na fila', tone: 'slate' }, processando: { label: 'Processando', tone: 'blue' }, respondido: { label: 'Respondido', tone: 'emerald' },
    erro: { label: `Erro · tentativa ${message.attempts}`, tone: 'red' }, ignorado: { label: 'Número não autorizado', tone: 'slate' },
    enviado: { label: 'Enviado ✓', tone: 'slate' }, entregue: { label: 'Entregue ✓✓', tone: 'blue' }, lido: { label: 'Lido ✓✓', tone: 'emerald' },
    falhou: { label: 'Não entregue', tone: 'red' }, simulado: { label: 'Simulação', tone: 'slate' }
  }
  const s = map[message.status] ?? { label: message.status, tone: 'slate' as Tone }
  return <span title={message.error ?? ''}><Pill tone={s.tone}>{s.label}</Pill></span>
}

function ActionDetail({ action, source, contactName, onClose }: { action: WaAction; source: WaMessage | null; contactName?: string; onClose: () => void }) {
  const [audio, setAudio] = useState<string | null>(null)
  useEffect(() => {
    if (source?.media_path && source.kind === 'audio') mediaUrl(source.media_path).then(setAudio).catch(() => setAudio(null))
  }, [source])
  return (
    <Modal title={`Lançamento ${action.code}`} onClose={onClose} size="lg">
      <ActionRow action={action} contactName={contactName} source={source} />
      {source && (
        <section className="wa-xray-block">
          <span className="eyebrow">Mensagem de origem</span>
          {audio && <audio controls src={audio} className="wa-detail-audio" />}
          <blockquote>“{source.transcription ?? source.body}”</blockquote>
          {source.interpretation?.tools?.length ? (
            <ol className="wa-tools">
              {source.interpretation.tools.map((tool, i) => <li key={i} className={tool.ok ? 'ok' : 'fail'}><code>{tool.name}</code><span>{compactJson(tool.input)}</span></li>)}
            </ol>
          ) : null}
        </section>
      )}
      {action.result_refs?.length > 0 && (
        <section className="wa-xray-block">
          <span className="eyebrow">Registros criados ou alterados</span>
          <ul className="wa-refs">{action.result_refs.map((r) => <li key={`${r.table}-${r.id}-${r.op}`}><code>{r.table}</code> {r.op === 'insert' ? 'criado' : 'alterado'} <small className="muted">{r.id.slice(0, 8)}</small></li>)}</ul>
        </section>
      )}
    </Modal>
  )
}

// ------------------------------------------------------------------
// Números autorizados
// ------------------------------------------------------------------

function Contacts() {
  const [contacts, setContacts] = useState<WaContact[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [editing, setEditing] = useState<Partial<WaContact> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = () => listWaContacts().then(setContacts).catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar.'))
  useEffect(() => {
    if (!whatsappDatabase) return
    void reload()
    listProfiles().then(setProfiles).catch(() => setProfiles([]))
  }, [])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editing?.name || !editing.phone) return
    setBusy(true)
    setError(null)
    try {
      await saveWaContact(editing as WaContact)
      setEditing(null)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setBusy(false)
    }
  }

  if (!whatsappDatabase) {
    return <EmptyState icon={Phone} title="Os números ficam no banco" text="Com o Supabase ligado, cadastre aqui os celulares da equipe que podem falar com o assistente. Números fora da lista recebem um aviso e nada é lançado." />
  }
  const profileName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? null
  return (
    <section className="panel">
      <PanelHead eyebrow="Quem pode usar" title="Números autorizados" action={<button type="button" className="button button-primary button-sm" onClick={() => setEditing({ permission: 'lancamento', active: true })}><Plus size={15} /> Adicionar número</button>} />
      {error && <Alert tone="error">{error}</Alert>}
      {!contacts.length ? (
        <EmptyState icon={Phone} title="Nenhum número cadastrado" text="Cadastre o seu primeiro para testar com o número de teste da Meta." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Nome</th><th>Celular</th><th>Permissão</th><th>Conta no sistema</th><th>Última mensagem</th><th /></tr></thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className={c.active ? '' : 'muted'}>
                  <td><strong>{c.name}</strong>{!c.active && <> <Pill tone="slate">desativado</Pill></>}</td>
                  <td>{formatPhone(c.phone)}</td>
                  <td>{c.permission === 'consulta' ? <Pill tone="blue">Só consulta</Pill> : <Pill tone="emerald">Consulta e lança</Pill>}</td>
                  <td>{profileName(c.profile_id) ?? <span className="muted">não ligada</span>}</td>
                  <td>{c.last_seen_at ? formatDateTime(c.last_seen_at) : <span className="muted">nunca</span>}</td>
                  <td className="row-actions">
                    <button type="button" className="icon-button" aria-label="Editar" onClick={() => setEditing(c)}><Pencil size={15} /></button>
                    <button type="button" className="icon-button danger" aria-label="Excluir" onClick={async () => { if (confirm(`Remover ${c.name}? O histórico de mensagens continua guardado.`)) { await deleteWaContact(c.id); await reload() } }}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="panel-note">Ligue o número a uma conta do sistema para que os registros apareçam com o nome dessa pessoa na Administração.</p>
      {editing && (
        <Modal title={editing.id ? 'Editar número' : 'Novo número'} onClose={() => setEditing(null)} onSubmit={save}>
          <div className="form-grid">
            <Field label="Nome" required><input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required /></Field>
            <Field label="Celular com DDD" required hint="Ex.: 34 99999-8888. O 55 do Brasil entra sozinho."><input value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} inputMode="tel" required /></Field>
            <Field label="Permissão">
              <select value={editing.permission} onChange={(e) => setEditing({ ...editing, permission: e.target.value as WaPermission })}>
                <option value="lancamento">Consulta e lança</option>
                <option value="consulta">Só consulta</option>
              </select>
            </Field>
            <Field label="Conta no sistema" hint="Autoria dos registros feitos por este número.">
              <select value={editing.profile_id ?? ''} onChange={(e) => setEditing({ ...editing, profile_id: e.target.value || null })}>
                <option value="">Nenhuma</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </select>
            </Field>
            <label className="checkbox-field"><input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Ativo</label>
          </div>
          <div className="modal-actions">
            <button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Cancelar</button>
            <button type="submit" className="button button-primary" disabled={busy}>Salvar</button>
          </div>
        </Modal>
      )}
    </section>
  )
}

// ------------------------------------------------------------------
// Configuração
// ------------------------------------------------------------------

function Setup({ status }: { status: WaStatus | null | undefined }) {
  const webhook = `${window.location.origin}/api/whatsapp`
  const [copied, setCopied] = useState(false)
  const items: { ok: boolean | undefined; title: string; env: string; text: ReactNode; icon: typeof KeyRound }[] = [
    { ok: status?.banco, title: 'Banco de dados', env: 'SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY', icon: ShieldCheck, text: 'Rode o supabase/schema.sql atualizado (cria as tabelas do WhatsApp e o bucket privado de áudios).' },
    { ok: status?.claude, title: 'IA que interpreta (Claude)', env: 'ANTHROPIC_API_KEY · CLAUDE_MODEL (opcional)', icon: Bot, text: 'Chave criada no console da Anthropic. Modelo padrão: Sonnet 5.5. Para baratear, teste claude-haiku-5-5.' },
    { ok: status?.transcricao, title: 'Transcrição dos áudios (Gemini)', env: 'GEMINI_API_KEY', icon: AudioLines, text: 'A mesma chave que o sistema já usa para ler brincos e folhas de campo.' },
    { ok: status?.whatsapp, title: 'Envio pelo WhatsApp', env: 'WHATSAPP_TOKEN · WHATSAPP_PHONE_NUMBER_ID', icon: RadioTower, text: 'No painel de desenvolvedor da Meta: app do tipo Business, produto WhatsApp, token permanente do usuário do sistema.' },
    { ok: status?.verificacao && status?.assinatura, title: 'Segurança do webhook', env: 'WHATSAPP_VERIFY_TOKEN · WHATSAPP_APP_SECRET', icon: KeyRound, text: 'O verify token é uma senha que você inventa e repete na Meta. O app secret confere a assinatura de cada mensagem.' },
    { ok: status?.modelo_aviso, title: 'Avisos fora da janela de 24 h (opcional)', env: 'WHATSAPP_TEMPLATE_AVISO', icon: MessageCircle, text: 'Modelo de mensagem "utilidade" aprovado pela Meta, com um parâmetro de texto. Usado em lembretes quando o peão ficou mais de 24 h sem escrever.' }
  ]
  return (
    <div className="wa-setup">
      <section className="panel">
        <PanelHead eyebrow="Passo a passo" title="O que falta ligar" />
        <ul className="wa-checklist">
          {items.map((item) => (
            <li key={item.title} className={item.ok ? 'ok' : ''}>
              <span className="wa-check">{item.ok ? <CircleCheck size={18} /> : <item.icon size={18} />}</span>
              <div>
                <strong>{item.title}</strong>
                <code>{item.env}</code>
                <p>{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <PanelHead eyebrow="No painel da Meta" title="Endereço do webhook" />
        <div className="wa-webhook">
          <code>{webhook}</code>
          <button type="button" className="button button-secondary button-sm" onClick={() => { void navigator.clipboard.writeText(webhook); setCopied(true) }}><Copy size={14} /> {copied ? 'Copiado' : 'Copiar'}</button>
        </div>
        <p className="panel-note">Assine o campo <strong>messages</strong>. Teste primeiro com o número grátis da Meta (até 5 celulares cadastrados) e só depois registre o chip da fazenda.</p>
        <div className="wa-guarantees">
          <h3>O que o sistema garante</h3>
          <ul>
            <li><CheckCheck size={15} /> Nenhuma mensagem se perde: tudo é guardado antes de processar, e a Meta reenvia se o servidor falhar.</li>
            <li><WifiOff size={15} /> Áudio gravado sem sinal vale pela hora em que foi gravado, não pela hora em que chegou.</li>
            <li><RotateCcw size={15} /> Aviso repetido não vira lançamento repetido, e dois toques no Confirmar gravam uma vez só.</li>
            <li><Clock3 size={15} /> Ficou sem confirmar? Lembrete em 30 min, e expira em 24 h sem gravar nada.</li>
            <li><Undo2 size={15} /> Todo lançamento tem código e pode ser desfeito com exatidão.</li>
          </ul>
        </div>
      </section>
    </div>
  )
}
