import { describe, expect, it } from 'vitest'
import { analyze, residentsFrom, signals, statusOf } from './analyze'
import { alias, type RawRepo } from './github'
import { buildingFor, canonicalQuery, USERNAME } from './handler'
import { expiringSoon } from './github'

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

describe('unusual repos', () => {
  it('does not move a library in with the frameworks it only tests against', () => {
    const plugin = { name: 'eslint-plugin-x', exports: './index.js', files: ['index.js'], devDependencies: { svelte: '^5', vue: '^3', vitest: '^3' } }
    expect(roles(repo({ 'package.json': JSON.stringify(plugin) }, { primaryLanguage: { name: 'JavaScript', color: '#f1e05a' } }))).toEqual({
      tests: 'Vitest',
      coder: 'JavaScript',
    })
  })

  it('still reads an app that keeps its framework in devDependencies', () => {
    const kit = { name: 'site', private: true, devDependencies: { svelte: '^5', '@sveltejs/kit': '^2' } }
    expect(roles(repo({ 'package.json': JSON.stringify(kit) }))).toEqual({ frontend: 'Svelte' })
  })

  it('reads a component library by the framework it plugs into', () => {
    const lib = { name: 'ui', exports: './index.js', peerDependencies: { react: '>=18' } }
    expect(roles(repo({ 'package.json': JSON.stringify(lib) }))).toEqual({ frontend: 'React' })
  })

  const tree = (...names: string[]) => ({ entries: names.map((name) => ({ name, type: name.includes('.') ? 'blob' : 'tree' })) })
  const noLanguage = { primaryLanguage: null }

  it('leaves a repo with no commits empty', () => {
    expect(analyze(repo({}, { ...noLanguage, root: null })).residents).toEqual([])
  })

  it('leaves a README-only repo empty instead of inventing a coder', () => {
    expect(analyze(repo({}, { ...noLanguage, root: tree('README.md', 'LICENSE') })).residents).toEqual([])
  })

  it('keeps the CI robot of a repo with no code, without a coder next to it', () => {
    expect(roles(repo({}, { ...noLanguage, workflows: { entries: [{ name: 'pages.yml' }] } }))).toEqual({ devops: 'GitHub Actions' })
  })

  it('spots game engines from their project files', () => {
    const csharp = { primaryLanguage: { name: 'C#', color: '#178600' } }
    expect(roles(repo({}, { ...csharp, root: tree('Assets', 'Packages', 'ProjectSettings') }))).toEqual({ game: 'Unity' })
    expect(roles(repo({}, { primaryLanguage: { name: 'GDScript', color: '#355570' }, root: tree('project.godot', 'scenes') }))).toEqual({ game: 'Godot' })
    expect(roles(repo({}, { primaryLanguage: { name: 'C++', color: '#f34b7d' }, root: tree('Source', 'MyGame.uproject') }))).toEqual({ game: 'Unreal Engine' })
    expect(roles(repo({}, { primaryLanguage: { name: 'Lua', color: '#000080' }, root: tree('main.lua', 'conf.lua') }))).toEqual({ game: 'LÖVE' })
  })

  it('spots game libraries from the dependencies', () => {
    expect(roles(repo({ 'requirements.txt': 'pygame==2.6\n' }))).toEqual({ game: 'Pygame' })
    expect(roles(repo({ 'Cargo.toml': '[dependencies]\nbevy = "0.15"\n' }, { primaryLanguage: { name: 'Rust', color: '#dea584' } }))).toEqual({ game: 'Bevy' })
    expect(roles(repo({ 'package.json': JSON.stringify({ dependencies: { phaser: '^3.80' } }) }, { primaryLanguage: { name: 'JavaScript', color: '#f1e05a' } }))).toEqual({ game: 'Phaser' })
  })

  it('keeps the web front end of a browser game alongside the engine', () => {
    const r = repo({ 'package.json': JSON.stringify({ dependencies: { phaser: '^3.80', react: '^19' } }) })
    expect(roles(r)).toEqual({ frontend: 'React', game: 'Phaser' })
  })

  it('reads the engine of a game kept in a subfolder from the .gitignore at the root', () => {
    expect(roles(repo({ '.gitignore': '# Unity folders\n[Ll]ibrary/\n[Tt]emp/\n' }, { primaryLanguage: { name: 'C#', color: '#178600' } }))).toEqual({ game: 'Unity' })
    expect(roles(repo({ '.gitignore': '# Godot 4+ specific ignores\n.godot/\n' }, { primaryLanguage: null }))).toEqual({ game: 'Godot' })
    expect(roles(repo({ '.gitignore': 'Binaries/\nDerivedDataCache/\nIntermediate/\n' }, { primaryLanguage: { name: 'C++', color: '#f34b7d' } }))).toEqual({ game: 'Unreal Engine' })
  })

  it('falls back to the engine for a game whose project file sits in a subfolder', () => {
    expect(roles(repo({}, { primaryLanguage: { name: 'GDScript', color: '#355570' } }))).toEqual({ game: 'Godot' })
    expect(roles(repo({}, { primaryLanguage: { name: 'Luau', color: '#00a2ff' } }))).toEqual({ game: 'Roblox' })
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
  const okFetch = (repos: RawRepo[], page = { total: repos.length, next: null as string | null }) => async () =>
    new Response(
      JSON.stringify({
        data: {
          repositoryOwner: {
            login: 'x',
            avatarUrl: 'a',
            name: 'X',
            repositories: { totalCount: page.total, pageInfo: { hasNextPage: page.next !== null, endCursor: page.next }, nodes: repos },
          },
        },
      }),
    )

  it('rejects names GitHub would not allow, without calling it', async () => {
    expect(USERNAME.test('-bad')).toBe(false)
    expect((await buildingFor('-bad', 't')).status).toBe(400)
  })

  it('stacks the oldest repo at the bottom', async () => {
    const a = repo({}, { name: 'new', createdAt: '2026-05-01T00:00:00Z' })
    const b = repo({}, { name: 'old', createdAt: '2024-01-01T00:00:00Z' })
    const answer = await buildingFor('x', 't', okFetch([a, b]))
    expect(answer.status).toBe(200)
    expect(answer.cache).toBe('long')
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

  it('asks for fewer repos when GitHub times out on a big account', async () => {
    const asked: number[] = []
    const slowForTwelve = async (_url: string, init: RequestInit) => {
      const count = Number(/repositories\(first: (\d+)/.exec(JSON.parse(String(init.body)).query)![1])
      asked.push(count)
      if (count > 6) return new Response('<html>502 Bad Gateway</html>', { status: 502 })
      return okFetch([repo({})])()
    }
    const answer = await buildingFor('x', 't', slowForTwelve)
    expect(answer.status).toBe(200)
    expect(asked).toEqual([12, 6])
    // Cut short by a slow GitHub: cached only briefly, so the full building comes back soon.
    expect(answer.cache).toBe('brief')
  })

  it('says where the next building starts when there are more repos than fit', async () => {
    const answer = await buildingFor('x', 't', okFetch([repo({})], { total: 20, next: 'Y3Vyc29yOjEy' }))
    expect(answer.body).toMatchObject({ next: 'Y3Vyc29yOjEy', total: 20, fetched: 1 })
  })

  it('opens the next building with six more repos, starting after the last one', async () => {
    let sent: { query: string; variables: { after?: string } } | null = null
    const spy = async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body))
      return okFetch([repo({})])()
    }
    expect((await buildingFor('x', 't', spy, 'Y3Vyc29yOjEy')).status).toBe(200)
    expect(sent!.variables.after).toBe('Y3Vyc29yOjEy')
    expect(sent!.query).toContain('repositories(first: 6, after: $after')
    expect((await buildingFor('x', 't', spy, 'not a cursor!')).status).toBe(400)
  })

  it('builds without pull requests and checks when even fewer repos time out', async () => {
    const asked: string[] = []
    const choking = async (_url: string, init: RequestInit) => {
      const query = JSON.parse(String(init.body)).query as string
      const heavy = query.includes('statusCheckRollup')
      asked.push(`${/repositories\(first: (\d+)/.exec(query)![1]}${heavy ? '' : ' lite'}`)
      return heavy ? new Response('<html>502 Bad Gateway</html>', { status: 502 }) : okFetch([repo({})])()
    }
    const answer = await buildingFor('x', 't', choking)
    expect(answer.status).toBe(200)
    expect(asked).toEqual(['12', '6', '6 lite'])
    expect('apartments' in answer.body && answer.body.apartments[0].status).toEqual({})
  })

  it('leaves archived repos out while there are enough active ones', async () => {
    const live = ['a', 'b', 'c'].map((name) => repo({}, { name }))
    const answer = await buildingFor('x', 't', okFetch([...live, repo({}, { name: 'old', isArchived: true })]))
    expect('apartments' in answer.body && answer.body.apartments.map((x) => x.name)).toEqual(['a', 'b', 'c'])
  })

  it('keeps archived repos when they are most of what there is, instead of an empty lot', async () => {
    const archived = ['a', 'b', 'c', 'd', 'e'].map((name) => repo({}, { name, isArchived: true }))
    const answer = await buildingFor('x', 't', okFetch([repo({}, { name: 'live' }), ...archived]))
    expect(answer.status).toBe(200)
    expect('apartments' in answer.body && answer.body.apartments).toHaveLength(6)
  })

  it('answers 503 when the server has no token', async () => {
    expect((await buildingFor('x', undefined)).status).toBe(503)
  })
})

describe('canonicalQuery', () => {
  it('leaves the URLs the site itself asks for alone', () => {
    expect(canonicalQuery('?user=octocat')).toBeNull()
    expect(canonicalQuery('?user=octocat&after=Y3Vyc29yOjEy%3D%3D')).toBeNull()
  })

  it('folds case changes and extra parameters into the one cached URL', () => {
    expect(canonicalQuery('?user=OctoCat')).toBe('?user=octocat')
    expect(canonicalQuery('?user=octocat&_=123')).toBe('?user=octocat')
    expect(canonicalQuery('?_=1&after=abc&user=Octocat')).toBe('?user=octocat&after=abc')
  })

  it('has nothing to fold without a user', () => {
    expect(canonicalQuery('')).toBeNull()
    expect(canonicalQuery('?_=1')).toBeNull()
  })
})

describe('expiringSoon', () => {
  const now = new Date('2026-10-06T12:00:00Z')

  it('warns in the last two weeks of the token', () => {
    expect(expiringSoon('2026-10-15 09:00:00 UTC', now)).toBe(true)
    expect(expiringSoon('2026-12-01 09:00:00 UTC', now)).toBe(false)
  })

  it('stays quiet when GitHub sends no date it can read', () => {
    expect(expiringSoon(null, now)).toBe(false)
    expect(expiringSoon('someday', now)).toBe(false)
  })
})
