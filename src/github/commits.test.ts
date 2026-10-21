import { describe, expect, it } from 'vitest'
import { churn, cleanFilters, commitDetail, listBranches, listCommits } from './commits'
import { type GitHubClient, StudioFailure } from './client'

type Query = Record<string, string | number | undefined>
type Handler = (path: string, query: Query) => unknown

/** A fake GitHub: `handler` answers each path with the JSON to return; `next` is false unless set. */
function fakeGitHub(handler: Handler, next = false) {
  const calls: { path: string; query: Query }[] = []
  const client: GitHubClient = {
    async get(path: string, query: Query = {}) {
      calls.push({ path, query })
      return { data: (await handler(path, query)) as never, next }
    },
    async graphql() {
      throw new Error('not used')
    },
  }
  return { client, calls }
}

function rawCommit(sha: string, message: string, extra: Record<string, unknown> = {}) {
  return {
    sha,
    commit: { message, author: { name: 'Ana Souza', date: '2026-03-02T12:00:00Z', email: 'ana@example.com' } },
    author: { login: 'ana', avatar_url: 'https://avatars.example/ana', id: 9 },
    parents: [{ sha: 'p1' }],
    html_url: `https://github.com/ana/crm/commit/${sha}`,
    ...extra,
  }
}

function rawFile(filename: string, additions: number, deletions: number, extra: Record<string, unknown> = {}) {
  return { filename, status: 'modified', additions, deletions, patch: `@@ -1 +1 @@\n-x\n+y`, ...extra }
}

describe('listBranches', () => {
  it('puts the default branch first and keeps the rest in GitHub order', async () => {
    const { client, calls } = fakeGitHub((path) => {
      if (path.endsWith('/branches')) {
        return [
          { name: 'feat/a', commit: { sha: 'aaa1111' }, protected: false },
          { name: 'main', commit: { sha: 'bbb2222' }, protected: true },
          { name: 'dev', commit: { sha: 'ccc3333' }, protected: false },
        ]
      }
      return { default_branch: 'main' }
    })
    const branches = await listBranches(client, 'ana', 'crm')
    expect(branches).toEqual([
      { name: 'main', sha: 'bbb2222', protected: true },
      { name: 'feat/a', sha: 'aaa1111', protected: false },
      { name: 'dev', sha: 'ccc3333', protected: false },
    ])
    expect(calls.find((c) => c.path.endsWith('/branches'))?.query).toEqual({ per_page: 100 })
  })
})

describe('listCommits', () => {
  it('maps headline, body, author and merge parents, and passes the filters on', async () => {
    const { client, calls } = fakeGitHub(() => [
      rawCommit('a1b2c3d', 'feat: tela de pagamento\r\n\r\nDetalhes do Pix.\n\nVer chamado 12  \n', { parents: [{ sha: 'p1' }, { sha: 'p2' }] }),
      rawCommit('e4f5a6b', 'fix: typo', { author: null, commit: { message: 'fix: typo', author: { name: 'Bia', date: '2026-03-01T08:00:00Z' } } }),
    ], true)
    const page = await listCommits(client, 'ana', 'crm', { branch: 'dev', author: 'ana', since: '2026-03-01' }, 2)
    expect(page.next).toBe(3)
    expect(calls[0]).toEqual({
      path: '/repos/ana/crm/commits',
      query: { sha: 'dev', author: 'ana', since: '2026-03-01T00:00:00Z', until: undefined, per_page: 40, page: 2 },
    })
    expect(page.commits[0]).toEqual({
      sha: 'a1b2c3d',
      headline: 'feat: tela de pagamento',
      body: 'Detalhes do Pix.\n\nVer chamado 12',
      author: { name: 'Ana Souza', login: 'ana', avatarUrl: 'https://avatars.example/ana' },
      date: '2026-03-02T12:00:00Z',
      parents: 2,
      url: 'https://github.com/ana/crm/commit/a1b2c3d',
    })
    expect(page.commits[1]).toMatchObject({ headline: 'fix: typo', body: '', author: { name: 'Bia', login: null, avatarUrl: null }, parents: 1 })
  })

  it('never forwards e-mails or other GitHub fields', async () => {
    const { client } = fakeGitHub(() => [rawCommit('a1b2c3d', 'oi')])
    const page = await listCommits(client, 'ana', 'crm', {}, 1)
    expect(JSON.stringify(page)).not.toContain('example.com')
    expect(page.next).toBeNull()
  })

  it('refuses a bad page, a bad branch or a bad date', async () => {
    const { client } = fakeGitHub(() => [])
    await expect(listCommits(client, 'ana', 'crm', {}, 0)).rejects.toMatchObject({ code: 'invalid' })
    await expect(listCommits(client, 'ana', 'crm', { branch: 'a..b' }, 1)).rejects.toMatchObject({ code: 'invalid' })
    await expect(listCommits(client, 'ana', 'crm', { since: '2026-13-01' }, 1)).rejects.toMatchObject({ code: 'invalid' })
  })
})

