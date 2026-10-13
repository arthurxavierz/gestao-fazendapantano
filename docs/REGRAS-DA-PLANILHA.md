# Regras de negócio da planilha (v11)

Levantadas de `Gado_Rebanho_Fazenda_v11.xlsm`: abas, fórmulas, validações, formatação condicional e o código VBA. São elas que o sistema reproduz. Cada regra indica onde mora no código (`src/domain/regras.ts`).

## Animal

- **Brinco** é a chave. Pode ter letra (`2-A`, `342-B`). Não pode repetir entre animais ativos.
- **Sexo**: `M`, `F` ou vazio. Vazio aparece como **"Falta informar o sexo"**.
- **Data de nascimento** ou **faixa etária**. Com data, a faixa é calculada sozinha e se atualiza com o tempo; sem data, vale a faixa informada.
- **Faixas**: `0 a 12`, `13 a 24`, `25 a 36`, `Acima de 36` meses. Meses completos: só conta o mês quando o dia do nascimento já passou.
- **Raça**: Nelore, Cruzado, Gir, Angus, Outra. **Cor**: Branca, Cinza, Vermelha, Preta, Malhada, Rajada, Outra.
- **No IMA?** (sim/não), **Observações**, **Conferência da foto** (texto; começa com "Conferir" quando precisa ver no curral, e a linha fica destacada).
- **Último manejo**: a data mais recente no histórico de manejos do animal.
- **Manejo pendente**: quantos manejos ele tem como "Pendente".

## Troca de sexo

- Preencher `F` coloca a vaca em Fêmeas (ciclo nº 1). Preencher `M` coloca em Machos.
- Trocar o sexo de uma fêmea que **já tem protocolo lançado** ou saída é bloqueado, com aviso. O mesmo para macho com avaliação, peso ou saída.

## Situação

- **Sem sexo**: "Falta informar o sexo".
- **Macho**: a saída (Venda, Morte, Descarte) ou **"Ativo (destino: descarte)"**. O destino padrão do macho é o descarte.
- **Fêmea**, nesta ordem:
  1. Se saiu: o motivo da saída.
  2. Se o ciclo atual tem **3 resultados "Vazia"**: **"Descarte (3 protocolos vazia)"**.
  3. Último resultado do ciclo (3º, senão 2º, senão 1º) = Prenha: **"Prenha"**.
  4. Último resultado = Vazia: **"Vazia (aguardando próximo protocolo)"**.
  5. Tem bezerro mamando: **"Com bezerro ao pé"**.
  6. Senão: **"Aguardando protocolo"**.

## Protocolos de IATF (fêmeas)

- Cada **ciclo** tem até **3 protocolos**. Cada protocolo: **Apta p/ IATF** (S/N), **motivo se não apta** (Prenha, Jovem, Anestro, Bezerro novo, Magra, Infusão, Outro), **data do protocolo**, **data da confirmação**, **resultado** (Prenha ou Vazia).
- **3 vazias no ciclo = descarte.** O sistema mostra a matriz em vermelho e propõe a saída por descarte; quem confirma é a pessoa.

## Parto

- Registrado na ficha da vaca: **data**, **sexo do bezerro** e **observação**.
- O bezerro recebe o código **`<brinco da mãe>-B<n>`** (n = partos da vaca + 1, pulando códigos já usados), situação **"Mamando"**.
- O ciclo atual da vaca é **encerrado e arquivado** em "Protocolos anteriores" com a data do parto, o código do bezerro e a data do encerramento. Os 3 protocolos são limpos e o **ciclo passa para o próximo número**.
- Fêmeas mostram **partos**, **último parto** e **bezerros ao pé** (mamando).

## Bezerros

- Ficam ligados à mãe até o **8º mês**. Idade em meses completos desde o nascimento.
- **Situação**: Mamando, Ficou na fazenda, Vendido, Morto, Descarte, Incorporado ao rebanho. Mais a data do destino, o brinco definitivo e observações.
- **Aviso**:
  - Vendido, Morto ou Descarte: nada.
  - Incorporado: "Já está no rebanho".
  - Sem nascimento: "Informe a data de nascimento".
  - 8 meses ou mais e "Ficou na fazenda": **"Pronto: incorporar ao rebanho"**.
  - 8 meses ou mais com outra situação: **"Passou do 8º mês: definir o destino"**.
  - Antes do 8º mês: "Ao pé da mãe: faltam N mês(es) para o 8º mês".
