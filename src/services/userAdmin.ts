import type { Profile, UserRole } from '../types'
import { callFunction } from './functions'
import { isSupabaseConfigured, supabase } from './supabase'

/**
 * Gestão de contas (criar, trocar senha e e-mail, excluir).
 *
 * Com banco: a função do Netlify netlify/functions/gerenciar-usuarios, que usa a
 * service_role guardada no servidor. Se ela não estiver configurada, tenta a
 * Edge Function antiga do Supabase.
 *
 * Sem banco (demonstração): as contas de exemplo vivem no navegador, para a
 * tela de administração poder ser apresentada por completo.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const legacyUrl = supabaseUrl ? `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/gerenciar-usuarios` : undefined

export const isUserAdminAvailable = true

const PROFILES_KEY = 'pantano.v3.contas'
const demoProfiles: Profile[] = [
  { id: 'u-admin', full_name: 'Administrador da fazenda', email: 'admin@fazendapantano.com.br', role: 'administrador', created_at: '2026-10-01T12:00:00.000Z' },
  { id: 'u-campo', full_name: 'Equipe do campo', email: 'campo@fazendapantano.com.br', role: 'operador', created_at: '2026-10-01T12:00:00.000Z' }
]

export function readDemoProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY)
    if (raw) return JSON.parse(raw) as Profile[]
  } catch { /* armazenamento indisponível */ }
  return demoProfiles
}

export function writeDemoProfiles(profiles: Profile[]) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)) } catch { /* cheio */ }
}

export async function listProfiles(): Promise<Profile[]> {
  if (!isSupabaseConfigured || !supabase) return readDemoProfiles()
  const { data, error } = await supabase.from('profiles').select('*').order('full_name')
  if (error) throw new Error(error.message)
  return (data ?? []) as Profile[]
}

export async function updateProfileRole(id: string, role: UserRole): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const profiles = readDemoProfiles()
    if (role !== 'administrador' && profiles.find((item) => item.id === id)?.role === 'administrador' && profiles.filter((item) => item.role === 'administrador').length <= 1) {
      throw new Error('É preciso manter pelo menos um administrador no sistema.')
    }
    writeDemoProfiles(profiles.map((item) => (item.id === id ? { ...item, role } : item)))
    return
  }
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
  if (error) throw new Error(error.message)
}

type Action = 'criar' | 'redefinir_senha' | 'alterar_email' | 'excluir'

interface Payload {
  action: Action
  email?: string
  password?: string
  full_name?: string
  user_id?: string
}

async function call(payload: Payload) {
  if (!isSupabaseConfigured) return demoCall(payload)
  const result = await callFunction<{ ok: boolean }>('gerenciar-usuarios', payload)
  if (result.status === 'ok') return result.data
  if (legacyUrl) {
    const legacy = await callFunction<{ ok: boolean }>('gerenciar-usuarios', payload, legacyUrl)
    if (legacy.status === 'ok') return legacy.data
  }
  throw new Error('A gestão de contas ainda não foi ativada neste site. Cadastre SUPABASE_SERVICE_ROLE_KEY no Netlify.')
}

/** Mesmas regras do servidor, aplicadas às contas de exemplo. */
function demoCall(payload: Payload) {
  const profiles = readDemoProfiles()
  const email = (payload.email ?? '').trim().toLowerCase()
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  switch (payload.action) {
    case 'criar': {
      if (!emailValid) throw new Error('Informe um e-mail válido.')
      if ((payload.password ?? '').length < 8) throw new Error('A senha precisa ter ao menos 8 caracteres.')
      if (profiles.some((item) => item.email === email)) throw new Error('Já existe uma conta com esse e-mail.')
      writeDemoProfiles([...profiles, { id: crypto.randomUUID(), full_name: payload.full_name || email, email, role: 'operador', created_at: new Date().toISOString() }])
      return { ok: true }
    }
    case 'redefinir_senha':
      if ((payload.password ?? '').length < 8) throw new Error('A senha precisa ter ao menos 8 caracteres.')
      return { ok: true }
    case 'alterar_email':
      if (!emailValid) throw new Error('Informe um e-mail válido.')
      writeDemoProfiles(profiles.map((item) => (item.id === payload.user_id ? { ...item, email } : item)))
      return { ok: true }
    case 'excluir': {
      const target = profiles.find((item) => item.id === payload.user_id)
      if (target?.role === 'administrador' && profiles.filter((item) => item.role === 'administrador').length <= 1) {
        throw new Error('É preciso manter pelo menos um administrador.')
      }
      writeDemoProfiles(profiles.filter((item) => item.id !== payload.user_id))
      return { ok: true }
    }
  }
}

export const createUser = (email: string, password: string, fullName: string) =>
  call({ action: 'criar', email, password, full_name: fullName })

export const resetUserPassword = (userId: string, password: string) =>
  call({ action: 'redefinir_senha', user_id: userId, password })

export const changeUserEmail = (userId: string, email: string) =>
  call({ action: 'alterar_email', user_id: userId, email })

export const deleteUser = (userId: string) =>
  call({ action: 'excluir', user_id: userId })
