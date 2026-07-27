# Fazenda Pântano

Web app responsivo para controle simples de animais, ocorrências, contagens e documentos impressos.

## O que já está implementado

- Login individual com dois perfis: administrador e operador
- Tela de administração com o histórico de quem registrou cada informação e a gestão da equipe
- Tela inicial com resumo do rebanho
- Cadastro e edição de animal com foto
- Leitura do número do brinco, da pelagem e da raça provável por IA, com confirmação obrigatória do usuário
- Pesquisa por número, raça, local e situação
- Situações: normal, em observação, doente, morto e vendido
- Registro rápido de ocorrências
- Contagem somente por quantidade ou por número do animal
- Ficha individual em PDF, Word e impressão direta, com a foto do animal em tamanho grande
- Relação completa em PDF e Word, com miniatura da foto de cada animal
- Folha de controle de manejo em PDF para preencher no papel, com miniatura da foto
- Exportação CSV compatível com Excel
- Interface responsiva para computador e celular
- PWA instalável na tela inicial do celular
- Supabase para autenticação, banco, armazenamento de fotos e Edge Function da IA
- Modo demonstração local quando o Supabase ainda não está configurado

## Tecnologias

- React
- TypeScript
- Vite
- Supabase
- Netlify
- jsPDF
- docx
- PWA

## Início rápido

```bash
npm install
npm run dev
```

Abra o endereço mostrado no terminal. Sem arquivo `.env`, o sistema inicia em modo de demonstração.

Para configurar banco, autenticação e publicação, leia [GUIA_IMPLANTACAO.md](./GUIA_IMPLANTACAO.md).

## Estrutura do projeto

```text
src/
  components/     Componentes visuais reutilizáveis
  pages/          Telas do sistema
  services/       Supabase, modo local e persistência
  types/          Tipos de dados
  utils/          Exportações e formatação
supabase/
  schema.sql      Tabelas, políticas e bucket de fotos
  demo-data.sql   Dados opcionais para teste
  functions/      Edge Function que lê o brinco com o Gemini
```

## Próximas incrementações possíveis

- Importação direta da planilha atual do sogro
- Perfis mais rígidos para administrador e operador
- Registro de múltiplas fazendas
- Histórico simples de pesagens
- Relatório por período
- Ficha de vacinação ou medicação
- Modo offline de dados de campo
- Leitura de QR Code ou brinco eletrônico
- Integração com WhatsApp para avisos administrativos

A estrutura atual foi mantida modular para receber esses incrementos sem reconstruir o projeto do zero.
