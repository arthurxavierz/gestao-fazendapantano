// Gestão de contas (criar, trocar senha, trocar e-mail, excluir).
//
// Exige a chave service_role do Supabase, que ignora todas as políticas de
// segurança. Por isso ela vive só aqui, no servidor, na variável
// SUPABASE_SERVICE_ROLE_KEY do Netlify. Toda chamada confere, no servidor,
// se quem chama está autenticado e é administrador.
//
// Em modo demonstração (sem banco) esta função não é usada: as contas de
// exemplo são geridas no próprio navegador.

import { createClient } from '@supabase/supabase-js'
import { json } from '../lib/shared.mjs'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async (request) => {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'A gestão de contas ainda não foi configurada neste site (SUPABASE_SERVICE_ROLE_KEY).', code: 'not_configured' }, 503)
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  // 1. Quem está chamando?
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Sessão não informada.' }, 401)
  const { data: caller, error: callerError } = await admin.auth.getUser(token)
  if (callerError || !caller.user) return json({ error: 'Sessão inválida ou expirada.' }, 401)

  // 2. É administrador? (conferido no banco, nunca pelo que o navegador diz)
  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', caller.user.id).maybeSingle()
  if (callerProfile?.role !== 'administrador') return json({ error: 'Apenas administradores podem gerenciar contas.' }, 403)

  // 3. Executa a ação
  let body
  try { body = await request.json() } catch { return json({ error: 'Não foi possível ler os dados enviados.' }, 400) }
  const action = String(body.action ?? '')
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const fullName = String(body.full_name ?? '').trim()
  const userId = String(body.user_id ?? '')
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  switch (action) {
    case 'criar': {
      if (!emailValid) return json({ error: 'Informe um e-mail válido.' }, 400)
      if (password.length < 8) return json({ error: 'A senha precisa ter ao menos 8 caracteres.' }, 400)
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: fullName ? { full_name: fullName } : undefined
      })
      if (error) {
        const duplicated = /already|registered|exists/i.test(error.message)
        return json({ error: duplicated ? 'Já existe uma conta com esse e-mail.' : error.message }, 400)
      }
      if (fullName && data.user) await admin.from('profiles').update({ full_name: fullName }).eq('id', data.user.id)
      return json({ ok: true, user_id: data.user?.id })
    }
    case 'redefinir_senha': {
      if (!userId) return json({ error: 'Conta não informada.' }, 400)
      if (password.length < 8) return json({ error: 'A senha precisa ter ao menos 8 caracteres.' }, 400)
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }
    case 'alterar_email': {
      if (!userId) return json({ error: 'Conta não informada.' }, 400)
      if (!emailValid) return json({ error: 'Informe um e-mail válido.' }, 400)
      const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true })
      if (error) return json({ error: error.message }, 400)
      await admin.from('profiles').update({ email }).eq('id', userId)
      return json({ ok: true })
    }
    case 'excluir': {
      if (!userId) return json({ error: 'Conta não informada.' }, 400)
      if (userId === caller.user.id) return json({ error: 'Você não pode excluir a própria conta.' }, 400)
      const { data: target } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
      if (target?.role === 'administrador') {
        const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'administrador')
        if ((count ?? 0) <= 1) return json({ error: 'É preciso manter pelo menos um administrador.' }, 400)
      }
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }
    default:
      return json({ error: 'Ação desconhecida.' }, 400)
  }
}
