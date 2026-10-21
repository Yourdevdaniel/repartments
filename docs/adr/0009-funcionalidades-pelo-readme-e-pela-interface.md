# 0009. Funcionalidades lidas do README e da interface

- Estado: aceito
- Data: 2026-10-08

## Contexto e problema

A análise ([0003](0003-analise-estatica-sem-llm.md)) só contava a arquitetura: partes, rotas, bancos, agentes. Em 12 repositórios medidos, ela falhou em 7: projetos sem back-end, sites de uma página, bots e ferramentas de terminal saíam com uma cena genérica ("Visão geral") que não dizia nada do que o projeto faz. Para quem assiste, a pergunta é "o que isso faz por mim?", e a arquitetura não responde.

## Opções consideradas

1. **Só arquitetura** (como estava). Nada novo a manter, mas a cena fica vazia ou genérica em projetos pequenos.
2. **Ler o README.** O autor já descreveu o que o projeto faz, nas palavras dele. Depende da qualidade do texto.
3. **Ler a interface**: rótulos de botões das telas e comandos de bots e de terminal. Mostra o que existe de fato, mas só o que está escrito literalmente no código.
4. **Resumir com uma LLM.** Descartada: [0003](0003-analise-estatica-sem-llm.md) decidiu não usar LLM, por privacidade, custo e porque o resultado não seria repetível.

## Decisão

Opções 2 e 3, juntas (`src/architecture/features.ts`). O README da raiz dá a frase de abertura e os itens das seções de funcionalidades e de uso; as telas e os comandos dão botões e subcomandos. O que README e código confirmam vai primeiro. Uma nova cena, "O que dá para fazer", abre a apresentação quando há 2 ou mais funcionalidades. Se faltar a frase de abertura, vale a descrição do repositório no GitHub e, por último, o `<title>` do `index.html`. README e `.html` são lidos só para isso e ficam fora da análise de código.

## Consequências

- Os textos aparecem no idioma do autor, sem tradução.
- Um README ruim ou ausente dá uma cena fraca ou nenhuma; o roteiro editável serve para corrigir.
- Nada é inventado: toda funcionalidade vem de uma linha do README, de um botão ou de um comando registrado, e botões e comandos guardam o arquivo e a linha de origem.
- Continua sem LLM e sem executar código do repositório; a análise segue determinística e roda no navegador.
- Mais dois tipos de arquivo são baixados (README e `.html`), dentro do mesmo orçamento de 700 arquivos e 7 MB.
