# Como o Repartments funciona

Um guia para entender o projeto por dentro: o que cada parte faz, por onde passa uma requisição, e como os bonequinhos sabem o que fazer.

## A ideia em uma frase

Você digita um usuário do GitHub; o site lê os repositórios públicos dessa pessoa, descobre a stack de cada um (React, Django, PostgreSQL…) e monta um prédio em 3D onde cada repositório é um apartamento e cada tecnologia é um morador. Dentro do apartamento, os moradores encenam como as partes conversam: o front pede, o segurança confere o token, o back busca no banco, os testes conferem, a página aparece na TV.

A animação é **ilustrativa**. O site nunca mostra código, rota, dado ou segredo de ninguém: só *quais* peças existem.

## Tecnologias

| Parte | Tecnologia | Para quê |
|---|---|---|
| Interface | React 19 + TypeScript | Painéis, busca, rotas, estado |
| Build | Vite | Servidor de desenvolvimento e build de produção |
| Estilo | Tailwind CSS v4 | Os cards de vidro, chips, botões |
| 3D | three.js + react-three-fiber + drei | O prédio, os apartamentos, a câmera, as luzes |
| Personagens e móveis | Kenney Mini Characters e Furniture Kit (CC0) | Modelos `.glb` com animações (andar, pegar, acenar, sentar…) |
| Back-end | Funções serverless da Vercel (`api/`) | Prédio público e repasse do login |
| Login | Device flow do GitHub (GitHub App ou OAuth App) | Cada pessoa entra com a própria conta, sem chave no servidor |
| Dados | APIs GraphQL e REST do GitHub | Repositórios, manifestos, PRs, status, commits, diffs, árvore de arquivos |
| Testes | Vitest | Partes puras: analisadores, geradores, motor de animação, sessão, rotas, layout do mapa |
| Hospedagem | Vercel | Site estático + função + cache na borda |

## Estrutura de pastas

```
repartments/
├─ api/
│  ├─ building.ts         ← prédio público (GET /api/building?user=...)
│  └─ auth/               ← repasse do login do estúdio: config, device, token
├─ server/
│  ├─ github.ts           ← a consulta GraphQL do prédio público
│  ├─ analyze.ts          ← manifestos → moradores (regras)
│  ├─ handler.ts          ← valida, chama, analisa, monta a resposta
│  ├─ auth.ts             ← repasse sem estado do device flow do GitHub
│  └─ limiter.ts          ← freio por visitante
├─ src/
│  ├─ App.tsx             ← tela inicial, rotas, painéis, faixa do ciclo
│  ├─ data/building.ts    ← busca /api/building e converte em apartamentos
│  ├─ shared/             ← o "contrato" entre as partes (types.ts, studio.ts)
│  ├─ github/             ← cliente do GitHub no navegador: repositórios, commits
│  ├─ architecture/       ← análise estática: arquivos, imports, partes, rotas, agentes, cenas
│  ├─ scene/
│  │  ├─ story.ts         ← o motor de coreografia (beats → tempo)
│  │  ├─ rooms.ts         ← o gerador de apartamentos e histórias
│  │  ├─ tour.ts          ← o gerador das cenas do estúdio
│  │  ├─ Stage.tsx        ← o Canvas 3D, a câmera, o relógio
│  │  ├─ Tower.tsx        ← o prédio visto de fora (vidro fosco)
│  │  ├─ Interior.tsx     ← o apartamento em tela cheia
│  │  ├─ Flat.tsx         ← cômodos, móveis, quadros, TV, vapor, relógio
│  │  ├─ Resident.tsx     ← um morador: modelo, animação, crachá, balão
│  │  ├─ Life.tsx         ← pedestres e carros
│  │  ├─ Sky.tsx          ← luzes, nuvens e chuva conforme o clima
│  │  └─ demo/            ← o prédio de exemplo, digitado à mão
│  ├─ studio/             ← o estúdio: login, abas, palco, apresentação, commits, mapa
│  └─ ui/                 ← textos em PT/EN, peças comuns e a cidade borrada do fundo
├─ docs/                  ← este guia, arquitetura, análise, API, configuração, ADRs
├─ public/models/         ← os .glb da Kenney
└─ vercel.json            ← rotas da SPA e cabeçalhos de segurança
```

