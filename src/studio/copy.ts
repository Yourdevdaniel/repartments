/** The studio shell's words, in both languages. Tabs and panels owned by other files keep their own. */
import type { StudioErrorCode } from '../shared/studio'
import type { L } from '../ui/roles'

export const t = {
  studio: { en: 'Studio', pt: 'Estúdio' },
  tagline: { en: 'See how a system works, told by its residents', pt: 'Veja como um sistema funciona, contado pelos moradores' },
  signInTitle: { en: 'Open any of your repos, private ones too', pt: 'Abra qualquer repositório seu, privados também' },
  signInLead: {
    en: 'Sign in with GitHub to browse commits, map the architecture and turn it into an animated presentation anyone can follow.',
    pt: 'Entre com o GitHub para navegar nos commits, mapear a arquitetura e transformar tudo numa apresentação animada que qualquer pessoa entende.',
  },
  signIn: { en: 'Sign in with GitHub', pt: 'Entrar com o GitHub' },
  signInDev: { en: 'Sign in (GitHub CLI, development)', pt: 'Entrar (GitHub CLI, desenvolvimento)' },
  signInOff: {
    en: "Sign-in isn't set up on this server yet. See docs/configuracao.md to create the GitHub app.",
    pt: 'O login ainda não foi configurado neste servidor. Veja docs/configuracao.md para criar o app do GitHub.',
  },
  signInError: {
    denied: { en: 'GitHub sign-in was cancelled.', pt: 'O login no GitHub foi cancelado.' },
    expired: { en: 'The sign-in expired. Please sign in again.', pt: 'O login expirou. Entre de novo.' },
    unavailable: { en: "Couldn't reach GitHub. Please try again.", pt: 'Não deu para falar com o GitHub. Tente de novo.' },
  },
  privacy: {
    en: "Sign-in is GitHub's own, with a code like the GitHub CLI's. The key stays only in this tab and goes straight to GitHub: this site stores nothing, and closing the tab or signing out forgets it.",
    pt: 'O login é o do próprio GitHub, com um código como o do GitHub CLI. A chave fica só nesta aba e vai direto para o GitHub: este site não guarda nada, e fechar a aba ou sair apaga tudo.',
  },
  deviceTitle: { en: 'Approve on GitHub', pt: 'Autorize no GitHub' },
  deviceLead: {
    en: 'Open GitHub, type this code and approve. This page carries on by itself.',
    pt: 'Abra o GitHub, digite este código e autorize. Esta página continua sozinha.',
  },
  deviceOpen: { en: 'Copy the code and open GitHub', pt: 'Copiar o código e abrir o GitHub' },
  deviceCopied: { en: 'Code copied: paste it on GitHub', pt: 'Código copiado: cole no GitHub' },
  deviceWaiting: { en: 'Waiting for your approval…', pt: 'Esperando a sua autorização…' },
  cancel: { en: 'Cancel', pt: 'Cancelar' },
  openFile: { en: 'Open a saved presentation', pt: 'Abrir uma apresentação salva' },
  badFile: { en: "That file isn't a Repartments presentation.", pt: 'Esse arquivo não é uma apresentação do Repartments.' },
  signOut: { en: 'Sign out', pt: 'Sair' },
  yourRepos: { en: 'Your repositories', pt: 'Seus repositórios' },
  back: { en: 'All repositories', pt: 'Todos os repositórios' },
  backHome: { en: 'Back to the building', pt: 'Voltar ao prédio' },
  tabs: {
    present: { en: 'How it works', pt: 'Como funciona' },
    commits: { en: 'Commits', pt: 'Commits' },
    map: { en: 'Map', pt: 'Mapa' },
  },
  private: { en: 'Private', pt: 'Privado' },
  savedFile: { en: 'Saved presentation', pt: 'Apresentação salva' },
  save: { en: 'Save presentation', pt: 'Salvar apresentação' },
  saveHint: {
    en: 'Everything here lasts only while this tab is open. Save it to present later, even without signing in. The file has the script, part names and file names (never code).',
    pt: 'Tudo aqui dura só enquanto esta aba estiver aberta. Salve para apresentar depois, até sem entrar. O arquivo leva o roteiro, os nomes das partes e dos arquivos (nunca o código).',
  },
  example: { en: 'See an example', pt: 'Ver um exemplo' },
  exampleLead: { en: 'A made-up CRM with an AI sales assistant, no sign-in needed.', pt: 'Um CRM de exemplo com assistente de vendas de IA, sem precisar entrar.' },
  offline: {
    en: 'This presentation was saved without commits. Sign in and open the repo to see them.',
    pt: 'Esta apresentação foi salva sem commits. Entre e abra o repositório para vê-los.',
  },
  analyze: { en: 'Read the repository', pt: 'Ler o repositório' },
  reanalyze: { en: 'Read again', pt: 'Ler de novo' },
  analyzeTitle: { en: 'Turn this repo into a presentation', pt: 'Transforme este repositório numa apresentação' },
  analyzeLead: {
    en: 'The studio reads the code (file names, imports, routes, AI agents), works out the parts of the system and how they talk, and writes the scenes the residents act out, for how it works and for every commit. It all happens here in your browser: the code comes straight from GitHub and no AI service reads it.',
    pt: 'O estúdio lê o código (nomes de arquivos, imports, rotas, agentes de IA), descobre as partes do sistema e como elas conversam, e escreve as cenas que os moradores encenam, de como funciona e de cada commit. Tudo acontece aqui no seu navegador: o código vem direto do GitHub e nenhum serviço de IA o lê.',
  },
  stages: {
    tree: { en: 'Reading the file tree…', pt: 'Lendo a árvore de arquivos…' },
    files: { en: 'Reading the code', pt: 'Lendo o código' },
    graph: { en: 'Finding the parts and how they connect…', pt: 'Encontrando as partes e as conexões…' },
    flows: { en: 'Writing the scenes…', pt: 'Escrevendo as cenas…' },
  },
  analyzedAt: (date: string): L => ({ en: `Read on ${date}`, pt: `Lido em ${date}` }),
  errors: {
    'signed-out': { en: 'Your session ended. Please sign in again.', pt: 'Sua sessão terminou. Entre de novo.' },
    forbidden: { en: "Your GitHub account can't read this repository.", pt: 'Sua conta do GitHub não pode ler este repositório.' },
    'not-found': { en: "This repository doesn't exist, is empty, or isn't shared with you.", pt: 'Este repositório não existe, está vazio ou não foi compartilhado com você.' },
    invalid: { en: "That doesn't look like a repository.", pt: 'Isso não parece um repositório.' },
    'rate-limited': { en: 'Too many requests for now. Try again in a few minutes.', pt: 'Muitos pedidos por agora. Tente de novo em alguns minutos.' },
    'login-disabled': { en: "Sign-in isn't set up on this server.", pt: 'O login não está configurado neste servidor.' },
    unavailable: { en: "Couldn't reach GitHub right now.", pt: 'Não deu para falar com o GitHub agora.' },
  } satisfies Record<StudioErrorCode, L>,
  retry: { en: 'Try again', pt: 'Tentar de novo' },
}
