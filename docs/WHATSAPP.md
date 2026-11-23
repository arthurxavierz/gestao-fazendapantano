# Assistente de campo pelo WhatsApp

O peão manda áudio, texto ou foto para o número da fazenda. O sistema transcreve, entende, confere com o rebanho e responde com um cartão de confirmação. Só depois do **Confirmar** o registro é gravado. Ele também responde perguntas: "quantas vacas entraram no protocolo do dia 10?", "o que tem de manejo essa semana?", "o que eu lancei hoje?".

## Como funciona

```text
WhatsApp do peão
   │  áudio / texto / foto / botão
   ▼
Meta Cloud API ──► /api/whatsapp  (confere a assinatura, guarda, responde 200 em < 1 s)
                        │
                        ▼
          whatsapp-processar-background  (até 15 min)
            1. marca como lida + "digitando..."
            2. áudio: baixa, guarda o original, Gemini transcreve
            3. atalhos sem IA: botões, "sim"/"não", números do modo lote, "fechar"
            4. Claude com ferramentas: consulta o rebanho ou PROPÕE lançamento
            5. o sistema confere a proposta com as regras e manda o cartão
                        │
                        ▼
          Confirmar ──► confere de novo ──► grava com autoria, origem e código
```

`whatsapp-rotina` (a cada 10 min) reprocessa o que ficou para trás, lembra do que falta confirmar e expira em 24 h o que ninguém confirmou.

## Rastreabilidade

| Onde | O que guarda |
|---|---|
| `whatsapp_messages` | Toda mensagem que entra e sai: texto, transcrição, caminho do áudio original, hora gravada no celular, hora de chegada, rastro da IA (ferramentas chamadas, modelo, tokens), status de entrega (enviado, entregue, lido) |
| `whatsapp_actions` | Cada lançamento proposto: código (ex.: K7P2), resumo mostrado ao peão, avisos, quem confirmou e quando, os registros criados e o valor anterior dos alterados |
| `whatsapp_sessions` | Os lotes de curral, número por número, com a mensagem de origem |
| bucket `whatsapp-media` | Áudios e fotos originais (privado, só administrador ouve) |
| Tabelas do rebanho | `created_by` = conta ligada ao número, `origin_channel = 'whatsapp'`, `origin_ref` = lançamento |

A autoria só pode ser definida pelo servidor (service_role). Pelo navegador continua impossível forjar.

## Sinal fraco no campo

- **Nada se perde.** A mensagem é guardada antes de qualquer processamento. Se o banco estiver fora, o webhook devolve erro e a própria Meta reenvia.
- **Hora certa.** O WhatsApp segura a mensagem no celular até ter sinal. O manejo é registrado com a hora em que foi **gravada**, e o peão recebe "sua mensagem de 12:41 chegou agora (3 h depois)".
- **Sem duplicidade.** O identificador da Meta é único no banco. Reenvio vira a mesma mensagem, e dois toques no Confirmar gravam uma vez só.
- **Fila em ordem.** Mensagens que chegam juntas são processadas em ordem, uma por vez por contato.
- **Falha na IA.** O peão recebe "recebi, está guardada, respondo assim que processar". A rotina tenta de novo até 4 vezes e, se desistir, avisa e deixa no painel.
- **Confirmação esquecida.** Lembrete em 30 min. Em 24 h expira sem gravar nada, com aviso.
- **Conferência na hora de gravar.** Se o animal morreu ou foi vendido entre o resumo e o Confirmar, nada é gravado.

## Modo lote (curral)

```text
Peão:  vou vacinar o lote Matrizes contra aftosa
Bot:   🟢 Lote aberto: Sanitário · Aftosa · lote Matrizes. Mande os brincos.
Peão:  401 402 403
Bot:   ✓ 401, 402, 403 · 3 no lote
Peão:  4100
Bot:   ⚠ Não existe no rebanho, não entrou: 4100 (seria 410?)
Peão:  fechar
Bot:   [cartão] 3 animais · 🔴 Do lote Matrizes não passaram 2: 404, 405   [Confirmar] [Cancelar]
```

Números puros não passam pela IA: é instantâneo e funciona mesmo se a IA cair. Vale para sanitário, início e etapa de protocolo, pesagem ("401 380"), diagnóstico ("401 P 402 V") e contagem.

## O que falta ligar (fazer junto)

1. **Banco.** Reativar o projeto no Supabase (org paga) e rodar `supabase/schema.sql` inteiro no SQL Editor. É idempotente.
2. **Anthropic.** Criar a conta no console da Anthropic, gerar a chave e cadastrar `ANTHROPIC_API_KEY` no Netlify.
3. **Gemini.** Conferir se a `GEMINI_API_KEY` atual está ativa (ela já é usada na leitura de brincos).
4. **Testar no simulador.** Sistema > WhatsApp com IA > Simulador. Modo Ensaio não grava nada, e dá para gravar áudio pelo microfone do computador e simular "sem sinal".
5. **Meta.** Em developers.facebook.com: criar app do tipo Business, adicionar o produto WhatsApp, cadastrar até 5 celulares no número de teste grátis.
6. **Netlify.** Cadastrar `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` (senha inventada) e `WHATSAPP_APP_SECRET`, e publicar de novo.
7. **Webhook.** Na Meta, em WhatsApp > Configuração: URL `https://fazendapantano.achillesmedia.com.br/api/whatsapp`, o mesmo verify token, e assinar o campo `messages`.
8. **Números.** Sistema > WhatsApp com IA > Números autorizados: cadastrar cada celular e ligar à conta da pessoa.
9. **Chip.** Comprar a linha, registrar o número no WhatsApp Business Platform (um SMS de verificação) e trocar o `WHATSAPP_PHONE_NUMBER_ID`.
10. **Opcional.** Aprovar um modelo de mensagem "utilidade" com um parâmetro de texto e cadastrar em `WHATSAPP_TEMPLATE_AVISO`, para lembretes depois de 24 h sem conversa.

## Custos

| Item | Estimativa |
|---|---|
| Claude Sonnet 5.5 (padrão) | uns R$ 0,02 a 0,05 por mensagem interpretada |
| Claude Haiku 5.5 (`CLAUDE_MODEL=claude-haiku-5-5`) | menos de R$ 0,01 por mensagem |
| Gemini (transcrição) | poucos reais por mês |
| WhatsApp | respostas dentro de 24 h da mensagem do peão não são cobradas |

Confirmações, números do modo lote e "fechar" não chamam o Claude, então o dia de curral sai barato. O raio-x do simulador mostra o custo estimado de cada mensagem.

## Arquivos

```text
netlify/functions/
  whatsapp.mjs                       webhook (GET verificação, POST mensagens)
  whatsapp-processar-background.mjs  processamento pesado
  whatsapp-rotina.mjs                agendada: reprocessar, lembrar, expirar
  whatsapp-painel.mjs                status e simulador (administrador)
netlify/lib/campo/
  fluxo.mjs         recebe, confirma, modo lote, falhas, rotina
  assistente.mjs    Claude: instruções, ferramentas, laço
  lancamentos.mjs   conferência de cada tipo de lançamento contra o rebanho
  aplicar.mjs       gravação com rastreabilidade e desfazer
  rebanho.mjs       consultas (reprodução, sanitário, pesagens, agenda)
  armazem.mjs       Supabase e memória (testes e ensaio)
  whatsapp.mjs      Meta Cloud API
  transcrever.mjs   Gemini para áudio
  campo.test.mjs    testes do fluxo completo
src/pages/WhatsApp.tsx  simulador, registro, números, configuração
```
