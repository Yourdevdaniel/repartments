# 0007. Vídeo e PowerPoint feitos no próprio navegador

- Estado: aceito; a parte do vídeo foi substituída por [0013](0013-video-quadro-a-quadro.md)
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
- Os quadros vão para o vídeo a cada n atualizações da tela (`framePacer`), n sendo quantas cabem em cerca de 1/30 s: 2 numa tela de 60 ou 75 Hz, 5 numa de 144 Hz. O navegador carimba cada quadro gravado com a atualização da tela em que foi desenhado; pegar um a cada 1/30 s pelo relógio (`captureStream(30)`, a primeira versão) deixava os quadros ora 2, ora 3 atualizações separados numa tela de 75 Hz, e o vídeo saía travado. A gravação também só começa quando a primeira cena já carregou e roda sem engasgos por um segundo (os moradores e a mobília carregam primeiro), com a história voltando ao começo nesse momento. Até lá o gravador fica pausado recebendo os quadros: o codificador leva quase um segundo para engrenar e, sem isso, o vídeo abria parado.
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
- Os quadros por segundo acompanham a tela: 30 numa de 60 Hz, 37,5 numa de 75 Hz, 28,8 numa de 144 Hz. Sempre igualmente espaçados; exatamente 30 em qualquer tela pediria a opção (b). O bitrate acompanha na proporção inversa (`videoBitrate`: 2,4 Mbit/s a 37,5 quadros), porque o codificador do navegador gasta o bitrate por quadro como se fossem sempre 30 por segundo (37,5 quadros pedidos a 3 Mbit/s saíram a 3,75); assim o arquivo fica nos ~22 MB por minuto em qualquer tela.
- O pptxgenjs depende do `image-size`, que tem um alerta de segurança; esse pacote não entra no código do navegador (o pptxgenjs o desliga no `browser` do `package.json`), e um `overrides` o fixa numa versão corrigida para o `npm audit` ficar limpo.