## O caminho de uma requisição

```
Navegador                         Vercel (função)                      GitHub
─────────                         ───────────────                      ──────
/Yourdevdaniel
   │  fetch /api/building?user=yourdevdaniel
   ├──────────────────────────────►  1. freio por visitante (20/min)
   │                                 2. valida o nome (regras do GitHub)
   │                                 3. POST api.github.com/graphql ────►  repositórios + manifestos
   │                                    (token do servidor)          ◄────  + PRs + status
   │                                 4. analyze(): manifestos → etiquetas
   │                                 5. ordena: mais antigo embaixo
   │  ◄────────────────────────────  6. JSON só com etiquetas
   │                                    (cache na borda: 1 h)
   ▼
buildFlat() para cada repositório → cômodos + moradores + história → cena 3D
```

1. **Rota.** `App.tsx` lê a URL: `/` é a tela inicial, `/demo` o prédio de exemplo, `/<usuário>` o prédio de alguém. Trocar de usuário usa `history.pushState` (sem recarregar a página).
2. **Busca.** `useBuilding()` em `src/data/building.ts` chama `/api/building?user=<usuário em minúsculas>` (em minúsculas para todas as variações cairem no mesmo cache).
3. **Função.** `api/building.ts` passa pelo freio (`limiter.ts`), chama `buildingFor()` (`handler.ts`) com o token que só existe no ambiente do servidor (`GITHUB_TOKEN`).
4. **Validação.** O nome precisa seguir as regras do GitHub (letras, números e hífens simples, até 39 caracteres). Nome inválido nem chega ao GitHub.
5. **GitHub.** `github.ts` faz **uma** consulta GraphQL por usuário (ver abaixo). Se o GitHub demorar e devolver uma página de erro, tenta mais uma vez.
6. **Análise.** `analyze.ts` transforma o texto dos manifestos em etiquetas e **descarta o texto**. Um teste garante que nada do conteúdo dos arquivos sai na resposta.
7. **Resposta.** Volta um JSON com, por repositório: nome, descrição, link, estrelas, datas, linguagem principal, moradores (`{ tech, role, color }`) e estado (`ci`, `prs`). A Vercel guarda esse JSON por 1 hora na borda e serve a versão antiga por até 1 dia enquanto atualiza em segundo plano.
8. **Montagem.** No navegador, cada repositório vira um apartamento via `buildFlat()` (`rooms.ts`).

### Erros

| Situação | Resposta | O que a tela mostra |
|---|---|---|
| Nome inválido | 400 `invalid-user` | "Isso não parece um usuário do GitHub" |
| Usuário não existe | 404 `not-found` | "Ninguém chamado @… no GitHub" |
| Sem repositório público | 404 `no-repos` | "terreno vazio" |
| Muitas requisições | 429 `rate-limited` | "O GitHub pediu para irmos devagar" |
| GitHub fora / sem token | 502/503 `unavailable` | "Não deu para falar com o GitHub" |

## A consulta ao GitHub

Uma única consulta GraphQL (`server/github.ts`) pede, para o dono (usuário **ou** organização):

- nome, login e avatar;
- os **12 repositórios públicos mais recentes** (sem forks), e para cada um:
  - nome, descrição, link, estrelas, data de criação e do último push;
  - linguagem principal e as 8 maiores linguagens;
  - nomes dos arquivos da raiz e se existe `.github/workflows`;
  - o texto de alguns manifestos, na raiz e nas pastas comuns de monorepo (`frontend/`, `backend/`, `web/`, `client/`, `server/`):
    `package.json`, `requirements.txt`, `pyproject.toml`, `docker-compose.yml`/`compose.yaml`, `Dockerfile`, `pom.xml`, `build.gradle`, `go.mod`, `Cargo.toml`, `Gemfile`, `composer.json`, `pubspec.yaml`;
  - quantos PRs abertos e se algum está com conflito (`mergeable: CONFLICTING`);
  - o status dos testes no branch principal (`statusCheckRollup`).

