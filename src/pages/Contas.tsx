import { KeyRound, Mail, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { roleLabel, useAuth } from '../AuthContext'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { PageHeading } from '../components/ui'
import { isSupabaseConfigured } from '../services/supabase'
import { changeUserEmail, createUser, deleteUser, listProfiles, resetUserPassword, updateProfileRole } from '../services/userAdmin'
import type { Profile, UserRole } from '../types'

/** Contas de acesso. O dono gerencia; a equipe do campo entra como operador. */
export function Contas() {
  const { profile: currentProfile } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [novo, setNovo] = useState({ nome: '', email: '', senha: '' })

  const reload = useCallback(async () => {
    try {
      setProfiles(await listProfiles())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as contas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  async function run(task: () => Promise<unknown>, ok: string) {
    setBusy(true); setError(null); setNotice(null)
    try {
      await task()
      setNotice(ok)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir.')
    } finally {
      setBusy(false)
    }
  }

  async function changeRole(id: string, role: UserRole) {
    setSavingId(id); setError(null)
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
      <PageHeading eyebrow="Somente administradores" title="Contas e acessos" text="Toda a equipe lança no rebanho, como na planilha. O administrador também cria contas e define quem é administrador." />
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <section className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Equipe da fazenda</span><h2>{profiles.length} conta(s)</h2></div>
          {!showNew && <button type="button" className="button button-primary" onClick={() => setShowNew(true)}><UserPlus size={18} /> Nova conta</button>}
        </div>

        {showNew && (
          <div className="new-user-form">
            <div className="form-grid">
              <label className="field"><span>Nome da pessoa</span><input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: João do curral" autoFocus /></label>
              <label className="field required"><span>E-mail de acesso</span><input type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></label>
              <label className="field required"><span>Senha provisória</span><input type="text" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} placeholder="Mínimo de 8 caracteres" /></label>
            </div>
            <small className="panel-note">A senha aparece em texto para você anotar e repassar. Peça para a pessoa trocar depois.</small>
            <div className="modal-actions">
              <button type="button" className="button button-ghost" onClick={() => setShowNew(false)}>Cancelar</button>
              <button type="button" className="button button-primary" disabled={busy || !novo.email.trim() || novo.senha.length < 8}
                onClick={() => void run(async () => { await createUser(novo.email, novo.senha, novo.nome); setShowNew(false); setNovo({ nome: '', email: '', senha: '' }) }, 'Conta criada como operador.')}>
                {busy ? 'Criando…' : 'Criar conta'}
              </button>
            </div>
          </div>
        )}

        {!isSupabaseConfigured && <p className="panel-note">Demonstração: as contas de exemplo ficam só neste navegador. Com o banco ligado, as mesmas ações criam contas de verdade.</p>}

        {profiles.length ? (
          <ul className="team-list">
            {profiles.map((item) => {
              const isSelf = item.id === currentProfile?.id
              const isLastAdmin = item.role === 'administrador' && admins <= 1
              const nome = item.full_name || item.email || 'Conta'
              return (
                <li key={item.id}>
                  <div className="team-avatar">{nome.trim().charAt(0).toUpperCase()}</div>
                  <div className="team-main">
                    <strong>{item.full_name || 'Conta sem nome'}<span className={`role-badge role-${item.role}`}>{roleLabel[item.role]}</span>{isSelf && <span className="team-self">você</span>}</strong>
                    <span>{item.email || 'E-mail não informado'}</span>
                  </div>
                  <div className="team-role">
                    <select value={item.role} disabled={savingId === item.id || isLastAdmin} title={isLastAdmin ? 'É preciso manter pelo menos um administrador.' : undefined} onChange={(e) => void changeRole(item.id, e.target.value as UserRole)}>
                      <option value="operador">Operador</option>
                      <option value="administrador">Administrador</option>
                    </select>
                    <div className="team-actions">
                      <button type="button" className="icon-button" title="Trocar a senha" disabled={busy} onClick={() => {
                        const senha = window.prompt(`Nova senha para ${nome} (mínimo de 8 caracteres)`)
                        if (senha) void run(() => resetUserPassword(item.id, senha), 'Senha alterada.')
                      }}><KeyRound size={17} /></button>
                      <button type="button" className="icon-button" title="Trocar o e-mail" disabled={busy} onClick={() => {
                        const email = window.prompt(`Novo e-mail para ${nome}`, item.email ?? '')
                        if (email && email !== item.email) void run(() => changeUserEmail(item.id, email), 'E-mail alterado.')
                      }}><Mail size={17} /></button>
                      {!isSelf && <button type="button" className="icon-button danger" title="Excluir a conta" disabled={busy} onClick={() => {
                        if (window.confirm(`Excluir a conta de ${nome}? A pessoa perde o acesso; o que ela lançou continua no histórico.`)) void run(() => deleteUser(item.id), 'Conta excluída.')
                      }}><Trash2 size={17} /></button>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : <EmptyState icon={ShieldCheck} title="Nenhuma conta encontrada" text="Crie os usuários aqui ou no painel do Supabase, em Authentication." />}
      </section>
    </>
  )
}
