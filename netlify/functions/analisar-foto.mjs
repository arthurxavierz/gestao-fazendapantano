// Leitura do brinco por IA: recebe a foto do animal e devolve número do brinco,
// pelagem e raça provável, cada um com nível de confiança.
//
// Variáveis no Netlify: GEMINI_API_KEY (obrigatória) e GEMINI_MODEL (opcional).

import { GEMINI_API_KEY, GEMINI_MODEL, askGemini, authorize, json, notConfigured, rateLimited, readImageBody } from '../lib/shared.mjs'

const PROMPT = `Você analisa fotografias de bovinos de uma fazenda brasileira de corte.

Devolva SOMENTE o JSON pedido, com estes campos:

1. "numero": o número de identificação escrito no brinco da orelha do animal.
   - Transcreva exatamente os dígitos que você consegue LER na imagem.
   - Se o brinco não aparece, está ilegível, coberto de barro, cortado ou virado,
     devolva string vazia e marque a confiança como "ilegivel".
   - NUNCA invente, complete ou adivinhe dígitos. É muito pior errar um número
     do que admitir que não deu para ler.

2. "numero_confianca": "alta" quando os dígitos estão nítidos e sem ambiguidade;
   "media" quando você leu mas algum dígito é discutível (3/8, 6/5, 1/7);
   "baixa" quando é quase um palpite; "ilegivel" quando não leu nada.

3. "pelagem": a aparência da pelagem, em uma ou duas palavras simples que um
   fazendeiro usaria. Escreva SEMPRE no feminino, concordando com a palavra
   "pelagem", e tudo em minúsculas. Exemplos corretos: "branca",
   "branca acinzentada", "vermelha", "preta", "pintada",
   "malhada preta e branca", "castanha".

4. "raca_sugerida": a raça mais provável considerando pelagem, cupim, orelhas,
   barbela e porte. Raças comuns no Brasil: Nelore, Guzerá, Gir, Girolando,
   Brahman, Tabapuã, Angus, Brangus, Senepol, Holandesa, Canchim.
   Se for claramente cruzamento, escreva "Cruzamento" ou "Cruzamento (Nelore x Angus)".

5. "raca_confianca": mesma escala. Seja honesto: pelagem NÃO determina raça.
   Use "alta" apenas para casos evidentes, como Nelore branco com cupim marcado
   ou Angus preto mocho.

6. "observacao": no máximo uma frase curta, só se houver algo visualmente
   relevante para o manejo (magreza aparente, ferimento visível, claudicação,
   brinco rasgado). Caso contrário, string vazia. Não diagnostique doença.`

const levels = ['alta', 'media', 'baixa', 'ilegivel']
const schema = {
  type: 'OBJECT',
  properties: {
    numero: { type: 'STRING' },
    numero_confianca: { type: 'STRING', enum: levels },
    pelagem: { type: 'STRING' },
    raca_sugerida: { type: 'STRING' },
    raca_confianca: { type: 'STRING', enum: levels },
    observacao: { type: 'STRING' }
  },
  required: ['numero', 'numero_confianca', 'pelagem', 'raca_sugerida', 'raca_confianca', 'observacao']
}

export default async (request) => {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  if (!GEMINI_API_KEY) return notConfigured()
  const auth = await authorize(request)
  if (!auth.ok) return auth.response
  if (rateLimited(request)) return json({ error: 'Muitas leituras seguidas. Aguarde alguns minutos.' }, 429)

  const input = await readImageBody(request, 6 * 1024 * 1024)
  if (input.error) return input.error

  const result = await askGemini({ imageBase64: input.imageBase64, mimeType: input.mimeType, prompt: PROMPT, schema })
  if (result.error) return result.error
  return json({ analysis: result.data, modelo: GEMINI_MODEL })
}
