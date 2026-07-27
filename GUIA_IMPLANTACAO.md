# Guia de implantação da Fazenda Pântano

Guia completo, do computador vazio até o sistema publicado e instalado no celular.

As seções estão na ordem em que devem ser executadas. Cada uma só depende das anteriores, então não pule etapas para frente.

## Checklist

Vá marcando conforme avança.

- [ ] 1. Node.js, Git e VS Code instalados, `npm install` concluído
- [ ] 2. Projeto criado no Supabase e `schema.sql` executado
- [ ] 3. Arquivo `.env` preenchido e sistema abrindo com banco conectado
- [ ] 4. Usuários criados e sua conta promovida a administrador
- [ ] 5. Leitura do brinco por IA ativada *(opcional)*
- [ ] 6. `npm run build` e `npm run preview` testados
- [ ] 7. Código no GitHub, com o `.env` fora do repositório
- [ ] 8. Site publicado no Netlify
- [ ] 9. Variáveis de ambiente cadastradas no Netlify e novo deploy solicitado
- [ ] 10. Subdomínio apontado *(opcional)*
- [ ] 11. Aplicativo instalado no celular do seu sogro

Tempo estimado: cerca de duas horas na primeira vez, sem contar a espera de DNS.

---

## 1. Preparar o computador

Instale:

- Node.js 20 ou superior
- Git
- Visual Studio Code

Abra a pasta do projeto no Visual Studio Code e execute no terminal:

```bash
npm install
npm run dev
```

O Vite informará um endereço semelhante a:

```text
http://localhost:5173
```

Sem configurar o Supabase, o sistema abre em modo de demonstração. Os registros ficam apenas no navegador, o botão de leitura por IA não aparece, e a aba escolhida no login define qual visão será aberta.

Use este momento para conhecer as telas antes de configurar qualquer coisa. Dá inclusive para mostrar ao seu sogro nesse estado e colher opinião antes de investir tempo em servidor.

---

## 2. Criar o projeto no Supabase

1. Acesse o Supabase e crie um novo projeto.
2. Escolha um nome como `fazenda-pantano`.
3. Guarde a senha do banco em local seguro. Ela não é usada pelo aplicativo, mas é necessária para acesso direto ao banco.
4. Escolha a região mais próxima, como `South America (São Paulo)`.
5. Aguarde a criação, que leva alguns minutos.
6. Abra `SQL Editor`.
7. Clique em `New query`.
8. Copie todo o conteúdo de `supabase/schema.sql`.
9. Execute o script.

O script cria:

- `profiles`, com o papel de cada pessoa
- `animals`
- `occurrences`
- `counts`
- gatilhos que registram quem criou cada informação
- políticas de segurança por perfil
- bucket público `animal-photos`

O script é seguro para executar mais de uma vez. Se o banco já existir de uma versão anterior, as colunas e políticas novas são adicionadas sem apagar dados.

Para popular com quatro animais fictícios e conhecer as telas com conteúdo, execute também `supabase/demo-data.sql`. Apague esses registros antes de entregar o sistema para uso real.

---

## 3. Conectar o aplicativo ao Supabase

No Supabase:

1. Abra `Project Settings`.
2. Entre em `API` ou na área de chaves do projeto.
3. Copie a URL do projeto.
4. Copie a chave pública, chamada `anon` ou `publishable`.

Na raiz do projeto, copie o arquivo de exemplo:

```bash
cp .env.example .env
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Edite o `.env`:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICAVEL_ANON
```

Reinicie o servidor, porque o Vite só lê o `.env` na inicialização:

```bash
npm run dev
```

No rodapé do menu lateral deve aparecer `Banco conectado`. Se ainda aparecer `Modo demonstração`, o `.env` não foi lido: confira o nome do arquivo, se está na raiz do projeto e se o servidor foi reiniciado.

### Sobre as chaves

