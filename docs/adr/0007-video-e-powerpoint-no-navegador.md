# 0007. Vídeo e PowerPoint feitos no próprio navegador

- Estado: aceito
- Data: 2026-10-07

## Contexto e problema

A apresentação só existia ao vivo, no site. Quem a prepara quer mandá-la para um cliente ou um stakeholder que não vai abrir o site: um **vídeo** para assistir e um **PowerPoint** para encaixar numa reunião. Nada do repositório deve passar por um servidor nosso (o estúdio não guarda código nem token em lugar nenhum, [ADR 0002](0002-token-so-no-navegador.md)).

## Opções consideradas

- Para o vídeo: (a) **gravar em tempo real** o canvas enquanto a apresentação toca uma vez (`MediaRecorder`); (b) renderizar quadro a quadro, mais rápido que o tempo real, e codificar com WebCodecs mais uma biblioteca de MP4; (c) gravar a aba inteira com `getDisplayMedia`; (d) renderizar num servidor.
- Para os slides: (a) **montar o `.pptx` no navegador** (pptxgenjs); (b) exportar PDF; (c) um servidor com LibreOffice.

## Decisão

**Vídeo (a)**, em `src/studio/export/video.ts`:

- A apresentação toca do começo ao fim, uma vez cada cena, na velocidade escolhida. A cada quadro, o canvas 3D é copiado para um canvas 1920×1080 com o céu atrás, o título da cena no alto e a legenda embaixo (as legendas da página são HTML e não sairiam numa gravação só do 3D), com um esmaecer branco nas trocas de cena.
- O `Stage` ganhou `onFrame`: enquanto grava, ele mesmo desenha cada quadro e entrega o canvas logo em seguida, enquanto a imagem ainda está nele (um canvas WebGL é limpo depois de exibido).
- Durante a gravação o palco fica em 16:9, o mesmo formato do vídeo.
- Formato: MP4 (H.264) quando o navegador grava (Chrome e Edge recentes, Safari), WebM nos outros. Sem som.
- Descartadas: (b) é mais complexa e traz uma dependência a mais; (c) pede permissão para gravar a tela e grava o que estiver em cima; (d) poria o conteúdo do repositório num servidor.

**PowerPoint (a)**, em `src/studio/export/deck.ts`:

- O estúdio visita cada cena, pausa no meio dela e tira uma foto (o mesmo canvas do vídeo, sem as palavras). O `.pptx` tem uma capa com o resumo do sistema, um slide por cena (foto, quem participa, o passo a passo e, nas anotações do apresentador, tudo de novo para ler) e um fechamento.
- O tamanho da letra do passo a passo é calculado para caber, porque o "reduzir texto para caber" do PowerPoint só age quando a caixa é editada.
- O pptxgenjs (~125 kB comprimido) só é carregado quando alguém pede o PowerPoint.

As duas saídas usam as mesmas escolhas de "Antes de apresentar": nomes simples ou do código, cenas, velocidade.

## Consequências

- Nada sai do navegador: o arquivo é montado em memória e baixado.
- O vídeo leva o tempo da apresentação (mais curto em 1,5x ou 2x), e a aba precisa ficar aberta e na frente: com a aba escondida o navegador para de desenhar.
- A qualidade do vídeo acompanha o computador: numa máquina lenta, menos quadros por segundo.
- O pptxgenjs depende do `image-size`, que tem um alerta de segurança; esse pacote não entra no código do navegador (o pptxgenjs o desliga no `browser` do `package.json`), e um `overrides` o fixa numa versão corrigida para o `npm audit` ficar limpo.
