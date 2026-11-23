// WhatsApp Cloud API (oficial da Meta).
//
// Variáveis no Netlify:
//   WHATSAPP_TOKEN            token permanente do usuário do sistema (Meta Business)
//   WHATSAPP_PHONE_NUMBER_ID  id do número (não é o número em si)
//   WHATSAPP_VERIFY_TOKEN     senha combinada para a Meta validar o webhook
//   WHATSAPP_APP_SECRET       segredo do app, confere a assinatura de cada aviso
//   WHATSAPP_TEMPLATE_AVISO   (opcional) modelo aprovado para avisar fora da janela de 24 h

import { createHmac, timingSafeEqual } from 'node:crypto'

const VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'
const TOKEN = process.env.WHATSAPP_TOKEN || ''
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || ''
export const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || ''
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || ''
const TEMPLATE = process.env.WHATSAPP_TEMPLATE_AVISO || ''
const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_IDIOMA || 'pt_BR'

export const whatsappReady = Boolean(TOKEN && PHONE_ID)
export const signatureReady = Boolean(APP_SECRET)

const BASE = `https://graph.facebook.com/${VERSION}`

/** Confere a assinatura X-Hub-Signature-256. Sem ela, qualquer um poderia forjar mensagens. */
export function verifySignature(rawBody, header, secret = APP_SECRET) {
  if (!secret) return false
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  const given = String(header || '')
  if (given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}

/** Só dígitos. A Meta manda "5534999998888"; o cadastro pode ter "+55 (34) 99999-8888". */
export function normPhone(value) {
  return String(value ?? '').replace(/\D+/g, '')
}

/**
 * Variações do mesmo celular. Números brasileiros antigos às vezes chegam sem
 * o 9 na frente (55 34 9999-8888), então procuramos com e sem ele.
 */
export function phoneVariants(phone) {
  const p = normPhone(phone)
  const out = new Set([p])
  const m = p.match(/^55(\d{2})(\d{8,9})$/)
  if (m) {
    if (m[2].length === 8) out.add(`55${m[1]}9${m[2]}`)
    if (m[2].length === 9 && m[2].startsWith('9')) out.add(`55${m[1]}${m[2].slice(1)}`)
  }
  return [...out]
}

/** Converte o aviso da Meta em uma lista simples de mensagens e de status de entrega. */
export function parseWebhook(body) {
  const messages = []
  const statuses = []
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {}
      const names = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]))
      for (const m of value.messages ?? []) {
        const base = {
          wamid: m.id,
          phone: normPhone(m.from),
          profileName: names.get(m.from) ?? null,
          sentAt: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
          contextWamid: m.context?.id ?? null,
          raw: m
        }
        switch (m.type) {
          case 'text':
            messages.push({ ...base, kind: 'text', text: m.text?.body ?? '' })
            break
          case 'audio':
            messages.push({ ...base, kind: 'audio', mediaId: m.audio?.id, mime: m.audio?.mime_type, voice: Boolean(m.audio?.voice) })
            break
          case 'image':
            messages.push({ ...base, kind: 'image', mediaId: m.image?.id, mime: m.image?.mime_type, text: m.image?.caption ?? '' })
            break
          case 'interactive': {
            const reply = m.interactive?.button_reply ?? m.interactive?.list_reply
            messages.push({ ...base, kind: 'button', buttonId: reply?.id ?? '', text: reply?.title ?? '' })
            break
          }
          case 'button':
            messages.push({ ...base, kind: 'button', buttonId: m.button?.payload ?? '', text: m.button?.text ?? '' })
            break
          default:
            messages.push({ ...base, kind: m.type || 'unknown', text: '' })
        }
      }
      for (const s of value.statuses ?? []) {
        statuses.push({
          wamid: s.id,
          status: s.status,
          at: s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : new Date().toISOString(),
          phone: normPhone(s.recipient_id),
          error: s.errors?.[0] ? `${s.errors[0].code}: ${s.errors[0].title ?? s.errors[0].message ?? ''}` : null
        })
      }
    }
  }
  return { messages, statuses }
}

