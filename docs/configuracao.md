# Configuração

Como rodar o Repartments na sua máquina e publicar o seu. O estúdio (`/studio`) está fechado para testes ([ADR 0015](adr/0015-estudio-fechado.md)): hoje a rota mostra só a página de beta, sem login, então o único segredo é o token do prédio público.

## 1. Variável de ambiente

| Variável | Para quê | O que é |
|---|---|---|
| `GITHUB_TOKEN` | prédio público (`/api/building`) | Token *fine-grained* sem nenhuma permissão: só lê dados públicos. Em desenvolvimento pode faltar, o servidor pede ao GitHub CLI (`gh auth login`). |

O arquivo [`.env.example`](../.env.example) explica. Copie para `.env.local` (que o git ignora).

## 2. Rodar localmente

```sh
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

## 3. Publicar na Vercel

1. Importe o repositório na Vercel (o Vite é detectado; a pasta `api/` vira funções).
2. Em **Settings → Environment Variables**, crie `GITHUB_TOKEN` (marque *Sensitive*).
3. Deploy. Tokens *fine-grained* vencem: nas duas últimas semanas a função avisa nos logs.

## 4. Checklist de segurança antes de publicar

- **No build:** `npm run build` termina com `scripts/check-dist.mjs`, que **interrompe o deploy** se algum arquivo publicado tiver o valor de `GITHUB_TOKEN` ou algo com cara de token ou chave.
- **Nos testes:** `server/logs.test.ts` confere que nenhum log do servidor imprime segredo, token, cookie ou pedido.
- **No site publicado:** `npm run check:site -- https://seu-site` olha o site de fora e confere scripts, mapas de código, arquivos sensíveis e cabeçalhos de segurança. Rode depois de cada deploy.

E, na configuração:

- [ ] A política de privacidade (`src/privacy/policy.ts`) tem um contato de verdade em `CONTROLLER.contact`, o DPA da Vercel foi aceito na conta e o registro em [privacidade.md](privacidade.md) está em dia.
- [ ] `.env.local` não está no git (o `.gitignore` cobre `.env*`).
- [ ] No GitHub, **Secret scanning** e **Push protection** ligados no repositório.
- [ ] A CSP de `vercel.json` continua com `script-src 'self'` e `require-trusted-types-for 'script'`.
- [ ] `npm audit` sem vulnerabilidades altas.
