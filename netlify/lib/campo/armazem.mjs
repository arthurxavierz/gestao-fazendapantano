// Onde o assistente lê e grava.
//
// Duas implementações com a mesma interface:
//   supabaseStore -> produção, com a service_role (só no servidor)
//   memoryStore   -> testes automáticos e o simulador do sistema, que roda o
//                    mesmo fluxo sem tocar no banco ("ensaio")

import { createClient } from '@supabase/supabase-js'
import { defaultProtocols, defaultSettings } from '../../../src/domain/reproduction.ts'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function newCode() {
  let code = ''
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return code
}

const uuid = () => globalThis.crypto.randomUUID()
const nowIso = () => new Date().toISOString()

// Os avisos de entrega da Meta podem chegar fora de ordem: "lido" nunca volta para "entregue".
const DELIVERY_RANK = { simulado: 0, enviado: 1, entregue: 2, lido: 3, falhou: 4 }
export const lowerDelivery = (status) => Object.keys(DELIVERY_RANK).filter((k) => DELIVERY_RANK[k] < DELIVERY_RANK[status])

const HERD_TABLES = {
  animals: 'animals',
  breeding_attempts: 'attempts',
  health_events: 'health',
  weighings: 'weighings',
  occurrences: 'occurrences',
  counts: 'counts'
}

function withDefaultProtocols(protocols) {
  if (protocols?.length) return protocols
  return defaultProtocols.map((p, i) => ({ ...p, id: `default-${i}`, created_at: '2026-01-01T00:00:00Z' }))
}

// ------------------------------------------------------------------
// Memória
// ------------------------------------------------------------------

export function emptyMemoryState(herd = {}) {
  return {
    contacts: [],
    messages: [],
    actions: [],
    sessions: [],
    media: [],
    herd: {
      animals: herd.animals ?? [],
      attempts: herd.attempts ?? [],
      health: herd.health ?? [],
      weighings: herd.weighings ?? [],
      occurrences: herd.occurrences ?? [],
      counts: herd.counts ?? [],
      protocols: herd.protocols ?? [],
      settings: herd.settings ?? { ...defaultSettings }
    }
  }
}

