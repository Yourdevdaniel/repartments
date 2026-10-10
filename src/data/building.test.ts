import { describe, expect, it } from 'vitest'
import { loginFrom, parseRoute } from './building'

describe('loginFrom', () => {
  it('takes a username however it was pasted', () => {
    for (const input of ['octocat', ' @octocat ', 'octocat/', 'https://github.com/octocat', 'github.com/octocat', 'https://www.github.com/octocat/hello-world', 'https://github.com/octocat?tab=repositories', 'HTTPS://GitHub.com/octocat#readme']) {
      expect(loginFrom(input)).toBe('octocat')
    }
  })

  it('gives nothing back for an empty field', () => {
    expect(loginFrom('  ')).toBe('')
    expect(loginFrom('https://github.com/')).toBe('')
  })
})

describe('parseRoute', () => {
  it('reads the landing page, the demo and a building', () => {
    expect(parseRoute('/')).toEqual({ login: null, demo: false })
    expect(parseRoute('/demo')).toEqual({ login: null, demo: true })
    expect(parseRoute('/octocat/')).toEqual({ login: 'octocat', demo: false })
  })

  it('reads the studio, with or without a repo', () => {
    expect(parseRoute('/studio')).toEqual({ login: null, demo: false, studio: { owner: null, repo: null } })
    expect(parseRoute('/studio/acme/crm-api/')).toEqual({ login: null, demo: false, studio: { owner: 'acme', repo: 'crm-api' } })
    expect(parseRoute('/studio/acme')).toEqual({ login: null, demo: false, studio: { owner: 'acme', repo: null } })
  })

  it('survives a broken %-escape instead of taking the whole page down', () => {
    expect(parseRoute('/%E0%A4%A')).toEqual({ login: '%E0%A4%A', demo: false })
  })
})
