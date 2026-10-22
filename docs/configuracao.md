# Configuração

Como rodar o Repartments na sua máquina e publicar o seu, incluindo o login do **estúdio** (`/studio`).

> Resumo: o prédio público precisa de um token só de leitura (`GITHUB_TOKEN`). O estúdio precisa do *Client ID* de um app do GitHub (`GITHUB_CLIENT_ID`), que é **público**. Com o *client secret* do mesmo app (`GITHUB_CLIENT_SECRET`), o estúdio oferece o botão **Continuar com GitHub**; sem ele, o login é pelo código do *device flow*. O segredo fica só no ambiente do servidor, sem sessão e sem banco de dados ([ADR 0008](adr/0008-continuar-com-github.md), que complementa o [ADR 0001](adr/0001-login-pelo-device-flow.md)).

## 1. Variáveis de ambiente

| Variável | Para quê | O que é |
|---|---|---|
| `GITHUB_TOKEN` | prédio público (`/api/building`) | Token *fine-grained* sem nenhuma permissão: só lê dados públicos. Em desenvolvimento pode faltar, o servidor pede ao GitHub CLI. |
| `GITHUB_CLIENT_ID` | login do estúdio | O *Client ID* do GitHub App ou OAuth App. Não é segredo. Com ele sozinho, o login é pelo código (*device flow*), que precisa de **Enable Device Flow** marcado. |
| `GITHUB_CLIENT_SECRET` | login do estúdio com "Continuar com GitHub" | Segredo do app. Só no ambiente do servidor (na Vercel, marque *Sensitive*). Sem ele, o estúdio usa o login por código. |
| `GITHUB_APP_SLUG` | opcional, só GitHub App | O nome do app no endereço (`github.com/apps/<slug>`). Não é segredo. Com ele, o estúdio mostra o botão **Escolher repositórios no GitHub**, porque o token de um GitHub App só lê os repositórios onde o app está instalado. |
| `GITHUB_OAUTH_SCOPE` | opcional | Só para OAuth App: `repo` (padrão, lê privados) ou `public_repo` (só públicos). GitHub App ignora. |

O arquivo [`.env.example`](../.env.example) tem todas, comentadas. Copie para `.env.local` (que o git ignora).

## 2. Criar o app do GitHub

Há dois tipos de app. Os dois funcionam com o mesmo código; a diferença é a permissão do token.

| | GitHub App (recomendado) | OAuth App |
|---|---|---|
| Permissão | *Fine-grained*: **Contents: read** e **Metadata: read**, nada de escrita | Escopo `repo`, que o GitHub só oferece como leitura **e** escrita |
| Quais repositórios | A pessoa escolhe ao instalar o app (todos ou alguns) | Todos que a conta acessa |
| Validade do token | 8 horas | Não expira no GitHub; o estúdio o esquece em 8 horas |
| Organizações | O dono da organização instala o app | A organização pode exigir aprovação do OAuth App |

### GitHub App (recomendado)

1. GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**.
2. **Homepage URL:** o endereço do site. **Callback URL:** `https://<seu site>/api/auth/callback`. Para desenvolvimento, um GitHub App aceita mais de uma: inclua também `http://localhost:5173/api/auth/callback`. A URL precisa ser exatamente a do site, com o mesmo endereço e sem barra no final.
3. **Enable Device Flow:** opcional. Só é preciso se o estúdio for usar o login por código (quando não há `GITHUB_CLIENT_SECRET`).
   **Setup URL:** `https://<seu site>/studio`, com *Redirect on update* marcado: quem escolhe os repositórios no GitHub volta direto para o estúdio.
4. **Webhook:** desmarque *Active*.
5. **Repository permissions:** `Contents: Read-only` e `Metadata: Read-only`. Nada mais.
6. **Where can this GitHub App be installed?** *Only on this account* para uso interno, ou *Any account* se clientes vão instalar.
7. Crie o app, copie o **Client ID** para `GITHUB_CLIENT_ID` e, em **Client secrets**, clique em **Generate a new client secret**. Copie o segredo para `GITHUB_CLIENT_SECRET` e guarde-o só ali: o GitHub mostra o valor uma vez.
8. **Install App** na conta ou organização dona dos repositórios. O token de um GitHub App só enxerga os repositórios onde o app está instalado: se a lista do estúdio vier vazia, falta instalar (ou incluir o repositório na instalação). Com `GITHUB_APP_SLUG` (o nome do app no endereço `github.com/apps/<slug>`), o estúdio mostra o botão **Escolher repositórios no GitHub**, e cada pessoa instala o app nos próprios repositórios sem sair do fluxo.

### OAuth App (mais simples, mais permissão)

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. **Authorization callback URL:** `https://<seu site>/api/auth/callback`. Um OAuth App aceita só uma URL, então para desenvolvimento use um OAuth App separado, com `http://localhost:5173/api/auth/callback`.
3. Copie o **Client ID** para `GITHUB_CLIENT_ID` e clique em **Generate a new client secret**. Copie o segredo para `GITHUB_CLIENT_SECRET`.
4. **Enable Device Flow** é opcional: só é preciso sem o segredo, para o login por código.
5. Se só repositórios públicos interessam, use `GITHUB_OAUTH_SCOPE=public_repo`.

