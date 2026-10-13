// Leitura da foto do QUADRO DE CAMPO (lona) por IA.
//
// O quadro é impresso pelo sistema com os brincos já escritos; a equipe anota
// à caneta, na coluna ANOTAÇÃO, um CÓDIGO e um detalhe. Esta função transcreve
// essas anotações em linhas Data, Brinco, Código, Detalhe. Nada é gravado aqui:
// o resultado volta para a tela de lançamento, onde uma pessoa confere.

import { GEMINI_API_KEY, GEMINI_MODEL, askGemini, authorize, json, notConfigured, rateLimited, readImageBody } from '../lib/shared.mjs'

function buildPrompt(brincos) {
  const lista = brincos.length ? brincos.join(', ') : '(não informados)'
  return `Você lê a foto de um QUADRO DE CAMPO de uma fazenda de gado no Brasil. O quadro foi impresso por um sistema, com uma linha por animal (colunas Brinco, Sexo, Faixa, Situação, Pend. e ANOTAÇÃO), e preenchido à mão com caneta na coluna ANOTAÇÃO. À direita há um bloco de OCORRÊNCIAS com colunas Data, Brinco, Cód. e o que aconteceu.

Códigos usados nas anotações:
N = nasceu bezerro (detalhe: sexo do bezerro, M ou F)
M = morreu
S = saiu / vendeu (detalhe: venda ou descarte)
V = vacina ou remédio (detalhe: qual)
F = faltou no manejo (detalhe: qual manejo)
P = protocolo (detalhe vazio = novo protocolo; "prenha" ou "vazia" = resultado)
D = dado (ex.: sexo M, faixa 13 a 24, nasc 10/03/2025)
O = outro

Brincos cadastrados (use exatamente um destes quando a anotação estiver na linha de um animal): ${lista}.

Para CADA anotação manuscrita (na coluna ANOTAÇÃO ou no bloco de OCORRÊNCIAS), devolva um objeto:
1. "data": a data escrita, no formato DD/MM/AAAA; se não houver data, string vazia.
2. "brinco": o brinco IMPRESSO na linha onde a anotação foi feita (ou o brinco escrito no bloco de ocorrências).
3. "codigo": uma letra entre N, M, S, V, F, P, D, O. Se não reconhecer, string vazia.
4. "detalhe": o restante do que está escrito, transcrito sem inventar.
5. "confianca": "alta", "media", "baixa" ou "ilegivel".

Regras:
- Ignore linhas sem anotação manuscrita. NÃO devolva os dados impressos (sexo, faixa, situação) como anotação.
- NUNCA invente brincos, códigos ou detalhes. É melhor marcar baixa confiança.
- Devolva SOMENTE o JSON pedido, no formato { "linhas": [ ... ] }.`
}

const levels = ['alta', 'media', 'baixa', 'ilegivel']
const schema = {
  type: 'OBJECT',
  properties: {
    linhas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          data: { type: 'STRING' },
          brinco: { type: 'STRING' },
          codigo: { type: 'STRING' },
          detalhe: { type: 'STRING' },
          confianca: { type: 'STRING', enum: levels }
        },
        required: ['data', 'brinco', 'codigo', 'detalhe', 'confianca']
      }
    }
  },
  required: ['linhas']
}

export default async (request) => {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  if (!GEMINI_API_KEY) return notConfigured()
  const auth = await authorize(request)
  if (!auth.ok) return auth.response
  if (rateLimited(request)) return json({ error: 'Muitas leituras seguidas. Aguarde alguns minutos.' }, 429)

  const input = await readImageBody(request, 9 * 1024 * 1024)
  if (input.error) return input.error
  const brincos = Array.isArray(input.body.brincos) ? input.body.brincos.map((item) => String(item)).slice(0, 1500) : []

  const result = await askGemini({ imageBase64: input.imageBase64, mimeType: input.mimeType, prompt: buildPrompt(brincos), schema })
  if (result.error) return result.error
  const linhas = Array.isArray(result.data?.linhas) ? result.data.linhas : []
  return json({ linhas: linhas.filter((item) => item && String(item.brinco ?? '').trim()), modelo: GEMINI_MODEL })
}
