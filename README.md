# Fazenda Pântano

**A planilha do rebanho, em forma de aplicativo.** O controle que a fazenda montou na planilha `Gado_Rebanho_Fazenda` (v11, com macros), com as mesmas regras, só que no celular: lista do rebanho com foto, fêmeas com os 3 protocolos de IATF por ciclo, parto que cria o bezerro, bezerros até o 8º mês, manejo em lote com quem faltou, baixa com número liberado, quadro de campo para imprimir e comparação com o IMA.

Publicado em **fazendapantano.achillesmedia.com.br**. Desenvolvido pela Achilles.

As regras de negócio, levantadas das fórmulas, validações e do VBA da planilha, estão em **[docs/REGRAS-DA-PLANILHA.md](docs/REGRAS-DA-PLANILHA.md)**.

## Da planilha para o app

| Na planilha | No app |
|---|---|
| Aba Geral (quadro do topo) | **Painel**: machos, fêmeas e sem sexo por faixa; ativos, bezerros ao pé, números disponíveis, manejos pendentes e o que precisa de ação |
| Aba Geral (lista), Machos e Fêmeas | **Animais**: lista com foto, sexo e faixa editáveis na própria linha, abas Fêmeas / Machos / Sem sexo / Saíram, busca e CSV |
| Preencher sexo de 400 animais | **Completar cadastro**: um animal por vez, foto grande, botões grandes (teclado: M, F, 1 a 4, Enter) |
| Botão + e aba Detalhe | **Ficha do animal**: dados, foto, setas para o anterior e o próximo (todos ou do mesmo sexo), protocolos, partos, ciclos anteriores, avaliação do macho, manejos e baixa |
| Aba Fêmeas (3 protocolos na linha) | **Fêmeas e IATF**: as vacas por fase (aguardando, em protocolo, vazia, prenha, com bezerro, descarte) |
| Registrar parto | Cria o bezerro `<brinco da mãe>-B<n>` mamando, arquiva o ciclo e a vaca volta ao 1º protocolo |
| Aba Bezerros | **Bezerros**: aviso do 8º mês, destino e **Incorporar ao rebanho** com número disponível sugerido |
| Manejo em lote | **Manejo em lote**: gera a lista, troca para "Faltou" quem não veio, confirma; quem faltou fica pendente |
| Aba Manejos | **Histórico de manejos**, com as pendências em vermelho e o botão para marcar como feitas |
| Saída (venda, morte, descarte) | O registro vira **X + brinco**, em vermelho, e o número vai para **Números disponíveis**; dá para desfazer |
| Quadro (lona) | **Quadro de campo**: PDF grande e vetorial para a gráfica, com códigos N, M, S, V, F, P, D, O |
| Lançar do quadro | Cole a tabela, digite as linhas ou **fotografe o quadro e a IA transcreve**; cada linha recebe OK ou ERRO |
| Aba IMA | **Comparar com o IMA**: diferença por faixa e sexo e o plano de ação do que declarar |

## Decisões

**As regras são código testado, não fórmula solta.** `src/domain/regras.ts` (situação, faixa, aviso do bezerro, IMA, lista do lote) e `src/domain/operacoes.ts` (as macros: parto, baixa, incorporar, lote...) são funções puras, cobertas por `npm test`. A tela só chama.

**Os 402 animais vieram da planilha**, com foto e a observação da conferência das fotos (`src/data/rebanho-planilha.json`, fotos em `public/rebanho/`). As fotos ficam em cache no celular depois da primeira vez.

**A IA sugere, a pessoa confere.** A leitura do quadro e do brinco volta para uma tela de conferência; nada é gravado sem alguém lançar.

**Descarte proposto, não automático.** Com 3 vazias no ciclo, a vaca aparece em vermelho e o sistema oferece a saída por descarte; quem confirma é a pessoa.

**Funciona sem banco.** Sem as chaves do Supabase, abre em demonstração com o rebanho da planilha guardado no navegador. Ligar o banco é rodar dois arquivos SQL e cadastrar duas variáveis.

## Stack

`React 18` · `TypeScript` · `Vite` · `Supabase` (Postgres, Auth, Storage) · `Netlify` (site e funções) · `Cloudflare` (DNS) · `Google Gemini` · `jsPDF` · `PWA`

## Rodando localmente

```bash
npm install
npm run dev
npm test
```

## Ligando o banco (Supabase)

1. No Supabase, em **SQL Editor**, execute `supabase/schema.sql` e depois `supabase/rebanho-planilha.sql` (os 402 animais). Os dois podem rodar de novo sem duplicar nada.
2. Em **Authentication > Users**, crie o primeiro usuário e promova a administrador com o comando no fim do `schema.sql`.
3. No Netlify, em **Site configuration > Environment variables**, cadastre e publique de novo:

| Variável | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | chave pública (anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role, para criar contas pela tela |
| `GEMINI_API_KEY` | leitura do brinco e do quadro por IA |

As tabelas são `rebanho_*`; as da versão anterior (genérica) não são tocadas e o schema antigo está em `supabase/legado/`.

## Estrutura

```text
src/
  domain/      Regras da planilha (regras.ts), macros (operacoes.ts), lançamento do quadro (quadro.ts) e testes
  pages/       Painel, Animais, Completar, Ficha, Fêmeas, Bezerros, Manejos, Lote, Quadro, IMA, Números, Contas
  components/  Layout, foto, botões de escolha, manejos e baixa
  services/    Banco (Supabase ou navegador), IA (brinco e quadro), contas
  data/        Os 402 animais da planilha v11
netlify/functions/  analisar-foto (brinco), ler-quadro (quadro de campo), gerenciar-usuarios
supabase/           schema.sql, rebanho-planilha.sql e o legado
docs/               Regras de negócio da planilha
```

---

Projeto real, construído com o dono da fazenda a partir da planilha que ele usa.
