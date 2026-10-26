# Referência da API

O Repartments tem uma rota própria: o **prédio público**. O estúdio, que tinha login e lia repositórios pelo navegador, está fechado para testes ([ADR 0015](adr/0015-estudio-fechado.md)).

Os tipos de cada resposta estão em [`src/shared/types.ts`](../src/shared/types.ts).

## Rotas do Repartments

### `GET /api/building?user=<login>[&after=<cursor>]`

O prédio público de um usuário ou organização: até 12 repositórios públicos (6 nos prédios seguintes, a partir de `after`). Resposta `Building`. Erros `BuildingError`: `invalid-user` (400), `not-found` / `no-repos` (404), `rate-limited` (429), `unavailable` (502/503). Cache: 1 h na borda; URLs com outra caixa ou parâmetros extras são redirecionadas (308) para a canônica. Freio: 20 requisições por minuto por visitante. Usa o `GITHUB_TOKEN` do servidor, que só lê dados públicos.

## Cabeçalhos de segurança

Todas as páginas e rotas recebem os cabeçalhos de [`vercel.json`](../vercel.json): CSP restrita (scripts só do site; `connect-src 'self' https://api.github.com`; imagens só do site e de `avatars.githubusercontent.com`; sem iframes nem plugins; **Trusted Types** obrigatório, com a política de `src/security.ts`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` e HSTS.
