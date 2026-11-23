// O cérebro do assistente: Claude com ferramentas.
//
// O Claude nunca escreve no banco. Ele tem dois tipos de ferramenta:
//   consultar_*  -> lê o rebanho e responde perguntas
//   registrar_*  -> PROPÕE um lançamento. O sistema confere com as regras,
//                   guarda como pendente e manda o cartão com "Confirmar".
// A gravação só acontece quando o peão confirma.

import Anthropic from '@anthropic-ai/sdk'
import {
  animalCard, farmContext, queryAgenda, queryHealth, queryHerd, queryOccurrences, queryReproduction, queryWeighings, resolveNumbers
} from './rebanho.mjs'

const API_KEY = process.env.ANTHROPIC_API_KEY || ''
export const claudeReady = Boolean(API_KEY)
// Sonnet 5.5 é o equilíbrio recomendado entre acerto e custo. Para testar
// outro, troque CLAUDE_MODEL no Netlify (claude-haiku-5-5, claude-opus-5-5).
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5'
const EFFORT = process.env.CLAUDE_EFFORT || ''
const FALLBACKS = process.env.CLAUDE_FALLBACKS !== 'off'
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
const MAX_TURNS = 8

let client = null
function anthropic() {
  if (!client) client = new Anthropic({ apiKey: API_KEY, maxRetries: 2, timeout: 90 * 1000 })
  return client
}

// ------------------------------------------------------------------
// Ferramentas
// ------------------------------------------------------------------

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description) => ({ type: 'number', description })
const numbers = (description = 'Números dos brincos, exatamente como ditos. Ex.: ["401", "402"]') => ({ type: 'array', items: { type: 'string' }, description })
const date = (description = 'Data do manejo no formato AAAA-MM-DD. Omita para usar a data em que a mensagem foi gravada.') => str(description)
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false })

const QUERY_TOOLS = [
  {
    name: 'buscar_animais',
    description: 'Ficha de um ou mais animais pelo brinco: sexo, categoria, lote, situação, reprodução (protocolo, prenhez, parto previsto), sanitário recente, peso, mãe e crias. Use sempre que a conversa citar um brinco específico.',
    input_schema: obj({ numeros: numbers() }, ['numeros'])
  },
  {
    name: 'consultar_rebanho',
    description: 'Contagem do rebanho ativo com filtros e agrupamento por categoria, lote e situação. Ex.: "quantas novilhas tem no lote 3", "quantos bois ativos", "quais vacas estão prenhes".',
    input_schema: obj({
      lote: str('Filtra pelo nome do lote.'),
      sexo: { type: 'string', enum: ['macho', 'femea'] },
      categoria: { type: 'string', enum: ['bezerro', 'bezerra', 'garrote', 'novilha', 'vaca', 'touro', 'boi'] },
      situacao: { type: 'string', enum: ['normal', 'observacao', 'doente', 'descarte'] },
      reproducao: { type: 'string', enum: ['vazia', 'em_protocolo', 'inseminada', 'prenhe', 'parida', 'descarte', 'nao_apta'], description: 'Estado reprodutivo das fêmeas.' },
      listar: { type: 'boolean', description: 'true para devolver também a lista de brincos.' }
    })
  },
  {
    name: 'consultar_reproducao',
    description: 'Protocolos, inseminações e diagnósticos, agrupados por data de início e protocolo, com resultados e taxa de prenhez. Ex.: "quantas vacas entraram no protocolo do dia 10", "quantas deram prenhe na última IATF", "quem foi inseminada com o touro X".',
    input_schema: obj({
      inicio_de: date('Início do protocolo a partir desta data (AAAA-MM-DD).'),
      inicio_ate: date('Início do protocolo até esta data (AAAA-MM-DD).'),
      inseminacao_de: date('Inseminação a partir desta data.'),
      inseminacao_ate: date('Inseminação até esta data.'),
      protocolo: str('Parte do nome do protocolo.'),
      resultado: { type: 'string', enum: ['pendente', 'prenhe', 'vazia', 'aborto', 'parida'] },
      touro: str('Touro ou sêmen.'),
      lote: str('Lote atual do animal.'),
      numeros: numbers('Restringe a estes brincos.')
    })
  },
  {
    name: 'consultar_sanitario',
    description: 'Vacinas, vermífugos e remédios aplicados, por data e produto, e quem está em carência hoje.',
    input_schema: obj({
      de: date('A partir de (AAAA-MM-DD).'), ate: date('Até (AAAA-MM-DD).'),
      produto: str('Parte do nome do produto.'),
      tipo: { type: 'string', enum: ['vacina', 'vermifugo', 'carrapaticida', 'medicamento', 'exame', 'outro'] },
      lote: str('Lote.'), numeros: numbers('Restringe a estes brincos.')
    })
  },
  {
    name: 'consultar_pesagens',
    description: 'Pesagens por dia, com média em kg e arrobas.',
    input_schema: obj({ de: date('A partir de.'), ate: date('Até.'), lote: str('Lote.'), numeros: numbers('Restringe a estes brincos.') })
  },
  {
    name: 'consultar_ocorrencias',
    description: 'Observações, doenças, recuperações, mortes e descartes registrados.',
    input_schema: obj({
      de: date('A partir de.'), ate: date('Até.'),
      tipo: { type: 'string', enum: ['observacao', 'doenca', 'morte', 'recuperado', 'descarte', 'outro'] },
      numeros: numbers('Restringe a estes brincos.')
    })
  },
  {
    name: 'consultar_agenda',
    description: 'O que está previsto para os próximos dias: etapas de protocolo, diagnósticos, partos e reforços de vacina, incluindo atrasados.',
    input_schema: obj({ dias: num('Quantos dias à frente. Padrão 7.') })
  },
  {
    name: 'consultar_lancamentos',
    description: 'Lançamentos feitos pelo WhatsApp (com código, situação e resumo). Use para "o que eu lancei hoje", "o que ficou pendente", "o que a equipe lançou ontem".',
    input_schema: obj({
      de: date('A partir de (AAAA-MM-DD).'),
      todos: { type: 'boolean', description: 'true para incluir os lançamentos de toda a equipe, não só deste contato.' },
      situacao: { type: 'string', enum: ['pendente', 'aplicada', 'cancelada', 'expirada', 'erro', 'desfeita'] }
    })
  }
]

