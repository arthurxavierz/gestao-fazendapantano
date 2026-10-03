import { isSupabaseConfigured, supabase } from './supabase'

/**
 * Chamada às funções de servidor do Netlify (pasta netlify/functions).
 *
 * Elas guardam as chaves (Gemini, service_role) e funcionam com ou sem banco.
 * Quando a função não existe neste ambiente (rodando localmente com o Vite) ou
 * ainda não foi configurada (sem GEMINI_API_KEY), devolve "unavailable" e quem
 * chamou decide o que fazer: na demonstração, uma leitura simulada.
 */
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || '/api').replace(/\/+$/, '')

export type FunctionResult<T> = { status: 'ok'; data: T } | { status: 'unavailable'; reason: string }

async function sessionToken() {
  if (!isSupabaseConfigured || !supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function callFunction<T>(name: string, body: unknown, url = `${API_BASE}/${name}`): Promise<FunctionResult<T>> {
  const token = await sessionToken()
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    })
  } catch {
    return { status: 'unavailable', reason: 'sem conexão com o servidor' }
  }

  // Sem a função publicada (ex.: servidor local), o pedido cai na página do app.
  const isJson = (response.headers.get('content-type') || '').includes('application/json')
  if (response.status === 404 || !isJson) return { status: 'unavailable', reason: 'função não publicada neste ambiente' }

  const payload = await response.json().catch(() => null)
  if (response.status === 503 && payload?.code === 'not_configured') return { status: 'unavailable', reason: payload.error }
  if (!response.ok) {
    const base = payload?.error || 'O servidor não conseguiu concluir a operação.'
    throw new Error(payload?.detail ? `${base} (${payload.detail})` : base)
  }
  return { status: 'ok', data: payload as T }
}

/** Espera curta para a leitura simulada não parecer instantânea demais. */
export const simulatedDelay = (ms = 1400) => new Promise((resolve) => setTimeout(resolve, ms))

/** Gerador determinístico a partir de um texto, para a simulação ser estável. */
export function seeded(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}
