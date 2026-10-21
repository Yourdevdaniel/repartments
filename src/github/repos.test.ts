import { describe, expect, it } from 'vitest'
import { listRepos, repoInfo } from './repos'
import { type GitHubClient, StudioFailure } from './client'

type Query = Record<string, string | number | undefined>

function raw(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    full_name: `ana/${name}`,
    owner: { login: 'ana', email: 'ana@example.com', id: 1 },
    private: false,
    description: null,
    language: 'TypeScript',
    pushed_at: '2026-03-01T10:00:00Z',
    default_branch: 'main',
    stargazers_count: 3,
    fork: false,
    archived: false,
    html_url: 'https://github.com/ana/x',
    ...extra,
  }
}

/** A client whose `get` answers `/user/repos` from a list, paged by the query's `per_page`. */
function reposClient(all: ReturnType<typeof raw>[]) {
  const calls: { path: string; query: Query }[] = []
  const client: GitHubClient = {
    async get(path: string, query: Query = {}) {
      calls.push({ path, query })
      const size = Number(query.per_page)
      const page = Number(query.page)
      const data = all.slice((page - 1) * size, page * size)
      return { data: data as never, next: page * size < all.length }
    },
    async graphql() {
      throw new Error('not used')
    },
  }
  return { client, calls }
}

describe('listRepos', () => {
  it('maps GitHub repos to the studio summary and never forwards e-mails or extra fields', async () => {
    const { client } = reposClient([raw('crm', { private: true, description: 'Gestão de clientes', archived: true })])
    const page = await listRepos(client, 1, '')
    expect(page.repos).toEqual([
      {
        owner: 'ana',
        name: 'crm',
        fullName: 'ana/crm',
        private: true,
        description: 'Gestão de clientes',
        language: 'TypeScript',
        pushedAt: '2026-03-01T10:00:00Z',
        defaultBranch: 'main',
        stars: 3,
        fork: false,
        archived: true,
      },
    ])
    expect(JSON.stringify(page)).not.toContain('example.com')
  })

  it('asks for one page of 30 most recently pushed repos the person can read', async () => {
    const { client, calls } = reposClient(Array.from({ length: 31 }, (_, i) => raw(`r${i}`)))
    const first = await listRepos(client, 1, '')
    expect(first.repos).toHaveLength(30)
    expect(first.next).toBe(2)
    expect(calls[0]).toEqual({
      path: '/user/repos',
      query: { per_page: 30, page: 1, sort: 'pushed', affiliation: 'owner,collaborator,organization_member' },
    })
    const second = await listRepos(client, 2, '')
    expect(second.repos.map((r) => r.name)).toEqual(['r30'])
    expect(second.next).toBeNull()
  })

  it('walks pages of 100 with a search text and keeps names, full names and descriptions that match', async () => {
    const all = [
      ...Array.from({ length: 150 }, (_, i) => raw(`other-${i}`)),
      raw('Billing-API'),
      raw('site', { description: 'Página de BILLING' }),
      raw('unrelated'),
    ]
    const { client, calls } = reposClient(all)
    const page = await listRepos(client, 1, 'billing')
    expect(page.repos.map((r) => r.name)).toEqual(['Billing-API', 'site'])
    expect(calls.every((c) => c.query.per_page === 100)).toBe(true)
    // The first GitHub page had no match worth stopping for, so the walk went on to the second page.
    expect(calls.map((c) => c.query.page)).toEqual([1, 2])
    expect(page.next).toBeNull()
  })

  it('stops after 30 matches on a page boundary and returns the page to continue from', async () => {
    const all = Array.from({ length: 450 }, (_, i) => raw(`svc-${i}`))
    const { client, calls } = reposClient(all)
    const page = await listRepos(client, 1, 'svc')
    expect(calls.map((c) => c.query.page)).toEqual([1])
    expect(page.repos).toHaveLength(100)
    expect(page.next).toBe(2)
  })

  it('reads at most ten GitHub pages during a search', async () => {
    const all = Array.from({ length: 2000 }, (_, i) => raw(`other-${i}`))
    const { client, calls } = reposClient(all)
    const page = await listRepos(client, 1, 'nothing-matches')
    expect(calls).toHaveLength(10)
    expect(page.repos).toEqual([])
    expect(page.next).toBe(11)
  })

  it('answers no next page when GitHub has no more after the search walk', async () => {
    const { client } = reposClient([raw('alpha')])
    const page = await listRepos(client, 1, 'zzz')
    expect(page).toEqual({ repos: [], next: null })
  })

  it('treats a blank search as no search', async () => {
    const { client, calls } = reposClient([raw('alpha')])
    await listRepos(client, 1, '   ')
    expect(calls[0].query.per_page).toBe(30)
  })

  it('refuses a bad page number or a very long search', async () => {
    const { client } = reposClient([])
    await expect(listRepos(client, 0, '')).rejects.toMatchObject({ code: 'invalid' })
    await expect(listRepos(client, 1.5, '')).rejects.toBeInstanceOf(StudioFailure)
    await expect(listRepos(client, 1, 'x'.repeat(101))).rejects.toMatchObject({ code: 'invalid' })
  })
})

describe('repoInfo', () => {
  it('reads one repo as a summary', async () => {
    const calls: string[] = []
    const client: GitHubClient = {
      async get(path: string) {
        calls.push(path)
        return { data: raw('crm') as never, next: false }
      },
      async graphql() {
        throw new Error('not used')
      },
    }
    const info = await repoInfo(client, 'ana', 'crm')
    expect(calls).toEqual(['/repos/ana/crm'])
    expect(info.fullName).toBe('ana/crm')
  })

  it('refuses names that are not GitHub names, before calling GitHub', async () => {
    const client: GitHubClient = {
      async get() {
        throw new Error('should not be called')
      },
      async graphql() {
        throw new Error('not used')
      },
    }
    await expect(repoInfo(client, 'ana/../x', 'crm')).rejects.toMatchObject({ code: 'invalid' })
    await expect(repoInfo(client, 'ana', '..')).rejects.toMatchObject({ code: 'invalid' })
  })
})