A lista de manifestos é curta de propósito: cada arquivo é uma busca a mais por repositório, e consulta pesada faz o GitHub estourar o tempo.

## Como o analisador decide os papéis

`server/analyze.ts` junta os sinais de cada repositório:

- nomes das dependências do `package.json` (npm);
- nomes dos pacotes do `requirements.txt`/`pyproject.toml` (Python);
- imagens e nomes de serviço do `docker-compose`;
- padrões de texto nos outros manifestos (ex.: `spring-boot` no `pom.xml`);
- se existe `Dockerfile`/compose e `.github/workflows`.

Depois passa por uma tabela de regras; **a primeira regra que bate em cada papel ganha**:

| Papel | Exemplos de sinais | Morador |
|---|---|---|
| front-end | `react`, `next`, `vue`, `svelte`, `@angular/core` | React, Next.js, Vue… |
| mobile | `expo`, `react-native`, Flutter | Expo… |
| back-end | `django`, `fastapi`, `flask`, `express`, `@nestjs/core`, Spring Boot, Rails | Django… |
| segurança | `djangorestframework-simplejwt`, `jsonwebtoken`, `passport`, `next-auth`, nginx | SimpleJWT… |
| banco | `psycopg`, `pg`, `mongoose`, `sqlite3`, imagem `postgres` | PostgreSQL… |
| cache | `redis`, `ioredis`, imagem `redis` | Redis |
| tarefas | `celery`, `rq`, `bullmq`, `sidekiq` | Celery… |
| testes | `pytest`, `vitest`, `jest`, `@playwright/test`, JUnit | pytest… |
| devops | Dockerfile/compose → Docker; senão workflows → GitHub Actions | Docker |
| código | nada acima → um morador com a linguagem principal | Python, Java… |

Ajustes: React num app React Native não conta como front-end web; Django sem banco declarado ganha SQLite (o padrão do Django).

## O gerador de apartamentos

`src/scene/rooms.ts` recebe os moradores e monta o apartamento:

1. **Um cômodo por papel**, na ordem em que um pedido viaja: sala (front-end) → portaria (segurança) → escritório (API) → despensa (cache) → laboratório (testes) → arquivo (banco) → correio (tarefas) → oficina (Docker). Projetos de uma linguagem só ganham estúdio, cozinha e quarto.
2. Cada cômodo é um **modelo** (`Template`) com largura, cores, móveis, quadros/janelas/relógio, uma placa ("API", "Banco de dados"…) e **pontos nomeados** (onde fica a mesa, a prateleira, a porta).
3. **A história** é escrita a partir de quem existe. O ciclo principal, quando há back-end:
   - o front pede (📨) → o segurança confere o token (🔑, ✅) → o pedido chega na API → a API lê (🧐);
   - se tem cache: olha no Redis primeiro (⚡) e ele diz que não tem (❌);
   - busca no banco (💾), que entrega a caixa (📦);
   - se tem testes: o pytest confere (🔍 ✅); **se os testes do repositório estão falhando**, eles discutem ("na minha máquina funciona!") e o back conserta (🔧);
   - a resposta volta, o front abre o pacote e a página aparece na TV (✨);
   - **se tem PR aberto**, chega um visitante com a plaquinha "PR": aprovado e mesclado 🎉, ou conflito no merge 💥 e eles discordam.
4. Quem fica parado por muito tempo **vai para o hobby**: o front joga videogame 🎮, o banco lê 📖, o Redis ouve música 🎧, o segurança toma café ☕.
5. Moradores fora do ciclo ganham uma rotina própria (o Docker empacota caixas azuis, o Celery separa cartas, quem programa sozinho escreve código, consulta a documentação e toma café).

## O motor de animação

`src/scene/story.ts` é o coração e é **puro** (sem 3D), por isso dá para testar.