## 3. Rodar localmente

```sh
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

- **Sem `GITHUB_CLIENT_ID`**, o botão "Entrar" do estúdio usa o login do **GitHub CLI** (`gh auth login`) direto. Isso só existe no servidor de desenvolvimento do Vite e só para quem acessa da própria máquina; as funções publicadas não têm esse atalho.
- **Com `GITHUB_CLIENT_ID`** em `.env.local`, o login real é usado também em desenvolvimento: com `GITHUB_CLIENT_SECRET` no mesmo arquivo, o botão é **Continuar com GitHub** (vai ao GitHub e volta para a mesma página); sem ele, o código digitado no GitHub. O segredo vai em `.env.local` como as outras variáveis, e o servidor de desenvolvimento do Vite o lê.
- **Sem login nenhum**, "Ver um exemplo" abre a apresentação de um CRM de exemplo.

## 4. Publicar na Vercel

1. Importe o repositório na Vercel (o Vite é detectado; a pasta `api/` vira funções).
2. Em **Settings → Environment Variables**, crie `GITHUB_TOKEN`, `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET` (marque *Sensitive* nas três; o segredo é o que mais importa).
3. Confirme que a Callback URL do app é `https://<seu site>/api/auth/callback`.
4. Deploy.
5. Para ver se o login está completo, abra `/api/auth/config`: `"web": true` quer dizer que "Continuar com GitHub" está ligado.

## 5. Checklist de segurança antes de publicar

Três verificações automáticas cuidam de que o segredo não vaze:

- **No build:** `npm run build` (o que a Vercel roda, fixado no `buildCommand` do `vercel.json`) termina com `scripts/check-dist.mjs`, que lê todos os arquivos que vão ser publicados e **interrompe o deploy** se algum tiver o valor de `GITHUB_CLIENT_SECRET` ou `GITHUB_TOKEN` (na Vercel, os valores reais; localmente, os do `.env.local`) ou qualquer coisa com cara de token ou chave. Ele nunca imprime o valor.
- **Nos testes:** `server/auth.test.ts` passa por todas as rotas de login com um segredo de teste e confere que ele não sai em nenhuma resposta, redirecionamento ou cookie, e que só vai para o GitHub; `server/logs.test.ts` confere que nenhum log do servidor imprime segredo, token, cookie ou pedido.
- **No site publicado:** `npm run check:site -- https://seu-site` olha o site de fora, como qualquer pessoa: os scripts que a página carrega (com os valores reais do `.env.local`, se houver), se há mapas de código publicados, se `.env*`, `.git/`, o código do servidor e o projeto da Vercel respondem como arquivo, se as rotas de login dizem só o que devem e se os cabeçalhos de segurança estão lá. Rode depois de cada deploy.

E, na configuração:

- [ ] A política de privacidade (`src/privacy/policy.ts`) tem um contato de verdade em `CONTROLLER.contact`, o DPA da Vercel foi aceito na conta e o registro em [privacidade.md](privacidade.md) está em dia.

- [ ] `.env.local` não está no git (`git status` não mostra; o `.gitignore` cobre `.env*`).
- [ ] O app do GitHub pede só leitura (GitHub App) ou `public_repo` se privados não forem necessários.
- [ ] `GITHUB_CLIENT_SECRET` só no ambiente do servidor (`.env.local` ignorado pelo git, ou variável *Sensitive* na Vercel). Nunca no código, no repositório ou no navegador.
- [ ] A Callback URL do app é exatamente `https://<seu site>/api/auth/callback`, sem outra origem, para que o GitHub só devolva o login a este site.
- [ ] Na Vercel, `GITHUB_CLIENT_SECRET` como *Sensitive* e só no ambiente **Production** (sem *Preview* nem *Development*), e só quem precisa com acesso ao projeto: quem publica código pode publicar algo que leia o segredo.
- [ ] No GitHub, **Settings → Code security → Secret scanning** e **Push protection** ligados no repositório: o GitHub recusa um push que traga um token ou chave conhecidos.
- [ ] GitHub App com **Expire user authorization tokens** ligado (o padrão): os tokens das pessoas morrem em 8 horas mesmo se a aba for fechada sem sair.
- [ ] Depois do deploy, `npm run check:site -- https://seu-site` sem problemas.
- [ ] Se o segredo vazou, gere um novo na página do app no GitHub (o antigo deixa de valer) e atualize a variável na Vercel.
- [ ] *Enable Device Flow* marcado no app, se o login for pelo código (sem o segredo; sem ele o login responde `login-disabled`). Se o login responder "indisponível", o log do servidor diz o motivo que o GitHub deu (`GitHub refused the device code: …`): `Not Found` é um Client ID errado.
- [ ] A CSP de `vercel.json` continua com `script-src 'self'`, `connect-src 'self' https://api.github.com` e `require-trusted-types-for 'script'`: o token fica trancado no cofre do navegador, e a CSP é o que impede scripts de fora de rodar na página ([ADR 0002](adr/0002-token-so-no-navegador.md)).
- [ ] `npm audit` sem vulnerabilidades altas.
