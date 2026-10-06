import { buildFlat, type FlatSpec } from '../rooms'
import type { FlatData } from '../types'

/**
 * The demo building, ground floor up, until real GitHub data arrives. These are Daniel's public repos
 * with their stacks typed in by hand; the analyzer will produce the same specs from the API.
 */
export const demoOwner = { login: 'Yourdevdaniel', name: 'Daniel Bernardes' }

const PY = { name: 'Python', color: '#3572A5' }
const TS = { name: 'TypeScript', color: '#3178c6' }
const c = {
  react: '#61dafb',
  django: '#0c4b33',
  jwt: '#7c5cff',
  pytest: '#0a9edc',
  postgres: '#4169e1',
  redis: '#dc382d',
  celery: '#37814a',
  docker: '#2f8fe6',
  python: '#3572a5',
  sqlite: '#0f80cc',
}

const specs: FlatSpec[] = [
  {
    id: 'contrato-facil',
    repo: 'contrato-facil',
    language: PY,
    intro: {
      en: 'Contracts signed online: React up front, Django and Celery behind, Redis and PostgreSQL for the data.',
      pt: 'Contratos assinados online: React na frente, Django e Celery por trás, Redis e PostgreSQL guardando os dados.',
    },
    residents: [
      { tech: 'React', role: 'frontend', color: c.react },
      { tech: 'SimpleJWT', role: 'security', color: c.jwt },
      { tech: 'Django', role: 'backend', color: c.django },
      { tech: 'pytest', role: 'tests', color: c.pytest },
      { tech: 'PostgreSQL', role: 'database', color: c.postgres },
      { tech: 'Redis', role: 'cache', color: c.redis },
      { tech: 'Celery', role: 'worker', color: c.celery },
      { tech: 'Docker', role: 'devops', color: c.docker },
    ],
    status: { ci: 'passing', prs: { open: 1 } },
  },
  {
    id: 'cafe-verde',
    repo: 'cafe-verde',
    language: PY,
    intro: {
      en: 'Table ordering for a café: React screens, Django Channels live updates, Redis and PostgreSQL.',
      pt: 'Pedidos na mesa de um café: telas em React, Django Channels ao vivo, Redis e PostgreSQL.',
    },
    residents: [
      { tech: 'React', role: 'frontend', color: c.react },
      { tech: 'Django', role: 'backend', color: c.django },
      { tech: 'PostgreSQL', role: 'database', color: c.postgres },
      { tech: 'Redis', role: 'cache', color: c.redis },
      { tech: 'pytest', role: 'tests', color: c.pytest },
      { tech: 'Docker', role: 'devops', color: c.docker },
    ],
    status: { ci: 'failing' },
  },
  {
    id: 'dublacon',
    repo: 'dublacon',
    language: PY,
    intro: {
      en: 'A social network for amateur voice actors: React, Django REST Framework with JWT, PostgreSQL.',
      pt: 'Uma rede social de dubladores amadores: React, Django REST Framework com JWT, PostgreSQL.',
    },
    residents: [
      { tech: 'React', role: 'frontend', color: c.react },
      { tech: 'SimpleJWT', role: 'security', color: c.jwt },
      { tech: 'Django', role: 'backend', color: c.django },
      { tech: 'PostgreSQL', role: 'database', color: c.postgres },
    ],
    status: { prs: { open: 1, conflict: true } },
  },
  {
    id: 'boardgame-library-db',
    repo: 'boardgame-library-db',
    language: PY,
    intro: {
      en: 'A normalized PostgreSQL database for a board-game café, driven by Python and checked by pytest.',
      pt: 'Um banco PostgreSQL normalizado para um café de jogos, usado pelo Python e conferido pelo pytest.',
    },
    residents: [
      { tech: 'Python', role: 'coder', color: c.python },
      { tech: 'PostgreSQL', role: 'database', color: c.postgres },
      { tech: 'pytest', role: 'tests', color: c.pytest },
    ],
  },
  {
    id: 'akira-assistant',
    repo: 'akira-assistant',
    language: PY,
    intro: {
      en: 'A personal Telegram assistant in Python, keeping its to-dos in SQLite.',
      pt: 'Um assistente pessoal no Telegram em Python, que guarda as tarefas no SQLite.',
    },
    residents: [
      { tech: 'Python', role: 'coder', color: c.python },
      { tech: 'SQLite', role: 'database', color: c.sqlite },
    ],
  },
  {
    id: 'transit-router',
    repo: 'transit-router',
    language: PY,
    intro: {
      en: 'A command-line route finder in plain Python, with pytest keeping it honest.',
      pt: 'Um buscador de rotas de linha de comando em Python puro, com o pytest conferindo.',
    },
    residents: [
      { tech: 'Python', role: 'coder', color: c.python },
      { tech: 'pytest', role: 'tests', color: c.pytest },
    ],
    status: { prs: { open: 1 } },
  },
  {
    id: 'portfolio',
    repo: 'portfolio',
    language: TS,
    intro: {
      en: 'A personal site: React on its own, no back end to talk to.',
      pt: 'Um site pessoal: só React, sem back-end para conversar.',
    },
    residents: [{ tech: 'React', role: 'frontend', color: c.react }],
  },
]

export const demoFlats: FlatData[] = specs.map(buildFlat)