**Nunca coloque a `service_role` no projeto web.** Ela ignora todas as políticas de segurança e daria acesso total ao banco a qualquer pessoa que abrisse o código-fonte da página.

A chave `anon` é diferente: ela é pública por natureza e fica embutida no arquivo que o navegador baixa. Isso é seguro porque as políticas de segurança do banco, criadas na seção 2, definem o que cada pessoa pode ver e fazer. A chave sozinha não abre nada.

---

## 4. Criar os usuários e definir os perfis

O sistema tem dois perfis.

| | Operador | Administrador |
| --- | --- | --- |
| Consultar e filtrar animais | Sim | Sim |
| Cadastrar, editar e excluir animais | Sim | Sim |
| Registrar ocorrências e contagens | Sim | Sim |
| Gerar fichas, relações e folhas de manejo | Sim | Sim |
| Ler o brinco com IA | Sim | Sim |
| Ver quem registrou cada informação | Não | Sim |
| Ver o responsável por cada contagem do dia | Não | Sim |
| Ver a lista de contas e mudar o perfil delas | Não | Sim |

### 4.1 Criar as contas

No Supabase:

1. Abra `Authentication`.
2. Entre em `Users`.
3. Clique em `Add user` e depois em `Create new user`.
4. Informe o e-mail e a senha da pessoa.
5. Marque `Auto Confirm User`, para que ela consiga entrar sem precisar confirmar e-mail.
6. Repita para cada operador.

Crie uma conta por pessoa. Não compartilhe um login entre vários peões: é justamente o login individual que permite saber quem fez cada lançamento.

Para que o nome apareça no sistema em vez do e-mail, edite o usuário e preencha `User Metadata` com:

```json
{ "full_name": "João da Silva" }
```

### 4.2 Promover o primeiro administrador

**Toda conta nasce como operador, inclusive a sua.** Isso é proposital: evita que uma conta criada por engano já entre com acesso total.

Depois de criar a sua conta, abra `SQL Editor` e execute uma vez, trocando o e-mail:

```sql
update public.profiles
set role = 'administrador'
where email = 'seu-email@fazenda.com.br';
```

Confira o resultado:

```sql
select full_name, email, role from public.profiles order by role, full_name;
```

Se a consulta não retornar nada, o usuário ainda não foi criado em `Authentication`. Volte ao passo 4.1.

### 4.3 Definir os demais perfis pela tela

A partir daí você não precisa mais de SQL. Entre no sistema como administrador, abra `Administração`, vá em `Equipe` e mude o perfil de cada pessoa pelo seletor.

O sistema impede remover o último administrador. Se tentar rebaixar a única conta administrativa, o banco recusa a alteração e o seletor fica desabilitado.

### 4.4 Entrar no sistema

Na tela de login existe uma aba `Operador` e uma aba `Administrador`.

A aba **não** concede permissão. Ela apenas informa qual área a pessoa quer abrir, e o sistema confere contra o perfil real gravado no banco:

- Escolheu `Administrador` e a conta é operador: o acesso é recusado com mensagem clara e a sessão é encerrada.
- Escolheu `Operador` e a conta é administrador: entra normalmente, com todos os acessos.

---

## 5. Ativar a leitura do brinco por IA

Etapa opcional. Sem ela o sistema funciona normalmente e o botão de análise não aparece no cadastro.

### 5.1 Como funciona

Ao escolher a foto do animal, aparece o botão `Ler brinco com IA`. O sistema:

1. Comprime a foto no próprio celular, para 1280 pixels.
2. Envia para uma função no servidor do Supabase.
3. Essa função consulta o Google Gemini e devolve o número do brinco, a pelagem e uma raça provável, cada um com nível de confiança.
4. O resultado aparece destacado como **interpretado pela IA**, e **nada é salvo automaticamente**.
5. Você clica em `Usar` no que estiver certo. Todo campo continua editável e pode ser corrigido à mão.
6. Se você digitar por cima, a marcação de IA some, porque o campo passou a ser seu.

