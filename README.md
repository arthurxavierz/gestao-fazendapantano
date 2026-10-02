# 🐂 Fazenda Pântano

**Gestão pecuária que substitui a planilha.** Aplicativo web instalável no celular para rebanho de corte e cria: reprodução com protocolos de IATF, partos com genealogia, vacinas com calendário de reforço, pesagens com ganho diário, compras de lotes, leitura do brinco por IA e rastreabilidade de quem registrou cada informação.

[**Ver demonstração**](#)

<!-- Substitua o link acima pela URL publicada e adicione uma captura de tela aqui. -->

---

## O problema

Uma fazenda de corte controlada por planilhas de Excel: números de brinco digitados à mão, fotos soltas no celular, protocolos de inseminação anotados em caderno e nenhuma forma de saber quem lançou o quê. O objetivo não era construir um ERP pecuário, e sim tirar a operação do Excel sem exigir que ninguém aprendesse um sistema complicado.

Duas restrições guiaram o projeto: **o operador usa o celular no meio do pasto**, e **o dono precisa confiar no dado**.

## O que o sistema faz

**Painel.** Rebanho ativo, taxa de prenhez, matrizes aguardando diagnóstico e GMD da engorda. Composição por categoria, situação das matrizes, próximas doses, evolução do peso médio e partos previstos por mês. Alertas do que precisa de ação: manejos atrasados, matrizes na última tentativa, partos próximos, animais em carência.

**Agenda.** Montada sozinha a partir dos registros: etapas de protocolo, diagnósticos, partos previstos e reforços de vacina, agrupados por dia e por lote, com o botão para concluir direto dali.

**Reprodução.**
- Protocolos configuráveis (IATF 3 e 4 manejos e repasse com touro já vêm prontos). Cada etapa tem o dia relativo ao D0.
- Quadro por fase: vazia, em protocolo, aguardando diagnóstico, prenhe, pós-parto e descarte.
- Etapas concluídas em lote, desmarcando quem não passou pelo curral naquele dia.
- Diagnóstico de gestação em lote, com previsão de parto calculada pela gestação configurada.
- **Regra de descarte:** cada vazia ou aborto conta como tentativa sem prenhez. Ao atingir o limite da fazenda (padrão: 4), o sistema propõe enviar a matriz para descarte (abate), a pessoa confirma, a situação muda e fica registrada uma ocorrência com o motivo.
- Parto que cria o bezerro já vinculado à mãe, ao touro ou sêmen, com data de nascimento, lote e peso ao nascer. Novilha que pariu passa a vaca.
- Respeito ao puerpério: vaca recém-parida só volta a ficar apta depois de 30 dias.

**Rebanho.**
- Categoria (bezerro, garrote, novilha, vaca, boi, touro) informada ou deduzida pela idade e sexo, para o cadastro antigo já aparecer classificado.
- Origem estruturada: **nascido na fazenda** aponta para a mãe; **comprado** aponta para o lote de compra.
- Ficha com abas: resumo, reprodução, sanitário, pesagens com gráfico, família (mãe, pai, irmãos, crias) e ocorrências.
- Cadastro de vários animais de uma vez pela faixa de brincos (`401-440, 445`), vinculados à compra.

**Compras.** Lote com fornecedor, GTA, data de entrada, quantidade, valor total e peso médio na chegada. Mostra custo por cabeça, quantos ainda faltam cadastrar e quanto o lote ganhou de peso desde a compra.

**Sanitário.** Vacinas, vermífugos, carrapaticidas e medicamentos aplicados em um ou vários animais. Atalhos para os produtos comuns já preenchem a próxima dose e a carência. A próxima dose entra na agenda; a carência gera o aviso "não enviar para abate".

**Pesagem.** Modo curral: digita o brinco, Enter, o peso, Enter, e o próximo já fica pronto. Mostra o ganho diário na hora, comparado com a pesagem anterior. Peso médio e GMD por lote, @ estimada.

**Leitura do brinco por IA.** A foto é comprimida no celular, enviada a uma Edge Function e analisada pelo Gemini, que devolve número do brinco, pelagem e raça provável, cada um com nível de confiança.

**Importação de planilha.** Leitor próprio de `.xlsx` e CSV, com detecção automática de qual coluna é o quê.

**Contagens e ocorrências.** Conferência por quantidade ou por brinco; registro de doença, observação, recuperação, morte e descarte.

**Documentos.** Ficha individual em PDF, Word e impressão; relação completa e folha de manejo com miniatura de cada animal; relatório reprodutivo das matrizes; CSV com categoria, origem, mãe, pai e compra.

**Administração.** Linha do tempo de quem registrou o quê (cadastros, ocorrências, contagens, reprodução, vacinas, pesagens e compras), contas e perfis, e as **regras da fazenda**: limite de tentativas até o descarte, duração da gestação, dias até o diagnóstico e idade mínima para reprodução.

## Decisões técnicas

**A IA sugere, a pessoa confirma.** Nada do que o modelo interpreta é salvo automaticamente. O mesmo vale para o descarte reprodutivo: o sistema calcula e propõe, mas quem marca é a pessoa.

**Estado reprodutivo calculado, não gravado.** A fase de cada matriz (vazia, prenhe, pós-parto...) é derivada das tentativas registradas. Não existe um campo "situação reprodutiva" que possa ficar desatualizado em relação ao histórico.

**Cada tentativa guarda uma cópia das etapas.** Editar um protocolo não reescreve o passado: as tentativas já iniciadas continuam com as etapas que tinham.

**Agenda sem agendamento.** Nada é marcado à mão. Datas de etapas, diagnósticos, partos e reforços saem dos registros, então a agenda nunca diverge do que foi lançado.

**Rastreabilidade que não dá para forjar.** A autoria de cada registro, inclusive nas tabelas novas, é gravada por *trigger* no Postgres a partir de `auth.uid()`.

**Permissão no banco, não na interface.** As políticas de RLS garantem que o operador só leia a própria linha em `profiles`. As regras da fazenda todos leem, mas só o administrador altera.

**Migração sem susto.** O `schema.sql` é idempotente e pode ser executado sobre o banco em produção. Enquanto ele não roda, o app continua funcionando: grava só as colunas antigas, esconde o que depende das tabelas novas e mostra um aviso para o administrador.

**A chave da IA nunca chega ao navegador.** A chamada ao Gemini vive numa Edge Function em Deno; a chave fica nos secrets do Supabase.

**Leitor de planilha escrito à mão** e **gráficos em SVG puro.** Sem dependências pesadas para o que cabe em poucas dezenas de linhas. As bibliotecas de PDF e Word só são baixadas quando alguém gera um documento.

**Funciona sem backend.** Sem `.env`, o app abre em modo de demonstração com um rebanho de exemplo completo (matrizes em todas as fases, bezerros com mãe, compras, vacinas e pesagens), atrás da mesma interface de repositório.

## Stack

`React 18` · `TypeScript` · `Vite` · `Supabase` (Postgres, Auth, Storage, Edge Functions) · `Google Gemini` · `jsPDF` · `docx` · `PWA` · `Netlify`

## Rodando localmente

```bash
npm install
npm run dev
```

Sem arquivo `.env`, o sistema abre em **modo de demonstração**. O botão "Reiniciar demo", no rodapé do menu, volta o rebanho de exemplo ao estado inicial.

## Configuração

Copie `.env.example` para `.env` e preencha:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anon
```

Depois, no painel do Supabase, execute `supabase/schema.sql` no SQL Editor.

### Atualizando um banco que já está em uso

Execute o `supabase/schema.sql` completo de novo. Ele só cria o que falta:

- colunas novas em `animals` (categoria, origem, mãe, pai, lote de compra, entrada e saída);
- as tabelas `purchase_batches`, `repro_protocols`, `breeding_attempts`, `health_events`, `weighings` e `farm_settings`, com gatilhos de autoria e RLS;
- as situações novas `descarte` e `abatido`;
- os três protocolos iniciais, se a tabela estiver vazia.

Nenhum dado é apagado. Animais com a origem em texto ("Nascido na fazenda", "Comprado") são convertidos automaticamente para a origem estruturada.

### Edge Functions (opcionais)

```bash
npx supabase functions deploy analisar-foto        # leitura do brinco por IA
npx supabase functions deploy gerenciar-usuarios   # gestão de contas pela tela
npx supabase secrets set GEMINI_API_KEY=sua_chave
```

## Estrutura

```text
src/
  domain/       Regras de negócio puras: reprodução, agenda, sanitário, rebanho
  components/   Interface reutilizável: gráficos, seletor de animais, formulários de manejo
  pages/        Telas: painel, agenda, reprodução, manejo, compras, rebanho, documentos
  hooks/        Visão calculada do rebanho (categoria e fase reprodutiva de cada animal)
  services/     Supabase, modo demonstração, repositório genérico, IA
  utils/        Exportadores (PDF/Word), imagens, formatação
supabase/
  schema.sql    Tabelas, triggers de autoria, políticas RLS, bucket de fotos e migração v2
  functions/    Edge Functions: leitura do brinco e gestão de contas
```

## Roadmap

- Identificar o animal pela foto no curral, buscando o brinco lido entre os cadastrados
- Registros de campo em modo offline, sincronizados quando voltar o sinal
- Módulo financeiro: custo por arroba e resultado por lote

---

Projeto real, construído para uso em produção numa fazenda de corte.
