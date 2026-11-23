// Processamento das mensagens do WhatsApp em segundo plano (até 15 minutos).
// Chamada pelo webhook e pela rotina agendada, nunca pelo navegador.

import { processPhone } from '../lib/campo/fluxo.mjs'
import { checkInternalKey, productionDeps } from '../lib/campo/servidor.mjs'

export default async (request) => {
  if (!checkInternalKey(request)) return new Response('Proibido', { status: 403 })
  let body
  try { body = await request.json() } catch { return new Response('JSON inválido', { status: 400 }) }
  const phones = [...new Set((body?.phones ?? []).map(String))].slice(0, 50)
  for (const phone of phones) {
    try {
      // Cada telefone com dependências novas: a fotografia do rebanho é recarregada.
      const result = await processPhone(productionDeps(), phone)
      console.log('Processado', phone, result)
    } catch (error) {
      console.error('Falha ao processar telefone', phone, error)
    }
  }
  return new Response('ok')
}