A chave do Gemini fica somente no servidor. Ela nunca é enviada para o navegador e não entra no arquivo `.env` do projeto web.

### 5.2 Criar a chave do Gemini

O plano gratuito não pede cartão de crédito.

#### Gere a chave pelo AI Studio

```text
https://aistudio.google.com
```

1. Entre com uma conta Google e aceite os termos.
2. Clique em `Get API key`, no menu lateral.
3. Clique em `Create API key`.
4. Escolha um projeto do Google Cloud ou deixe criar um novo automaticamente.
5. Copie a chave. Ela começa com `AQ.`.

O AI Studio cuida sozinho da conta de serviço, da vinculação e da ativação da API. É por isso que este é o caminho recomendado.

#### Por que não usar o Google Cloud Console

Parece o caminho "profissional", mas leva a uma chave que vai parar de funcionar.

O Google está migrando os formatos de chave por causa de uma falha de segurança em que milhares de chaves Google tinham acesso indevido ao Gemini. Duas datas importam:

| Data | O que muda |
| --- | --- |
| 19/06/2026 | A API do Gemini passa a recusar chaves padrão `AIzaSy` **sem restrição** |
| Setembro/2026 | A API do Gemini passa a recusar **todas** as chaves padrão `AIzaSy` |

| Formato | Nome | Como obter | Validade |
| --- | --- | --- | --- |
| `AQ....` | Auth key | AI Studio, automático | Formato atual |
| `AIzaSy...` | Chave padrão | Cloud Console, manual | Recusada a partir de setembro de 2026 |

A auth key `AQ.` é vinculada a uma conta de serviço e já vem restrita à API do Gemini. Se vazar, o Google consegue bloqueá-la rapidamente.

Se você tentar criar a chave pelo Cloud Console, vai notar que a opção `Gemini API` aparece **cinza e não selecionável** na lista de restrições. Não é falha do console: chave padrão não acessa mais o Gemini. Para liberar seria preciso marcar `Autenticar chamadas de API por uma conta de serviço`, criar a conta de serviço e vinculá-la à mão. É exatamente o que o AI Studio faz sozinho em um clique.

#### Sobre o aviso de faturamento

O Google Cloud exibe banners sugerindo `Ativar faturamento`. **Não é necessário.** O nível gratuito funciona sem cartão cadastrado. Ignore o aviso.

#### Ao copiar

**Copie a chave inteira e nada além dela.** Um erro comum é substituir só parte do texto de exemplo do comando e deixar um pedaço do exemplo grudado na frente da chave.

Três avisos honestos sobre o plano gratuito:

- **O Google pode usar as imagens e as respostas do plano gratuito para melhorar os modelos dele.** Para foto de boi e número de brinco o risco é baixíssimo, mas o seu sogro merece saber disso antes de usar.
- **Os limites mudam sem aviso.** Hoje ficam na casa de algumas centenas de análises por dia, muito acima do uso de uma fazenda. Confira o número vigente no painel do AI Studio.
- **Nunca coloque essa chave no `.env` do projeto web.** Variáveis `VITE_` são embutidas no arquivo que vai para o navegador e qualquer pessoa consegue lê-las.

### 5.3 Instalar a CLI do Supabase

No terminal, dentro da pasta do projeto:

```bash
npm install supabase --save-dev
```

Confirme a instalação:

```bash
npx supabase --version
```

### 5.4 Conectar a CLI ao seu projeto

```bash
npx supabase login
```

O comando abre o navegador para autorizar. Depois, conecte a pasta ao projeto:

```bash
npx supabase link --project-ref SEU_REF_DO_PROJETO
```

O `REF` é o trecho antes de `.supabase.co` na URL do projeto. Se a sua URL é `https://abcdefghijklm.supabase.co`, o `REF` é `abcdefghijklm`. Ele também aparece em `Project Settings`, como `Reference ID`.