export function memoryStore(state = emptyMemoryState()) {
  const clone = (x) => (x == null ? x : structuredClone(x))
  const herdList = (table) => state.herd[HERD_TABLES[table]]
  return {
    kind: 'memory',
    state,
    async loadSnapshot() {
      const h = state.herd
      return clone({ ...h, protocols: withDefaultProtocols(h.protocols), settings: { ...defaultSettings, ...h.settings } })
    },
    async getContactByPhone(phone) {
      return clone(state.contacts.find((c) => c.phone === phone && c.active !== false) ?? null)
    },
    async getContact(id) {
      return clone(state.contacts.find((c) => c.id === id) ?? null)
    },
    async touchContact(id) {
      const c = state.contacts.find((x) => x.id === id)
      if (c) c.last_seen_at = nowIso()
    },
    async acquireLease() { return true },
    async releaseLease() {},
    async insertMessage(row) {
      if (row.wamid && state.messages.some((m) => m.wamid === row.wamid)) {
        return { duplicate: true, row: clone(state.messages.find((m) => m.wamid === row.wamid)) }
      }
      const full = { id: uuid(), received_at: nowIso(), status: 'recebido', attempts: 0, updated_at: nowIso(), ...row }
      state.messages.push(full)
      return { duplicate: false, row: clone(full) }
    },
    async getMessage(id) {
      return clone(state.messages.find((m) => m.id === id) ?? null)
    },
    async updateMessage(id, patch) {
      const m = state.messages.find((x) => x.id === id)
      if (m) Object.assign(m, patch, { updated_at: nowIso() })
      return clone(m ?? null)
    },
    async updateMessageByWamid(wamid, patch) {
      const m = state.messages.find((x) => x.wamid === wamid)
      if (m) Object.assign(m, patch, { updated_at: nowIso() })
      return clone(m ?? null)
    },
    async updateDelivery(wamid, status, error) {
      const m = state.messages.find((x) => x.wamid === wamid)
      if (m && lowerDelivery(status).includes(m.status)) Object.assign(m, { status, ...(error ? { error } : {}), updated_at: nowIso() })
    },
    async claimMessage(id) {
      const m = state.messages.find((x) => x.id === id)
      if (!m || !['recebido', 'erro'].includes(m.status)) return null
      m.status = 'processando'
      m.attempts = (m.attempts ?? 0) + 1
      return clone(m)
    },
    async pendingInbound(phone) {
      return clone(state.messages
        .filter((m) => m.direction === 'in' && m.phone === phone && ['recebido', 'erro'].includes(m.status) && (m.attempts ?? 0) < 4)
        .sort((a, b) => (a.sent_at ?? '').localeCompare(b.sent_at ?? '')))
    },
    async recentConversation(phone, since, limit = 12) {
      return clone(state.messages
        .filter((m) => m.phone === phone && (m.sent_at ?? m.received_at) >= since)
        .sort((a, b) => (a.sent_at ?? a.received_at).localeCompare(b.sent_at ?? b.received_at))
        .slice(-limit))
    },
    async lastOutboundAt(phone) {
      const out = state.messages.filter((m) => m.phone === phone && m.direction === 'out').map((m) => m.received_at).sort()
      return out[out.length - 1] ?? null
    },
    async lastInboundAt(phone) {
      const list = state.messages.filter((m) => m.phone === phone && m.direction === 'in').map((m) => m.sent_at ?? m.received_at).sort()
      return list[list.length - 1] ?? null
    },
    async createAction(row) {
      let code = newCode()
      while (state.actions.some((a) => a.code === code)) code = newCode()
      const full = { id: uuid(), code, status: 'pendente', warnings: [], result_refs: [], created_at: nowIso(), ...row }
      state.actions.push(full)
      return clone(full)
    },
    async getAction(id) {
      return clone(state.actions.find((a) => a.id === id) ?? null)
    },
    async getActionByCode(code) {
      return clone(state.actions.find((a) => a.code === String(code).toUpperCase()) ?? null)
    },
    async listActions({ contactId, status, since, limit = 30 } = {}) {
      return clone(state.actions
        .filter((a) => (!contactId || a.contact_id === contactId) && (!status || [].concat(status).includes(a.status)) && (!since || a.created_at >= since))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit))
    },
    async claimAction(id, fromStatus, patch) {
      const a = state.actions.find((x) => x.id === id)
      if (!a || ![].concat(fromStatus).includes(a.status)) return null
      Object.assign(a, patch)
      return clone(a)
    },
    async updateAction(id, patch) {
      const a = state.actions.find((x) => x.id === id)
      if (a) Object.assign(a, patch)
      return clone(a ?? null)
    },
    async getOpenSession(contactId) {
      return clone(state.sessions.find((s) => s.contact_id === contactId && s.status === 'aberta') ?? null)
    },
    async createSession(row) {
      for (const s of state.sessions) if (s.contact_id === row.contact_id && s.status === 'aberta') Object.assign(s, { status: 'cancelada', closed_at: nowIso() })
      const full = { id: uuid(), status: 'aberta', entries: [], started_at: nowIso(), ...row }
      state.sessions.push(full)
      return clone(full)
    },
    async updateSession(id, patch) {
      const s = state.sessions.find((x) => x.id === id)
      if (s) Object.assign(s, patch)
      return clone(s ?? null)
    },
    async appendSessionEntries(id, entries) {
      const s = state.sessions.find((x) => x.id === id && x.status === 'aberta')
      if (!s) return null
      s.entries = [...s.entries, ...entries]
      return clone(s)
    },
    async insertRows(table, rows) {
      const list = herdList(table)
      const saved = rows.map((r) => ({ id: uuid(), created_at: nowIso(), ...r }))
      list.push(...saved)
      return clone(saved)
    },
    async updateRow(table, id, patch) {
      const list = herdList(table)
      const row = list.find((r) => r.id === id)
      if (!row) return null
      const before = Object.fromEntries(Object.keys(patch).map((k) => [k, row[k] ?? null]))
      Object.assign(row, patch)
      return before
    },
    async deleteRows(table, ids) {
      const list = herdList(table)
      const keep = list.filter((r) => !ids.includes(r.id))
      list.splice(0, list.length, ...keep)
    },
    async uploadMedia(path, bytes, mime) {
      state.media.push({ path, mime, size: bytes?.length ?? 0 })
      return path
    },
    async staleInbound() {
      const limit = new Date(Date.now() - 2 * 60000).toISOString()
      return clone(state.messages.filter((m) => m.direction === 'in' && ['recebido', 'erro', 'processando'].includes(m.status) && (m.attempts ?? 0) < 4 && m.updated_at < limit))
    },
    async pendingActions() {
      return clone(state.actions.filter((a) => a.status === 'pendente'))
    },
    async openSessions() {
      return clone(state.sessions.filter((s) => s.status === 'aberta'))
    }
  }
}

