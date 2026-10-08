# O roteiro do autor (`repartments.json`)

A leitura automática do estúdio ([analise.md](analise.md)) entende a **arquitetura**, mas não a **intenção**: não sabe que "Backend Routes" é a "Recepção de pedidos", nem quais são as três coisas que o cliente faz no sistema. Quem conhece o sistema diz isso num arquivo `repartments.json`, o **roteiro do autor**, e o estúdio o usa no lugar do que leu sozinho. Por que é um arquivo, e não uma LLM no estúdio: [ADR 0010](adr/0010-roteiro-do-autor.md).

- Schema (para o editor conferir o arquivo enquanto se escreve): [`public/schema/repartments-1.json`](../public/schema/repartments-1.json), publicado em `https://raw.githubusercontent.com/Yourdevdaniel/repartments/main/public/schema/repartments-1.json`.
- Exemplo completo, para o CRM de exemplo do estúdio: [`docs/exemplos/repartments.json`](exemplos/repartments.json).

## De onde o estúdio lê

1. **`repartments.json` na raiz do repositório**: lido junto com os outros arquivos (só o da raiz; o de uma subpasta é ignorado). Origem "repo".
2. **Importado** no estúdio (menu **Roteiro**, "Importar roteiro de um arquivo…" ou "Colar a resposta da IA…"): vale no lugar do da raiz. Origem "import".