### 5.5 Testar a chave antes de guardá-la

Vale trinta segundos e evita depurar a função à toa. O comando abaixo faz exatamente a mesma chamada que a Edge Function fará.

No PowerShell:

```powershell
curl.exe -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent" -H "x-goog-api-key: SUA_CHAVE" -H "Content-Type: application/json" -d '{\"contents\":[{\"parts\":[{\"text\":\"responda apenas: ok\"}]}]}'
```

No Git Bash ou Linux:

```bash
curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent" \
  -H "x-goog-api-key: SUA_CHAVE" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"responda apenas: ok"}]}]}'
```

Resultado esperado: um JSON contendo `"text": "ok"`.

| Resposta | Significado |
| --- | --- |
| JSON com `"text"` | Chave válida. Siga para 5.6 |
| `API key not valid` | Chave incorreta, ou sobrou texto de exemplo colado nela |
| `API key expired` | Chave revogada. Gere outra no AI Studio |
| `...GenerativeService.GenerateContent are blocked` | A chave existe, mas não tem permissão para a API do Gemini. Gere outra, ou habilite a Generative Language API no projeto do Google Cloud vinculado |

### 5.6 Guardar a chave do Gemini no servidor

Substitua **todo** o texto depois do sinal de igual pela sua chave. Não deixe nada do exemplo colado na frente dela.

```bash
npx supabase secrets set GEMINI_API_KEY=COLE_AQUI_A_CHAVE_INTEIRA
```

Confira o que foi gravado, comparando o tamanho com o da sua chave:

```bash
npx supabase secrets list
```

Opcionalmente, para trocar o modelo usado:

```bash
npx supabase secrets set GEMINI_MODEL=gemini-3.6-flash
```

O padrão é `gemini-3.6-flash`, que equilibra bem leitura de texto pequeno e cota gratuita. O `gemini-3.5-flash-lite` tem cota diária maior, mas lê brinco sujo ou torto com menos precisão.

Para conferir o que já está configurado:

```bash
npx supabase secrets list
```

### 5.7 Publicar a função

A função já está pronta em `supabase/functions/analisar-foto/index.ts`.

```bash
npx supabase functions deploy analisar-foto
```

**Você não precisa fazer nada com o que o terminal devolver.** O aplicativo monta o endereço da função sozinho, juntando o `VITE_SUPABASE_URL` que você já preencheu na seção 3 com o caminho fixo `/functions/v1/analisar-foto`.

Use a saída do terminal apenas para conferir. Ela costuma trazer duas coisas diferentes, e é importante não confundir:

| O que aparece | Para que serve |
| --- | --- |
| `https://supabase.com/dashboard/project/SEU-REF/functions` | Link do painel, para inspecionar e ver logs. **Não** é o endereço da função |
| `https://SEU-REF.supabase.co/functions/v1/analisar-foto` | O endereço real de chamada, montado automaticamente pelo aplicativo |

A variável `VITE_AI_FUNCTION_URL` existe apenas para um caso raro: a função publicada em um projeto Supabase diferente do banco. Não é o seu caso, então deixe a linha comentada no `.env`.

Se quiser confirmar que a função subiu, verifique se ela responde:

```bash
npx supabase functions list
```

### 5.8 Testar no sistema

1. Rode `npm run dev`.
2. Entre no sistema e abra `Cadastrar animal`.
3. Escolha uma foto em que o brinco apareça.
4. Clique em `Ler brinco com IA`.
5. Confira o número, a pelagem e a raça sugerida.
6. Clique em `Usar` no que estiver certo.

Para acompanhar erros da função:

```bash
npx supabase functions logs analisar-foto
```

### 5.9 Regra de uso que não deve ser flexibilizada

