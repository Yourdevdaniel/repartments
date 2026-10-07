# 0004. Apresentação gerada sobre o motor de histórias existente

- Estado: aceito
- Data: 2026-10-07

## Contexto e problema

O pedido é apresentar o funcionamento de um sistema a um cliente "de forma visual e intuitiva, com as formas das pessoas". O Repartments já tem moradores 3D, cômodos, balões, legendas e um motor de coreografia (`story.ts`) testado. Mas o gerador atual (`rooms.ts`) coreografa à mão uma stack conhecida (front, segurança, API, banco…), com um morador por papel.

## Opções consideradas

1. **Só diagrama 2D** (grafo, C4). Útil para técnicos; não é "com as pessoas".
2. **Novo motor 3D para a apresentação.** Liberdade total, muito código duplicado.
3. **Novo gerador sobre o mesmo motor:** cada cena (`Flow`) vira um `FlatData` comum, tocado pelo mesmo `Stage`, `Interior` e `Resident`.

## Decisão

Opção 3, em `src/scene/tour.ts`, com o mapa 2D como complemento técnico (`src/studio/map/`):

- **um prédio por repositório, um andar por cena**; dentro, **um cômodo por participante**, na ordem em que aparecem;
- regras genéricas no lugar de coreografia à mão: quem entrega caminha até o cômodo de quem recebe levando carta ou caixa; quem já está esperando recebe ali mesmo; ações sozinho (pensar, decidir, mostrar na tela) acontecem no lugar; quem não participa do passo volta para o seu canto; no fim todos voltam, e o loop recomeça limpo;
- cômodos próprios da apresentação, com móveis só junto à parede do fundo, para o caminho estar sempre livre;
- o `Stage` ganhou poucas propriedades: `restart` (recomeçar a história ao entrar numa cena), `paused` e `rate` (pausar e mudar a velocidade do relógio da história, que os moradores e as animações seguem), `clock` (entrega o relógio, para pular para um passo) `panel` (centralizar a cena quando o painel lateral está escondido) e `onFrame` (entregar cada quadro para gravar o vídeo, [ADR 0007](0007-video-e-powerpoint-no-navegador.md)); os controles e as teclas ficam em `src/studio/present/Playback.tsx`;
- uma cena de abertura, **"Conheça o sistema"**, gerada do modelo: um guia visita as partes principais e cada uma diz o que faz;
- o roteiro (nomes, legendas, títulos, cenas ocultas) é editável e salvo à parte do modelo; renomear uma parte troca o nome também nas legendas, no mapa e nos commits; a apresentação pode ser baixada como arquivo e aberta sem login;
- o mesmo palco (`src/studio/present/Theater.tsx`) toca também os commits ([0005](0005-commits-como-cenas.md));
- cada participante tem um nome simples (o que aparece por padrão: "Recepção", "Buscar leads", "Banco de dados") e o nome do código (`technical`: "Backend Routes", "search_leads", "PostgreSQL"). Antes de apresentar, perguntas de sim ou não escolhem, para as partes, as ferramentas da IA e os serviços de fora, qual dos dois aparece (`ScriptEdits.naming`); as legendas trocam os nomes junto. Nomes escolhidos à mão valem quando o nome simples está escolhido; quando o do código está, ele prevalece.

## Consequências

- A apresentação herda tudo da cena 3D: câmera que segue a ação, balões, legendas, faixa de passos, clima, movimento reduzido.
- Cenas com muitos participantes ficam largas; o analisador limita a 7 participantes e 14 passos por cena.
- Testes (`tour.test.ts`) garantem que todos ficam dentro do apartamento, que o pacote passa de mão em mão e que o loop fecha.
