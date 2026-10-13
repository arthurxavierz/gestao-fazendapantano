// Leitura da FICHA DE CAMPO preenchida à caneta.
//
// O sistema imprime a ficha com o brinco de cada animal já escrito e
// quadradinhos para marcar com X. A foto da folha chega aqui junto com a lista
// de brincos impressos e as colunas da ficha. Nada é gravado: o resultado
// volta para a tela de conferência e só vira registro quando uma pessoa aplica.

import { GEMINI_API_KEY, GEMINI_MODEL, askGemini, authorize, json, notConfigured, rateLimited, readImageBody } from '../lib/shared.mjs'

function buildPrompt({ codigo, brincos, colunas, manejo }) {
  const cols = []
  if (manejo) cols.push(`"Veio": um quadradinho. X = o animal passou no manejo do dia (${manejo}). Vazio = faltou.`)
  if (colunas.sexo) cols.push('"Sexo": dois quadradinhos, M e F.')
  if (colunas.faixa) cols.push('"Faixa (meses)": quatro quadradinhos numerados 1, 2, 3, 4 (1 = 0 a 12, 2 = 13 a 24, 3 = 25 a 36, 4 = acima de 36).')
  if (colunas.peso) cols.push('"Peso (kg)": número escrito à mão.')
  if (colunas.diagnostico) cols.push('"Prenha · Vazia": dois quadradinhos, P e V.')
  if (colunas.saida) cols.push('"Saiu": três quadradinhos, M (morreu), V (vendeu), D (descarte).')
  cols.push('"Observação": texto livre escrito à mão.')

  return `Você lê a foto de uma FICHA DE CAMPO de uma fazenda de gado no Brasil (código ${codigo}). A ficha foi impressa por um sistema em folha A4 deitada, com uma linha por animal, e preenchida à mão com caneta no curral. A coluna "Brinco" já vem IMPRESSA; a coluna "Hoje" mostra o sexo e a faixa que o sistema tem hoje (é impressa, NÃO é marcação).

Colunas a ler em cada linha:
- ${cols.join('\n- ')}

Brincos impressos nesta ficha: ${brincos.join(', ')}.

Para CADA linha que aparece na foto, devolva um objeto:
1. "brinco": o brinco IMPRESSO na linha, exatamente como na lista acima.
2. "presente": true se o quadradinho "Veio" está marcado, false se está vazio${manejo ? '' : ' (esta ficha não tem a coluna; use null)'}.
3. "sexo": "M" ou "F" conforme o quadradinho marcado; "" se nenhum.
4. "faixa": "1", "2", "3" ou "4" conforme o quadradinho marcado; "" se nenhum.
5. "peso": o peso escrito, só algarismos (vírgula ou ponto se houver); "" se vazio.
6. "diagnostico": "prenha" se P marcado, "vazia" se V marcado; "" se nenhum.
7. "saida": "morte", "venda" ou "descarte" conforme M, V ou D marcado; "" se nenhum.
8. "observacao": o texto escrito à mão na coluna Observação, transcrito; "" se vazio.
9. "confianca": "alta" se tudo na linha está claro; "media" ou "baixa" se alguma marca está fraca, borrada, rasurada ou ambígua; "ilegivel" se não dá para ler a linha.

Regras:
- Uma marca é um X, um tique, um risco ou o quadradinho pintado. Quadradinho vazio NÃO é marca.
- Se houver duas marcas na mesma coluna (rasura), escolha a mais forte e use confiança "baixa".
- NUNCA invente marcas, pesos ou textos. Na dúvida, deixe vazio e baixe a confiança.
- Ignore o texto impresso (cabeçalho, coluna Hoje, número da linha).
- Devolva SOMENTE o JSON pedido, no formato { "codigo": "...", "pagina": número ou 0, "linhas": [ ... ] }.`
}

const levels = ['alta', 'media', 'baixa', 'ilegivel']
const schema = {
  type: 'OBJECT',
  properties: {
    codigo: { type: 'STRING' },
    pagina: { type: 'INTEGER' },
    linhas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          brinco: { type: 'STRING' },
          presente: { type: 'BOOLEAN', nullable: true },
          // Sem enum: o Gemini não aceita opção vazia. O app normaliza os valores.
          sexo: { type: 'STRING' },
          faixa: { type: 'STRING' },
          peso: { type: 'STRING' },
          diagnostico: { type: 'STRING' },
          saida: { type: 'STRING' },
          observacao: { type: 'STRING' },
          confianca: { type: 'STRING', enum: levels }
        },
        required: ['brinco', 'sexo', 'faixa', 'peso', 'diagnostico', 'saida', 'observacao', 'confianca']
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
  const body = input.body
  const brincos = Array.isArray(body.brincos) ? body.brincos.map((item) => String(item)).slice(0, 600) : []
  const colunas = { sexo: true, faixa: true, peso: true, diagnostico: true, saida: true, ...(body.colunas ?? {}) }
  const prompt = buildPrompt({ codigo: String(body.codigo ?? ''), brincos, colunas, manejo: body.manejo ? String(body.manejo) : '' })

  const result = await askGemini({ imageBase64: input.imageBase64, mimeType: input.mimeType, prompt, schema })
  if (result.error) return result.error
  const linhas = Array.isArray(result.data?.linhas) ? result.data.linhas : []
  return json({ codigo: result.data?.codigo ?? '', pagina: result.data?.pagina ?? 0, linhas, modelo: GEMINI_MODEL })
}
