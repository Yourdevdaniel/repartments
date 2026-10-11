# 0001. Login com o GitHub pelo device flow, sem segredo no servidor

- Estado: aceito
- Data: 2026-10-07

## Contexto e problema

O prédio público usa **um** token do servidor, só de leitura e só para dados públicos. O estúdio precisa ler repositórios **privados** de quem usa (o CRM de um cliente, por exemplo). O pedido inicial: o token tem de ser por pessoa e por sessão, nunca no código nem no repositório. Depois, ao ver a primeira versão (fluxo OAuth web com `GITHUB_CLIENT_SECRET` e um `SESSION_SECRET` no servidor), o pedido foi mais longe: **não guardar chave nenhuma no servidor**, de preferência com algo que o próprio GitHub ofereça, "como quando você entra pelo GitHub".

## Opções consideradas

1. **Token pessoal (PAT) colado pela pessoa num formulário.** Simples, mas ensina a colar segredos em sites, e o token costuma ter permissão demais e validade longa.
2. **Fluxo OAuth web (redirecionamento) com o segredo do cliente no servidor.** O padrão "Entrar com o GitHub". Exige `GITHUB_CLIENT_SECRET` no servidor para trocar o código pelo token, e uma sessão no servidor (no nosso caso, um cookie lacrado com `SESSION_SECRET`). Foi a primeira versão construída; descartada pelo pedido de não guardar chaves.
3. **Device flow do GitHub (cliente público).** O mesmo login do GitHub CLI: a página mostra um código curto, a pessoa digita em `github.com/login/device` e autoriza. Precisa só do *Client ID*, que é público. Funciona com GitHub App e com OAuth App (opção "Enable Device Flow").

## Decisão

Opção 3, com o token entregue direto à aba do navegador ([0002](0002-token-so-no-navegador.md)).

- `server/auth.ts` só **repassa** duas chamadas ao GitHub (`/login/device/code` e `/login/oauth/access_token`), porque esses endereços não aceitam pedidos feitos por páginas web (CORS). Ele acrescenta o *Client ID* e não guarda nada: nem token, nem código, nem sessão.
- Pedidos ao repasse exigem um cabeçalho próprio (`X-Requested-With`) e `Origin` do próprio site, e têm freio por visitante.
- O código do dispositivo é validado antes de seguir; respostas de "ainda esperando" e "vá mais devagar" passam como estão, para a página respeitar o ritmo que o GitHub pede.
- Em desenvolvimento, sem *Client ID*, o Vite oferece `/api/auth/dev`, que entrega o token do GitHub CLI à página, **só** para conexões da própria máquina. Esse atalho não existe nas funções publicadas.

Recomendação documentada: **GitHub App** com Contents e Metadata só leitura (a pessoa escolhe os repositórios ao instalar, tokens expiram em 8 horas). Um OAuth App com escopo `repo` também funciona, mas esse escopo é leitura **e** escrita.

## Consequências

- Nenhum segredo no servidor: as únicas variáveis do estúdio são `GITHUB_CLIENT_ID` (pública) e, opcionalmente, `GITHUB_OAUTH_SCOPE`.
- Cada pessoa usa a própria cota do GitHub e só vê o que a conta dela já vê.
- O login tem um passo a mais que o redirecionamento: copiar o código e colar no GitHub (a página copia e abre a aba sozinha).
- O app do GitHub precisa ter o device flow ligado; organizações podem exigir aprovação do app.
