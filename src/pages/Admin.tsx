import { ClipboardCheck, PawPrint, ShieldCheck, Stethoscope, UserCog, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppData } from '../AppContext'
import { roleLabel, useAuth } from '../AuthContext'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { listProfiles, updateProfileRole } from '../services/repository'
import type { Profile, UserRole } from '../types'
import { formatDateTime, occurrenceLabel } from '../utils/format'

type Tab = 'equipe' | 'atividade'

interface ActivityEntry {
  id: string
  kind: 'animal' | 'ocorrencia' | 'contagem'
  title: string
  detail: string
  authorId: string | null
  createdAt: string
}

const kindMeta = {
  animal: { label: 'Cadastro de animal', icon: PawPrint },
  ocorrencia: { label: 'Ocorrência', icon: Stethoscope },
  contagem: { label: 'Contagem', icon: ClipboardCheck }
} as const

export function Admin() {
  const { animals, occurrences, counts, loading } = useAppData()
  const { profile: currentProfile } = useAuth()
  const [tab, setTab] = useState<Tab>('atividade')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [authorFilter, setAuthorFilter] = useState('todos')
  const [kindFilter, setKindFilter] = useState('todos')

  useEffect(() => {
    let active = true
    listProfiles()
      .then((data) => { if (active) setProfiles(data) })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Não foi possível carregar a equipe.') })
      .finally(() => { if (active) setLoadingProfiles(false) })
    return () => { active = false }
  }, [])

  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of profiles) map.set(item.id, item.full_name || item.email || 'Conta sem nome')
    return map
  }, [profiles])

  const activity = useMemo<ActivityEntry[]>(() => {
    const entries: ActivityEntry[] = [
      ...animals.map((animal) => ({
        id: `animal-${animal.id}`,
        kind: 'animal' as const,
        title: `Animal ${animal.number}`,
        detail: [animal.breed, animal.lot].filter(Boolean).join(' · ') || 'Cadastro criado',
        authorId: animal.created_by ?? null,
        createdAt: animal.created_at
      })),
      ...occurrences.map((item) => ({
        id: `ocorrencia-${item.id}`,
        kind: 'ocorrencia' as const,
        title: `${occurrenceLabel[item.type]} · animal ${item.animal_number || 'não identificado'}`,
        detail: item.note,
        authorId: item.created_by ?? null,
        createdAt: item.created_at
      })),
      ...counts.map((item) => ({
        id: `contagem-${item.id}`,
        kind: 'contagem' as const,
        title: item.title,
        detail: `${item.total_counted} animais contados${item.expected_total != null ? ` de ${item.expected_total} esperados` : ''}`,
        authorId: item.created_by ?? null,
        createdAt: item.created_at
      }))
    ]

    return entries
      .filter((entry) => kindFilter === 'todos' || entry.kind === kindFilter)
      .filter((entry) => authorFilter === 'todos' || entry.authorId === authorFilter)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [animals, occurrences, counts, kindFilter, authorFilter])

  /** Agrupa por dia, que é como o responsável pela fazenda pensa a rotina. */
  const activityByDay = useMemo(() => {
    const groups = new Map<string, ActivityEntry[]>()
    for (const entry of activity) {
      const day = entry.createdAt.slice(0, 10)
      const list = groups.get(day)
      if (list) list.push(entry)
      else groups.set(day, [entry])
    }
    return [...groups.entries()]
  }, [activity])

  async function changeRole(id: string, role: UserRole) {
    setSavingId(id)
    setError(null)
    try {
      await updateProfileRole(id, role)
      setProfiles((current) => current.map((item) => (item.id === id ? { ...item, role } : item)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar o perfil.')
    } finally {
      setSavingId(null)
    }
  }

  if (loading) return <Loading />

  const admins = profiles.filter((item) => item.role === 'administrador').length

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Somente administradores</span>
          <h1>Administração</h1>
          <p>Acompanhe quem registrou cada informação e defina o acesso de cada pessoa.</p>
        </div>
      </div>

      <div className="segmented" role="tablist" aria-label="Seções da administração">
        <button type="button" role="tab" aria-selected={tab === 'atividade'} className={tab === 'atividade' ? 'selected' : ''} onClick={() => setTab('atividade')}>
          <ClipboardCheck size={17} /> Atividade
        </button>
        <button type="button" role="tab" aria-selected={tab === 'equipe'} className={tab === 'equipe' ? 'selected' : ''} onClick={() => setTab('equipe')}>
          <Users size={17} /> Equipe
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {tab === 'atividade' && (
        <>
          <section className="admin-metrics">
            <article><PawPrint /><div><strong>{animals.length}</strong><span>animais cadastrados</span></div></article>
            <article><Stethoscope /><div><strong>{occurrences.length}</strong><span>ocorrências registradas</span></div></article>
            <article><ClipboardCheck /><div><strong>{counts.length}</strong><span>contagens realizadas</span></div></article>
            <article><Users /><div><strong>{profiles.length}</strong><span>contas de acesso</span></div></article>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Rastreabilidade</span><h2>Quem registrou o quê</h2></div>
              <strong className="selection-count">{activity.length} registros</strong>
            </div>

            <div className="filters-panel embedded">
              <label className="select-box">
                <UserCog size={18} />
                <select value={authorFilter} onChange={(e) => setAuthorFilter(e.target.value)}>
                  <option value="todos">Todas as pessoas</option>
                  {profiles.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email}</option>)}
                </select>
              </label>
              <label className="select-box">
                <ClipboardCheck size={18} />
                <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
                  <option value="todos">Todos os tipos</option>
                  <option value="animal">Cadastros de animais</option>
                  <option value="ocorrencia">Ocorrências</option>
                  <option value="contagem">Contagens</option>
                </select>
              </label>
            </div>

            {activityByDay.length ? (
              <div className="activity-days">
                {activityByDay.map(([day, entries]) => (
                  <div className="activity-day" key={day}>
                    <div className="activity-day-head">
                      <strong>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${day}T12:00:00`))}</strong>
                      <span>{entries.length} {entries.length === 1 ? 'registro' : 'registros'}</span>
                    </div>
                    <ul className="activity-list">
                      {entries.map((entry) => {
                        const Icon = kindMeta[entry.kind].icon
                        return (
                          <li key={entry.id}>
                            <div className={`activity-icon activity-${entry.kind}`}><Icon size={17} /></div>
                            <div className="activity-main">
                              <span className="activity-kind">{kindMeta[entry.kind].label}</span>
                              <strong>{entry.title}</strong>
                              <p>{entry.detail}</p>
                            </div>
                            <div className="activity-meta">
                              <span className="activity-author">{entry.authorId ? nameById.get(entry.authorId) || 'Conta removida' : 'Não identificado'}</span>
                              <small>{formatDateTime(entry.createdAt)}</small>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={ClipboardCheck} title="Nenhum registro no filtro atual" text="Altere a pessoa ou o tipo para visualizar outros lançamentos." />
            )}
          </section>
        </>
      )}

      {tab === 'equipe' && (
        <section className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Contas de acesso</span><h2>Equipe da fazenda</h2></div>
            <strong className="selection-count">{profiles.length} pessoas</strong>
          </div>

          <p className="panel-note">
            O operador acessa o rebanho, os documentos e os registros do dia a dia. O administrador acessa também esta tela.
            Novas contas são criadas no Supabase e entram como operador.
          </p>

          {loadingProfiles ? <Loading /> : profiles.length ? (
            <ul className="team-list">
              {profiles.map((item) => {
                const isSelf = item.id === currentProfile?.id
                const isLastAdmin = item.role === 'administrador' && admins <= 1
                return (
                  <li key={item.id}>
                    <div className="team-avatar">{(item.full_name || item.email || '?').trim().charAt(0).toUpperCase()}</div>
                    <div className="team-main">
                      <strong>{item.full_name || 'Conta sem nome'}{isSelf && <span className="team-self">você</span>}</strong>
                      <span>{item.email || 'E-mail não informado'}</span>
                    </div>
                    <div className="team-role">
                      <span className={`role-badge role-${item.role}`}>{roleLabel[item.role]}</span>
                      <select
                        value={item.role}
                        disabled={savingId === item.id || isLastAdmin}
                        title={isLastAdmin ? 'É preciso manter pelo menos um administrador.' : undefined}
                        onChange={(e) => void changeRole(item.id, e.target.value as UserRole)}
                      >
                        <option value="operador">Operador</option>
                        <option value="administrador">Administrador</option>
                      </select>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState icon={ShieldCheck} title="Nenhuma conta encontrada" text="Crie os usuários no painel do Supabase, em Authentication." />
          )}
        </section>
      )}
    </>
  )
}
