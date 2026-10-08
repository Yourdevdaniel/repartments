/**
 * The prompt the studio offers to copy ("Copiar prompt para a IA"): the person pastes it into the AI
 * of their choice, which reads their repo and writes the `repartments.json` the studio then imports
 * (`src/architecture/authored.ts`). Nothing is sent anywhere by the studio. The whole text is shown in
 * `docs/roteiro.md` ("Transparência sobre o prompt"); a test keeps the two the same.
 *
 * Kept as one constant on purpose, like the help prompt of a step-by-step tree visualizer that
 * inspired it: a role, the site's rules, a numbered task and the exact answer wanted.
 */
import { exportAuthored } from '../architecture/authored'
import type { ArchitectureModel, AuthoredProblem } from '../shared/studio'

/** Bumped with the file format: a script made from an older prompt still reads, with a note. */
export const PROMPT_VERSION = 1

export const AUTHOR_PROMPT = `Você vai escrever o roteiro de uma apresentação do Repartments sobre um sistema de software.

O Repartments transforma um repositório do GitHub num prédio animado: cada andar é uma cena, e bonequinhos (as partes do sistema e quem o usa) encenam como ele funciona para quem não programa, como um cliente ou um gestor. O estúdio do Repartments lê o código sozinho, mas só entende a arquitetura. Quem conhece o sistema conta o que ele faz num arquivo repartments.json, e é esse arquivo que você vai escrever.

Repositório: {{repo}} (branch {{branch}}, commit {{commit}}), em https://github.com/{{repo}}

Regras:
- Se você consegue ler os arquivos do repositório, leia o README, os manifestos (package.json, requirements.txt, pyproject.toml…), os pontos de entrada, as telas, as rotas e as pastas principais. Se não consegue, use só o material que a pessoa colar depois deste texto, e cite apenas arquivos que aparecem nele.
- Escreva só o que o código mostra. Não invente funcionalidade, nome de tela nem arquivo; na dúvida, deixe de fora.
- Para cada funcionalidade e para cada passo que vem de um lugar do código, cite o arquivo em "file" (caminho a partir da raiz do repositório) e, se souber, a linha em "line". O estúdio confere se o arquivo existe e descarta caminho errado.
- Escreva para quem não programa: nada de "endpoint", "payload" ou "serializer". Diga o que a pessoa vê e o que o sistema faz por ela.
- Todo texto vai nos dois idiomas: {"pt": "...", "en": "..."}.
- Limites: até 16 partes, 6 funcionalidades e 6 cenas; em cada cena, até 7 personagens e 14 passos. Nome de parte com até 28 caracteres, título de cena até 60, fala de um passo até 120 e balão ("say") até 24.
- Papéis ("role") dos personagens: person, screen, api, security, service, agent, llm, tool, worker, queue, database, cache, external.
- Ações ("action") de um passo: ask (pede algo), check (confere quem pede), call (passa o trabalho para outra parte), fetch (busca dados), save (grava), think e decide (um agente de IA pensa e escolhe; "from" igual a "to"), use-tool (o agente usa uma ferramenta), reply (a resposta volta), show (a resposta aparece na tela), queue (deixa uma tarefa para depois), send (manda algo para fora: e-mail, mensagem, outro serviço).

Tarefa:
1. Em "about", escreva uma ou duas frases sobre o que o sistema faz e para quem.
2. Em "parts", liste as partes principais, cada uma com um "id" curto, um nome simples ("Tela de pedidos", "Cozinha", "Banco de dados"), o que ela faz ("does"), o papel ("role") e as pastas ou arquivos que ela cobre ("paths").
3. Em "features", liste o que a pessoa consegue fazer com o sistema (no máximo 6): o nome que a funcionalidade tem nele ("name": o texto do botão, o comando), o que ela faz ("does"), como a pessoa chega nela ("how": "button", "command" ou "readme") e o arquivo onde está.
4. Em "scenes", escreva de 2 a 6 cenas que mostrem o sistema funcionando do ponto de vista de quem usa: quem pede, quem atende, o que é guardado, o que aparece na tela. Cada cena tem "title", "summary", "cast" e "steps". Cada personagem do "cast" tem um "id" curto, e os passos usam esses ids em "from" e "to". Um personagem que é uma parte do sistema leva em "part" o id da parte.
5. O rascunho abaixo é o que o estúdio leu sozinho do código. Use como ponto de partida: corrija o que estiver errado, troque nomes genéricos e complete o que faltar.

Responda só com o arquivo repartments.json completo, num único bloco \`\`\`json, sem texto antes ou depois, sem comentários, com aspas duplas e sem vírgula sobrando. Mantenha "$schema", "version", "commit" e "writtenAt" como estão no rascunho.

Rascunho lido pelo estúdio:
\`\`\`json
{{draft}}
\`\`\``

/** The prompt for this repo: its name, branch and commit, and what the studio read as the draft. */
export function authorPrompt(model: ArchitectureModel): string {
  const fill: Record<string, string> = {
    repo: `${model.repo.owner}/${model.repo.name}`,
    branch: model.repo.branch,
    commit: model.repo.sha.slice(0, 7) || '?',
    // Compact: the draft is read by the AI, not by a person, and a shorter prompt pastes anywhere.
    draft: JSON.stringify(JSON.parse(exportAuthored(model, model.automatic ?? model.flows))),
  }
  return AUTHOR_PROMPT.replace(/\{\{(\w+)\}\}/g, (all, key: string) => fill[key] ?? all)
}

/** What to paste back into the same AI when the studio refused the file or left parts of it out. */
export function fixPrompt(problems: AuthoredProblem[], lang: 'pt' | 'en'): string {
  const list = problems.map((p) => `- ${p.where ? `${p.where}: ` : ''}${p.message[lang]}${p.detail ? ` (${p.detail})` : ''}`).join('\n')
  return lang === 'pt'
    ? `O estúdio do Repartments leu o repartments.json que você escreveu e apontou isto:\n${list}\n\nCorrija esses pontos sem mudar o resto e responda só com o arquivo repartments.json completo, num único bloco \`\`\`json.`
    : `The Repartments studio read the repartments.json you wrote and pointed this out:\n${list}\n\nFix these points without changing the rest and answer only with the complete repartments.json file, in a single \`\`\`json block.`
}
