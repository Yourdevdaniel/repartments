# 0008. Botão "Continuar com GitHub" com o segredo só para trocar o código

- Estado: aceito
- Data: 2026-10-07

## Contexto e problema

Quem entra no estúdio está acostumado ao botão "Continuar com GitHub": clica, o GitHub pede autorização, e a pessoa volta para o site já logada. O login pelo código ([0001](0001-login-pelo-device-flow.md)) funciona, mas é estranho para clientes: é preciso copiar um código curto, abrir outra aba e digitá-lo. Quem apresenta o estúdio a um cliente nota a diferença logo no começo.

Ao mesmo tempo, o que [0001](0001-login-pelo-device-flow.md) buscava continua importando: o mínimo possível guardado no servidor, nenhuma sessão, nenhum banco. E o token segue as regras de [0002](0002-token-so-no-navegador.md): fica trancado no cofre do navegador, só faz leituras, e nunca aparece em endereço, página ou log.

Dois fatos do GitHub pesam na decisão. O GitHub só troca o código de autorização por token se o pedido trouxer o *client secret* do app, mesmo com PKCE (o GitHub publicou PKCE em 2025-07-14, e um mantenedor confirmou que o segredo continua obrigatório, porque o GitHub não distingue clientes públicos de confidenciais). E o endereço `github.com/login/oauth/access_token` não aceita pedidos de páginas web (sem CORS). Logo, a troca tem de ser feita no servidor, e o servidor precisa do segredo.

## Opções consideradas

1. **Manter só o device flow.** Nenhum segredo, nenhum estado novo. Não resolve a estranheza do código para o cliente.
2. **Fluxo OAuth web com sessão no servidor** (a primeira versão de [0001](0001-login-pelo-device-flow.md)): o servidor guarda a sessão num cookie lacrado com `SESSION_SECRET`. Funciona bem, mas cria uma chave de sessão e um estado no servidor, o que [0001](0001-login-pelo-device-flow.md) decidiu não ter.
3. **Fluxo OAuth web sem sessão no servidor.** O segredo serve só para trocar o código. O token segue para o cofre do navegador por um cookie `HttpOnly` de 2 minutos, lido uma vez por `/api/auth/claim`. O `state` e o verificador PKCE vão num cookie de 10 minutos, para recusar retornos forjados ou repetidos.
4. **Esperar o GitHub aceitar clientes públicos** (sem segredo no fluxo web). Não há data, e não depende de nós.

## Decisão

Opção 3. O estúdio mostra **Continuar com GitHub** quando o servidor tem `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`. Sem o segredo, continua valendo o device flow da opção 1, sem mudança.

- `GET /api/auth/login` gera `state` e um verificador PKCE de 32 bytes cada, guarda-os com o destino (`next`, só caminhos `/studio…`) no cookie `gh_flow`, e redireciona ao GitHub com o desafio S256.
- `GET /api/auth/callback` confere o `state` com o cookie, troca o código no GitHub com o *client ID*, o *client secret*, o `redirect_uri` e o verificador, apaga `gh_flow` e põe o token no cookie `gh_handoff` (HttpOnly, Secure, SameSite=Strict, só para `/api/auth/claim`, 2 minutos), e volta para `next?signin=1`.
- `POST /api/auth/claim` entrega o token uma vez ao cofre (só de chamadas do próprio site) e apaga o cookie.
- Cancelamento no GitHub volta como `signin=denied`; qualquer outra falha como `signin=failed`, e o log do servidor registra o que o GitHub respondeu.

## Consequências

- Passa a existir um segredo no servidor, `GITHUB_CLIENT_SECRET`, como variável de ambiente. Na Vercel ele é marcado como *Sensitive*; localmente fica em `.env.local`, que o git ignora. Nunca vai para o código, o repositório ou o navegador.
- Continuam valendo as regras de [0001](0001-login-pelo-device-flow.md): nenhuma sessão, nenhum banco e nenhum `SESSION_SECRET`. O servidor só repassa duas trocas e guarda o estado do login em cookies curtos.
- O token nunca aparece em endereço, na página nem em log. Ele passa do servidor ao cofre pelo cookie de 2 minutos e fica no cofre, como manda [0002](0002-token-so-no-navegador.md).
- O `state` e o PKCE impedem que um retorno forjado ou repetido vire login. Os cookies são `Secure`, `HttpOnly` e com `Path` restrito.
- A Callback URL do app tem de ser registrada exatamente como `https://<site>/api/auth/callback` (e `http://localhost:5173/api/auth/callback` para desenvolvimento, em outro OAuth App, se o app for OAuth).
- O segredo só é lido em `server/auth.ts` e só viaja no corpo do pedido a `https://github.com/login/oauth/access_token`. Um teste passa por todas as rotas e confere que ele não aparece em nenhuma resposta, endereço ou cookie; e, como o Vite só põe no código do navegador variáveis que começam com `VITE_`, ele também não entra no site publicado (conferido com um build de teste).
- Se o segredo vazar, ele deve ser trocado: a página do app no GitHub gera um novo, e o antigo deixa de valer. A variável na Vercel é atualizada e o site é reimplantado.
- Sem o segredo, o estúdio continua funcionando pelo código, então a mudança é aditiva: nenhuma instalação atual quebra.
- Quando o GitHub aceitar clientes públicos no fluxo web, a troca no servidor pode sair e o segredo deixa de ser necessário. Este ADR seria então substituído.
