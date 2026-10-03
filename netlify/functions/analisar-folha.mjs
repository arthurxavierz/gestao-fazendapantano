// Leitura de folha de campo por IA.
//
// O sistema imprime a folha com o número de cada animal JÁ IMPRESSO. No curral,
// a equipe só marca um X e escreve valores curtos à caneta. A foto da folha
// preenchida chega aqui junto com a lista de números impressos, para a IA casar
// cada linha com o animal certo em vez de adivinhar dígitos manuscritos.
//
// Nada é gravado aqui: o resultado volta para uma tela de conferência e só vira
// registro depois que uma pessoa confirma.

import { GEMINI_API_KEY, GEMINI_MODEL, askGemini, authorize, json, notConfigured, rateLimited, readImageBody } from '../lib/shared.mjs'

/** Colunas de cada folha, iguais às impressas pelo sistema. */
const SHEETS = {
  diagnostico: {
    contexto: 'É uma folha de DIAGNÓSTICO DE GESTAÇÃO. Cada linha tem duas colunas de marcação: "Prenhe" e "Vazia". A equipe marca um X em uma delas.',
    marca: 'Prenhe',
    marcaRegra: '"marcado" é true quando o X está na coluna "Prenhe" e false quando o X está na coluna "Vazia". Se nenhuma das duas estiver marcada, use false e "marcado_confianca": "ilegivel".',
    valor: 'nenhuma (devolva sempre string vazia em "valor")'
  },
  pesagem: {
    contexto: 'É uma folha de PESAGEM. A coluna "Peso (kg)" recebe o peso escrito à mão. A coluna "Presente" recebe um X quando o animal passou pela balança.',
    marca: 'Presente',
    marcaRegra: '"marcado" é true quando há X na coluna "Presente" OU quando há um peso escrito na linha.',
    valor: '"Peso (kg)": transcreva só os algarismos do peso, com vírgula ou ponto se houver'
  },
  sanitario: {
    contexto: 'É uma folha de APLICAÇÃO SANITÁRIA (vacina, vermífugo ou medicamento). A coluna "Feito" recebe um X quando o animal recebeu a aplicação.',
    marca: 'Feito',
    marcaRegra: '"marcado" é true quando há X, tique ou risco na coluna "Feito".',
    valor: '"Dose": o que estiver escrito, se houver'
  }
}

function buildPrompt(kind, numeros) {
  const cfg = SHEETS[kind] ?? SHEETS.pesagem
  const lista = numeros.length ? numeros.join(', ') : '(não informados)'
  return `Você lê uma FOLHA DE CAMPO de uma fazenda brasileira, impressa por um sistema e preenchida à mão com caneta. ${cfg.contexto}

Cada linha da tabela tem o número do animal JÁ IMPRESSO na coluna "Brinco". Os números impressos nesta folha são: ${lista}.

Para CADA linha com número impresso, devolva um objeto com:

1. "numero": o número impresso naquela linha. Use exatamente um dos números da lista acima.
2. "numero_confianca": "alta", "media", "baixa" ou "ilegivel", conforme a nitidez do número impresso.
3. "marcado": ${cfg.marcaRegra}
4. "marcado_confianca": "alta" quando a marca (ou a ausência dela) é evidente; "media" ou "baixa" quando está fraca, borrada ou ambígua; "ilegivel" quando não dá para saber.
5. "valor": coluna ${cfg.valor}. Transcreva exatamente o que lê. Se estiver vazio ou ilegível, string vazia. NUNCA invente.
6. "observacao": o que estiver escrito na coluna "Observação", se houver. Caso contrário, string vazia.

Regras:
- NUNCA invente números, marcas ou valores. É melhor admitir baixa confiança do que errar.
- Devolva as linhas na ordem em que aparecem na folha.
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
          numero: { type: 'STRING' },
          numero_confianca: { type: 'STRING', enum: levels },
          marcado: { type: 'BOOLEAN' },
          marcado_confianca: { type: 'STRING', enum: levels },
          valor: { type: 'STRING' },
          observacao: { type: 'STRING' }
        },
        required: ['numero', 'numero_confianca', 'marcado', 'marcado_confianca', 'valor', 'observacao']
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

  const input = await readImageBody(request, 8 * 1024 * 1024)
  if (input.error) return input.error
  const kind = String(input.body.kind ?? 'pesagem')
  const numeros = Array.isArray(input.body.numeros) ? input.body.numeros.map((item) => String(item)).slice(0, 300) : []

  const result = await askGemini({ imageBase64: input.imageBase64, mimeType: input.mimeType, prompt: buildPrompt(kind, numeros), schema })
  if (result.error) return result.error
  return json({ linhas: Array.isArray(result.data?.linhas) ? result.data.linhas : [], modelo: GEMINI_MODEL })
}