- **Incorporar ao rebanho** (só "Ficou na fazenda"):
  - antes do 8º mês, pede confirmação;
  - exige o sexo;
  - pede o brinco definitivo e sugere o primeiro **número disponível** que não esteja em uso;
  - recusa um brinco já usado por um animal ativo;
  - cria o animal com sexo, nascimento, faixa e a observação "Nascido na fazenda, filho da vaca X (bezerro COD)";
  - passa os manejos do bezerro para o animal novo;
  - marca o bezerro como "Incorporado ao rebanho", com a data.

## Manejos

- Tipos: Vacina, Vermífugo, Medicamento, Pesagem, Exame, Inseminação, Marcação / brinco, Castração, Desmama, Mudança de pasto, Outro.
- Cada registro: data, animal (ou bezerro), manejo, produtos utilizados, observação, **status**:
  - **Feito**;
  - **Pendente**: o animal faltou;
  - **Feito depois**: a pendência foi resolvida, com a data em que foi feita.
- **Manejo de um animal** na ficha: exige data e pelo menos o manejo, o produto ou a observação.
- **Manejo em lote**:
  1. Informe data, manejo, produto, observação geral e **para quem vale**: Todo o rebanho; Todo o rebanho + bezerros; Fêmeas; Machos; uma faixa etária; Bezerros ao pé (mamando ou "ficou na fazenda"); Sem sexo informado. Animais que já saíram não entram.
  2. Gere a lista: todos começam como "Feito". Troque para **"Faltou"** quem não veio. Cada animal pode ter uma observação própria, somada à geral.
  3. Confirme: quem faltou fica **Pendente**.
- **Marcar pendências como feitas**: pede a data e muda todas as pendências do animal para "Feito depois".

## Saída (baixa)

- Venda, Morte ou Descarte, com data (padrão: hoje). Pede confirmação.
- O registro continua guardado e aparece como **`X<brinco>`** (por exemplo X149), em vermelho.
- O número vai para **Números disponíveis**: número, data de liberação, registro antigo (`X149`), situação "Disponível" e o motivo com a data.
- **Desfazer baixa**: o animal volta com o número original. Se o número já foi reutilizado, pede outro, que não pode estar em uso. Na lista de números, a situação vira "Baixa desfeita".
- **Reutilização**: ao cadastrar um animal com um número "Disponível", o número passa a "Reutilizado", com a data.

## Painel (topo da Geral)

- Machos, fêmeas e sem sexo **por faixa etária** (mais "sem faixa"), só animais ativos.
- Animais ativos, bezerros ao pé (mamando), bezerros com 8+ meses sem destino, números disponíveis e manejos pendentes.

## IMA

- Entrada: data do relatório e o consolidado do IMA (machos e fêmeas por faixa).
- **Na fazenda**: ativos por sexo e faixa, mais os **bezerros mamando ou "ficou na fazenda" na faixa 0 a 12**.
- **Diferença** = fazenda − IMA, por faixa e sexo.
- **Plano de ação**:
  1. Avisa quantos animais estão sem sexo ou sem faixa (ficam fora da conta).
  2. **Faixas vizinhas** se compensam:
     - fazenda +m numa faixa e IMA +m na seguinte: "Faixa diferente", confira a idade;
     - IMA +m numa faixa e fazenda +m na seguinte: "Mudança de faixa", atualize no IMA.
  3. O que sobra:
     - IMA a mais: declarar saída (morte, venda, abate, descarte);
     - fazenda a mais em 0 a 12: declarar nascimentos ou compra;
     - fazenda a mais nas outras faixas: declarar entrada (compra, transferência) ou conferir a faixa.
  4. Sem diferença: "Tudo certo".

## Quadro de campo (lona) e lançamento

- **Quadro**: todos os ativos e os bezerros ao pé, em 6 blocos de colunas (Brinco, Sexo, Faixa, Situação curta, Pendências, ANOTAÇÃO), mais um bloco de OCORRÊNCIAS (Data, Brinco, Código, o que aconteceu). Impresso grande e pendurado; a equipe anota à caneta.
- **Códigos**:

  | Código | Significado | Detalhe |
  |---|---|---|
  | N | nasceu bezerro | sexo |
  | M | morreu | |
  | S | saiu / vendeu | "descarte" vira saída por descarte; o resto, venda |
  | V | vacina ou remédio | qual |
  | F | faltou no manejo | qual; vira manejo pendente |
  | P | protocolo | vazio abre o próximo protocolo (apta S, com a data); "prenha" ou "vazia" fecha o último protocolo aberto (com data e sem resultado) |
  | D | dado | "sexo M/F", "faixa 13 a 24", "nasc 10/03/2025" |
  | O | outro | vira um manejo "Outro" com o detalhe |

- **Lançar do quadro**: cada linha (Data, Brinco, Código, Detalhe) é aplicada e recebe um resultado "OK…" ou "ERRO…". Linhas já lançadas não são lançadas de novo.
