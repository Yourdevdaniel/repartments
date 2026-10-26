# 0015. Estúdio fechado para testes, e o código dele fora do repositório

- Estado: aceito
- Data: 2026-10-26

## Contexto e problema

O estúdio (`/studio`) deixava entrar com o GitHub, abrir qualquer repositório, inclusive privado, e transformá-lo numa apresentação animada, com vídeo e PowerPoint. O autor quer reconstruí-lo como uma ferramenta que roda no computador da pessoa, mais completa, e não quer manter no ar, nem no repositório público, uma versão que vai ser substituída.

## Decisão

- `/studio` passa a mostrar uma página de beta fechado (`src/beta/Beta.tsx`): um pedido de desculpas, o motivo, um botão "Quero ser tester" (`TESTER_URL`; no começo uma issue pré-preenchida no GitHub, hoje o formulário do site, em `/beta/`) e um FAQ. O seletor Prédio/Estúdio continua, levando a essa página.
- O código do estúdio sai do repositório **e do histórico**: `src/studio`, `src/architecture`, `src/github`, `api/auth`, `server/auth.ts`, `src/scene/tour.ts`, `src/shared/studio.ts`, `src/shared/components.ts`, com seus testes e documentos (ADRs 0001 a 0005, 0007 a 0010, 0012 a 0014, `analise.md`, `roteiro.md`, `exemplos/`). Uma cópia completa, com o histórico original, fica com o autor fora do repositório.
- Saem também as dependências que só ele usava (`mediabunny`, `pptxgenjs`) e o atalho de login do servidor de desenvolvimento.
- A política de privacidade e o registro (`docs/privacidade.md`) deixam de descrever login, token e cookies: o site não tem mais nenhum.

## Consequências

- O site fica só com o prédio público e a página de beta; nenhum login, token de pessoa ou cookie.
- Os commits antigos foram reescritos: os hashes mudaram, e commits antigos não compilam (referenciam código que saiu). PRs antigos no GitHub ainda guardam cópias até o GitHub Support limpá-las.
- `docs/arquitetura.md` e `docs/COMO-FUNCIONA.md` ainda descrevem o estúdio em algumas seções; valem como registro de como ele era até serem revisados.
- O app do GitHub `repartments-reader` e as variáveis `GITHUB_CLIENT_*` na Vercel ficam sem uso e podem ser removidos.