const WRITE_TOOLS = [
  {
    name: 'registrar_inicio_protocolo', kind: 'protocolo_inicio',
    description: 'Fêmeas entrando em um protocolo reprodutivo (D0 da IATF ou entrada do touro). O protocolo deve ser um dos cadastrados.',
    input_schema: obj({ numeros: numbers(), protocolo: str('Nome do protocolo cadastrado.'), data: date(), touro: str('Touro ou sêmen, se já definido.'), tecnico: str('Inseminador ou veterinário.') }, ['numeros', 'protocolo'])
  },
  {
    name: 'registrar_etapa_protocolo', kind: 'protocolo_etapa',
    description: 'Etapa feita em fêmeas que já estão em protocolo: retirada do implante, aplicação, ou a inseminação da IATF. Informe os brincos OU a data de início do protocolo (para o lote inteiro daquele protocolo).',
    input_schema: obj({
      numeros: numbers(),
      inicio_protocolo: date('Data de início (D0) do protocolo, quando a etapa foi feita no lote todo dele.'),
      etapa: { type: 'string', enum: ['proxima', 'aplicacao', 'retirada', 'inseminacao'], description: '"proxima" quando o peão só diz que fez a etapa do dia.' },
      data: date(), touro: str('Touro ou sêmen usado, se for inseminação.')
    }, ['etapa'])
  },
  {
    name: 'registrar_inseminacao', kind: 'inseminacao',
    description: 'Inseminação no cio, monta natural ou transferência de embrião. Se a vaca estiver em protocolo, o sistema marca como a etapa de inseminação dele.',
    input_schema: obj({ numeros: numbers(), metodo: { type: 'string', enum: ['ia', 'monta', 'te', 'iatf'] }, data: date(), touro: str('Touro ou sêmen.'), tecnico: str('Inseminador.') }, ['numeros', 'metodo'])
  },
  {
    name: 'registrar_diagnostico', kind: 'diagnostico',
    description: 'Diagnóstico de gestação (toque ou ultrassom): prenhe ou vazia, animal por animal.',
    input_schema: obj({
      itens: { type: 'array', items: obj({ numero: str('Brinco.'), resultado: { type: 'string', enum: ['prenhe', 'vazia'] } }, ['numero', 'resultado']) },
      data: date()
    }, ['itens'])
  },
  {
    name: 'registrar_parto', kind: 'parto',
    description: 'Parto, aborto ou bezerro nascido morto. Cadastra o bezerro ligado à mãe.',
    input_schema: obj({
      numero_mae: str('Brinco da mãe.'),
      resultado: { type: 'string', enum: ['nascido', 'aborto', 'natimorto'] },
      bezerro_numero: str('Brinco do bezerro, se já tiver.'),
      bezerro_sexo: { type: 'string', enum: ['macho', 'femea'] },
      bezerro_peso: num('Peso ao nascer em kg.'),
      data: date(), observacao: str('Algo relevante: parto difícil, ajudado, mãe rejeitou.')
    }, ['numero_mae', 'resultado'])
  },
  {
    name: 'registrar_sanitario', kind: 'sanitario',
    description: 'Vacina, vermífugo, carrapaticida, remédio ou exame aplicado. Informe os brincos ou o lote inteiro.',
    input_schema: obj({
      numeros: numbers(), lote: str('Lote inteiro, quando aplicaram em todos do lote.'),
      tipo: { type: 'string', enum: ['vacina', 'vermifugo', 'carrapaticida', 'medicamento', 'exame', 'outro'] },
      produto: str('Nome do produto ou da vacina.'), dose: str('Dose dita pelo peão, ex.: "5 ml".'),
      carencia_dias: num('Dias de carência para abate, se dito.'), proxima_dose_dias: num('Dias até a próxima dose, se dito.'),
      partida: str('Partida/lote do frasco.'), data: date()
    }, ['produto'])
  },
  {
    name: 'registrar_pesagem', kind: 'pesagem',
    description: 'Pesos de um ou mais animais, em kg. Se disserem em arrobas, converta (1 @ = 30 kg de peso vivo, a não ser que digam outra regra).',
    input_schema: obj({ itens: { type: 'array', items: obj({ numero: str('Brinco.'), peso: num('Peso em kg.') }, ['numero', 'peso']) }, data: date() }, ['itens'])
  },
  {
    name: 'registrar_ocorrencia', kind: 'ocorrencia',
    description: 'Algo observado no animal: mancando, magro, bicheira, doente, separado, ou que se recuperou.',
    input_schema: obj({ numeros: numbers(), tipo: { type: 'string', enum: ['observacao', 'doenca', 'recuperado', 'outro'] }, nota: str('O que aconteceu, nas palavras do peão.') }, ['numeros', 'tipo', 'nota'])
  },
  {
    name: 'registrar_saida', kind: 'saida',
    description: 'Animal que saiu do rebanho: morreu, foi vendido ou abatido.',
    input_schema: obj({ numeros: numbers(), motivo: { type: 'string', enum: ['morte', 'venda', 'abate'] }, data: date(), nota: str('Causa ou detalhe.') }, ['numeros', 'motivo'])
  },
  {
    name: 'registrar_troca_lote', kind: 'lote',
    description: 'Mudança de animais para outro lote ou pasto.',
    input_schema: obj({ numeros: numbers(), lote: str('Lote de destino.') }, ['numeros', 'lote'])
  },
  {
    name: 'registrar_contagem', kind: 'contagem',
    description: 'Contagem de animais passando no curral ou na porteira, com os brincos vistos. Informe o lote para o sistema dizer quem faltou.',
    input_schema: obj({ numeros: numbers(), lote: str('Lote conferido.'), titulo: str('Título da contagem.') }, ['numeros'])
  }
]

