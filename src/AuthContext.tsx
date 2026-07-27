import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './services/supabase'
import type { Profile, UserRole } from './types'

const DEMO_ROLE_KEY = 'pantano.demoRole'

type AuthContextValue = {
  loading: boolean
  authenticated: boolean
  profile: Profile | null
  role: UserRole
  isAdmin: boolean
  displayName: string
  signIn: (email: string, password: string, intendedRole: UserRole) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readDemoRole(): UserRole {
  return localStorage.getItem(DEMO_ROLE_KEY) === 'operador' ? 'operador' : 'administrador'
}

/**
 * Busca o papel do usuário no banco. O papel NUNCA vem da tela de login:
 * a aba escolhida ali é apenas a intenção do usuário, e é conferida contra isto.
 */
async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error || !data) return null
  return data as Profile
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [demoRole, setDemoRole] = useState<UserRole>(readDemoRole)

  const loadSession = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthenticated(true)
      setDemoRole(readDemoRole())
      setLoading(false)
      return
    }
    const { data } = await supabase.auth.getSession()
    const user = data.session?.user
    setAuthenticated(Boolean(user))
    setProfile(user ? await fetchProfile(user.id) : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadSession()
    if (!supabase) return
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      setAuthenticated(Boolean(user))
      if (!user) {
        setProfile(null)
        setLoading(false)
        return
      }
      void fetchProfile(user.id).then((next) => {
        setProfile(next)
        setLoading(false)
      })
    })
    return () => listener.subscription.unsubscribe()
  }, [loadSession])

  const signIn = async (email: string, password: string, intendedRole: UserRole) => {
    // Modo demonstração: a aba escolhida define o papel, para apresentar as duas visões.
    if (!isSupabaseConfigured || !supabase) {
      localStorage.setItem(DEMO_ROLE_KEY, intendedRole)
      setDemoRole(intendedRole)
      setAuthenticated(true)
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error || !data.user) throw new Error('E-mail ou senha não conferem.')

    const loaded = await fetchProfile(data.user.id)
    const actualRole: UserRole = loaded?.role ?? 'operador'

    // Pediu a área administrativa sem ter o papel? Encerra a sessão imediatamente.
    if (intendedRole === 'administrador' && actualRole !== 'administrador') {
      await supabase.auth.signOut()
      throw new Error('Esta conta não possui acesso administrativo. Entre como operador.')
    }

    setProfile(loaded)
    setAuthenticated(true)
  }

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut()
    setAuthenticated(false)
    setProfile(null)
  }

  const role: UserRole = isSupabaseConfigured ? profile?.role ?? 'operador' : demoRole

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      authenticated,
      profile,
      role,
      isAdmin: role === 'administrador',
      displayName: profile?.full_name || profile?.email || (isSupabaseConfigured ? 'Usuário' : 'Demonstração'),
      signIn,
      signOut
    }),
    [loading, authenticated, profile, role]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return context
}

export const roleLabel: Record<UserRole, string> = {
  administrador: 'Administrador',
  operador: 'Operador'
}