O arquivo pode ser o JSON puro ou um texto qualquer com um bloco ```` ```json ```` (a resposta de uma IA salva como veio): vale o primeiro bloco.

## O formato

Todo texto pode ser uma **string** (vale para português e inglês) ou um objeto `{"pt": "...", "en": "..."}` (o idioma que falta copia o outro). Textos acima do limite são cortados, sem aviso.

### Raiz

| Campo | Tipo | Limite | O que é |
|---|---|---|---|
| `$schema` | texto | | Endereço do schema; só para o editor. |
| `version` | inteiro | 1 | Versão do formato. Sem o campo, lido como 1 (com aviso). |
| `commit` | texto | 4 a 40 hex | Commit lido ao escrever. Base do aviso de desatualizado. |
| `writtenAt` | `AAAA-MM-DD` | | Data em que foi escrito. |
| `about` | texto | 300 | Uma ou duas frases sobre o sistema; vira o resumo. |
| `parts` | lista | 16 itens | As partes principais. |
| `features` | lista | 6 itens | O que a pessoa consegue fazer. |
| `scenes` | lista | 6 itens | As cenas. |

Campos desconhecidos na raiz são aceitos (compatibilidade para frente).

### `parts[]`

| Campo | Limite | O que é |
|---|---|---|
| `id` (obrigatório) | `[A-Za-z0-9_.-]`, 1 a 40 | Identificador único, usado em `part` nos personagens. |
| `name` (obrigatório) | 28 | Nome simples da parte. |
| `does` | 120 | O que ela faz. |
| `role` | enum | Papel (lista abaixo). |
| `paths` | 20 itens | Pastas ou arquivos que a parte cobre. |

### `features[]`

Precisa de `name` ou de `does`.

| Campo | Limite | O que é |
|---|---|---|
| `name` | 48 | O nome que a funcionalidade tem no sistema (o texto do botão, o comando). |
| `does` | 120 | O que faz. |
| `how` | `button`, `command` ou `readme` | Como a pessoa chega nela; outro valor vira `readme`. |
| `file`, `line` | | Onde está no código (`line` a partir de 1; sem ele, 1). |

### `scenes[]`

| Campo | Limite | O que é |
|---|---|---|
| `title` (obrigatório) | 60 | Título da cena. |
| `summary` | 160 | Uma frase; sem ela vale o título. |
| `cast` | 7 itens | Os personagens. |
| `steps` | 14 itens | Os passos, em ordem. |

Personagem (`cast[]`): `id` (obrigatório, como em `parts`, único na cena); `name` (28; obrigatório se não houver `part`); `part` (id de uma parte: herda nome, papel e frase); `role`; `does` (120).

Passo (`steps[]`): `from` (id do elenco), `to` (id do elenco; sem ele, igual a `from`), `text` (120, obrigatório), `action`, `say` (24, o balão), `file` e `line`.

Papéis (`role`, 13): `person`, `screen`, `api`, `security`, `service`, `agent`, `llm`, `tool`, `worker`, `queue`, `database`, `cache`, `external`.

Ações (`action`, 12): `ask`, `check`, `call`, `fetch`, `save`, `think`, `decide`, `use-tool`, `reply`, `show`, `queue`, `send`.

## O que é recusado e o que vira aviso

**Recusado** (o arquivo inteiro não é usado, e a primeira mensagem diz por quê):

- texto que não é JSON válido;
- JSON que não é um objeto (por exemplo uma lista);
- mais de 200 KB;
- `version` maior que 1 (ou menor que 1, ou não inteira).

**Aviso** (o item sai ou é corrigido, o resto vale): parte sem `id` ou `name`, ou com `id` repetido; funcionalidade sem `name` e sem `does`; cena sem `title` ou sem nenhum passo válido; personagem sem `id` ou sem nome; `part` que não está em `parts`; passo com `from` ou `to` fora do elenco, ou sem `text`; lista maior que o limite (só os primeiros itens entram); caminho absoluto ou com `..`; arquivo que não existe no repositório; `role` desconhecido (vira `service`); `action` desconhecida (vira `call`); sem `version` (lido como 1).

## Como o estúdio confere os arquivos

Todo `file` de funcionalidade ou de passo e todo item de `paths` é comparado com a lista de arquivos do repositório. Caminhos são relativos à raiz (`\` e `./` são normalizados). Os que existem contam como **conferidos**; os que não existem (ou que não puderam ser conferidos, quando não há lista de arquivos) contam como **não conferidos**. Um `file` que não existe sai do passo (o passo fica, sem o link para o código); um item de `paths` que não existe sai da parte. Em `paths`, uma pasta vale se há arquivos dentro dela. O estúdio mostra as duas contagens e a lista de avisos.

## Como as cenas entram

- O `about` vira o resumo do sistema.
- Cada parte renomeia o **componente** que cobre: o dono do primeiro caminho de `paths` que pertence a um. O nome e o `does` da parte passam a valer no mapa, nas legendas e nos commits.
- As `features` viram a cena **"O que dá para fazer"**, na frente.
- As `scenes` viram cenas do autor, depois dela. Um personagem com `part` aparece com o componente dessa parte; dois personagens da mesma cena nunca apontam para o mesmo componente.
- **Se o arquivo traz cenas ou funcionalidades, elas substituem as cenas lidas do código.** Essas ficam guardadas como reserva: "Ver as cenas lidas do código" mostra as automáticas e "Voltar às cenas do autor" volta; "Tirar o roteiro importado" devolve tudo ao que foi lido. Um arquivo só com `about` e `parts` mantém as cenas lidas do código e só renomeia as partes.
- No máximo 6 cenas ao todo.

## Aviso de desatualizado

Se o `commit` do roteiro é diferente do commit aberto (um não é prefixo do outro), o estúdio avisa que o roteiro foi escrito para outra versão do código. Ele continua valendo; o aviso só diz que talvez precise de revisão.

## No site

O menu **Roteiro** do estúdio tem:

- **Copiar prompt para a IA**: copia o texto da seção abaixo, já com o repositório, a branch, o commit e um rascunho do que o estúdio leu. Cole na IA da sua escolha (de preferência com acesso ao repositório) e peça o arquivo.
- **Importar roteiro de um arquivo…**: escolha o `repartments.json` (ou o arquivo com a resposta da IA).
- **Colar a resposta da IA…**: cole a resposta inteira num campo de texto; o estúdio acha o bloco ```json nela, como faria com o arquivo. Os avisos aparecem na tela; **Copiar pedido de correção para a IA** gera um texto para colar de volta na mesma IA, listando o que deve ser consertado.
- **Exportar roteiro**: baixa um `repartments.json` do que o estúdio mostra agora (partes, cenas e as edições feitas). Salvar esse arquivo na raiz do repositório faz as edições viajarem com o código.

## Transparência sobre o prompt