const SESSION_TOOLS = [
  {
    name: 'iniciar_lote',
    description: 'Abre o MODO LOTE para um manejo no curral com muitos animais: depois o peão manda só os brincos (ou "brinco peso" na pesagem, "brinco P/V" no diagnóstico) em várias mensagens e diz "fechar" no fim. Use quando ele disser que vai começar a vacinar, protocolar, pesar, diagnosticar ou contar um lote.',
    input_schema: obj({
      tipo: { type: 'string', enum: ['sanitario', 'protocolo_inicio', 'protocolo_etapa', 'pesagem', 'diagnostico', 'contagem'] },
      lote: str('Lote que está sendo trabalhado (para o sistema avisar quem faltou).'),
      produto: str('Sanitário: produto aplicado.'),
      tipo_sanitario: { type: 'string', enum: ['vacina', 'vermifugo', 'carrapaticida', 'medicamento', 'exame', 'outro'] },
      dose: str('Sanitário: dose.'),
      protocolo: str('Início de protocolo: nome do protocolo.'),
      etapa: { type: 'string', enum: ['proxima', 'aplicacao', 'retirada', 'inseminacao'] },
      touro: str('Touro ou sêmen.'),
      data: date()
    }, ['tipo'])
  },
  {
    name: 'adicionar_ao_lote',
    description: 'Acrescenta brincos ao lote aberto, quando a mensagem não veio só com números (ex.: "agora passou a 401 e a 402").',
    input_schema: obj({
      itens: { type: 'array', items: obj({ numero: str('Brinco.'), peso: num('Pesagem: kg.'), resultado: { type: 'string', enum: ['prenhe', 'vazia'] } }, ['numero']) }
    }, ['itens'])
  },
  {
    name: 'remover_do_lote',
    description: 'Tira brincos que entraram errado no lote aberto.',
    input_schema: obj({ numeros: numbers() }, ['numeros'])
  },
  { name: 'fechar_lote', description: 'Encerra o lote aberto e manda o resumo para confirmação.', input_schema: obj({}) },
  { name: 'cancelar_lote', description: 'Descarta o lote aberto sem gravar nada.', input_schema: obj({}) },
  {
    name: 'cancelar_lancamento',
    description: 'Cancela um lançamento AINDA PENDENTE (antes de confirmar), por exemplo quando o peão diz que errou. Depois proponha o correto, se ele disse.',
    input_schema: obj({ codigo: str('Código de 4 letras do lançamento.') }, ['codigo'])
  },
  {
    name: 'desfazer_lancamento',
    description: 'Desfaz um lançamento JÁ GRAVADO (apaga o que ele criou e volta o que ele mudou). Pede confirmação.',
    input_schema: obj({ codigo: str('Código de 4 letras do lançamento.') }, ['codigo'])
  }
]

