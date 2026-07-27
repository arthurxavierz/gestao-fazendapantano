# 🐂 Fazenda Pântano

**Controle de rebanho que substitui a planilha.** Aplicativo web instalável no celular, com leitura do brinco por IA, rastreabilidade de quem registrou cada informação e documentos prontos para o curral.

[**Ver demonstração**](#)

<!-- Substitua o link acima pela URL publicada e adicione uma captura de tela aqui. -->

---

## O problema

Uma fazenda de corte controlada por planilhas de Excel: números de brinco digitados à mão, fotos soltas no celular, e nenhuma forma de saber quem lançou o quê. O objetivo não era construir um ERP pecuário, e sim tirar a operação do Excel sem exigir que ninguém aprendesse um sistema complicado.

Duas restrições guiaram o projeto: **o operador usa o celular no meio do pasto**, e **o dono precisa confiar no dado**.

## O que o sistema faz

**Rebanho** — cadastro com foto, situação (normal, observação, doente, morto, vendido), busca por número, raça, local ou situação, e histórico de ocorrências por animal.

**Leitura do brinco por IA** — a foto é comprimida no celular, enviada a uma Edge Function e analisada pelo Gemini, que devolve número do brinco, pelagem e raça provável, cada um com nível de confiança.

**Importação de planilha** — leitor próprio de `.xlsx` e CSV, com detecção automática de qual coluna é o quê e conversão de datas, pesos em arroba e variações de sexo e situação.

**Contagens** — conferência rápida por quantidade total ou individual, digitando os brincos conforme os animais passam.

**Documentos** — ficha individual em PDF, Word e impressão direta com a foto em tamanho grande; relação completa e folha de manejo com miniatura de cada animal; exportação CSV para Excel.

**Administração** — linha do tempo de quem registrou o quê, agrupada por dia, com filtros por pessoa e por tipo. Criação de contas, troca de senha e e-mail, e definição de perfis.

## Decisões técnicas

**A IA sugere, a pessoa confirma.** Nada do que o modelo interpreta é salvo automaticamente. As sugestões aparecem num painel destacado, com nível de confiança, e cada campo tem um botão `Usar` — os campos seguem editáveis e a marcação some quando alguém digita por cima. Um número de brinco errado gravado em silêncio contaminaria o cadastro inteiro, e o erro só apareceria meses depois na conferência.

**Rastreabilidade que não dá para forjar.** A autoria de cada registro é gravada por *trigger* no Postgres, a partir de `auth.uid()`. O cliente não envia esse campo e não consegue alterá-lo.

**Permissão no banco, não na interface.** Esconder um botão não é segurança. As políticas de RLS garantem que o operador só leia a própria linha em `profiles` — mesmo consultando a API por fora, ele não converte um identificador em nome de pessoa. Não existe política de `UPDATE` de perfil para operador, então ninguém se promove sozinho, e um *trigger* impede remover o último administrador.

**A chave da IA nunca chega ao navegador.** A chamada ao Gemini vive numa Edge Function em Deno; a chave fica nos secrets do Supabase. O modelo é configurável por variável de ambiente, porque o Google aposenta modelos com frequência.

**Gestão de contas sem expor a `service_role`.** Criar e excluir usuários exige a chave que ignora todo o RLS. Ela vive apenas numa segunda Edge Function, que valida o token do chamador e confere o papel dele no banco antes de qualquer ação — nunca confia no que o cliente afirma sobre si mesmo.

**Leitor de planilha escrito à mão.** O pacote `xlsx` no npm está parado numa versão com duas falhas de severidade alta e sem correção. Em vez de aceitar a dívida, o `.xlsx` é lido descompactando o arquivo com `fflate` (8 KB) e interpretando o XML com o `DOMParser` do próprio navegador — incluindo *shared strings*, strings inline e a conversão de datas seriais do Excel. Custo total no bundle: 18 KB.

**Funciona sem backend.** Sem `.env`, o app cai num modo de demonstração com `localStorage`, atrás da mesma interface de repositório. Isso permitiu validar as telas com o usuário final antes de provisionar qualquer infraestrutura.

**Fotos embutidas nos documentos.** As imagens são baixadas, normalizadas em canvas e embutidas no PDF e no `.docx` — foto grande na ficha individual, miniatura quadrada recortada ao centro nas listagens.

## Stack

`React 18` · `TypeScript` · `Vite` · `Supabase` (Postgres, Auth, Storage, Edge Functions) · `Google Gemini` · `jsPDF` · `docx` · `PWA` · `Netlify`

## Rodando localmente

```bash
npm install
npm run dev
```

Sem arquivo `.env`, o sistema abre em **modo de demonstração** — dá para navegar por todas as telas sem configurar nada. A tela de login permite escolher entre a visão de administrador e a de operador.

## Configuração

Para conectar o backend, copie `.env.example` para `.env` e preencha:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anon
```

Depois, no painel do Supabase, execute `supabase/schema.sql` no SQL Editor. Ele cria as tabelas, os gatilhos de autoria, as políticas de RLS e o bucket de fotos.

As duas Edge Functions são opcionais e independentes:

```bash
npx supabase functions deploy analisar-foto        # leitura do brinco por IA
npx supabase functions deploy gerenciar-usuarios   # gestão de contas pela tela
```

A primeira precisa de uma chave do Gemini, guardada apenas no servidor:

```bash
npx supabase secrets set GEMINI_API_KEY=sua_chave
```

Sem elas o sistema funciona normalmente: o botão de análise não aparece e as contas são criadas pelo painel do Supabase.

## Estrutura

```text
src/
  components/   Componentes reutilizáveis (visualizador de foto, painel da IA, layout)
  pages/        Telas: rebanho, contagens, ocorrências, documentos, administração
  services/     Supabase, modo demonstração, integração com a IA
  utils/         Exportadores (PDF/Word), tratamento de imagem, formatação
supabase/
  schema.sql    Tabelas, triggers de autoria, políticas RLS e bucket de fotos
  functions/    Edge Functions: leitura do brinco e gestão de contas
```

## Roadmap

- Identificar o animal pela foto no curral, buscando o brinco lido entre os cadastrados
- Histórico de pesagens
- Registros de campo em modo offline

---

Projeto real, construído para uso em produção numa fazenda de corte.
