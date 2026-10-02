import { ArrowRight, HardHat, LockKeyhole, ShieldCheck } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { brand } from '../brand'
import { Brand } from '../components/Brand'
import { isSupabaseConfigured } from '../services/supabase'
import type { UserRole } from '../types'

const tabs: { role: UserRole; label: string; icon: typeof ShieldCheck; hint: string }[] = [
  {
    role: 'operador',
    label: 'Operador',
    icon: HardHat,
    hint: 'Rebanho, reprodução, vacinas, pesagens, contagens e documentos.'
  },
  {
    role: 'administrador',
    label: 'Administrador',
    icon: ShieldCheck,
    hint: 'Tudo do operador, mais a equipe, as regras da fazenda e o histórico de quem registrou cada informação.'
  }
]

export function Login() {
  const navigate = useNavigate()
  const { authenticated, loading, signIn } = useAuth()
  const [intendedRole, setIntendedRole] = useState<UserRole>('operador')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && authenticated) navigate('/', { replace: true })
  }, [loading, authenticated, navigate])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage(null)
    setSubmitting(true)
    try {
      await signIn(email, password, intendedRole)
      navigate('/', { replace: true })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível entrar.')
    } finally {
      setSubmitting(false)
    }
  }

  const activeTab = tabs.find((tab) => tab.role === intendedRole)!

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <Brand />
        <div className="login-copy">
          <span className="eyebrow">Gestão agropecuária</span>
          <h1>Do curral ao escritório, o rebanho inteiro na palma da mão.</h1>
          <p>Protocolos de IATF, partos, vacinas, pesagens e compras num só lugar, com a agenda do dia montada sozinha.</p>
        </div>
        <div className="login-feature"><ShieldCheck /><span>Cada pessoa entra com o próprio acesso, e o sistema registra quem fez cada lançamento.</span></div>
      </section>

      <section className="login-form-panel">
        <form className="login-form" onSubmit={submit}>
          <div className="login-icon"><LockKeyhole /></div>
          <span className="eyebrow">Acesso ao sistema</span>
          <h2>{brand.loginTitle}</h2>

          <div className="role-tabs" role="tablist" aria-label="Tipo de acesso">
            {tabs.map(({ role, label, icon: Icon }) => (
              <button
                key={role}
                type="button"
                role="tab"
                aria-selected={intendedRole === role}
                className={intendedRole === role ? 'selected' : ''}
                onClick={() => { setIntendedRole(role); setMessage(null) }}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <p className="role-hint">{activeTab.hint}</p>

          {isSupabaseConfigured ? (
            <>
              <label className="field"><span>E-mail</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@fazenda.com.br" /></label>
              <label className="field"><span>Senha</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" /></label>
            </>
          ) : (
            <p className="demo-note">O projeto está em modo de demonstração. A aba escolhida acima define qual visão será aberta, para você mostrar as duas.</p>
          )}

          {message && <div className="alert alert-error">{message}</div>}

          <button className="button button-primary login-button" disabled={submitting}>
            {submitting ? 'Entrando' : isSupabaseConfigured ? `Entrar como ${activeTab.label.toLowerCase()}` : `Abrir demonstração como ${activeTab.label.toLowerCase()}`}
            <ArrowRight size={18} />
          </button>

          {!isSupabaseConfigured && <small>Para ativar usuários reais, preencha o arquivo .env conforme o guia.</small>}
        </form>
      </section>
    </main>
  )
}