export const WRITE_KIND = Object.fromEntries(WRITE_TOOLS.map((t) => [t.name, t.kind]))

function toolList(canWrite, strict) {
  const list = canWrite ? [...QUERY_TOOLS, ...WRITE_TOOLS, ...SESSION_TOOLS] : QUERY_TOOLS
  return list.map(({ kind, ...tool }) => (strict ? { ...tool, strict: true } : tool))
}

// ------------------------------------------------------------------
// Instruções
// ------------------------------------------------------------------

function systemPrompt(farmName) {
  return `Você é o assistente de campo da ${farmName}, uma fazenda de gado de corte no Brasil. Você conversa pelo WhatsApp com a equipe da fazenda: peões, vaqueiros, gerente e o dono. Eles mandam áudio (que chega transcrito), texto ou foto, muitas vezes do curral, com pressa, com barulho e sinal fraco.

Seus dois trabalhos:
1. Registrar o que aconteceu no manejo, com o máximo de exatidão. Cada registro vira prova de rastreabilidade do rebanho.
2. Responder perguntas sobre o rebanho com os dados do sistema.

Como responder:
- Escreva como alguém da fazenda escreveria: frases curtas, palavras simples, sem termos de informática. Trate a pessoa pelo nome quando souber.
- WhatsApp aceita *negrito* e _itálico_. Use listas curtas com "•" quando ajudar. Nunca use o travessão "—".
- Números e contagens SEMPRE vêm das ferramentas consultar_* e buscar_animais. Nunca invente, estime ou complete dado. Se a ferramenta não trouxe, diga que não tem a informação.
- Respostas de consulta: comece pelo número que a pessoa pediu ("*42 vacas* entraram no protocolo de 10/11."), depois o detalhe mínimo útil. Liste brincos só se pedirem ou se forem poucos.

Como registrar:
- Use as ferramentas registrar_*. Elas não gravam: o sistema confere com o rebanho e manda para a pessoa um cartão com o resumo e os botões Confirmar e Cancelar. Só depois do Confirmar o registro é gravado.
- Quando a ferramenta aceitar, NÃO repita o resumo, porque o cartão já mostra. Termine sem texto ou com no máximo uma frase curta, se houver algo que o cartão não diz.
- Quando a ferramenta devolver "problemas", não insista: faça UMA pergunta curta e objetiva ao peão para resolver (ex.: "Não achei a 410. Seria a 401?").
- Uma mensagem pode ter vários manejos ("a 401 pariu um macho e a 405 tá mancando"): chame uma ferramenta para cada um.
- Datas: por padrão o manejo aconteceu na "data do manejo" informada no contexto (o dia em que a mensagem foi GRAVADA no celular, que pode ser antes de chegar por falta de sinal). Se a pessoa disser "ontem", "segunda", "dia 10", calcule a partir da data em que a mensagem foi gravada.
- Áudio com transcrição de confiança baixa, ou com dúvida justamente no número do brinco, no peso ou no resultado: confirme com a pessoa antes de registrar.
- Brinco ambíguo, produto não dito, resultado de diagnóstico não dito: pergunte. Errar um registro é muito pior que perguntar.
- Se a pessoa corrigir algo de um lançamento pendente ("não, era a 402"), cancele o pendente com cancelar_lancamento e proponha o correto.
- "desfazer K7P2" ou "apaga o que eu lancei": use desfazer_lancamento (o sistema pede confirmação).
- Respostas curtas como "sim", "pode", "não" para confirmar ou cancelar cartões são tratadas pelo sistema antes de chegar a você.

Modo lote (curral):
- Quando a pessoa avisar que vai começar a vacinar, protocolar, pesar, diagnosticar ou contar vários animais, abra com iniciar_lote. Depois disso, mensagens só com números são somadas ao lote automaticamente, sem passar por você.
- Se houver um lote aberto e a mensagem trouxer brincos no meio de outras palavras, use adicionar_ao_lote. Para tirar um brinco errado, remover_do_lote. "Acabou", "terminou", "fechar" encerra com fechar_lote.

Foto:
- Na foto de um animal, leia o brinco se estiver legível e use buscar_animais. Se não der para ler, diga e peça o número. Nunca adivinhe dígitos.

Limites:
- Permissão "consulta" só pergunta: não registra nada. Se pedir para registrar, explique que o número dele é só de consulta.
- Sobre doença e tratamento, você pode orientar no geral, mas dose e remédio quem define é o veterinário da fazenda. Em caso grave (animal caído, sangramento, muitos doentes) recomende chamar o veterinário já.
- Assunto fora da fazenda: responda com educação que você cuida só do rebanho.`
}