A IA **sugere**, a pessoa **confirma**. Um número de brinco errado gravado em silêncio contamina o cadastro inteiro do rebanho, e o erro só aparece meses depois, na conferência. Por isso o sistema nunca salva sugestão sem clique, e a marcação `Interpretado pela IA` continua visível até alguém revisar o campo.

O sistema guarda, em cada animal, o que a IA sugeriu e o que foi de fato aceito. Depois de alguns meses de uso isso permite medir o acerto real e decidir se vale manter, ajustar o modelo ou desligar.

---

## 6. Testar a versão de produção

Antes de publicar, confirme que a versão compilada funciona:

```bash
npm run build
npm run preview
```

O primeiro comando cria a pasta `dist` e falha se houver erro de tipo no código. O segundo serve essa pasta localmente, igual ao que o Netlify vai servir.

Teste com o `preview` aberto:

- Entrar como administrador e como operador
- Cadastrar um animal com foto
- Gerar uma ficha em PDF e conferir se a foto aparece
- Abrir `Administração` e ver o registro do que você acabou de fazer

---

## 7. Publicar no GitHub com segurança

O repositório pode ser público, para portfólio. Mas antes do primeiro `commit`, faça a conferência abaixo. **Depois que um segredo entra no histórico do Git, apagar o arquivo não resolve**: ele continua acessível em qualquer commit anterior.

### 7.1 O que nunca pode subir

| Item | Onde ele fica |
| --- | --- |
| `.env` com URL e chave do Supabase | Somente na sua máquina e no painel do Netlify |
| Chave `service_role` | Somente no painel do Supabase, e nunca usada neste projeto |
| `GEMINI_API_KEY` | Somente nos secrets do Supabase |
| Senha do banco Supabase | Somente no seu gerenciador de senhas |
| Fotos reais do rebanho e dados de pessoas | Fora do repositório |

O `.gitignore` do projeto já cobre `.env`, todas as variações `.env.*`, `node_modules`, `dist` e os arquivos temporários da CLI do Supabase. O `.env.example` continua versionado de propósito, porque só contém marcadores de texto.

### 7.2 Conferir antes do primeiro commit

```bash
git init
git add .
git status
```

Leia a lista impressa pelo `git status`. **O arquivo `.env` não pode aparecer.** Se aparecer, pare, confira o `.gitignore` e rode `git rm --cached .env` antes de continuar.

Confirmação extra, que deve retornar apenas `.env.example`:

```bash
git ls-files | grep env
```

E uma varredura por chaves esquecidas em qualquer arquivo:

```bash
git grep -nE "eyJ[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}"
```

Se esse comando não imprimir nada, está limpo.

### 7.3 Enviar

```bash
git commit -m "Sistema de controle de rebanho da Fazenda Pântano"
git branch -M main
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```

### 7.4 Se um segredo vazar mesmo assim

A ordem importa. Rotacionar primeiro, limpar depois.

1. **Revogue a chave imediatamente.** Chave do Gemini: apague no AI Studio e gere outra. Chave do Supabase: use `Project Settings` para rotacionar. Senha do banco: troque.
2. **Atualize onde a chave é usada.** Novo `secrets set` para o Gemini, novo `.env` e novas variáveis no Netlify para o Supabase.
3. **Só então limpe o histórico**, se o repositório for público. Para um repositório novo e sem colaboradores, o mais simples e seguro é apagar o repositório no GitHub e criar outro do zero, já com a conferência da seção 7.2 feita.

Considerar a chave "removida" apenas porque o arquivo saiu do último commit é o erro clássico. Enquanto ela não for revogada, continua válida.

### 7.5 Cuidados extras para portfólio

- Deixe o `demo-data.sql` com os dados fictícios que já vêm no projeto. Não substitua por dados reais da fazenda.
- Não coloque a URL real do Supabase no `README.md`.
- Se for mostrar capturas de tela, confira se não aparecem nomes de pessoas ou números reais de brinco.
- O `README.md` já descreve o projeto e a stack. Vale acrescentar um link para o site publicado.

