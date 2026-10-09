import { describe, expect, it } from 'vitest'
import { crmFixture } from '../architecture/fixtures'
import { buildModel } from '../architecture/index'
import { CODE, NO_EDITS } from '../scene/tour'
import type { CommitDetail } from '../shared/studio'
import { parsePresentation, presentationFile, withoutAuthors } from './store'

function commit(sha: string, name: string, login: string | null, body = ''): CommitDetail {
  return {
    sha,
    headline: `change ${sha}`,
    body,
    author: { name, login, avatarUrl: login ? `https://avatars.githubusercontent.com/${login}` : null },
    date: '2026-10-01T10:00:00Z',
    parents: 1,
    url: `https://github.com/acme/crm/commit/${sha}`,
    stats: { additions: 3, deletions: 1, total: 4 },
    files: [{ path: 'a.ts', previousPath: null, status: 'modified', additions: 3, deletions: 1, patch: '@@ -1 +1 @@', truncated: false }],
    filesTruncated: false,
  }
}

describe('withoutAuthors', () => {
  const commits = [
    commit('a1', 'Ana Souza', 'ana'),
    commit('b2', 'Bruno Lima', 'bruno', 'Fixes the form.\n\nCo-authored-by: Carla Dias <carla@example.com>\nReviewed-by: Ana <ana@example.com>'),
    commit('c3', 'Ana S.', 'ana'),
  ]

  it('numbers the authors, the same person keeping the same number, with no login or picture', () => {
    const out = withoutAuthors(commits, 'pt')
    expect(out.map((c) => c.author.name)).toEqual(['Autor 1', 'Autor 2', 'Autor 1'])
    expect(out.every((c) => c.author.login === null && c.author.avatarUrl === null)).toBe(true)
    expect(withoutAuthors(commits, 'en')[1].author.name).toBe('Author 2')
  })

  it('drops the message lines that carry an e-mail address and keeps the rest', () => {
    const out = withoutAuthors(commits, 'pt')
    expect(out[1].body).toBe('Fixes the form.')
    expect(JSON.stringify(out)).not.toMatch(/@example\.com|Carla|Bruno/)
  })
})

describe('presentationFile', () => {
  const model = buildModel({ ...crmFixture, generatedAt: '2026-10-08T00:00:00Z' })
  const commits = [commit('a1', 'Ana Souza', 'ana')]

  it('keeps the authors unless asked, and never the diffs', () => {
    const file = presentationFile(model, NO_EDITS, commits)
    expect(file.commits[0].author.name).toBe('Ana Souza')
    expect(file.commits[0].files[0].patch).toBeNull()
  })

  it('leaves the names out when asked', () => {
    const file = presentationFile(model, NO_EDITS, commits, { lang: 'pt' })
    expect(file.commits[0].author).toEqual({ name: 'Autor 1', login: null, avatarUrl: null })
    expect(JSON.stringify(file.commits)).not.toContain('Ana Souza')
  })
})

describe('parsePresentation', () => {
  const model = buildModel({ ...crmFixture, generatedAt: '2026-10-08T00:00:00Z' })

  it('keeps the naming switches the presentation was saved with', () => {
    const text = JSON.stringify(presentationFile(model, { ...NO_EDITS, naming: CODE }, []))
    expect(parsePresentation(text)!.edits.naming).toEqual(CODE)
  })

  it('ignores a naming that is missing a switch or has a value other than plain or code', () => {
    const file = JSON.parse(JSON.stringify(presentationFile(model, NO_EDITS, [])))
    file.edits.naming = { parts: 'code', tools: 'loud', services: 'plain' }
    expect(parsePresentation(JSON.stringify(file))!.edits.naming).toBeUndefined()
    file.edits.naming = { parts: 'code', tools: 'plain' }
    expect(parsePresentation(JSON.stringify(file))!.edits.naming).toBeUndefined()
    file.edits.naming = 'code'
    expect(parsePresentation(JSON.stringify(file))!.edits.naming).toBeUndefined()
  })
})
