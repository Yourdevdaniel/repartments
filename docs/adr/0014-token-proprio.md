# 0014. Entrar com um token da própria pessoa, que nunca passa pelo servidor

- Estado: aceito
- Data: 2026-10-26

## Contexto e problema

Quem instala o GitHub App confia no dono do app: com uma chave privada do app, ele poderia ler os repositórios liberados sem a pessoa estar no site. E no "Continuar com GitHub" ([0008](0008-continuar-com-github.md)) o token passa um instante pelo servidor, que poderia guardá-lo se fosse alterado. O autor não quer ter esse acesso, e quem vai mostrar código privado precisa de um jeito de não depender dessa confiança. Junto veio um tropeço de uso: entrar não libera repositório nenhum, e os privados só aparecem depois de instalar o app neles.

## Opções consideradas

1. **Só explicar melhor o GitHub App.** Resolve o tropeço, não a confiança.
2. **Trocar por OAuth App.** Some a chave do app, mas o escopo `repo` é leitura e escrita em todos os privados, e o token continua passando pelo servidor.
3. **Token fine-grained criado pela pessoa e colado no estúdio.** Só leitura, nos repositórios que ela escolhe, com prazo. A API do GitHub aceita chamadas direto do navegador, então o token vai da página para o cofre ([0002](0002-token-so-no-navegador.md)) e do cofre só para `api.github.com`.
4. **Rodar localmente.** Já existe (modo dev com o login do `gh`); faltava dizer.

## Decisão

Opções 3 e 4, com o GitHub App mantido como caminho principal:

- O cartão de login tem "Prefere não autorizar nenhum app? Use um token seu", com os passos, um link que abre a criação do token no GitHub e um campo de senha. O token vai ao cofre (`{ type: 'token' }` em `vault-core.ts`), que o marca como da própria pessoa e **nunca o manda ao servidor, nem para revogar** (o servidor não conseguiria revogar um token que não é do app). Testado em `vault-core.test.ts`.
- A lista de repositórios ganha "Como adicionar meus repositórios privados?", explicando que o login não libera nada e recomendando "Only select repositories".
- A política e `docs/privacidade.md` dizem o que o dono do app poderia fazer, que o projeto não gera chave privada do app e quais são as saídas. O README diz como rodar localmente.

## Consequências

- Quem usa token próprio não depende do servidor nem do dono do app, mas leva alguns minutos para criar o token, e enquanto digita o token ele passa pela página (o campo), não só pelo cofre.
- Continua havendo confiança no JavaScript publicado: um site alterado poderia mandar o token para fora. A defesa é o código aberto e a opção de rodar localmente.
- O compromisso "não gerar chave privada do app" é de processo, não de código: precisa ser conferido em GitHub → Developer settings → GitHub Apps → Private keys.
