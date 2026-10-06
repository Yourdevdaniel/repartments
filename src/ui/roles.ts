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

export const copy = {
  tagline: { en: 'Your repos, as a tiny apartment building', pt: 'Seus repositórios num predinho' },
  probe: { en: 'Look probe', pt: 'Teste de visual' },
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
