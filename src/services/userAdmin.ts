import { isSupabaseConfigured, supabase } from './supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const functionUrl = supabaseUrl
  ? `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/gerenciar-usuarios`
  : undefined

/** Criar e excluir contas exige servidor. Em modo demonstração o recurso fica indisponível. */
export const isUserAdminAvailable = Boolean(functionUrl && isSupabaseConfigured)

type Action = 'criar' | 'redefinir_senha' | 'alterar_email' | 'excluir'

interface Payload {
  action: Action
  email?: string
  password?: string
  full_name?: string
  user_id?: string
}

async function call(payload: Payload) {
  if (!functionUrl || !supabase) {
    throw new Error('A gestão de contas exige o Supabase configurado.')
  }

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sua sessão expirou. Entre novamente.')

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(anonKey ? { apikey: anonKey } : {})
    },
    body: JSON.stringify(payload)
  })

  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.error || 'Não foi possível concluir a operação.')
  return result
}

export const createUser = (email: string, password: string, fullName: string) =>
  call({ action: 'criar', email, password, full_name: fullName })

export const resetUserPassword = (userId: string, password: string) =>
  call({ action: 'redefinir_senha', user_id: userId, password })

export const changeUserEmail = (userId: string, email: string) =>
  call({ action: 'alterar_email', user_id: userId, email })

export const deleteUser = (userId: string) =>
  call({ action: 'excluir', user_id: userId })
