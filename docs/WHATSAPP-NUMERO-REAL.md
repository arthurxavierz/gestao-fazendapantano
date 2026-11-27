# Ligar o número brasileiro no assistente do WhatsApp

Passo a passo para depois de ativar o chip. Tempo total: uns 30 minutos.

## Onde paramos (23/11/2026)

Tudo funciona, menos a entrega no celular:

- As mensagens e áudios chegam ao sistema e ficam guardados no banco.
- O Gemini transcreve os áudios e o Claude responde com os dados do rebanho.
- A Meta **bloqueia a entrega das respostas** porque o número de teste é americano (+1 555). Ela não deixa conta nova de fora do Brasil mandar mensagem para número brasileiro (erro 130497).

Por isso, o próximo passo é trocar o número de teste por um chip brasileiro.

Endereços que aparecem abaixo:

- App na Meta: developers.facebook.com > Meus apps > **Fazenda Pantano Campo**
- Portfólio: business.facebook.com > Configurações (portfólio **Achilles Media**)
- Site de teste: https://feature-whatsapp-ia--fazendapantano.netlify.app
- Banco: supabase.com > projeto **fazenda-pantano** > SQL Editor

## 1. Ativar o chip

1. Coloque o chip no celular. Se for no iPhone, troque com o chip físico atual só durante o processo.
2. Faça o cadastro do pré-pago com CPF, pelo site ou app da operadora, ou ligando para a operadora a partir do próprio chip.
3. Confirme que o chip recebe SMS. Por exemplo, mande um SMS do seu número pessoal para ele.
4. **Não instale o WhatsApp nesse número.**

## 2. Cadastrar o número na Meta

1. Abra o app **Fazenda Pantano Campo** > Casos de uso > **Conectar no WhatsApp** > Personalizar > **Etapa 2. Configuração da produção** > **Registre seu número de telefone**. Se não aparecer, use o WhatsApp Manager > Números de telefone > **Adicionar número de telefone**.
2. Preencha assim:
   - **Nome de exibição:** Fazenda Pântano. A Meta revisa esse nome, então use o nome real da fazenda.
   - **Categoria:** Agricultura (ou a mais próxima).
   - **Número:** o do chip, com +55 e DDD.
3. Na verificação, escolha **SMS**. Se o SMS não chegar, escolha **Ligação** e digite o código que chegar.
4. Se pedir para escolher ou criar uma **conta do WhatsApp Business**, crie uma nova no portfólio **Achilles Media**, com o nome "Fazenda Pântano".
5. Se a Meta pedir uma **forma de pagamento**, cadastre o cartão. As respostas dentro de 24 horas da mensagem do peão não são cobradas. A cobrança só aparece em lembretes mandados depois de 24 h sem conversa.

Ao final, anote dois números que aparecem na tela **Etapa 1. Experimente**, agora com o número novo selecionado:

- **Phone Number ID** (identificação do número)
- **Identificação da conta do WhatsApp Business** (o WABA ID)

## 3. Dar acesso ao usuário do sistema

Sem isso, o envio falha com o erro 10 ("Viewer cannot access").

1. business.facebook.com > Configurações > **Contas do WhatsApp**. Também confira em **Contas de mensagens**.
2. Abra a conta nova "Fazenda Pântano" > **Atribuir pessoas**.
3. Escolha **fazenda-pantano-whatsapp**, ligue **Acesso total** e salve.

## 4. Ativar o número para a API e ligar o webhook

Faça no **Explorador da Graph API** (developers.facebook.com/tools/explorer):

1. Em **App da Meta**, escolha **Fazenda Pantano Campo**.
2. Clique em **Generate Access Token** e aceite as permissões **whatsapp_business_management** e **whatsapp_business_messaging**.
3. **Registrar o número na API.** Esse passo é obrigatório para número novo. Sem ele, o envio dá o erro 133010.
   - Método **POST**, caminho `PHONE_NUMBER_ID/register` (troque PHONE_NUMBER_ID pelo número anotado).
   - Na aba **JSON**, cole:
     ```json
     { "messaging_product": "whatsapp", "pin": "123456" }
     ```
     O "pin" é uma senha de 6 dígitos que você inventa. Ela vira a verificação em duas etapas do número, então guarde.
   - Clique em **Enviar**. A resposta deve ser `"success": true`.
