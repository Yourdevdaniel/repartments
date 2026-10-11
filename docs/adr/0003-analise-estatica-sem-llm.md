# 0003. Arquitetura por análise estática determinística, sem LLM

- Estado: aceito
- Data: 2026-10-07

## Contexto e problema

O estúdio precisa ler um repositório e dizer, para quem **não é técnico**, quais são as partes do sistema, como conversam e como um agente de IA dentro dele toma decisões. Uma LLM resumiria bem, mas:

- o código de clientes (um CRM vendido a terceiros) iria para um serviço externo;
- cada análise teria custo por token e mudaria de uma execução para outra;
- o pedido dizia "não sei se precisa ser uma LLM": o objetivo é gerar o que o programa faz e apresentar de forma visual.

## Opções consideradas

1. **LLM lê o código e escreve o modelo.** Textos melhores; custo, privacidade e resultados não reproduzíveis.
2. **Análise estática pura.** Lê árvore de arquivos, imports, rotas, manifestos e o código dos agentes com regras testáveis; textos montados por modelos de frase.
3. **Estática + LLM opcional para enfeitar os textos.** Melhor dos dois, mas reabre a questão de privacidade e acrescenta configuração.

## Decisão

Opção 2 (`src/architecture/`, detalhes em [analise.md](../analise.md)), rodando **no navegador** de quem usa ([0002](0002-token-so-no-navegador.md)). O analisador:

- escolhe os arquivos que importam (fonte, manifestos, prompts) dentro de um orçamento, e nunca lê `.env`, chaves ou pastas geradas;
- extrai imports e os resolve para arquivos do repositório (aliases do `tsconfig`, módulos Python, Go, Java…);
- agrupa arquivos em **componentes** por pasta, classifica cada um numa **camada** e liga componentes pelas importações e pelas chamadas HTTP do front para as rotas do back;
- reconhece serviços externos (banco, cache, fila, IA, e-mail, pagamento…) pelos pacotes usados;
- encontra **agentes de IA** pelo SDK que usam e extrai instruções, ferramentas, laços e o grafo de decisão (LangGraph explícito, ou inferido do laço de ferramentas);
- escreve as **cenas** da apresentação com frases prontas em português e inglês.

O texto gerado é um rascunho: o roteiro é **editável** na apresentação ([0004](0004-apresentacao-no-motor-de-historias.md)).

## Consequências

- O código vai do GitHub direto para o navegador de quem tem acesso e não passa por nenhum servidor nem serviço de IA; o resultado é o mesmo para o mesmo commit; custo zero por análise.
- Heurísticas erram: nomes de componentes vêm de pastas, fluxos vêm de imports. Daí o roteiro editável e a nota "gerado a partir do código".
- Agentes muito dinâmicos (prompts montados em tempo de execução, ferramentas registradas por reflexão) aparecem incompletos.
- Fica aberta a porta para a opção 3 no futuro, como etapa separada e opcional depois do modelo estático.
