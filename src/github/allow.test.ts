import { describe, expect, it } from 'vitest'
import { blobQuery } from '../architecture/fetch'
import { allowed, readOnlyQuery } from './allow'

const gql = (query: string) => JSON.stringify({ query, variables: {} })

describe('allowed', () => {
  it('lets through the reads the studio makes', () => {
    for (const path of [
      '/user',
      '/user/repos?per_page=30&page=2&sort=pushed',
      '/repos/acme/crm-api',
      '/repos/acme/crm.v2/branches?per_page=100',
      '/repos/acme/crm/commits?sha=main&author=ana&page=1',
      '/repos/acme/crm/commits/0a1b2c3d',
      '/repos/acme/crm/git/trees/0a1b2c3d?recursive=1',
    ]) {
      expect(allowed('GET', `https://api.github.com${path}`, null)).toBe(true)
    }
    expect(allowed('POST', 'https://api.github.com/graphql', gql(blobQuery('abc', ['src/a.ts', 'mutation/b.ts'])))).toBe(true)
  })

  it('refuses anything that could change a repository, or leave GitHub', () => {
    expect(allowed('POST', 'https://api.github.com/repos/acme/crm/issues', '{}')).toBe(false)
    expect(allowed('DELETE', 'https://api.github.com/repos/acme/crm', null)).toBe(false)
    expect(allowed('PUT', 'https://api.github.com/repos/acme/crm/contents/a.txt', '{}')).toBe(false)
    expect(allowed('GET', 'https://api.github.com/repos/acme/crm/actions/secrets', null)).toBe(false)
    expect(allowed('GET', 'https://api.github.com/user/emails', null)).toBe(false)
    expect(allowed('GET', 'https://evil.example/user', null)).toBe(false)
    expect(allowed('GET', 'https://api.github.com.evil.example/user', null)).toBe(false)
    expect(allowed('GET', 'https://user:pw@api.github.com/user', null)).toBe(false)
    expect(allowed('GET', 'https://api.github.com/repos/acme/crm/commits/../../user/emails', null)).toBe(false)
    expect(allowed('POST', 'https://api.github.com/graphql', gql('mutation { addStar(input: {}) { clientMutationId } }'))).toBe(false)
    expect(allowed('POST', 'https://api.github.com/graphql', 'not json')).toBe(false)
  })
})

describe('readOnlyQuery', () => {
  it('ignores words inside strings but catches a mutation anywhere else', () => {
    expect(readOnlyQuery('query { repository(owner: "mutation", name: "x") { id } }')).toBe(true)
    expect(readOnlyQuery('{ viewer { login } }')).toBe(true)
    expect(readOnlyQuery('query A { viewer { login } } mutation B { x }')).toBe(false)
    expect(readOnlyQuery('subscription { x }')).toBe(false)
    expect(readOnlyQuery('fragment F on User { login }')).toBe(false)
  })
})