describe('commitDetail', () => {
  it('maps the stats and files, with renames, statuses and binary files', async () => {
    const { client } = fakeGitHub(() => ({
      ...rawCommit('a1b2c3d', 'refactor: pastas'),
      stats: { additions: 7, deletions: 2, total: 9 },
      files: [
        rawFile('src/a.ts', 5, 1),
        rawFile('src/new.ts', 2, 0, { status: 'renamed', previous_filename: 'src/old.ts' }),
        rawFile('logo.png', 0, 0, { patch: undefined, status: 'added' }),
        rawFile('odd.txt', 0, 1, { status: 'something-else' }),
      ],
    }))
    const detail = await commitDetail(client, 'ana', 'crm', 'a1b2c3d')
    expect(detail.stats).toEqual({ additions: 7, deletions: 2, total: 9 })
    expect(detail.filesTruncated).toBe(false)
    expect(detail.files.map((f) => [f.path, f.previousPath, f.status, f.patch === null, f.truncated])).toEqual([
      ['src/a.ts', null, 'modified', false, false],
      ['src/new.ts', 'src/old.ts', 'renamed', false, false],
      ['logo.png', null, 'added', true, false],
      ['odd.txt', null, 'changed', false, false],
    ])
  })

  it('cuts a long patch on a line boundary and marks it truncated', async () => {
    const lines = Array.from({ length: 20_000 }, (_, i) => `+line ${i}`)
    const patch = `@@ -0,0 +1,20000 @@\n${lines.join('\n')}`
    const { client } = fakeGitHub(() => ({
      ...rawCommit('a1b2c3d', 'feat: grande'),
      stats: { additions: 20000, deletions: 0, total: 20000 },
      files: [rawFile('big.txt', 20000, 0, { patch })],
    }))
    const detail = await commitDetail(client, 'ana', 'crm', 'a1b2c3d')
    const f = detail.files[0]
    expect(f.truncated).toBe(true)
    expect(f.patch!.length).toBeLessThanOrEqual(60_000)
    // The cut keeps whole lines only: the kept text is a prefix that ends right before a newline.
    expect(patch.startsWith(f.patch!)).toBe(true)
    expect(patch[f.patch!.length]).toBe('\n')
  })

  it('leaves a short patch alone', async () => {
    const { client } = fakeGitHub(() => ({
      ...rawCommit('a1b2c3d', 'oi'),
      stats: { additions: 1, deletions: 1, total: 2 },
      files: [rawFile('a.ts', 1, 1, { patch: '@@ -1 +1 @@\n-a\n+b' })],
    }))
    const f = (await commitDetail(client, 'ana', 'crm', 'a1b2c3d')).files[0]
    expect(f).toMatchObject({ patch: '@@ -1 +1 @@\n-a\n+b', truncated: false })
  })

  it('says when GitHub listed 300 files, which means there may be more', async () => {
    const files = Array.from({ length: 300 }, (_, i) => rawFile(`f${i}.ts`, 1, 0))
    const { client } = fakeGitHub(() => ({
      ...rawCommit('a1b2c3d', 'chore: muitos'),
      stats: { additions: 300, deletions: 0, total: 300 },
      files,
    }))
    expect((await commitDetail(client, 'ana', 'crm', 'a1b2c3d')).filesTruncated).toBe(true)
  })

  it('refuses a sha that is not hexadecimal, before calling GitHub', async () => {
    const { client, calls } = fakeGitHub(() => ({}))
    await expect(commitDetail(client, 'ana', 'crm', '../../x')).rejects.toMatchObject({ code: 'invalid' })
    await expect(commitDetail(client, 'ana', 'crm', 'abc')).rejects.toBeInstanceOf(StudioFailure)
    expect(calls).toEqual([])
  })
})

