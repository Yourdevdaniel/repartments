import type { Role } from '../shared/types'

export type Lang = 'en' | 'pt'
export type L = Record<Lang, string>

/** What each role is called and what its resident is doing in the flat. */
export const roles: Record<Role, { name: L; does: L }> = {
  frontend: {
    name: { en: 'Front end', pt: 'Front-end' },
    does: { en: 'Asks for data and puts the page on screen', pt: 'Pede os dados e monta a página na tela' },
  },
  backend: {
    name: { en: 'Back end', pt: 'Back-end' },
    does: { en: 'Reads requests and sends the answers', pt: 'Lê os pedidos e manda as respostas' },
  },
  database: {
    name: { en: 'Database', pt: 'Banco de dados' },
    does: { en: 'Keeps the data on the shelves', pt: 'Guarda os dados nas prateleiras' },
  },
  cache: {
    name: { en: 'Cache', pt: 'Cache' },
    does: { en: 'Hands over what was asked a moment ago', pt: 'Entrega na hora o que acabaram de pedir' },
  },
  worker: {
    name: { en: 'Background jobs', pt: 'Tarefas em segundo plano' },
    does: { en: 'Sorts the mail nobody needs right now', pt: 'Cuida do correio que não precisa ser agora' },
  },
  security: {
    name: { en: 'Security', pt: 'Segurança' },
    does: { en: 'Checks who is allowed in', pt: 'Confere quem pode entrar' },
  },
  tests: {
    name: { en: 'Tests', pt: 'Testes' },
    does: { en: 'Checks every parcel before it leaves', pt: 'Confere cada pacote antes de sair' },
  },
  devops: {
    name: { en: 'DevOps', pt: 'DevOps' },
    does: { en: 'Builds the container everyone lives in', pt: 'Monta o contêiner onde todos moram' },
  },
  mobile: {
    name: { en: 'Mobile', pt: 'Mobile' },
    does: { en: 'Takes the app out on a phone', pt: 'Leva o app para o celular' },
  },
  coder: {
    name: { en: 'Code', pt: 'Código' },
    does: { en: 'Writes the code', pt: 'Escreve o código' },
  },
}

/** What a resident does, when it depends on the technology and not just the role. */
export function doesFor(role: Role, tech: string): L {
  if (role === 'devops' && tech !== 'Docker') return { en: 'Runs the checks on every push', pt: 'Roda as verificações a cada push' }
  return roles[role].does
}

export const copy = {
  tagline: { en: 'Your repos, as a tiny apartment building', pt: 'Seus repositórios num predinho' },
  landingTitle: { en: 'Your GitHub, as a tiny building', pt: 'Seu GitHub vira um predinho' },
  landingLead: {
    en: 'Every repo is a flat, every technology a resident. Step inside to watch how the pieces work together.',
    pt: 'Cada repositório é um apartamento, cada tecnologia um morador. Entre para ver como as partes trabalham juntas.',
  },
  placeholder: { en: 'GitHub username', pt: 'usuário do GitHub' },
  build: { en: 'Build it', pt: 'Construir' },
  examples: { en: 'Or peek at:', pt: 'Ou dê uma olhada em:' },
  demo: { en: 'demo building', pt: 'prédio de exemplo' },
  demoNote: { en: 'Demo: stacks and statuses typed in by hand.', pt: 'Exemplo: stacks e estados digitados à mão.' },
  onGitHub: { en: 'See on GitHub', pt: 'Ver no GitHub' },
  loading: (login: string): L => ({ en: `Building @${login}'s place…`, pt: `Construindo o prédio de @${login}…` }),
  loadingLead: { en: 'Reading the public repos, one floor at a time.', pt: 'Lendo os repositórios públicos, um andar por vez.' },
  errors: {
    'invalid-user': (): L => ({ en: "That doesn't look like a GitHub username.", pt: 'Isso não parece um usuário do GitHub.' }),
    'not-found': (login: string): L => ({ en: `No one called @${login} on GitHub.`, pt: `Ninguém chamado @${login} no GitHub.` }),
    'no-repos': (login: string): L => ({ en: `@${login} has no public repos yet: an empty lot.`, pt: `@${login} ainda não tem repositórios públicos: terreno vazio.` }),
    'rate-limited': (): L => ({ en: 'GitHub asked us to slow down. Try again in a minute.', pt: 'O GitHub pediu para irmos devagar. Tente de novo em um minuto.' }),
    unavailable: (): L => ({ en: "Couldn't reach GitHub right now.", pt: 'Não deu para falar com o GitHub agora.' }),
  } as Record<string, (login: string) => L>,
  cast: { en: 'Who lives here', pt: 'Quem mora aqui' },
  back: { en: 'Back to the building', pt: 'Voltar para o prédio' },
  hint: { en: 'Click a flat to step inside', pt: 'Clique num apartamento para entrar' },
  loop: { en: 'Steps of the loop, it repeats', pt: 'Passos do ciclo, que se repete' },
  weather: { en: 'Weather', pt: 'Clima' },
  prOpen: (n: number): L => ({ en: n === 1 ? '1 open PR' : `${n} open PRs`, pt: n === 1 ? '1 PR aberto' : `${n} PRs abertos` }),
  conflict: { en: 'merge conflict', pt: 'conflito no merge' },
  ciFailing: { en: 'tests failing', pt: 'testes falhando' },
  ciPassing: { en: 'tests passing', pt: 'testes passando' },
  auto: { en: 'auto', pt: 'auto' },
  weatherName: {
    sun: { en: 'Sunny', pt: 'Sol' },
    clouds: { en: 'Cloudy', pt: 'Nublado' },
    rain: { en: 'Rain', pt: 'Chuva' },
    night: { en: 'Night', pt: 'Noite' },
  } as Record<string, L>,
  note: {
    en: 'An illustration of how the pieces talk. It never shows code, routes or data.',
    pt: 'Uma ilustração de como as partes conversam. Nunca mostra código, rotas ou dados.',
  },
  credits: { en: 'Characters and furniture: Kenney (CC0)', pt: 'Personagens e móveis: Kenney (CC0)' },
  residents: (n: number): L => ({
    en: n === 1 ? '1 apartment' : `${n} apartments`,
    pt: n === 1 ? '1 apartamento' : `${n} apartamentos`,
  }),
  people: (n: number): L => ({
    en: n === 1 ? '1 resident' : `${n} residents`,
    pt: n === 1 ? '1 morador' : `${n} moradores`,
  }),
}
