// Edge Function: gerenciar-usuarios
//
// Criar conta, trocar senha, trocar e-mail e excluir conta exigem a chave
// service_role, que ignora todas as políticas de segurança. Ela JAMAIS pode ir
// para o navegador, então essas operações vivem aqui.
//
// Toda chamada é verificada duas vezes:
//   1. O token enviado corresponde a um usuário autenticado?
//   2. Esse usuário tem papel de administrador na tabela profiles?
//
// A verificação é feita no servidor, com a service_role, e não confia em nada
// que o navegador afirme sobre si mesmo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  // ---- 1. Quem está chamando? -------------------------------------
  const authHeader = request.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Sessão não informada.' }, 401)

  const { data: caller, error: callerError } = await admin.auth.getUser(token)
  if (callerError || !caller.user) return json({ error: 'Sessão inválida ou expirada.' }, 401)

  // ---- 2. Essa pessoa é administradora? ---------------------------
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .maybeSingle()

  if (callerProfile?.role !== 'administrador') {
    return json({ error: 'Apenas administradores podem gerenciar contas.' }, 403)
  }

  // ---- 3. Executa a ação ------------------------------------------
  let body: Record<string, string>
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Não foi possível ler os dados enviados.' }, 400)
  }

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
        email,
        password,
        email_confirm: true, // Fazenda não depende de e-mail: a conta já entra liberada.
        user_metadata: fullName ? { full_name: fullName } : undefined
      })

      if (error) {
        const duplicated = /already|registered|exists/i.test(error.message)
        return json({ error: duplicated ? 'Já existe uma conta com esse e-mail.' : error.message }, 400)
      }

      // O gatilho do banco cria o profile como operador. Garante o nome exibido.
      if (fullName && data.user) {
        await admin.from('profiles').update({ full_name: fullName }).eq('id', data.user.id)
      }
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
      if (userId === caller.user.id) {
        return json({ error: 'Você não pode excluir a própria conta.' }, 400)
      }

      // Não deixa a fazenda ficar sem nenhum administrador.
      const { data: target } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
      if (target?.role === 'administrador') {
        const { count } = await admin
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'administrador')
        if ((count ?? 0) <= 1) {
          return json({ error: 'É preciso manter pelo menos um administrador.' }, 400)
        }
      }

      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    default:
      return json({ error: 'Ação desconhecida.' }, 400)
  }
})