// ------------------------------------------------------------------
// Execução das consultas
// ------------------------------------------------------------------

function runQuery(name, input, snapshot, handlers) {
  switch (name) {
    case 'buscar_animais': {
      const { found, missing } = resolveNumbers(snapshot, input.numeros)
      return {
        encontrados: found.map((a) => animalCard(snapshot, a)),
        nao_encontrados: missing.map((m) => ({ brinco: m.number, parecidos: m.suggestions }))
      }
    }
    case 'consultar_rebanho': return queryHerd(snapshot, input)
    case 'consultar_reproducao': return queryReproduction(snapshot, input)
    case 'consultar_sanitario': return queryHealth(snapshot, input)
    case 'consultar_pesagens': return queryWeighings(snapshot, input)
    case 'consultar_ocorrencias': return queryOccurrences(snapshot, input)
    case 'consultar_agenda': return queryAgenda(snapshot, Math.min(Math.max(Number(input.dias) || 7, 1), 60))
    case 'consultar_lancamentos': return handlers.listActions(input)
    default: return null
  }
}

function contextBlock(ctx) {
  const lines = [
    `Contato: ${ctx.contact.name} (permissão: ${ctx.contact.permission === 'consulta' ? 'consulta' : 'lançamento'})`,
    `Hoje: ${ctx.today} (${ctx.todayWeekday})`,
    `Mensagem gravada no celular em: ${ctx.sentAtText}`,
    ctx.delayText ? `ATENÇÃO: a mensagem chegou ${ctx.delayText} depois de gravada (sem sinal no campo).` : null,
    `Data do manejo, se a pessoa não disser outra: ${ctx.eventDate}`,
    `Tipo: ${ctx.kindText}`,
    ctx.pending.length ? `Lançamentos aguardando confirmação deste contato:\n${ctx.pending.map((a) => `  • ${a.code}: ${a.summary.split('\n')[0].replace(/\*/g, '')} (${a.animals} animais)`).join('\n')}` : 'Nenhum lançamento aguardando confirmação.',
    ctx.session ? `LOTE ABERTO: ${ctx.session}` : null
  ]
  return lines.filter(Boolean).join('\n')
}

function historyBlock(history) {
  if (!history.length) return ''
  return history.map((h) => `[${h.at}] ${h.who}: ${h.text}`).join('\n')
}

/**
 * Roda a conversa com o Claude até ele terminar.
 * handlers: propose(kind, input), session(name, input), cancel(code), undo(code), listActions(input)
 */