- Uma história é uma lista de **beats** (passos). Em cada beat, alguns moradores andam (`walk`/`path`) ou fazem uma animação (`anim`), e quem não tem ação espera onde está. Um beat dura o tempo da caminhada mais longa ou o `dur` dado.
- Beats também podem mudar **props** (quem está com a carta/caixa), **flags** (TV ligada, visitante escondido), **legendas** (com ícone) e **balões** de fala.
- `compile()` transforma os beats em **segmentos com tempo** uma vez só.
- `sample(história, morador, t)` responde, a cada quadro, onde o morador está, para onde olha, que animação toca e se está carregando algo. A história repete em loop.
- `relax()` troca esperas longas por hobbies.

Na cena, `Resident.tsx` lê `sample()` a cada quadro: posiciona o boneco, gira suave, troca a animação com crossfade e, quando ele carrega uma caixa, toca **as pernas da caminhada com os braços de "segurando"** (os clipes são separados por osso). O balão aparece com um "pop".

## A cena 3D

- **Por fora** (`Tower.tsx`): o prédio alto, um bloco colorido por repositório, janelas de **vidro fosco** (material com transmissão: o que está atrás fica borrado) com os moradores como formas coloridas andando. Placa por andar, portaria com o nome do dono, telhado com caixa d'água.
- **Por dentro** (`Interior.tsx` + `Flat.tsx`): o apartamento em tela cheia, aberto na frente e em cima. A câmera segue quem está fazendo alguma coisa e ignora quem está no hobby.
- **Câmera** (`Stage.tsx`): ortográfica (visual de maquete), mergulha no andar ao clicar, com um véu suave na transição.
- **Clima** (`Sky.tsx` + `weather.ts`): sol, nublado, chuva e noite, trocando sozinho a cada 22 s ou escolhido no topo. Luzes, nuvens, chuva, janelas (inclusive as de dentro dos apartamentos) e a cidade do fundo acompanham.
- **Vida na rua** (`Life.tsx`): pedestres que passam, entram e saem do prédio (com guarda-chuva na chuva) e carros com farol à noite.
- **Desempenho:** todos os modelos são pré-carregados ao abrir; o tom das cores não passa por tone mapping (`flat`) para os pastéis saírem como escolhidos.

## Segurança

