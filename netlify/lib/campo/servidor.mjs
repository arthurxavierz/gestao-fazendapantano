// Peças comuns às funções do WhatsApp no Netlify.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { claudeReady, CLAUDE_MODEL } from './assistente.mjs'
import { supabaseReady, supabaseStore } from './armazem.mjs'
import { transcribeAudio, transcriberReady } from './transcrever.mjs'
import { cloudTransport, signatureReady, VERIFY_TOKEN, whatsappReady } from './whatsapp.mjs'

export const FARM_NAME = process.env.FARM_NAME || process.env.VITE_FARM_NAME || 'Fazenda Pântano'

export function productionDeps() {
  return { store: supabaseStore(), transport: cloudTransport, transcribe: transcribeAudio, farmName: FARM_NAME }
}

/** Chave interna para uma função chamar a outra. Derivada da service_role, que só o servidor tem. */
export function internalKey() {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || 'sem-chave').update('campo-interno-v1').digest('hex')
}

export function checkInternalKey(request) {
  const given = Buffer.from(request.headers.get('x-campo-chave') || '')
  const expected = Buffer.from(internalKey())
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** Pede à função de fundo para processar estes telefones. A rotina agendada cobre se falhar. */
export async function triggerProcessing(origin, phones) {
  if (!phones.length) return
  try {
    await fetch(`${origin}/.netlify/functions/whatsapp-processar-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-campo-chave': internalKey() },
      body: JSON.stringify({ phones }),
      signal: AbortSignal.timeout(4000)
    })
  } catch (error) {
    console.error('Não consegui acionar o processamento; a rotina agendada vai pegar.', error?.message ?? error)
  }
}

export function configStatus() {
  return {
    whatsapp: whatsappReady,
    assinatura: signatureReady,
    verificacao: Boolean(VERIFY_TOKEN),
    claude: claudeReady,
    modelo: CLAUDE_MODEL,
    transcricao: transcriberReady,
    banco: supabaseReady,
    modelo_aviso: Boolean(process.env.WHATSAPP_TEMPLATE_AVISO)
  }
}

/** Endereço deste mesmo deploy. process.env.URL é sempre o site principal, que pode não ter esta versão. */
export function siteOrigin(request) {
  if (request?.url) return new URL(request.url).origin
  return process.env.DEPLOY_PRIME_URL || process.env.URL || ''
}
