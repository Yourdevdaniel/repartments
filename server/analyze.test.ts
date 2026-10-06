import { describe, expect, it } from 'vitest'
import { analyze, residentsFrom, signals, statusOf } from './analyze'
import { alias, type RawRepo } from './github'
import { buildingFor, USERNAME } from './handler'

function repo(files: Record<string, string | true>, extra: Partial<RawRepo> = {}): RawRepo {
  const r: RawRepo = {
    name: 'demo',
    description: null,
    url: 'https://github.com/x/demo',
    stargazerCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    pushedAt: '2026-02-01T00:00:00Z',
    isArchived: false,
    primaryLanguage: { name: 'Python', color: '#3572A5' },
    languages: { totalSize: 0, edges: [] },
    root: { entries: [] },
    workflows: null,
    openPrs: { totalCount: 0 },
    prs: { nodes: [] },
    defaultBranchRef: null,
    ...extra,
  }
  for (const [path, text] of Object.entries(files)) r[alias(path)] = { text: text === true ? null : text, byteSize: 10 }
  return r
}

const roles = (r: RawRepo) => Object.fromEntries(analyze(r).residents.map((x) => [x.role, x.tech]))

describe('analyze', () => {
  it('reads a Django + React + Postgres + Celery project with Docker', () => {
    const r = repo({
      'backend/requirements.txt': 'Django==5.1\ndjangorestframework-simplejwt>=5\npsycopg[binary]==3.2\ncelery==5.4\nredis\npytest-django\n',
      'frontend/package.json': JSON.stringify({ dependencies: { react: '^19', 'react-dom': '^19' }, devDependencies: { vitest: '^3' } }),
      'docker-compose.yml': 'services:\n  db:\n    image: postgres:16\n  redis:\n    image: redis:7\n',
    })
    expect(roles(r)).toEqual({
      frontend: 'React',
      backend: 'Django',
      security: 'SimpleJWT',
      database: 'PostgreSQL',
      cache: 'Redis',
      worker: 'Celery',
      tests: 'pytest',
      devops: 'Docker',
    })
  })

  it('treats a plain library as one coder in its main language', () => {
    expect(roles(repo({}, { primaryLanguage: { name: 'Java', color: '#b07219' } }))).toEqual({ coder: 'Java' })
  })

  it('knows an Expo app is mobile, not a web front end', () => {
    const r = repo({ 'package.json': JSON.stringify({ dependencies: { expo: '~52', react: '19', 'react-native': '0.76' } }) })
    expect(roles(r)).toEqual({ mobile: 'Expo' })
  })

  it('reads pyproject dependencies and compose service names', () => {
    const r = repo({
      'pyproject.toml': '[project]\ndependencies = [\n  "fastapi>=0.110",\n  "asyncpg",\n]\n',
      'compose.yaml': 'services:\n  api:\n    build: .\n  redis:\n    build: ./redis\n',
    })
    expect(roles(r)).toMatchObject({ backend: 'FastAPI', database: 'PostgreSQL', cache: 'Redis', devops: 'Docker' })
  })

  it('gives Django its default SQLite when no other database is there', () => {
    expect(roles(repo({ 'requirements.txt': 'django\n' }))).toMatchObject({ backend: 'Django', database: 'SQLite' })
  })

  it('counts GitHub Actions as devops when there is no Docker', () => {
    expect(roles(repo({}, { workflows: { entries: [{ name: 'ci.yml' }] } }))).toMatchObject({ devops: 'GitHub Actions' })
  })

  it('spots a Spring Boot service with JUnit from pom.xml', () => {
    const pom = '<artifactId>spring-boot-starter-web</artifactId><artifactId>junit-jupiter</artifactId>'
    expect(roles(repo({ 'pom.xml': pom }, { primaryLanguage: { name: 'Java', color: '#b07219' } }))).toMatchObject({
      backend: 'Spring Boot',
      tests: 'JUnit',
    })
  })

  it('never returns manifest text, only tags', () => {
    const r = repo({ 'requirements.txt': 'django\nSECRET_THING=1\n' })
    expect(JSON.stringify(analyze(r))).not.toContain('SECRET_THING')
  })
})

describe('statusOf', () => {
  it('maps checks and open PRs, flagging conflicts', () => {
    const r = repo(
      {},
      {
        defaultBranchRef: { target: { statusCheckRollup: { state: 'FAILURE' } } },
        openPrs: { totalCount: 2 },
        prs: { nodes: [{ mergeable: 'MERGEABLE' }, { mergeable: 'CONFLICTING' }] },
      },
    )
    expect(statusOf(r)).toEqual({ ci: 'failing', prs: { open: 2, conflict: true } })
  })
})

describe('signals', () => {
  it('ignores a package.json that is not valid JSON', () => {
    expect(signals(repo({ 'package.json': '{ nope' })).npm.size).toBe(0)
  })

  it('keeps tags only from names, not versions', () => {
    const s = signals(repo({ 'requirements.txt': 'Flask[async]>=3 ; python_version>"3.9"\n' }))
    expect([...s.py]).toEqual(['flask'])
    expect(residentsFrom(s, 'Python')[0]).toMatchObject({ role: 'backend', tech: 'Flask' })
  })
})

describe('buildingFor', () => {
  const okFetch = (repos: RawRepo[]) => async () =>
    new Response(JSON.stringify({ data: { repositoryOwner: { login: 'x', avatarUrl: 'a', name: 'X', repositories: { nodes: repos } } } }))

  it('rejects names GitHub would not allow, without calling it', async () => {
    expect(USERNAME.test('-bad')).toBe(false)
    expect((await buildingFor('-bad', 't')).status).toBe(400)
  })

  it('stacks the oldest repo at the bottom', async () => {
    const a = repo({}, { name: 'new', createdAt: '2026-05-01T00:00:00Z' })
    const b = repo({}, { name: 'old', createdAt: '2024-01-01T00:00:00Z' })
    const answer = await buildingFor('x', 't', okFetch([a, b]))
    expect(answer.status).toBe(200)
    expect('apartments' in answer.body && answer.body.apartments.map((x) => x.name)).toEqual(['old', 'new'])
  })

  it('says so when the owner has no public repos, or does not exist', async () => {
    expect((await buildingFor('x', 't', okFetch([]))).body).toEqual({ error: 'no-repos' })
    const missing = async () => new Response(JSON.stringify({ data: { repositoryOwner: null } }))
    expect((await buildingFor('x', 't', missing)).status).toBe(404)
  })

  it('reports GitHub being busy as rate limited', async () => {
    const busy = async () => new Response('slow down', { status: 403 })
    expect((await buildingFor('x', 't', busy)).body).toEqual({ error: 'rate-limited' })
  })

  it('answers 503 when the server has no token', async () => {
    expect((await buildingFor('x', undefined)).status).toBe(503)
  })
})
