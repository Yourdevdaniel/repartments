# 0005. Commits como cenas com os moradores, não como lista e diff

- Estado: aceito
- Data: 2026-10-07

## Contexto e problema

O pedido inicial falava em linha do tempo com filtros e "um clique abre o diff e os arquivos alterados", e em destacar as partes que mudaram (calor por arquivo ou módulo). A primeira versão fez exatamente isso: filtros, gráfico de atividade, lista de commits e um visualizador de diff. Ao ver, o pedido mudou: a interação com os commits deve ser **visual, com as pessoas**, porque "uma parte para ver commit o próprio GitHub já faz". O público é leigo: um cliente, um stakeholder.

## Opções consideradas

1. **Manter lista e diff** (o que o GitHub já mostra) e só colorir o mapa.
2. **Commits encenados no mesmo palco da apresentação.**

## Decisão

Opção 2, em `src/studio/works/`:

- A aba **Commits** é um prédio em que **cada andar é um commit** (os 12 mais recentes dos filtros, o mais novo no topo) e o térreo é **"Onde o trabalho acontece"**: o diário de obras visita as partes que mais mudaram.
- Dentro de um commit, **o autor entra e visita cada parte do sistema que mudou**; quanto mais mudou, **mais quentes as paredes** do cômodo (o calor por módulo pedido no item 1, em 3D).
- Textos para leigos: tamanho em palavras (mudança pequena, média, grande) em vez de linhas; prefixos como `feat:` e `fix:` viram "uma novidade", "uma correção".
- As partes vêm do modelo da arquitetura, com os nomes do roteiro: um commit é contado com as mesmas palavras da apresentação.
- Filtros por branch, autor e período ficam; "Apresentar" toca os commits em ordem, do mais antigo ao mais novo.
- O mapa 2D continua com as sobreposições de calor e do commit em cena; o link "Ver o código no GitHub" leva ao diff de verdade para quem quiser.
- A lista, o gráfico de atividade e o visualizador de diff da primeira versão foram retirados.

## Consequências

- Ler os arquivos de cada commit é uma chamada ao GitHub: por isso 12 commits por prédio, com botões para os mais antigos e os mais novos.
- A aba depende da análise da arquitetura (é dela que vêm as partes); sem ela, aparece o mesmo convite para ler o repositório.
- Uma apresentação salva leva os commits em cena (lista de arquivos e tamanhos, sem código), para tocar também sem login.