- O **token do GitHub fica só no servidor** (variável `GITHUB_TOKEN` na Vercel). Deve ser um token *fine-grained* **sem nenhuma permissão de repositório**: só lê o que já é público.
- A resposta só tem **etiquetas e dados públicos**; o texto dos manifestos morre dentro da função (há teste para isso).
- O nome do usuário é validado antes de qualquer chamada; a função só fala com `api.github.com` (sem SSRF).
- React escapa todo texto (as descrições dos repositórios não viram HTML).
- `vercel.json` aplica **CSP** (scripts só do próprio site, sem iframes, sem plugins), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` e HSTS.
- **Freio** de 20 requisições por minuto por visitante (por instância) e **cache na borda** de 1 h, para ninguém esgotar a cota do token.
- Auditoria antes do deploy: nenhum segredo nos arquivos, no histórico do git ou no bundle; 0 vulnerabilidades nas dependências.

## O estúdio (`/studio`)

O prédio público só mostra o que é público e nunca mostra código. O **estúdio** (o botão **Prédio | Estúdio** no topo troca entre os dois) é a parte com login: a pessoa entra com a conta do GitHub, abre qualquer repositório que essa conta enxerga (privados também) e o transforma numa apresentação animada para mostrar a um cliente. A arquitetura completa está em [arquitetura.md](arquitetura.md), as decisões em [adr/](adr/README.md), a leitura do código em [analise.md](analise.md) e a configuração em [configuracao.md](configuracao.md).

### Entrar, sem chave nenhuma no servidor

1. Em `/studio`, **Entrar com o GitHub** mostra um código curto (como o login do GitHub CLI). O botão copia o código e abre `github.com/login/device`; a pessoa cola, autoriza, e a página continua sozinha.
2. O GitHub entrega o token para um **cofre**: um worker do navegador que guarda o token na memória dele. A página nunca vê o token; ela pede leituras ao cofre, e o cofre só faz as leituras de uma lista fechada (repositórios, commits, arquivos), direto na API do GitHub. O servidor do Repartments só repassa as duas chamadas do login, porque o GitHub não aceita que páginas façam essas duas diretamente, e não guarda nada.
3. **O login dura no máximo 8 horas.** O cabeçalho mostra quanto falta ("termina em 7 h 52 min"); nos últimos 10 minutos aparece um aviso para salvar a apresentação; ao terminar, o estúdio explica e pede para entrar de novo. Fechar o site, sair, ou recarregar a página sem outra aba do estúdio aberta também encerra.
4. A lista mostra os repositórios da conta (próprios, de colaboração e de organizações), com busca e "Carregar mais". Privados têm o selo 🔒.

Sem login: **Ver um exemplo** abre um CRM de exemplo (com assistente de vendas de IA e algumas semanas de commits), e **Abrir uma apresentação salva** abre um arquivo baixado antes. Em desenvolvimento, sem app do GitHub configurado, "Entrar" usa o login do GitHub CLI da própria máquina.

### Como funciona (a apresentação)

O repositório vira um prédio em que **cada andar é uma cena**:

- **Conheça o sistema** (térreo): um guia visita as partes principais e cada uma diz, numa frase, o que faz.
- **Como o agente decide**: a mensagem chega, o agente lê as instruções, pergunta ao modelo de IA, escolhe entre as ferramentas, usa a que precisa e responde.
- **Pedidos** ("Criar leads", "Ver clientes"…): a tela pede, a segurança confere, as regras trabalham, o banco guarda ou entrega, o e-mail sai, a resposta aparece na tela.
- **Tarefas em segundo plano**, quando há fila.

Cenas com 4 participantes ou mais viram um **escritório**: duas fileiras de salas dos dois lados de um corredor, a de trás com paredes altas e a da frente com divisórias baixas, para a câmera ver tudo por cima. Os moradores andam pelo corredor e **desviam dos móveis** (ninguém atravessa mesas). As legendas usam as palavras do próprio sistema: o título da tela, os campos do formulário ("preenche nome, empresa, e-mail e telefone e clica em “Salvar lead”"), o que o banco guarda, o assunto do e-mail.

Dentro da cena, cada parte é um morador com o nome no crachá; eles andam até o cômodo uns dos outros levando cartas (pedidos) e caixas (respostas), e a legenda explica cada passo. O painel lista quem participa e o passo a passo.

- **Apresentar:** antes de começar, uma janela "Antes de apresentar" faz algumas perguntas de sim ou não, cada uma com um exemplo do que muda:
  - "Trocar os nomes das partes do sistema por nomes mais simples?" (por exemplo, "Backend Routes" vira "Recepção");
  - "Trocar os nomes das ferramentas da IA por nomes mais simples?" ("search_leads" vira "Buscar leads");
  - "Trocar as marcas e o nome do modelo de IA por nomes gerais?" ("PostgreSQL" vira "Banco de dados", "gpt-4o-mini" vira "Modelo de IA");
  - "Passar para a próxima cena sozinho?", e quais cenas mostrar.

  Depois, tela cheia: só a cena, uma legenda grande e os controles. As escolhas valem também para os commits e o mapa, e vão junto na apresentação salva.
- **Controles da cena** (apresentando ou não, dentro de uma cena): uma barra como a de um player de vídeo, e o teclado, como no YouTube. `?` mostra a lista na tela.

  | Tecla | O que faz |
  |---|---|
  | Espaço ou K | Pausar ou continuar |
  | → ou L / ← ou J | Próximo passo / passo anterior (depois do último passo, a próxima cena) |
  | PgDn ou Shift → / PgUp ou Shift ← | Próxima cena / cena anterior |
  | Home ou 0 / End | Voltar ao começo da cena / ir para o final |
  | S | Parar: volta ao começo e pausa |
  | − e + | Mais devagar ou mais rápido: 0,5x, 1x, 1,5x, 2x |
  | H | Esconder ou mostrar os controles (a cena fica sozinha na tela, boa para gravar) |
  | Esc | Sair da apresentação (ou voltar para o prédio) |

  Clicar num ícone da faixa de passos também pula para ele. Trocar de cena volta a tocar; a velocidade continua a escolhida. Quem pediu ao sistema menos movimento começa com a cena pausada.
- **Editar roteiro:** renomear moradores com as palavras do cliente ("Backend Routes" → "Recepção"), reescrever legendas, mudar títulos e esconder cenas. O novo nome vale em todo lugar: legendas, mapa e commits.
- **Salvar apresentação:** baixa um `.json` com o modelo, o roteiro e os commits em cena (nomes de arquivos e tamanhos, nunca código), para apresentar depois sem login.

### Commits (as obras)

Outro prédio: **cada andar é um commit** (os 12 mais recentes, o mais novo no topo) e o térreo é **"Onde o trabalho acontece"**, o diário de obras que visita as partes que mais mudaram. Dentro de um commit, **o autor entra e visita cada parte que mudou**; quanto mais mudou, **mais quentes as paredes** do cômodo. As legendas falam para leigos: "@ana traz uma correção: “Login expirava cedo demais”", "@ana mexe em Porteiro: mudança pequena (1 arquivo)". Filtros por branch, autor e período; botões para commits mais antigos e mais novos; "Apresentar" toca a história do mais antigo ao mais novo. O diff de verdade fica no GitHub, a um clique.

### Mapa

A arquitetura em faixas, de cima para baixo: telas, API, segurança, regras de negócio, inteligência artificial, tarefas, dados, e os serviços de fora (banco, fila, modelo de IA, e-mail…). Passar o mouse acende as conexões; clicar abre os detalhes. Agentes têm **Ver como decide**, que desenha o fluxo de decisão. **Calor dos commits** pinta as partes pelo quanto mudaram nos commits em cena; **Commit selecionado** acende as partes do commit que estava aberto.

### Como a apresentação é gerada

Tudo sai de uma **análise estática** feita **no navegador**, sem LLM (detalhes em [analise.md](analise.md)):

1. lê a árvore de arquivos e o código que importa (até 700 arquivos), nunca `.env` nem chaves;
2. descobre quem importa quem e agrupa os arquivos em **partes** por pasta, cada uma numa camada;
3. acha as **rotas** (Express, FastAPI, Django, Next.js…) e liga as telas que chamam essas rotas;
4. reconhece **serviços de fora** pelos pacotes (PostgreSQL, Redis, OpenAI, Stripe…);
5. encontra **agentes de IA** pelo SDK que usam, com as instruções, as ferramentas e o laço de decisão;
6. escreve as **cenas** com frases prontas em português e inglês.

Depois, `src/scene/tour.ts` transforma cada cena num apartamento: um cômodo por participante, na ordem em que aparecem, e uma história em que quem entrega vai até quem recebe. É o mesmo motor de animação do prédio público.

## Rodar no PC

```sh
npm install
npm run dev        # http://localhost:5173 (ou a porta que aparecer)
npm test           # todos os testes (Vitest)
npm run build      # gera dist/ para produção
```

Em desenvolvimento, o Vite serve `/api/building` e o repasse do login com o mesmo código das funções. O token do prédio público vem de `GITHUB_TOKEN` ou, se não houver, do GitHub CLI logado (`gh auth token`). Ele fica só na memória do processo. Variáveis do estúdio: ver [configuracao.md](configuracao.md).

## Publicar

1. Criar o projeto na Vercel apontando para esta pasta (o Vite é detectado sozinho; a pasta `api/` vira função).
2. Em *Settings → Environment Variables*, criar `GITHUB_TOKEN` com um token fine-grained sem permissões e, para o estúdio, `GITHUB_CLIENT_ID` ([configuracao.md](configuracao.md)).
3. Deploy. As rotas como `/Yourdevdaniel` caem no app graças ao `vercel.json`.

## Limitações conhecidas

- A detecção olha nomes de dependências: uma biblioteca que usa um framework só nos testes pode aparecer com ele (ex.: `sqlmodel` com FastAPI).
- Até 12 repositórios por pessoa (os mais recentes).
- Usuários com repositórios enormes podem demorar ~20 s na primeira vez; depois vem do cache.
- O freio por visitante é por instância da função: é uma proteção extra, não uma cota rígida.