export async function runAssistant({ snapshot, farmName, ctx, text, image, handlers }) {
  const canWrite = ctx.contact.permission !== 'consulta'
  const trace = { model: CLAUDE_MODEL, tools: [], usage: { input: 0, output: 0, cache_read: 0, cache_write: 0 }, turns: 0 }
  const farm = JSON.stringify(farmContext(snapshot))
  const content = []
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.base64 } })
  const history = historyBlock(ctx.history)
  content.push({
    type: 'text',
    text: `<contexto>\n${contextBlock(ctx)}\n</contexto>\n${history ? `<conversa_recente>\n${history}\n</conversa_recente>\n` : ''}<mensagem>\n${text || (image ? '(foto sem legenda)' : '')}\n</mensagem>`
  })
  const messages = [{ role: 'user', content }]
  let strict = process.env.CLAUDE_STRICT_TOOLS !== 'off'
  let fallbacks = FALLBACKS

  const params = () => ({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    ...(EFFORT ? { output_config: { effort: EFFORT } } : {}),
    ...(fallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' } : {}),
    system: [
      { type: 'text', text: systemPrompt(farmName), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `Dados fixos da fazenda (JSON):\n${farm}`, cache_control: { type: 'ephemeral' } }
    ],
    tools: toolList(canWrite, strict),
    messages
  })

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    trace.turns = turn + 1
    let response
    try {
      response = await anthropic().beta.messages.create(params())
    } catch (error) {
      // Recursos opcionais recusados pela conta ou pelo modelo: tenta sem eles uma vez.
      if (error instanceof Anthropic.BadRequestError && (fallbacks || strict)) {
        console.warn('Claude recusou parâmetros opcionais; tentando sem eles:', error.message)
        if (fallbacks && /fallback/i.test(error.message)) fallbacks = false
        else if (strict) strict = false
        else fallbacks = false
        turn--
        continue
      }
      throw error
    }
    const u = response.usage ?? {}
    trace.usage.input += u.input_tokens ?? 0
    trace.usage.output += u.output_tokens ?? 0
    trace.usage.cache_read += u.cache_read_input_tokens ?? 0
    trace.usage.cache_write += u.cache_creation_input_tokens ?? 0
    if (response.model && response.model !== CLAUDE_MODEL) trace.served_by = response.model

    if (response.stop_reason === 'refusal') {
      trace.refusal = response.stop_details?.category ?? true
      return { text: 'Não consegui tratar essa mensagem. Pode mandar de outro jeito?', trace }
    }

    const toolUses = response.content.filter((b) => b.type === 'tool_use')
    const replyText = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()

    if (response.stop_reason === 'max_tokens' && toolUses.length) {
      trace.error = 'max_tokens'
      return { text: 'A mensagem ficou grande demais para eu entender de uma vez. Pode mandar em partes?', trace }
    }
    if (!toolUses.length || response.stop_reason === 'end_turn') {
      return { text: replyText, trace }
    }

    messages.push({ role: 'assistant', content: response.content })
    const results = []
    for (const use of toolUses) {
      const input = typeof use.input === 'string' ? JSON.parse(use.input) : use.input ?? {}
      let output
      try {
        if (WRITE_KIND[use.name]) {
          output = canWrite ? await handlers.propose(WRITE_KIND[use.name], input) : { ok: false, problemas: ['Este número é só de consulta e não pode registrar.'] }
        } else if (['iniciar_lote', 'adicionar_ao_lote', 'remover_do_lote', 'fechar_lote', 'cancelar_lote'].includes(use.name)) {
          output = canWrite ? await handlers.session(use.name, input) : { ok: false, problemas: ['Este número é só de consulta.'] }
        } else if (use.name === 'cancelar_lancamento') {
          output = await handlers.cancel(input.codigo)
        } else if (use.name === 'desfazer_lancamento') {
          output = canWrite ? await handlers.undo(input.codigo) : { ok: false, problemas: ['Este número é só de consulta.'] }
        } else {
          output = await runQuery(use.name, input, snapshot, handlers)
        }
      } catch (error) {
        console.error('Falha na ferramenta', use.name, error)
        output = { ok: false, erro: 'Falha interna ao executar. Tente de outro jeito.' }
      }
      trace.tools.push({ name: use.name, input, ok: output?.ok !== false, output: summarizeOutput(output) })
      results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(output ?? { erro: 'ferramenta desconhecida' }), ...(output?.ok === false ? { is_error: true } : {}) })
    }
    messages.push({ role: 'user', content: results })
  }
  trace.error = 'max_turns'
  return { text: 'Me perdi nessa. Pode repetir de um jeito mais simples?', trace }
}

/** Guarda no rastro só o essencial da resposta da ferramenta. */
function summarizeOutput(output) {
  const raw = JSON.stringify(output ?? null)
  return raw.length > 1200 ? `${raw.slice(0, 1200)}…` : JSON.parse(raw)
}