/**
 * Envia tentando as variações do número (com e sem o 9). A Meta entrega o
 * contato brasileiro sem o 9, mas a lista de destinatários do número de
 * teste pode ter o cadastro com ele (erro 131030).
 */
async function graphTo(path, body) {
  let result
  for (const to of phoneVariants(body.to)) {
    result = await graph(path, { ...body, to })
    if (result.code !== 131030) return result
  }
  return result
}

async function graph(path, body) {
  let response
  try {
    response = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    })
  } catch (error) {
    return { ok: false, transient: true, error: `rede: ${error?.message ?? error}` }
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const code = data?.error?.code
    return {
      ok: false,
      code,
      // 131047: passou das 24 h sem o contato escrever. Só com modelo aprovado.
      outsideWindow: code === 131047,
      transient: response.status >= 500 || code === 131000 || code === 130429,
      error: `${code ?? response.status}: ${data?.error?.message ?? 'erro'}`
    }
  }
  return { ok: true, wamid: data?.messages?.[0]?.id ?? null }
}

/** Limites da Meta: corpo de 4096 caracteres, botões com título de até 20. */
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

export const cloudTransport = {
  kind: 'cloud',
  async sendText(to, text, { replyTo } = {}) {
    return graphTo(`${PHONE_ID}/messages`, {
      messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text',
      text: { body: clip(text, 4096), preview_url: false },
      ...(replyTo ? { context: { message_id: replyTo } } : {})
    })
  },
  async sendButtons(to, text, buttons, { replyTo } = {}) {
    return graphTo(`${PHONE_ID}/messages`, {
      messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive',
      ...(replyTo ? { context: { message_id: replyTo } } : {}),
      interactive: {
        type: 'button',
        body: { text: clip(text, 1024) },
        action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id.slice(0, 256), title: clip(b.title, 20) } })) }
      }
    })
  },
  /** Fora da janela de 24 h a Meta só aceita modelo aprovado. */
  async sendTemplate(to, text) {
    if (!TEMPLATE) return { ok: false, error: 'sem modelo aprovado (WHATSAPP_TEMPLATE_AVISO)' }
    return graphTo(`${PHONE_ID}/messages`, {
      messaging_product: 'whatsapp', to, type: 'template',
      template: { name: TEMPLATE, language: { code: TEMPLATE_LANG }, components: [{ type: 'body', parameters: [{ type: 'text', text: clip(text.replace(/\s*\n+\s*/g, ' · '), 900) }] }] }
    })
  },
  /** Dois tiques azuis e "digitando...": o peão vê na hora que a mensagem chegou. */
  async markRead(wamid) {
    return graphTo(`${PHONE_ID}/messages`, { messaging_product: 'whatsapp', status: 'read', message_id: wamid, typing_indicator: { type: 'text' } })
  },
  async downloadMedia(mediaId) {
    const meta = await fetch(`${BASE}/${mediaId}`, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(15000) })
    if (!meta.ok) throw new Error(`Mídia ${mediaId} indisponível (${meta.status})`)
    const info = await meta.json()
    const file = await fetch(info.url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(30000) })
    if (!file.ok) throw new Error(`Falha ao baixar a mídia (${file.status})`)
    return { bytes: Buffer.from(await file.arrayBuffer()), mime: info.mime_type, size: info.file_size }
  }
}

/** Transporte do simulador e dos testes: guarda o que seria enviado. */
export function captureTransport(media = {}) {
  const sent = []
  let n = 0
  const push = (item) => {
    const wamid = `sim.out.${Date.now()}.${n++}`
    sent.push({ ...item, wamid, at: new Date().toISOString() })
    return { ok: true, wamid }
  }
  return {
    kind: 'capture',
    sent,
    async sendText(to, text) { return push({ to, type: 'text', text }) },
    async sendButtons(to, text, buttons) { return push({ to, type: 'buttons', text, buttons }) },
    async sendTemplate(to, text) { return push({ to, type: 'template', text }) },
    async markRead() { return { ok: true } },
    async downloadMedia(mediaId) {
      const item = media[mediaId]
      if (!item) throw new Error('mídia não encontrada no simulador')
      return item
    }
  }
}
