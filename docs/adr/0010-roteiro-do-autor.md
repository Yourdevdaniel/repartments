# 0010. Roteiro do autor em um arquivo escrito pela IA do cliente

- Estado: aceito
- Data: 2026-10-08

## Contexto e problema

A leitura automática ([0003](0003-analise-estatica-sem-llm.md), [0009](0009-funcionalidades-pelo-readme-e-pela-interface.md)) entende a arquitetura, mas não a intenção: dá nomes genéricos às partes, não sabe quais cenas contam melhor o sistema e erra quando o código não diz o que o produto faz. Quem conhece o sistema sabe, e precisa de um jeito de dizer isso ao estúdio sem depender de editar tudo à mão, cena por cena.

## Opções consideradas

1. **Só leitura automática** (como estava). Nada novo a manter, mas o resultado fica genérico e a correção é toda manual.
2. **Editor manual no estúdio.** Já existe para legendas e nomes; para escrever cenas inteiras é trabalhoso, e nada do que se escreve volta para o repositório.
3. **LLM no servidor do estúdio.** Descartada: [0003](0003-analise-estatica-sem-llm.md) decidiu não usar LLM, por privacidade, custo e porque o resultado não seria repetível. Mandaria código de repositórios privados para um terceiro.
4. **Um arquivo `repartments.json` escrito pela IA que o cliente já usa**, a partir de um prompt que o estúdio oferece, e lido pelo estúdio como dado.

## Decisão

Opção 4 (`src/architecture/authored.ts`, `src/studio/authorPrompt.ts`). O estúdio lê o `repartments.json` da raiz do repositório, ou um arquivo importado, que vale no lugar dele. O botão "Copiar prompt para a IA" só copia um texto fixo, preenchido com o repositório e um rascunho do que o estúdio leu; nada é enviado. O texto completo está em [roteiro.md](../roteiro.md#transparência-sobre-o-prompt) e um teste o mantém igual ao do código. O formato tem um JSON Schema publicado (`public/schema/repartments-1.json`) e um exemplo (`docs/exemplos/repartments.json`). Se o arquivo traz cenas ou funcionalidades, elas substituem as cenas lidas do código, que ficam de reserva. O estúdio também exporta o roteiro que mostra, para que as edições possam voltar ao repositório.

## Consequências

- Nenhuma LLM é chamada pelo estúdio, e a análise continua determinística; só o resultado da IA do cliente entra, como texto.
- **Segurança:** o arquivo é texto não confiável. É só passado por `JSON.parse`, cada campo é conferido e copiado um a um, textos são cortados nos limites da apresentação, nada vira HTML nem código, e o arquivo é limitado a 200 KB. Arquivos citados são procurados no repositório; caminho absoluto ou com `..` é ignorado. O que não confere sai com um aviso em vez de derrubar o arquivo; só JSON inválido, não-objeto, arquivo grande demais ou versão maior que a lida são recusados.
- A IA pode errar ou inventar: por isso o prompt pede só o que o código mostra e o estúdio mostra quantos arquivos citados foram encontrados. Um roteiro de outro commit é marcado como desatualizado.
- **Versões:** o campo `version` começa em 1; o estúdio recusa versões maiores. Campos novos na raiz são aceitos por quem lê, então acrescentar não exige nova versão; mudar o sentido de um campo exige, com um novo schema (`repartments-2.json`) e o antigo mantido.
- Um `repartments.json` na raiz passa a ser lido (e fica fora da análise de código), como o README.
- O prompt é parte do produto: mudar o texto exige mudar [roteiro.md](../roteiro.md), e o teste avisa se os dois se separarem.