4. **Ligar o app à conta**, para as mensagens chegarem no webhook:
   - Método **POST**, caminho `WABA_ID/subscribed_apps` (troque WABA_ID pelo número anotado).
   - Clique em **Enviar**. A resposta deve ser `"success": true`.

O endereço do webhook não muda. Ele é do app, não do número.

## 5. Atualizar o Netlify

1. app.netlify.com > projeto **fazendapantano** > Project configuration > **Environment variables**.
2. Edite **WHATSAPP_PHONE_NUMBER_ID** e coloque o Phone Number ID novo.
3. Republique a versão de teste:
   - Vá em **Deploys** e abra o último deploy da branch **feature/whatsapp-ia**.
   - Clique em **Retry deploy** (ou **Options > Retry with latest branch commit**).
   - Espere aparecer **Published**, uns 2 minutos.

Não precisa gerar token novo. O token atual é permanente e passa a enxergar a conta nova quando o usuário do sistema recebe acesso no passo 3. Se o envio der o erro 10 mesmo assim, gere um token novo em Usuários do sistema > fazenda-pantano-whatsapp > **Gerar token** (sem expiração, com as duas permissões whatsapp_*). Depois troque o **WHATSAPP_TOKEN** no Netlify e republique.

## 6. Testar

1. Do seu WhatsApp pessoal, mande "oi" para o número novo.
2. Pergunte "quantos animais temos?".
3. Mande um áudio com um manejo de um animal que exista no sistema. Deve chegar um cartão com **Confirmar** e **Cancelar**.

Se nada chegar, rode no SQL Editor do Supabase:

```sql
select direction, kind, status, left(coalesce(transcription, body), 120) as texto, error, received_at
from public.whatsapp_messages order by received_at desc limit 15;
```

A coluna **error** diz o motivo. Use a tabela abaixo.

| Erro | O que significa | O que fazer |
|---|---|---|
| Nenhuma linha nova | A mensagem não chegou no sistema | Refazer o passo 4.4 (subscribed_apps) |
| 10 Viewer cannot access | O usuário do sistema não tem acesso à conta | Refazer o passo 3. Se continuar, gerar token novo (passo 5) |
| 133010 | O número não foi registrado na API | Refazer o passo 4.3 (register) |
| 131030 | O número não está na lista permitida | Só acontece com número de teste. Confira se o Phone Number ID no Netlify é o novo |
| 130497 | Conta impedida de mandar para o Brasil | Confira se o Phone Number ID no Netlify é o do chip brasileiro |
| 131047 | Passaram 24 h sem o contato escrever | Normal. A resposta volta a funcionar quando a pessoa manda mensagem |
| Gemini 503 | O Google está sobrecarregado | Temporário. Mande o áudio de novo |

## 7. Depois que funcionar

1. **Trocar as chaves** que foram coladas no chat: Anthropic, Gemini, segredo do app da Meta e token. Gere novas e atualize no Netlify.
2. **Migrar o rebanho** do site, que hoje está em modo demonstração, para o banco. Assim a IA responde com os animais reais.
3. **Cadastrar os peões** em Sistema > WhatsApp com IA > Números autorizados.
4. **Publicar no site principal.** Isso significa mesclar a branch `feature/whatsapp-ia` na `main`, junto com as mudanças de 13/10 que já estão na `main`, e trocar a URL da política de privacidade para o domínio principal. Quando a `main` for publicada com as variáveis do Supabase, o site sai do modo demonstração e passa a usar o banco.
5. **Apagar a mensagem de teste** "this is a text message" de `whatsapp_messages`.