---

## 8. Publicar no Netlify

1. Acesse o Netlify.
2. Escolha `Add new site`.
3. Selecione `Import an existing project`.
4. Conecte o repositório do GitHub.
5. Confirme:

```text
Build command: npm run build
Publish directory: dist
```

O arquivo `netlify.toml` já contém essas configurações e o redirecionamento necessário para as rotas do React.

O primeiro deploy vai falhar ao abrir, ou abrir em modo demonstração, porque as variáveis ainda não existem. Isso é esperado: siga para a seção 9.

## 9. Adicionar as variáveis no Netlify

No painel do site no Netlify:

1. Abra `Site configuration`.
2. Entre em `Environment variables`.
3. Cadastre:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

4. Use os mesmos valores do arquivo `.env`.
5. Vá em `Deploys` e solicite `Trigger deploy` seguido de `Deploy site`.

As variáveis Vite são inseridas durante o build. Portanto, qualquer alteração exige um novo deploy para valer.

**Não cadastre `GEMINI_API_KEY` aqui.** Ela pertence aos secrets do Supabase, não ao Netlify.

## 10. Configurar o subdomínio

Etapa opcional. O endereço `nome-do-site.netlify.app` funciona normalmente.

Exemplo recomendado:

```text
fazendapantano.achillesmedia.com.br
```

No Netlify:

1. Abra `Domain management`.
2. Escolha `Add a domain`.
3. Informe o subdomínio completo.

No gerenciador DNS, como Cloudflare:

1. Crie um registro `CNAME`.
2. Nome: `fazendapantano`.
3. Destino: o endereço padrão fornecido pelo Netlify, como `nome-do-site.netlify.app`.
4. Salve.

A propagação leva de alguns minutos a algumas horas. O certificado HTTPS é emitido automaticamente pelo Netlify depois que o DNS resolve.

Se o domínio real for `aquiles.com.br`, use o mesmo procedimento nesse domínio. O nome usado no código não limita o endereço de publicação.

## 11. Instalar no celular

Depois de publicado:

### Android

1. Abra o sistema no Chrome.
2. Abra o menu do navegador.
3. Escolha `Instalar aplicativo` ou `Adicionar à tela inicial`.

### iPhone

1. Abra o sistema no Safari.
2. Toque em compartilhar.
3. Escolha `Adicionar à Tela de Início`.

O projeto já possui manifesto PWA e ícones básicos. Instalado, ele abre em tela cheia, sem a barra do navegador.

---

## 12. Como usar os documentos

Todos os documentos incluem a foto cadastrada do animal.

### Ficha individual

1. Abra `Animais`.
2. Selecione um animal.
3. Escolha `Baixar em PDF`, `Baixar em Word` ou `Imprimir agora`.

A foto aparece em tamanho grande, ao lado dos destaques do animal.

### Relação completa

1. Abra `Documentos`.
2. Escolha os filtros.
3. Baixe PDF ou Word.

Cada linha traz uma miniatura quadrada da foto.

### Folha de manejo

1. Abra `Documentos`.
2. Filtre os animais que devem constar na folha.
3. Clique em `Preparar folha`.
4. Imprima o PDF em papel A4 comum.

A folha possui a miniatura da foto e colunas para presença, situação, peso, observação e assinatura.

Como as fotos são baixadas e embutidas no arquivo, a geração leva alguns segundos em listas grandes. Os botões mostram `Gerando` enquanto isso acontece.

## 13. A tela de Administração

Visível apenas para quem tem o perfil de administrador. O operador não vê o item no menu e, se digitar o endereço na barra, é devolvido para a tela inicial.

### Atividade

Mostra tudo o que foi lançado, agrupado por dia, com o nome de quem fez cada lançamento. É aqui que você responde perguntas como:

