# 0002. Token só na aba do navegador, que fala direto com o GitHub

- Estado: aceito
- Data: 2026-10-07

## Contexto e problema

Depois do login ([0001](0001-login-pelo-device-flow.md)) alguém precisa guardar o token da pessoa e usá-lo para ler repositórios, commits e código. O pedido: nenhuma chave guardada no servidor. O site roda em funções da Vercel, sem memória entre chamadas e sem banco.

## Opções consideradas

1. **Sessão no servidor com cookie lacrado.** O token cifrado (AES-256-GCM) num cookie `HttpOnly`, e o servidor fazendo as chamadas ao GitHub. Fora do alcance de scripts da página, mas exige `SESSION_SECRET` no servidor e faz todo o código lido passar pelas funções. Foi a primeira versão construída.
2. **Sessão no servidor com banco ou KV.** Mesmo problema, mais um serviço.
3. **Token só no navegador.** A aba guarda o token e chama `api.github.com` direto (a API do GitHub aceita chamadas de qualquer site, com CORS). O servidor não participa depois do login.

## Decisão

Opção 3 (`src/studio/session.ts`, `src/studio/api.ts`, `src/github/client.ts`):

- O token fica no `sessionStorage` **da aba**: some ao fechá-la e ao clicar em "Sair". Nunca vai para `localStorage`, cookie ou servidor.
- Toda chamada do estúdio sai do navegador para `api.github.com`; a CSP libera só esse destino além do próprio site (`connect-src 'self' https://api.github.com`).
- A análise de arquitetura ([0003](0003-analise-estatica-sem-llm.md)) também roda no navegador: o código vai do GitHub direto para a aba e não passa pelo servidor do Repartments.
- O modelo e o roteiro também ficam no `sessionStorage`. Guardar uma apresentação é um ato explícito ("Salvar apresentação"), que baixa um arquivo com o roteiro, os nomes das partes e dos arquivos, nunca o código.
- Um 401 do GitHub (token revogado ou vencido) faz a página sair sozinha.

## Consequências

- Nenhum segredo no servidor, nenhum dado de pessoa no servidor; o custo do servidor do estúdio é só o repasse do login.
- O token fica ao alcance de um script que rodasse na página (XSS). Defesas: CSP restrita (scripts só do próprio site, sem `eval`), React escapando todo texto, nenhum `innerHTML`, arquivos abertos validados campo a campo, e a recomendação de GitHub App só leitura com tokens de 8 horas.
- Não há como o Repartments derrubar uma sessão; quem derruba é a pessoa (Sair, fechar a aba) ou o GitHub (revogar o app).
- O navegador faz as chamadas: em repositórios grandes a análise e os commits gastam a cota da própria pessoa (5 000 chamadas por hora), não a do site.
