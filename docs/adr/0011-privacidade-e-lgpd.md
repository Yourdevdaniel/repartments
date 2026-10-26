# 0011. Privacidade e LGPD: guardar o mínimo e dizer tudo

- Estado: aceito
- Data: 2026-10-08

## Contexto e problema

Com o "Continuar com GitHub" (ADR 0008, removido com o estúdio, ver [0015](0015-estudio-fechado.md)) e o estúdio aberto a clientes, o site passa a tratar dados pessoais de quem entra (nome de usuário, nome, foto, um token de acesso), de quem aparece nos commits (nomes de autores) e de quem é pesquisado no Prédio (dados públicos do GitHub). A LGPD (Lei 13.709/2018) pede que cada tratamento tenha finalidade, base legal e prazo, que a pessoa seja informada com clareza, que os direitos do art. 18 possam ser exercidos e que haja um canal de contato. O desenho já guarda pouco (ADRs 0001 e 0002, removidos com o estúdio), mas nada disso estava escrito para o público.

## Opções consideradas

1. **Só documentação interna.** Barato, mas não informa quem usa o site, como a lei pede.
2. **Banner de consentimento para tudo.** Comum, mas o site não tem cookies de análise ou propaganda; um banner para cookies estritamente necessários só cansaria a pessoa, e consentimento não é a base adequada para o login (é execução do serviço pedido).
3. **Política de privacidade no site, aviso no ponto de coleta, registro interno e opções que reduzem dados.** Informar onde a decisão acontece (ao lado do botão de login, ao salvar um arquivo, ao copiar o prompt), manter o inventário no repositório e dar a quem salva uma apresentação a opção de tirar os nomes.

## Decisão

Opção 3.

- **Política** em `/privacidade` e `/privacy` (`src/privacy/policy.ts`, `PrivacyPage.tsx`), em pt e en, com controlador e contato, o que é tratado em cada parte do site, finalidade, base legal, prazo, cookies, operadores (GitHub e Vercel) e a transferência internacional (art. 33), direitos (art. 18) e segurança. Ligada pelos créditos de todas as páginas e pela tela de login.
- **Aviso no login:** embaixo do botão, "Ao continuar, você autoriza o Repartments a ler (só ler) os repositórios que escolher", como cancelar no GitHub e o link da política.
- **Salvar sem nomes:** com commits na tela, "Salvar apresentação" oferece salvar com os autores trocados por "Autor 1, 2…" e sem as linhas de e-mail das mensagens (`withoutAuthors` em `src/studio/store.ts`).
- **Prompt para a IA:** o menu diz que o estúdio não envia nada, que o texto leva nomes e descrições (não o conteúdo dos arquivos) e que a IA escolhida segue os termos dela.
- **Registro das operações** (art. 37) em [privacidade.md](../privacidade.md), com o inventário, os direitos, os incidentes e as pendências antes de publicar.
- **Sem banner de cookies:** os únicos cookies são `gh_flow` e `gh_handoff`, necessários ao login e de poucos minutos. Um teste falha se o servidor criar um cookie que a política não cita.

## Consequências

- Quem usa o site sabe o que acontece com os dados antes de entrar, e quase todos os direitos se exercem sozinhos ("Sair", fechar a aba, revogar o app no GitHub).
- A política vira parte do código: mudou o tratamento, muda `policy.ts` (e `POLICY_UPDATED`) e `privacidade.md` no mesmo commit.
- Continua pendente, fora do código: um e-mail próprio para privacidade (hoje o contato é o site do autor), aceitar o DPA da Vercel e uma revisão jurídica antes de vender o estúdio a empresas.
- Endereços `/privacidade` e `/privacy` deixam de abrir o prédio de usuários do GitHub com esses nomes, como já acontece com `/demo` e `/studio`.