- Quem registrou a contagem do Curral 2 na terça-feira?
- Quantos animais o João cadastrou esta semana?
- Quem lançou a ocorrência do animal 142?

Use os dois filtros do topo para ver por pessoa ou por tipo de lançamento.

### Equipe

Lista as contas de acesso com o perfil de cada uma. O seletor à direita muda o perfil na hora.

O nome exibido vem do campo `full_name` do Supabase. Se você criou o usuário só com e-mail, é o e-mail que aparece. Para exibir o nome da pessoa, edite o usuário em `Authentication` e preencha `User Metadata` conforme mostrado na seção 4.1.

### Onde o responsável também aparece

Para o administrador, o nome de quem registrou aparece diretamente na lista de `Contagens` e na de `Ocorrências`, sem precisar abrir a Administração.

## 14. Segurança e backup

### Como o sistema se protege

- A autoria de cada registro é gravada por gatilho no banco, a partir da sessão autenticada. O navegador não consegue forjar quem fez o lançamento.
- O operador só consegue ler a própria conta na tabela `profiles`. Mesmo consultando a API por fora, ele não transforma um identificador em nome de pessoa.
- Nenhum operador consegue se promover a administrador: não existe política de atualização de perfil para ele.
- O banco impede remover o último administrador.
- A chave do Gemini nunca chega ao navegador. Ela fica nos secrets do Supabase e é usada apenas dentro da função no servidor.

### O que depende de você

- Crie uma conta por pessoa. Login compartilhado destrói a rastreabilidade.
- Não compartilhe a senha do projeto Supabase.
- Não coloque a chave `service_role` no navegador.
- Não coloque a chave do Gemini em nenhuma variável `VITE_`.
- Quando alguém sair da fazenda, remova o usuário em `Authentication`. Os registros feitos por ela continuam no histórico.

### Backup

- O Supabase mantém os dados no PostgreSQL, com backup automático conforme o plano contratado.
- Faça exportações periódicas em CSV pela tela `Documentos`, como cópia operacional que abre no Excel.
- Antes de excluir um animal, confirme se o cadastro realmente deve ser removido. Para manter histórico, prefira a situação `vendido` ou `morto`.

## 15. Se algo der errado

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| Rodapé mostra `Modo demonstração` com `.env` preenchido | Servidor não foi reiniciado, ou arquivo fora da raiz | Confira o local do `.env` e rode `npm run dev` de novo |
| `E-mail ou senha não conferem` | Usuário não existe ou não foi confirmado | Recrie em `Authentication` marcando `Auto Confirm User` |
| `Esta conta não possui acesso administrativo` | A conta ainda é operador | Execute o `update` da seção 4.2, ou entre pela aba `Operador` |
| Menu não mostra `Administração` | Perfil da conta é operador | Promova pela tela `Equipe` usando outra conta administrativa |
| Tela em branco após publicar no Netlify | Variáveis não cadastradas, ou deploy antigo | Faça a seção 9 e solicite novo deploy |
| Foto não aparece no PDF | Bucket sem acesso público | Reexecute `schema.sql`, que recria o bucket e as políticas |
| Botão da IA não aparece | Supabase não configurado no `.env` | Preencha as duas variáveis e reinicie o `npm run dev` |
| `A chave do Gemini não foi configurada no servidor` | `secrets set` não executado, ou função publicada antes | Rode o `secrets set` e publique a função de novo |
| `Limite gratuito de análises atingido por agora` | Cota por minuto ou por dia estourada | Aguarde alguns minutos. Se for constante, use `gemini-3.5-flash-lite` |
| `O serviço de análise recusou a solicitação` | O secret existe, mas o Google rejeitou a chave | A mensagem entre parênteses traz o motivo. Veja a tabela abaixo |
| `A IA não conseguiu ler o brinco` | Foto distante, tremida, com barro ou brinco virado | Aproxime a foto do brinco. Digite o número à mão se persistir |

### Quando a análise é recusada

