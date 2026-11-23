// Rotina agendada do WhatsApp, a cada 10 minutos.
// Reprocessa mensagens que ficaram para trás, lembra o que falta confirmar e
// expira o que ninguém confirmou em 24 h. O processamento pesado vai para a
// função de fundo, porque a agendada tem pouco tempo de execução.

import { supabaseReady } from '../lib/campo/armazem.mjs'
import { runRoutine } from '../lib/campo/fluxo.mjs'
import { productionDeps, triggerProcessing } from '../lib/campo/servidor.mjs'
import { whatsappReady } from '../lib/campo/whatsapp.mjs'

export default async () => {
  if (!supabaseReady || !whatsappReady) return new Response('não configurado')
  const report = await runRoutine(productionDeps())
  const origin = process.env.DEPLOY_PRIME_URL || process.env.URL
  if (report.reprocessar.length && origin) await triggerProcessing(origin, report.reprocessar)
  console.log('Rotina do WhatsApp', report)
  return new Response(JSON.stringify(report))
}

export const config = { schedule: '*/10 * * * *' }
