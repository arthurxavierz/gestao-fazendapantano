// Edge Function: analisar-foto
//
// Recebe a foto de um animal em base64 e devolve o que o Gemini interpretou:
// número do brinco, pelagem e uma sugestão de raça, cada um com nível de confiança.
//
// A chave do Gemini fica somente aqui, no servidor. O navegador nunca a enxerga.
// Configure com:  supabase secrets set GEMINI_API_KEY=...

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
// Modelos do Gemini saem de circulação com frequência, e contas novas perdem
// acesso aos antigos antes das existentes. Se a análise passar a responder
// "no longer available", troque pelo secret GEMINI_MODEL sem mexer no código.
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash'
const MAX_IMAGE_BYTES = 6 * 1024 * 1024

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

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
   Nunca escreva "branco", "preto" ou "malhado": a concordância é feminina.

4. "raca_sugerida": a raça mais provável considerando pelagem, cupim, orelhas,
   barbela e porte. Raças comuns no Brasil: Nelore, Guzerá, Gir, Girolando,
   Brahman, Tabapuã, Angus, Brangus, Senepol, Holandesa, Canchim.
   Se for claramente cruzamento, escreva "Cruzamento" ou "Cruzamento (Nelore x Angus)".

5. "raca_confianca": mesma escala. Seja honesto: pelagem NÃO determina raça.
   Nelore e Tabapuã são praticamente indistinguíveis em foto, e cruzamento é
   estimativa. Use "alta" apenas para casos evidentes, como Nelore branco com
   cupim marcado ou Angus preto mocho.

6. "observacao": no máximo uma frase curta, só se houver algo visualmente
   relevante para o manejo (magreza aparente, ferimento visível, claudicação,
   brinco rasgado). Caso contrário, string vazia. Não diagnostique doença.`

const responseSchema = {
  type: 'OBJECT',
  properties: {
    numero: { type: 'STRING' },
    numero_confianca: { type: 'STRING', enum: ['alta', 'media', 'baixa', 'ilegivel'] },
    pelagem: { type: 'STRING' },
    raca_sugerida: { type: 'STRING' },
    raca_confianca: { type: 'STRING', enum: ['alta', 'media', 'baixa', 'ilegivel'] },
    observacao: { type: 'STRING' }
  },
  required: ['numero', 'numero_confianca', 'pelagem', 'raca_sugerida', 'raca_confianca', 'observacao']
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
  try {
    const body = await request.json()
    imageBase64 = String(body.imageBase64 ?? '')
    mimeType = String(body.mimeType ?? 'image/jpeg')
  } catch {
    return json({ error: 'Não foi possível ler os dados enviados.' }, 400)
  }

  if (!imageBase64) return json({ error: 'Nenhuma imagem foi enviada.' }, 400)
  // base64 ocupa ~4/3 do tamanho original.
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
            { text: PROMPT }
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
    return json({ error: 'Não foi possível falar com o serviço de análise. Verifique a internet.' }, 502)
  }

  if (geminiResponse.status === 429) {
    return json({ error: 'Limite gratuito de análises atingido por agora. Tente de novo em alguns minutos.' }, 429)
  }

  if (!geminiResponse.ok) {
    const raw = await geminiResponse.text()
    console.error('Erro do Gemini:', geminiResponse.status, raw)

    // Repassa o motivo informado pelo Google para encurtar a configuração.
    // Essas mensagens descrevem o problema da chave e não expõem o valor dela.
    let reason = ''
    try {
      reason = String(JSON.parse(raw)?.error?.message ?? '')
    } catch {
      reason = ''
    }

    return json({
      error: 'O serviço de análise recusou a solicitação.',
      detail: reason.slice(0, 300) || `HTTP ${geminiResponse.status}`
    }, 502)
  }

  const payload = await geminiResponse.json()

  if (payload?.promptFeedback?.blockReason) {
    return json({ error: 'A imagem foi bloqueada pelo filtro de conteúdo do serviço.' }, 422)
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) return json({ error: 'O serviço não devolveu uma leitura para esta foto.' }, 502)

  try {
    const analysis = JSON.parse(text)
    return json({ analysis, modelo: GEMINI_MODEL })
  } catch {
    console.error('Resposta não era JSON válido:', text)
    return json({ error: 'A resposta do serviço veio em formato inesperado.' }, 502)
  }
})
