# 0006. Planta de escritório para cenas grandes, e moradores que desviam dos móveis

- Estado: aceito
- Data: 2026-10-07

## Contexto e problema

Duas coisas apareceram ao assistir às cenas:

1. **Moradores atravessando mesas.** Os caminhos eram linhas retas entre pontos escolhidos à mão, e uma mesa de centro, um sofá ou uma caixa no caminho eram atravessados.
2. **Apartamento em linha reta.** Uma cena com seis ou sete participantes virava um corredor comprido de cômodos; a câmera precisava atravessar tudo e a cena parecia um processo linear, não um lugar.

## Opções consideradas

- Para as colisões: (a) mover móveis e pontos à mão até não cruzarem; (b) **calcular o caminho em volta dos móveis**.
- Para a planta: (a) manter a fileira; (b) **planta de escritório**, com duas fileiras de salas dos dois lados de um corredor; (c) um apartamento quadrado com cômodos de tamanhos variados.

## Decisão

**Desvio de móveis** (`src/scene/nav.ts`, `footprints.ts`):

- O tamanho de cada móvel no chão foi medido direto dos arquivos `.glb` da Kenney (`footprints.ts`). Cada móvel posicionado vira um retângulo no chão, girado como o modelo; paredes viram retângulos finos com as portas abertas; tapetes e o que está em cima de mesas ficam de fora.
- Todos crescem pela metade da largura de um morador. Um caminho reto que não toca em nada continua reto; um que toca é calculado numa grade fina (A*) e depois endireitado, para continuar parecendo uma caminhada.
- O motor de histórias (`compile` em `story.ts`) aceita esse roteador e o aplica a cada trecho de cada caminhada, tanto no prédio público (`rooms.ts`) quanto no estúdio (`tour.ts`). Pontos que caíam em cima de um móvel (a porta de entrada atrás de um sofá, a visita do síndico) são empurrados para o lugar livre mais próximo.
- Um teste anda com todos os moradores, a cada 0,2 s, em todos os apartamentos do prédio de exemplo e em todas as cenas da apresentação e dos commits do exemplo, e falha se alguém ficar dentro de um móvel ou de uma parede.

**Planta de escritório** (`officePlan` em `tour.ts`, `OfficeRooms` em `Flat.tsx`), para cenas com 4 participantes ou mais:

- Duas fileiras de salas de 2,5 de largura, uma de cada lado de um corredor com tapete, onde todos andam.
- A fileira de trás mantém os cômodos como são (parede alta, quadros, placa, TV, estantes) e fica com quem precisa disso (a entrada, a tela, o banco, o modelo de IA).
- A fileira da frente é o espelho: os móveis encostam na mureta da frente e viram para o corredor, só os baixos entram (mesas, computadores, caixas), as divisórias são baixas e a placa fica na mureta, para a câmera enxergar o escritório inteiro por cima.
- A câmera enquadra de mais alto e mais longe; crachás e balões ficam 1,5× maiores para continuar legíveis.
- Cenas pequenas (até 3 participantes, como a maioria dos commits) continuam na fileira, mais perto da câmera.

## Consequências

- Nenhum morador atravessa móveis ou paredes, e isso é garantido por teste para todo o conteúdo de exemplo.
- Cenas grandes cabem numa tela e lembram um escritório de verdade; a câmera ainda acompanha a ação quando o escritório é mais largo que a tela.
- Modelos novos de móveis precisam entrar em `footprints.ts` (o script de medição está descrito no próprio arquivo) para virar obstáculo.
- Calcular rotas custa alguns milissegundos por cena, uma vez, ao montar o apartamento.
