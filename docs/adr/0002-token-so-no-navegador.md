# 0002. Token trancado num worker do navegador, que fala direto com o GitHub

- Estado: aceito
- Data: 2026-10-07

## Contexto e problema

Depois do login ([0001](0001-login-pelo-device-flow.md)) alguém precisa guardar o token da pessoa e usá-lo para ler repositórios, commits e código. O pedido: nenhuma chave guardada no servidor. O site roda em funções da Vercel, sem memória entre chamadas e sem banco. E, depois de ver a primeira versão (token no `sessionStorage` da aba), veio o segundo pedido: **proteger o token contra um script malicioso** que conseguisse rodar na página, e deixar claro que o login acaba em 8 horas.

## Opções consideradas

1. **Sessão no servidor com cookie lacrado.** O token cifrado (AES-256-GCM) num cookie `HttpOnly`, e o servidor fazendo as chamadas. Fora do alcance de scripts, mas exige `SESSION_SECRET` no servidor e faz todo o código lido passar pelas funções. Foi a primeira versão construída; descartada pelo pedido de não guardar chaves.
2. **Token no `sessionStorage` da aba.** Sem chave no servidor, mas qualquer script que rodasse na página leria o token. Foi a segunda versão.
3. **Token num worker (o "cofre").** Um SharedWorker (ou Worker dedicado, onde não há SharedWorker) guarda o token na memória dele e faz as chamadas ao GitHub em nome da página. A página nunca recebe o token.
4. **Cofre num iframe de outro domínio.** Isola até das chamadas da página, mas exige um segundo domínio publicado e mais infraestrutura.

## Decisão

Opção 3 (`src/github/vault-core.ts`, `vault.worker.ts`, `vault.ts`, `allow.ts`), com mais camadas em volta:

- **O cofre faz o login inteiro**: pede o código ao repasse, consulta até a aprovação e recebe o token. A página só vê o código para digitar e, depois, quem entrou e até quando. Nem no momento do login o token passa pela página.
- **Só leituras passam**: o cofre recusa qualquer pedido fora de uma lista (`allow.ts`): `GET` em poucos caminhos REST (`/user`, `/user/repos`, repositório, branches, commits, árvore) e consultas GraphQL sem `mutation`. Mesmo um token de OAuth App com escopo `repo` (leitura e escrita) não consegue alterar nada por aqui.
- **8 horas no máximo**: o cofre esquece o token 8 horas depois do login (ou antes, se o token do GitHub vencer antes) e avisa todas as abas. A interface mostra o tempo que falta no cabeçalho ("termina em 7 h 52 min"), uma faixa de aviso nos últimos 10 minutos ("salve a apresentação para continuar mostrando sem login") e, ao terminar, explica por que pediu login de novo.
- **Trusted Types** na CSP (`require-trusted-types-for 'script'; trusted-types default`) com uma política (`src/security.ts`) que só aceita scripts do próprio site e recusa transformar texto em HTML ou script. Junto com `script-src 'self'`, isso fecha os caminhos comuns de injeção de script.
- A CSP continua limitando conexões ao próprio site e a `api.github.com`; nada de `eval`, iframes ou plugins.
- Modelo e roteiro ficam no `sessionStorage` (não têm o token); guardar uma apresentação é um ato explícito ("Salvar apresentação").

## Consequências

- Nenhum segredo no servidor; o token não fica em nenhum armazenamento que a página leia.
- Um script que entrasse na página ainda poderia **pedir ao cofre** leituras permitidas enquanto o login durar (o cofre não sabe quem, dentro da página, está pedindo). Ele não consegue levar o token embora nem escrever nos repositórios. As defesas contra o script entrar são a CSP com Trusted Types, o React escapando todo texto e a validação dos arquivos abertos.
- Fechar todas as abas do site encerra o worker e o login. **Recarregar a página com só uma aba aberta também pede login de novo**; com outra aba do estúdio aberta, o login continua.
- Não há como o Repartments revogar um token no GitHub (exigiria o segredo do app); quem quiser cortar na hora revoga o app em GitHub → Settings → Applications.