// ------------------------------------------------------------------
// Supabase
// ------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
export const supabaseReady = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY)

let cachedClient = null
export function serviceClient() {
  if (!supabaseReady) return null
  if (!cachedClient) cachedClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  return cachedClient
}

async function fetchAll(query) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

function must({ data, error }) {
  if (error) throw error
  return data
}

export function supabaseStore(db = serviceClient()) {
  if (!db) throw new Error('Supabase não configurado (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY).')
  const leaseMs = 90 * 1000
  return {
    kind: 'supabase',
    db,
    async loadSnapshot() {
      const since = new Date(Date.now() - 400 * 86400000).toISOString()
      const [animals, attempts, health, weighings, occurrences, protocols, settings] = await Promise.all([
        fetchAll(() => db.from('animals').select('*').order('id')),
        fetchAll(() => db.from('breeding_attempts').select('*').order('id')),
        fetchAll(() => db.from('health_events').select('*').order('id')),
        fetchAll(() => db.from('weighings').select('*').order('id')),
        fetchAll(() => db.from('occurrences').select('*').gte('created_at', since).order('id')),
        db.from('repro_protocols').select('*').order('name').then(must),
        db.from('farm_settings').select('*').eq('id', 1).maybeSingle().then(must)
      ])
      return {
        animals, attempts, health, weighings, occurrences, counts: [],
        protocols: withDefaultProtocols(protocols),
        settings: { ...defaultSettings, ...(settings ?? {}) }
      }
    },
    async getContactByPhone(phone) {
      return must(await db.from('whatsapp_contacts').select('*').eq('phone', phone).eq('active', true).maybeSingle())
    },
    async getContact(id) {
      return must(await db.from('whatsapp_contacts').select('*').eq('id', id).maybeSingle())
    },
    async touchContact(id) {
      await db.from('whatsapp_contacts').update({ last_seen_at: nowIso() }).eq('id', id)
    },
    /** Trava curta por contato. Quem não consegue, tenta de novo em instantes. */
    async acquireLease(contactId) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const now = nowIso()
        const { data } = await db.from('whatsapp_contacts')
          .update({ processing_until: new Date(Date.now() + leaseMs).toISOString() })
          .eq('id', contactId)
          .or(`processing_until.is.null,processing_until.lt.${now}`)
          .select('id')
        if (data?.length) return true
        await new Promise((r) => setTimeout(r, 1500))
      }
      return false
    },
    async releaseLease(contactId) {
      await db.from('whatsapp_contacts').update({ processing_until: null }).eq('id', contactId)
    },
    async insertMessage(row) {
      const { data, error } = await db.from('whatsapp_messages').insert(row).select().single()
      if (error?.code === '23505' && row.wamid) {
        const existing = must(await db.from('whatsapp_messages').select('*').eq('wamid', row.wamid).maybeSingle())
        return { duplicate: true, row: existing }
      }
      if (error) throw error
      return { duplicate: false, row: data }
    },
    async getMessage(id) {
      return must(await db.from('whatsapp_messages').select('*').eq('id', id).maybeSingle())
    },
    async updateMessage(id, patch) {
      return must(await db.from('whatsapp_messages').update(patch).eq('id', id).select().maybeSingle())
    },
    async updateMessageByWamid(wamid, patch) {
      return must(await db.from('whatsapp_messages').update(patch).eq('wamid', wamid).select().maybeSingle())
    },
    async updateDelivery(wamid, status, error) {
      await db.from('whatsapp_messages').update({ status, ...(error ? { error } : {}) }).eq('wamid', wamid).in('status', lowerDelivery(status))
    },
    async claimMessage(id) {
      const current = must(await db.from('whatsapp_messages').select('attempts,status').eq('id', id).maybeSingle())
      if (!current || !['recebido', 'erro'].includes(current.status)) return null
      const { data } = await db.from('whatsapp_messages')
        .update({ status: 'processando', attempts: (current.attempts ?? 0) + 1 })
        .eq('id', id).in('status', ['recebido', 'erro']).select().maybeSingle()
      return data ?? null
    },
    async pendingInbound(phone) {
      return must(await db.from('whatsapp_messages').select('*')
        .eq('direction', 'in').eq('phone', phone).in('status', ['recebido', 'erro']).lt('attempts', 4)
        .order('sent_at', { ascending: true }).limit(20))
    },
    async recentConversation(phone, since, limit = 12) {
      const rows = must(await db.from('whatsapp_messages').select('direction,kind,body,transcription,sent_at,received_at,simulated')
        .eq('phone', phone).gte('received_at', since).order('received_at', { ascending: false }).limit(limit))
      return rows.reverse()
    },
    async lastOutboundAt(phone) {
      const row = must(await db.from('whatsapp_messages').select('received_at').eq('phone', phone).eq('direction', 'out').order('received_at', { ascending: false }).limit(1).maybeSingle())
      return row?.received_at ?? null
    },
    async lastInboundAt(phone) {
      const row = must(await db.from('whatsapp_messages').select('sent_at,received_at').eq('phone', phone).eq('direction', 'in').order('received_at', { ascending: false }).limit(1).maybeSingle())
      return row ? row.sent_at ?? row.received_at : null
    },
    async createAction(row) {
      for (let i = 0; i < 5; i++) {
        const { data, error } = await db.from('whatsapp_actions').insert({ ...row, code: newCode() }).select().single()
        if (!error) return data
        if (error.code !== '23505') throw error
      }
      throw new Error('Não foi possível gerar um código de lançamento.')
    },
    async getAction(id) {
      return must(await db.from('whatsapp_actions').select('*').eq('id', id).maybeSingle())
    },
    async getActionByCode(code) {
      return must(await db.from('whatsapp_actions').select('*').eq('code', String(code).toUpperCase()).maybeSingle())
    },
    async listActions({ contactId, status, since, limit = 30 } = {}) {
      let q = db.from('whatsapp_actions').select('*').order('created_at', { ascending: false }).limit(limit)
      if (contactId) q = q.eq('contact_id', contactId)
      if (status) q = q.in('status', [].concat(status))
      if (since) q = q.gte('created_at', since)
      return must(await q)
    },
    /** Atualiza só se o status ainda for o esperado: dois toques no "Confirmar" gravam uma vez só. */
    async claimAction(id, fromStatus, patch) {
      const { data, error } = await db.from('whatsapp_actions').update(patch).eq('id', id).in('status', [].concat(fromStatus)).select().maybeSingle()
      if (error) throw error
      return data ?? null
    },
    async updateAction(id, patch) {
      return must(await db.from('whatsapp_actions').update(patch).eq('id', id).select().maybeSingle())
    },
    async getOpenSession(contactId) {
      return must(await db.from('whatsapp_sessions').select('*').eq('contact_id', contactId).eq('status', 'aberta').order('started_at', { ascending: false }).limit(1).maybeSingle())
    },
    async createSession(row) {
      // Um lote aberto por vez: abrir outro cancela o anterior.
      if (row.contact_id) await db.from('whatsapp_sessions').update({ status: 'cancelada', closed_at: nowIso() }).eq('contact_id', row.contact_id).eq('status', 'aberta')
      return must(await db.from('whatsapp_sessions').insert(row).select().single())
    },
    async updateSession(id, patch) {
      return must(await db.from('whatsapp_sessions').update(patch).eq('id', id).select().maybeSingle())
    },
    async appendSessionEntries(id, entries) {
      const { data, error } = await db.rpc('whatsapp_session_append', { p_session: id, p_entries: entries })
      if (error) throw error
      return Array.isArray(data) ? data[0] ?? null : data
    },
    async insertRows(table, rows) {
      return must(await db.from(table).insert(rows).select())
    },
    async updateRow(table, id, patch) {
      const before = must(await db.from(table).select(Object.keys(patch).join(',')).eq('id', id).maybeSingle())
      if (!before) return null
      must(await db.from(table).update(patch).eq('id', id).select('id'))
      return before
    },
    async deleteRows(table, ids) {
      if (!ids.length) return
      must(await db.from(table).delete().in('id', ids).select('id'))
    },
    async uploadMedia(path, bytes, mime) {
      const { error } = await db.storage.from('whatsapp-media').upload(path, bytes, { contentType: mime, upsert: true })
      if (error) throw error
      return path
    },
    async staleInbound() {
      const limit = new Date(Date.now() - 2 * 60000).toISOString()
      const since = new Date(Date.now() - 48 * 3600000).toISOString()
      return must(await db.from('whatsapp_messages').select('*')
        .eq('direction', 'in').in('status', ['recebido', 'erro', 'processando']).lt('attempts', 4)
        .lt('updated_at', limit).gte('received_at', since).order('sent_at').limit(50))
    },
    async pendingActions() {
      return must(await db.from('whatsapp_actions').select('*').eq('status', 'pendente').eq('simulated', false).limit(200))
    },
    async openSessions() {
      return must(await db.from('whatsapp_sessions').select('*').eq('status', 'aberta').eq('simulated', false).limit(100))
    }
  }
}