A mensagem na tela traz, entre parênteses, o motivo informado pelo Google.

| Motivo entre parênteses | O que fazer |
| --- | --- |
| `API key not valid` | O valor gravado no secret está errado. Quase sempre sobrou texto de exemplo colado na frente da chave. Rode o `secrets set` de novo com a chave limpa |
| `API key expired` | Chave revogada. Gere outra no AI Studio |
| `...GenerativeService.GenerateContent are blocked` | A API do Gemini não está ativada no projeto da chave. Abra `https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com`, selecione **o projeto que o AI Studio criou** e clique em `Ativar` |
| `ACCESS_TOKEN_TYPE_UNSUPPORTED` ou `401 UNAUTHENTICATED` | Falha conhecida em algumas contas com chaves `AQ.`. Gere outra chave no AI Studio. Se repetir, o caso precisa ser aberto no fórum do Gemini, porque é do lado do Google |
| `API_KEY_SERVICE_BLOCKED` | Chave padrão `AIzaSy` tentando acessar o Gemini. Desde junho de 2026 isso é recusado. Gere uma chave pelo AI Studio, conforme a seção 5.2 |
| `models/... is not found` | Nome de modelo inválido no secret `GEMINI_MODEL`. Volte ao padrão com `npx supabase secrets set GEMINI_MODEL=gemini-3.6-flash` |
| `...is no longer available to new users` | O modelo saiu de circulação. Veja a seção logo abaixo |

### Quando o modelo sai de circulação

O Google aposenta modelos com frequência, e contas criadas depois da aposentadoria perdem o acesso antes das contas antigas. Quando isso acontece, a mensagem é clara: `This model models/... is no longer available to new users`.

Não é preciso mexer no código. Descubra quais modelos a **sua conta** aceita:

```powershell
(curl.exe -s "https://generativelanguage.googleapis.com/v1beta/models" -H "x-goog-api-key: SUA_CHAVE" | ConvertFrom-Json).models | Where-Object { $_.supportedGenerationMethods -contains "generateContent" } | Select-Object -ExpandProperty name
```

Escolha um da lista, retirando o prefixo `models/`, e grave:

```bash
npx supabase secrets set GEMINI_MODEL=nome-do-modelo
```

Prefira os modelos `flash`, que são os mais baratos e rápidos, e têm precisão suficiente para ler um brinco. Não é necessário republicar a função.
| `HTTP 403` | Chave restrita por domínio ou IP no Google Cloud. Remova a restrição ou gere uma chave sem ela |

Confira também o que está gravado, comparando com a sua chave:

```bash
npx supabase secrets list
```

Para ver o erro completo, direto do servidor:

```bash
npx supabase functions logs analisar-foto
```

Procure a linha que começa com `Erro do Gemini:`. Ela mostra o status HTTP e a resposta inteira do Google.

## 16. Alterações futuras recomendadas após a apresentação

Faça a apresentação do MVP e anote quais informações o seu sogro realmente consulta. Depois, priorize somente o que entrar na rotina.

Ordem sugerida:

1. Ajustar os campos do cadastro conforme o uso real.
2. Adaptar a folha impressa ao modelo usado hoje na fazenda.
3. Importar a planilha existente.
4. Comprimir a foto também no envio, e não apenas na exportação e na análise. Hoje a foto sobe no tamanho original da câmera, o que pesa no 4G da fazenda.
5. Identificar o animal pela foto no curral, buscando o número lido entre os já cadastrados. É o recurso de maior valor prático, e depende de validar antes se a leitura se sustenta em uso corrido.
6. Adicionar histórico simples de pesagens, somente se houver uso real.
7. Carregar as bibliotecas de PDF e Word sob demanda, para o primeiro acesso ficar mais leve.
8. Implementar funcionamento offline dos registros de campo.

A estrutura atual foi mantida modular para receber esses incrementos sem reconstruir o projeto do zero.
