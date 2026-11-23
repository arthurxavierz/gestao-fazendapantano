// Transcrição dos áudios do WhatsApp com o Gemini.
//
// O Claude não recebe áudio, então o Gemini faz só esta parte: ouvir e
// escrever. Quem interpreta e decide o que lançar é o Claude, depois.

import { GEMINI_API_KEY } from '../shared.mjs'

const MODEL = process.env.GEMINI_AUDIO_MODEL || process.env.GEMINI_MODEL || 'gemini-3.6-flash'

const PROMPT = `Transcreva este áudio de WhatsApp de um funcionário de uma fazenda de gado de corte no Brasil.

Regras:
- Escreva exatamente o que foi dito, em português, sem resumir e sem corrigir o sentido.
- Números de brinco e pesos SEMPRE em algarismos: "quatrocentos e um" vira 401, "quatro zero um" vira 401, "zero quarenta e dois" vira 042, "trezentos e oitenta quilos" vira 380 kg.
- Quando a pessoa soletra números em sequência ("quatro zero um, quatro zero dois") separe cada brinco por vírgula: 401, 402.
- Termos comuns que você vai ouvir: IATF, protocolo, D0, D8, D10, implante, retirada do implante, benzoato, cipionato, eCG, prostaglandina, inseminação, sêmen, touro, repasse, diagnóstico, toque, prenhe, vazia, parida, pariu, bezerro, bezerra, novilha, garrote, vaca, boi, aftosa, brucelose, raiva, clostridiose, ivermectina, vermífugo, carrapaticida, pour-on, mamite, bicheira, manqueira, curral, piquete, lote, desmama, apartação, arroba.
- Se um trecho estiver inaudível por vento, motor ou barulho de gado, escreva [inaudível] naquele ponto. Nunca invente.
- "confianca": "alta" se o áudio está claro; "media" se algum número ou palavra é duvidoso; "baixa" se boa parte está ruim.
- "duvidas": liste os trechos ou números de que você não tem certeza (vazio se nenhum).`

const schema = {
  type: 'OBJECT',
  properties: {
    texto: { type: 'STRING' },
    confianca: { type: 'STRING', enum: ['alta', 'media', 'baixa'] },
    duvidas: { type: 'ARRAY', items: { type: 'STRING' } }
  },
  required: ['texto', 'confianca', 'duvidas']
}

export const transcriberReady = Boolean(GEMINI_API_KEY)

export async function transcribeAudio(bytes, mime = 'audio/ogg') {
  if (!GEMINI_API_KEY) throw Object.assign(new Error('Transcrição não configurada (GEMINI_API_KEY).'), { permanent: true })
  const mimeType = String(mime).split(';')[0].trim() || 'audio/ogg'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: Buffer.from(bytes).toString('base64') } }, { text: PROMPT }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema }
    }),
    signal: AbortSignal.timeout(60000)
  })
  if (!response.ok) {
    const raw = await response.text()
    throw Object.assign(new Error(`Gemini ${response.status}: ${raw.slice(0, 300)}`), { transient: response.status === 429 || response.status >= 500 })
  }
  const payload = await response.json()
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('O Gemini não devolveu transcrição.')
  const data = JSON.parse(text)
  return { text: String(data.texto ?? '').trim(), confidence: data.confianca, doubts: data.duvidas ?? [], model: MODEL }
}
