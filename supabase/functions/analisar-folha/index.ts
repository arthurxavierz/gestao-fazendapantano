// Edge Function: analisar-folha
//
// Recebe a foto de uma folha de campo (protocolo reprodutivo ou manejo) já
// preenchida à caneta pelos peões e devolve, linha por linha, o número do
// animal, se a marca principal foi feita, o valor escrito à mão e uma
// observação — cada um com nível de confiança.
//
// O número de cada animal já vai IMPRESSO na folha e é enviado aqui em
// "numeros". Assim a IA casa cada linha com o animal certo em vez de tentar
// adivinhar dígitos manuscritos, que é a parte mais frágil.
//
// A chave do Gemini fica somente aqui, no servidor. O navegador nunca a enxerga.
// Configure com:  supabase secrets set GEMINI_API_KEY=...

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const columnByKind: Record<string, { marca: string; valor: string; contexto: string }> = {
  reproducao: {
    marca: 'Prenha',
    valor: 'Data do protocolo',
    contexto: 'É uma folha de protocolo reprodutivo. A coluna "Prenha" recebe um X quando o diagnóstico deu prenha; sem X significa vazia.'
  },
  manejo: {
    marca: 'Feito',
    valor: 'Peso (kg)',
    contexto: 'É uma folha de manejo. A coluna "Feito" recebe um X quando o animal foi manejado. A coluna de peso pode trazer um número escrito à mão.'
  }
}

function buildPrompt(kind: string, numeros: string[]) {
  const cfg = columnByKind[kind] ?? columnByKind.manejo
  const lista = numeros.length ? numeros.join(', ') : '(não informados)'
  return `Você lê uma FOLHA DE CAMPO de uma fazenda brasileira, preenchida à mão com caneta. ${cfg.contexto}

Cada linha da tabela tem o número do animal JÁ IMPRESSO na primeira coluna. Os números impressos nesta folha são: ${lista}.

Para CADA linha que você conseguir enxergar, devolva um objeto com:

1. "numero": o número do animal impresso naquela linha. Case sempre com um dos números da lista acima; se estiver entre eles, use exatamente aquele valor. Se a linha estiver em branco (sem número impresso), ignore-a e não a inclua.

2. "numero_confianca": "alta", "media", "baixa" ou "ilegivel", conforme a nitidez do número impresso.

3. "marcado": true se a coluna "${cfg.marca}" desta linha tem um X, tique, risco ou qualquer marca de caneta; false se está em branco. Na dúvida entre marcado e vazio, use false e sinalize na confiança.

4. "marcado_confianca": "alta" quando a marca (ou a ausência dela) é evidente; "media" ou "baixa" quando a marca é fraca, borrada ou ambígua; "ilegivel" quando a célula está ilegível.

5. "valor": o que estiver escrito à mão na coluna "${cfg.valor}" desta linha (uma data ou um número). Transcreva exatamente o que lê. Se estiver vazio ou ilegível, devolva string vazia. NUNCA invente.

6. "observacao": o que estiver escrito na coluna de observação, se houver. Caso contrário, string vazia.

Regras gerais:
- NUNCA invente números, marcas ou valores. É muito melhor admitir baixa confiança do que errar.
- Devolva as linhas na mesma ordem em que aparecem na folha.
- Devolva SOMENTE o JSON pedido, no formato { "linhas": [ ... ] }.`
}

const responseSchema = {
  type: 'OBJECT',
  properties: {
    linhas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          numero: { type: 'STRING' },
          numero_confianca: { type: 'STRING', enum: ['alta', 'media', 'baixa', 'ilegivel'] },
          marcado: { type: 'BOOLEAN' },
          marcado_confianca: { type: 'STRING', enum: ['alta', 'media', 'baixa', 'ilegivel'] },
          valor: { type: 'STRING' },
          observacao: { type: 'STRING' }
        },
        required: ['numero', 'numero_confianca', 'marcado', 'marcado_confianca', 'valor', 'observacao']
      }
    }
  },
  required: ['linhas']
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  if (!GEMINI_API_KEY) {
    return json({ error: 'A chave do Gemini não foi configurada no servidor.' }, 500)
  }

  let imageBase64: string
  let mimeType: string
  let kind: string
  let numeros: string[]
  try {
    const body = await request.json()
    imageBase64 = String(body.imageBase64 ?? '')
    mimeType = String(body.mimeType ?? 'image/jpeg')
    kind = String(body.kind ?? 'manejo')
    numeros = Array.isArray(body.numeros) ? body.numeros.map((item: unknown) => String(item)) : []
  } catch {
    return json({ error: 'Não foi possível ler os dados enviados.' }, 400)
  }

  if (!imageBase64) return json({ error: 'Nenhuma imagem foi enviada.' }, 400)
  if (imageBase64.length * 0.75 > MAX_IMAGE_BYTES) {
    return json({ error: 'A imagem é grande demais. Reduza a foto e tente novamente.' }, 413)
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

  let geminiResponse: Response
  try {
    geminiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: buildPrompt(kind, numeros) }
          ]
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema
        }
      })
    })
  } catch {
    return json({ error: 'Não foi possível falar com o serviço de leitura. Verifique a internet.' }, 502)
  }

  if (geminiResponse.status === 429) {
    return json({ error: 'Limite gratuito de leituras atingido por agora. Tente de novo em alguns minutos.' }, 429)
  }

  if (!geminiResponse.ok) {
    const raw = await geminiResponse.text()
    console.error('Erro do Gemini:', geminiResponse.status, raw)
    let reason = ''
    try {
      reason = String(JSON.parse(raw)?.error?.message ?? '')
    } catch {
      reason = ''
    }
    return json({
      error: 'O serviço de leitura recusou a solicitação.',
      detail: reason.slice(0, 300) || `HTTP ${geminiResponse.status}`
    }, 502)
  }

  const payload = await geminiResponse.json()

  if (payload?.promptFeedback?.blockReason) {
    return json({ error: 'A imagem foi bloqueada pelo filtro de conteúdo do serviço.' }, 422)
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) return json({ error: 'O serviço não devolveu uma leitura para esta folha.' }, 502)

  try {
    const parsed = JSON.parse(text)
    const linhas = Array.isArray(parsed?.linhas) ? parsed.linhas : []
    return json({ linhas, modelo: GEMINI_MODEL })
  } catch {
    console.error('Resposta não era JSON válido:', text)
    return json({ error: 'A resposta do serviço veio em formato inesperado.' }, 502)
  }
})
