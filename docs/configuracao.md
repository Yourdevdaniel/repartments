# Configuração

Como rodar o Repartments na sua máquina e publicar o seu, incluindo o login do **estúdio** (`/studio`).

> Resumo: o prédio público precisa de um token só de leitura (`GITHUB_TOKEN`). O estúdio precisa só do *Client ID* de um app do GitHub com o *device flow* ligado (`GITHUB_CLIENT_ID`), que é **público**: não há segredo de cliente, segredo de sessão nem chave nenhuma do estúdio no servidor ([ADR 0001](adr/0001-login-pelo-device-flow.md)).

## 1. Variáveis de ambiente

| Variável | Para quê | O que é |
|---|---|---|
| `GITHUB_TOKEN` | prédio público (`/api/building`) | Token *fine-grained* sem nenhuma permissão: só lê dados públicos. Em desenvolvimento pode faltar, o servidor pede ao GitHub CLI. |
| `GITHUB_CLIENT_ID` | login do estúdio | O *Client ID* do GitHub App ou OAuth App, com **Enable Device Flow** marcado. Não é segredo. |
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
2. **Homepage URL:** o endereço do site. **Callback URL:** pode ficar vazio (o *device flow* não usa redirecionamento).
3. Marque **Enable Device Flow**.
4. **Webhook:** desmarque *Active*.
5. **Repository permissions:** `Contents: Read-only` e `Metadata: Read-only`. Nada mais.
6. **Where can this GitHub App be installed?** *Only on this account* para uso interno, ou *Any account* se clientes vão instalar.
7. Crie o app e copie o **Client ID** para `GITHUB_CLIENT_ID`. Não gere *client secret*: ele não é usado.
8. **Install App** na conta ou organização dona dos repositórios. O token de um GitHub App só enxerga os repositórios onde o app está instalado: se a lista do estúdio vier vazia, falta instalar (ou incluir o repositório na instalação).

### OAuth App (mais simples, mais permissão)

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App** (a *callback URL* é obrigatória no formulário, mas não é usada: ponha o endereço do site).
2. Marque **Enable Device Flow** e copie o **Client ID**.
3. Se só repositórios públicos interessam, use `GITHUB_OAUTH_SCOPE=public_repo`.

## 3. Rodar localmente

```sh
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

- **Sem `GITHUB_CLIENT_ID`**, o botão "Entrar" do estúdio usa o login do **GitHub CLI** (`gh auth login`) direto. Isso só existe no servidor de desenvolvimento do Vite e só para quem acessa da própria máquina; as funções publicadas não têm esse atalho.
- **Com `GITHUB_CLIENT_ID`** em `.env.local`, o login real (código digitado no GitHub) é usado também em desenvolvimento.
- **Sem login nenhum**, "Ver um exemplo" abre a apresentação de um CRM de exemplo.

## 4. Publicar na Vercel

1. Importe o repositório na Vercel (o Vite é detectado; a pasta `api/` vira funções).
2. Em **Settings → Environment Variables**, crie `GITHUB_TOKEN` (marque *Sensitive*) e `GITHUB_CLIENT_ID`.
3. Deploy.

## 5. Checklist de segurança antes de publicar

- [ ] `.env.local` não está no git (`git status` não mostra; o `.gitignore` cobre `.env*`).
- [ ] O app do GitHub pede só leitura (GitHub App) ou `public_repo` se privados não forem necessários.
- [ ] *Enable Device Flow* marcado no app (sem ele o login responde `login-disabled`). Se o login responder "indisponível", o log do servidor diz o motivo que o GitHub deu (`GitHub refused the device code: …`): `Not Found` é um Client ID errado.
- [ ] A CSP de `vercel.json` continua com `script-src 'self'`, `connect-src 'self' https://api.github.com` e `require-trusted-types-for 'script'`: o token fica trancado no cofre do navegador, e a CSP é o que impede scripts de fora de rodar na página ([ADR 0002](adr/0002-token-so-no-navegador.md)).
- [ ] `npm audit` sem vulnerabilidades altas.
