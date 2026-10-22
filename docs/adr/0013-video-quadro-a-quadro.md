# 0013. Vídeo feito quadro a quadro, sem precisar da aba na frente

- Estado: aceito
- Data: 2026-10-22
- Substitui a parte do vídeo de [0007](0007-video-e-powerpoint-no-navegador.md)

## Contexto e problema

O vídeo de [0007](0007-video-e-powerpoint-no-navegador.md) era gravado em tempo real: a apresentação tocava uma vez e o `MediaRecorder` gravava o canvas a cada atualização da tela. Com a aba escondida o navegador para de atualizar a tela, e a gravação parava junto. Quem exportava tinha de ficar olhando a aba até o fim, e uma apresentação de 7 minutos prendia a pessoa 7 minutos.

## Opções consideradas

1. **Manter o tempo real** e só avisar melhor. Não resolve.
2. **Tocar um som mudo** para o navegador tratar a aba como "tocando áudio" e não frear. Truque frágil: depende do navegador e não destrava o desenho da tela, que é o que falta.
3. **Quadro a quadro** (a opção b de 0007): o palco para de seguir a tela e desenha só quando o vídeo pede, 1/30 s de história por vez, e cada quadro vai para o codificador do navegador (WebCodecs).

## Decisão

Opção 3.

- `Stage` ganhou `drive`: enquanto existe, o `Canvas` fica em `frameloop="never"` e `drive.current(dt)` chama o `advance` do react-three-fiber com o relógio adiantado em `dt`. Todo o movimento (história, moradores, câmera) já vinha do `delta` de cada quadro, então nada da cena mudou.
- `Theater.recordVideo` percorre as cenas: entra na cena, desenha 1 s sem guardar (a câmera assenta e a mobília carrega, com a história parada no começo; mais tempo se o `useProgress` do drei ainda estiver carregando) e então guarda `sceneFrames(duração da história, velocidade)` quadros. O título e a legenda de cada quadro saem da própria história (`captionAt`), não do estado da página, para não ficarem um quadro atrasados.
- Entre um quadro e outro o laço cede a vez ao navegador por mensagem (`breathe`, um `MessageChannel`), não por timer: numa aba escondida os timers são segurados para uma vez por segundo (e, depois de 5 minutos, uma vez por minuto); mensagens não.
- O arquivo é montado com o **mediabunny** (`encodeCanvas`): H.264 em MP4 onde o navegador codifica, senão VP9 ou VP8 em WebM. ~177 kB comprimidos, carregados só quando alguém pede um vídeo, como o pptxgenjs.
- Saíram `framePacer`, `videoBitrate`, `recordCanvas` e a escolha de formato do `MediaRecorder`: com quadros carimbados um a um, o vídeo tem 30 quadros por segundo exatos em qualquer tela e o bitrate pedido é o que sai.

## Consequências

- A pessoa pode trocar de aba ou minimizar a janela; só não pode fechar a aba. O aviso durante a exportação diz isso e mostra a porcentagem feita.
- O tempo de exportação deixa de ser o da apresentação: numa máquina comum, os 6 min 50 s do exemplo saíram em pouco mais de 2 minutos, com a janela minimizada por boa parte do tempo. Numa máquina lenta demora mais, mas o vídeo sai igual, sem quadros perdidos.
- 30 quadros por segundo e ~3 Mbit/s (cerca de 18 a 22 MB por minuto) em qualquer tela.
- Precisa de WebCodecs (Chrome e Edge, Safari 16.4+, Firefox 130+). Sem ele, o estúdio avisa que o navegador não faz vídeos; não há mais a gravação em tempo real como reserva.
- Alguns navegadores desenham WebGL mais devagar com a aba escondida. Nesse caso o vídeo continua igual; só fica pronto mais tarde.
- O PowerPoint usa o mesmo palco guiado (`openScene`): cada cena assenta por 1,4 s de quadros não guardados, a história para no meio de um passo e a foto sai de um quadro desenhado na hora. Também dá para trocar de aba enquanto ele é montado.