O estúdio **não envia nada** a nenhuma IA: ele não chama nenhum serviço, e a análise do repositório continua estática e feita no navegador ([ADR 0003](adr/0003-analise-estatica-sem-llm.md)). O botão apenas copia o texto abaixo para a área de transferência. Quem o cola numa IA é você, e o que essa IA faz com o repositório segue as regras dela. `{{repo}}`, `{{branch}}`, `{{commit}}` e `{{draft}}` são trocados pelos dados do repositório aberto e pelo rascunho do estúdio. O texto é o mesmo da constante `AUTHOR_PROMPT` (`src/studio/authorPrompt.ts`), e um teste garante que continuam iguais.

````text
Você vai escrever o roteiro de uma apresentação do Repartments sobre um sistema de software.

O Repartments transforma um repositório do GitHub num prédio animado: cada andar é uma cena, e bonequinhos (as partes do sistema e quem o usa) encenam como ele funciona para quem não programa, como um cliente ou um gestor. O estúdio do Repartments lê o código sozinho, mas só entende a arquitetura. Quem conhece o sistema conta o que ele faz num arquivo repartments.json, e é esse arquivo que você vai escrever.

Repositório: {{repo}} (branch {{branch}}, commit {{commit}})

Regras:
- Se você consegue ler os arquivos do repositório, leia o README, os manifestos (package.json, requirements.txt, pyproject.toml…), os pontos de entrada, as telas, as rotas e as pastas principais. Se não consegue, use só o material que a pessoa colar depois deste texto, e cite apenas arquivos que aparecem nele.
- Escreva só o que o código mostra. Não invente funcionalidade, nome de tela nem arquivo; na dúvida, deixe de fora.
- Para cada funcionalidade e para cada passo que vem de um lugar do código, cite o arquivo em "file" (caminho a partir da raiz do repositório) e, se souber, a linha em "line". O estúdio confere se o arquivo existe e descarta caminho errado.
- Escreva para quem não programa: nada de "endpoint", "payload" ou "serializer". Diga o que a pessoa vê e o que o sistema faz por ela.
- Todo texto vai nos dois idiomas: {"pt": "...", "en": "..."}.
- Limites: até 16 partes, 6 funcionalidades e 6 cenas; em cada cena, até 7 personagens e 14 passos. Nome de parte com até 28 caracteres, título de cena até 60, fala de um passo até 120 e balão ("say") até 24.
- Papéis ("role") dos personagens: person, screen, api, security, service, agent, llm, tool, worker, queue, database, cache, external.
- Ações ("action") de um passo: ask (pede algo), check (confere quem pede), call (passa o trabalho para outra parte), fetch (busca dados), save (grava), think e decide (um agente de IA pensa e escolhe; "from" igual a "to"), use-tool (o agente usa uma ferramenta), reply (a resposta volta), show (a resposta aparece na tela), queue (deixa uma tarefa para depois), send (manda algo para fora: e-mail, mensagem, outro serviço).

Tarefa:
1. Em "about", escreva uma ou duas frases sobre o que o sistema faz e para quem.
2. Em "parts", liste as partes principais, cada uma com um "id" curto, um nome simples ("Tela de pedidos", "Cozinha", "Banco de dados"), o que ela faz ("does"), o papel ("role") e as pastas ou arquivos que ela cobre ("paths").
3. Em "features", liste o que a pessoa consegue fazer com o sistema (no máximo 6): o nome que a funcionalidade tem nele ("name": o texto do botão, o comando), o que ela faz ("does"), como a pessoa chega nela ("how": "button", "command" ou "readme") e o arquivo onde está.
4. Em "scenes", escreva de 2 a 6 cenas que mostrem o sistema funcionando do ponto de vista de quem usa: quem pede, quem atende, o que é guardado, o que aparece na tela. Cada cena tem "title", "summary", "cast" e "steps". Cada personagem do "cast" tem um "id" curto, e os passos usam esses ids em "from" e "to". Um personagem que é uma parte do sistema leva em "part" o id da parte.
5. O rascunho abaixo é o que o estúdio leu sozinho do código. Use como ponto de partida: corrija o que estiver errado, troque nomes genéricos e complete o que faltar.

Responda só com o arquivo repartments.json completo, num único bloco ```json, sem texto antes ou depois, sem comentários, com aspas duplas e sem vírgula sobrando. Mantenha "$schema", "version", "commit" e "writtenAt" como estão no rascunho.

Rascunho lido pelo estúdio:
```json
{{draft}}
```
````