describe('churn', () => {
  /** Three commits: a.ts twice, b.ts once, c.ts once with a big change. */
  const details: Record<string, unknown> = {
    c1c1c1c: { ...rawCommit('c1c1c1c', 'one'), stats: { additions: 7, deletions: 1, total: 8 }, files: [rawFile('src/a.ts', 2, 1), rawFile('src/b.ts', 5, 0)] },
    c2c2c2c: { ...rawCommit('c2c2c2c', 'two'), stats: { additions: 1, deletions: 1, total: 2 }, files: [rawFile('src/a.ts', 1, 1)] },
    c3c3c3c: { ...rawCommit('c3c3c3c', 'three'), stats: { additions: 100, deletions: 0, total: 100 }, files: [rawFile('lib/c.ts', 100, 0)] },
  }

  it('adds up files over the most recent commits, busiest first', async () => {
    const { client, calls } = fakeGitHub((path) => {
      if (path.endsWith('/commits')) return [rawCommit('c1c1c1c', 'one'), rawCommit('c2c2c2c', 'two'), rawCommit('c3c3c3c', 'three')]
      return details[path.split('/').pop()!]
    })
    const result = await churn(client, 'ana', 'crm', { author: 'ana' }, 3)
    expect(result.commits).toBe(3)
    expect(result.filters).toEqual({ author: 'ana' })
    expect(result.files).toEqual([
      { path: 'src/a.ts', commits: 2, additions: 3, deletions: 2 },
      { path: 'lib/c.ts', commits: 1, additions: 100, deletions: 0 },
      { path: 'src/b.ts', commits: 1, additions: 5, deletions: 0 },
    ])
    expect(calls.filter((c) => c.path.endsWith('/commits'))[0].query).toMatchObject({ author: 'ana', per_page: 40 })
  })

  it('looks at only the most recent `limit` commits', async () => {
    const { client, calls } = fakeGitHub((path) => {
      if (path.endsWith('/commits')) return [rawCommit('c1c1c1c', 'one'), rawCommit('c2c2c2c', 'two'), rawCommit('c3c3c3c', 'three')]
      return details[path.split('/').pop()!]
    })
    const result = await churn(client, 'ana', 'crm', {}, 2)
    expect(result.commits).toBe(2)
    expect(result.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts'])
    expect(calls.filter((c) => c.path.includes('/commits/'))).toHaveLength(2)
  })

  it('keeps at most six commit details in flight', async () => {
    let inFlight = 0
    let peak = 0
    const shas = Array.from({ length: 12 }, (_, i) => `abc${String(i).padStart(4, '0')}`)
    const { client } = fakeGitHub(async (path) => {
      if (path.endsWith('/commits')) return shas.map((s) => rawCommit(s, 'msg'))
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return { ...rawCommit(path.split('/').pop()!, 'msg'), stats: { additions: 1, deletions: 0, total: 1 }, files: [rawFile('x.ts', 1, 0)] }
    })
    const result = await churn(client, 'ana', 'crm', {}, 12)
    expect(result.commits).toBe(12)
    expect(peak).toBe(6)
    expect(result.files).toEqual([{ path: 'x.ts', commits: 12, additions: 12, deletions: 0 }])
  })

  it('caps the list at 300 files', async () => {
    const many = (sha: string) => ({
      ...rawCommit(sha, 'msg'),
      stats: { additions: 200, deletions: 0, total: 200 },
      files: Array.from({ length: 200 }, (_, i) => rawFile(`${sha}/f${i}.ts`, 1, 0)),
    })
    const { client } = fakeGitHub((path) => {
      if (path.endsWith('/commits')) return [rawCommit('aaa1111', 'x'), rawCommit('bbb2222', 'y')]
      return many(path.split('/').pop()!)
    })
    const result = await churn(client, 'ana', 'crm', {}, 2)
    expect(result.files).toHaveLength(300)
  })

  it('defaults to 30 commits and refuses limits outside 1 to 60', async () => {
    const { client, calls } = fakeGitHub((path) => (path.endsWith('/commits') ? [] : {}))
    await churn(client, 'ana', 'crm', {}, undefined as unknown as number)
    expect(calls).toHaveLength(1)
    await expect(churn(client, 'ana', 'crm', {}, 0)).rejects.toMatchObject({ code: 'invalid' })
    await expect(churn(client, 'ana', 'crm', {}, 61)).rejects.toMatchObject({ code: 'invalid' })
  })
})

describe('cleanFilters', () => {
  it('drops empty values and keeps a trimmed branch and author', () => {
    expect(cleanFilters({})).toEqual({})
    expect(cleanFilters({ branch: '  dev  ', author: '', since: null, until: undefined })).toEqual({ branch: 'dev' })
    expect(cleanFilters({ author: ' ana ' })).toEqual({ author: 'ana' })
  })

  it('turns whole days into the start and the end of that day in UTC', () => {
    expect(cleanFilters({ since: '2026-03-01', until: '2026-03-31' })).toEqual({
      since: '2026-03-01T00:00:00Z',
      until: '2026-03-31T23:59:59Z',
    })
  })

  it('keeps full ISO timestamps as they are', () => {
    expect(cleanFilters({ since: '2026-03-01T09:30:00-03:00' })).toEqual({ since: '2026-03-01T09:30:00-03:00' })
  })

  it('refuses branches with .., control characters or too many characters', () => {
    expect(() => cleanFilters({ branch: 'a..b' })).toThrow(StudioFailure)
    expect(() => cleanFilters({ branch: 'a\nb' })).toThrow(StudioFailure)
    expect(() => cleanFilters({ branch: 'x'.repeat(201) })).toThrow(StudioFailure)
    expect(cleanFilters({ branch: 'x'.repeat(200) }).branch).toHaveLength(200)
  })

  it('refuses authors longer than 100 characters', () => {
    expect(() => cleanFilters({ author: 'a'.repeat(101) })).toThrow(StudioFailure)
  })

  it('refuses dates that do not exist or are not dates', () => {
    expect(() => cleanFilters({ since: '2026-02-30' })).toThrow(StudioFailure)
    expect(() => cleanFilters({ until: 'ontem' })).toThrow(StudioFailure)
    expect(() => cleanFilters({ since: '2026-03-01 10:00' })).toThrow(StudioFailure)
  })
})
