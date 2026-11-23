// Webhook do WhatsApp (Meta Cloud API).
//
// URL para cadastrar no painel da Meta:  https://SEU-SITE/api/whatsapp
//   GET  -> verificação inicial (hub.challenge)
//   POST -> mensagens e avisos de entrega
//
// Esta função só confere a assinatura, guarda e responde 200 em menos de um
// segundo. O trabalho pesado (transcrever, IA, responder) acontece na função
// de fundo. Se o banco estiver fora do ar, devolvemos erro e a própria Meta
// reenvia o aviso depois: a mensagem do peão não se perde.

import { parseWebhook, signatureReady, verifySignature, VERIFY_TOKEN } from '../lib/campo/whatsapp.mjs'
import { productionDeps, siteOrigin, triggerProcessing } from '../lib/campo/servidor.mjs'
import { storeIncoming } from '../lib/campo/fluxo.mjs'
import { supabaseReady } from '../lib/campo/armazem.mjs'

export default async (request) => {
  if (request.method === 'GET') {
    const url = new URL(request.url)
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === VERIFY_TOKEN
    return ok ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 }) : new Response('Token de verificação inválido', { status: 403 })
  }
  if (request.method !== 'POST') return new Response('Método não permitido', { status: 405 })

  const raw = await request.text()
  if (!signatureReady && process.env.WHATSAPP_SKIP_SIGNATURE !== '1') {
    console.error('WHATSAPP_APP_SECRET não configurado: aviso recusado.')
    return new Response('Assinatura não configurada', { status: 503 })
  }
  if (signatureReady && !verifySignature(raw, request.headers.get('x-hub-signature-256'))) {
    console.warn(`Assinatura inválida: recebida ${String(request.headers.get('x-hub-signature-256') || 'nenhuma').slice(0, 16)}..., ${raw.length} bytes. Confira WHATSAPP_APP_SECRET (Configurações do app > Básico > Chave secreta).`)
    return new Response('Assinatura inválida', { status: 401 })
  }
  if (!supabaseReady) return new Response('Banco não configurado', { status: 503 })

  let body
  try { body = JSON.parse(raw) } catch { return new Response('JSON inválido', { status: 400 }) }
  const parsed = parseWebhook(body)
  if (!parsed.messages.length && !parsed.statuses.length) return new Response('ok', { status: 200 })

  try {
    const { store } = productionDeps()
    const phones = await storeIncoming(store, parsed)
    await triggerProcessing(siteOrigin(request), phones)
  } catch (error) {
    console.error('Falha ao guardar aviso do WhatsApp; a Meta vai reenviar.', error)
    return new Response('Falha temporária', { status: 500 })
  }
  return new Response('ok', { status: 200 })
}
