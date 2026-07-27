# 🐂 Fazenda Pântano

**Controle de rebanho que substitui a planilha.** Aplicativo web instalável no celular, com leitura do brinco por IA, rastreabilidade de quem registrou cada informação e documentos prontos para o curral.

## O problema

Uma fazenda de corte controlada por planilhas de Excel: números de brinco digitados à mão, fotos soltas no celular, e nenhuma forma de saber quem lançou o quê. O objetivo não era construir um ERP pecuário, e sim tirar a operação do Excel sem exigir que ninguém aprendesse um sistema complicado.

Duas restrições guiaram o projeto: **o operador usa o celular no meio do pasto**, e **o dono precisa confiar no dado**.

## O que o sistema faz

**Rebanho** — cadastro com foto, situação (normal, observação, doente, morto, vendido), busca por número, raça, local ou situação, e histórico de ocorrências por animal.

**Leitura do brinco por IA** — a foto é comprimida no celular, enviada a uma Edge Function e analisada pelo Gemini, que devolve número do brinco, pelagem e raça provável, cada um com nível de confiança.

**Contagens** — conferência rápida por quantidade total ou individual, digitando os brincos conforme os animais passam.

**Documentos** — ficha individual em PDF, Word e impressão direta com a foto em tamanho grande; relação completa e folha de manejo com miniatura de cada animal; exportação CSV para Excel.

**Administração** — linha do tempo de quem registrou o quê, agrupada por dia, com filtros por pessoa e por tipo. Gestão de perfis da equipe.

## Decisões técnicas

**A IA sugere, a pessoa confirma.** Nada do que o modelo interpreta é salvo automaticamente. As sugestões aparecem num painel destacado, com nível de confiança, e cada campo tem um botão `Usar` — os campos seguem editáveis e a marcação some quando alguém digita por cima. Um número de brinco errado gravado em silêncio contaminaria o cadastro inteiro, e o erro só apareceria meses depois na conferência.

**Rastreabilidade que não dá para forjar.** A autoria de cada registro é gravada por *trigger* no Postgres, a partir de `auth.uid()`. O cliente não envia esse campo e não consegue alterá-lo.

**Permissão no banco, não na interface.** Esconder um botão não é segurança. As políticas de RLS garantem que o operador só leia a própria linha em `profiles` — mesmo consultando a API por fora, ele não converte um identificador em nome de pessoa. Não existe política de `UPDATE` de perfil para operador, então ninguém se promove sozinho, e um *trigger* impede remover o último administrador.

**A chave da IA nunca chega ao navegador.** A chamada ao Gemini vive numa Edge Function em Deno; a chave fica nos secrets do Supabase. O modelo é configurável por variável de ambiente, porque o Google aposenta modelos com frequência.

**Funciona sem backend.** Sem `.env`, o app cai num modo de demonstração com `localStorage`, atrás da mesma interface de repositório. Isso permitiu validar as telas com o usuário final antes de provisionar qualquer infraestrutura.

**Fotos embutidas nos documentos.** As imagens são baixadas, normalizadas em canvas e embutidas no PDF e no `.docx` — foto grande na ficha individual, miniatura quadrada recortada ao centro nas listagens.

## Stack

`React 18` · `TypeScript` · `Vite` · `Supabase` (Postgres, Auth, Storage, Edge Functions) · `Google Gemini` · `jsPDF` · `docx` · `PWA` · `Netlify`

## Rodando localmente

```bash
npm install
npm run dev
```

Sem arquivo `.env`, o sistema abre em modo de demonstração — dá para navegar por todas as telas sem configurar nada. A tela de login permite escolher entre a visão de administrador e a de operador.

## Estrutura

```text
src/
  components/   Componentes reutilizáveis (visualizador de foto, painel da IA, layout)
  pages/        Telas: rebanho, contagens, ocorrências, documentos, administração
  services/     Supabase, modo demonstração, integração com a IA
  utils/         Exportadores (PDF/Word), tratamento de imagem, formatação
supabase/
  schema.sql    Tabelas, triggers de autoria, políticas RLS e bucket de fotos
  functions/    Edge Function que lê o brinco com o Gemini
```

## Roadmap

- Importação da planilha atual
- Identificar o animal pela foto no curral, buscando o brinco lido entre os cadastrados
- Histórico de pesagens
- Registros de campo em modo offline

---

Projeto real, construído para uso em produção numa fazenda de corte.
