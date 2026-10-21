import { describe, expect, it } from 'vitest'
import { findLeaks, secretsFrom } from './leaks.mjs'
import { NEVER_SERVED, scanSite } from './scan-site.mjs'

const TOKEN = 'ghu_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'

describe('findLeaks', () => {
  it('finds a secret’s own value and names the file and the variable, never the value', () => {
    const secrets = secretsFrom({ GITHUB_CLIENT_SECRET: 'canary-value-123', GITHUB_TOKEN: '' })
    const found = findLeaks([{ name: 'assets/a.js', text: 'x="canary-value-123"' }, { name: 'assets/b.js', text: 'nothing' }], secrets)
    expect(found).toEqual([{ file: 'assets/a.js', kind: 'the value of GITHUB_CLIENT_SECRET' }])
    expect(JSON.stringify(found)).not.toContain('canary-value-123')
  })

  it('finds anything shaped like a token or a key, whatever its value', () => {
    expect(findLeaks([{ name: 'a.js', text: `const t = "${TOKEN}"` }])).toEqual([{ file: 'a.js', kind: 'GitHub token' }])
    expect(findLeaks([{ name: 'k', text: '-----BEGIN RSA PRIVATE KEY-----' }])[0].kind).toBe('private key')
    expect(findLeaks([{ name: 'c.js', text: 'GITHUB_CLIENT_SECRET: "abcdefgh1234"' }])[0].kind).toBe('secret written in the code')
  })

  it('leaves ordinary code alone, and ignores secrets too short to mean anything', () => {
    expect(findLeaks([{ name: 'a.js', text: 'if(!token||!jwt.verify(token,process.env.JWT_SECRET??""))' }])).toEqual([])
    expect(secretsFrom({ GITHUB_TOKEN: 'abc' })).toEqual([])
  })
})

describe('scanSite', () => {
  const PAGE = '<html><script src="/assets/index.js"></script></html>'
  const HEADERS = {
    'content-security-policy': "default-src 'self'; script-src 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'",
    'strict-transport-security': 'max-age=63072000',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  }
  /** A pretend site: a page, a script that loads another, everything else falls back to the page. */
  const site = (files, extra = {}) => async (url) => {
    const path = new URL(url).pathname
    if (path in extra) return extra[path]()
    if (path === '/') return new Response(PAGE, { headers: HEADERS })
    if (path in files) return new Response(files[path], { headers: { 'content-type': 'text/javascript' } })
    if (path.endsWith('.map') || path.startsWith('/api/')) return new Response('not found', { status: 404 })
    return new Response(PAGE, { headers: HEADERS })
  }

  it('passes a clean site, following the scripts the page loads', async () => {
    const { checked, problems } = await scanSite('https://site.example', site({ '/assets/index.js': 'import("./assets/more.js")', '/assets/more.js': 'ok' }))
    expect(problems).toEqual([])
    expect(checked).toContain('2 scripts and stylesheets')
    expect(checked).toContain(`${NEVER_SERVED.length} paths that must never be served`)
  })

  it('reports a secret in a script, a served env file and a published source map, without the value', async () => {
    const fetcher = site(
      { '/assets/index.js': 'k="canary-value-123"' },
      {
        '/.env': () => new Response('GITHUB_TOKEN=x', { status: 200 }),
        '/assets/index.js.map': () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
      },
    )
    const { problems } = await scanSite('https://site.example', fetcher, [{ name: 'GITHUB_CLIENT_SECRET', value: 'canary-value-123' }])
    expect(problems).toEqual([
      '/assets/index.js.map: source map is published (the original code can be read)',
      '/assets/index.js: the value of GITHUB_CLIENT_SECRET',
      '/.env: served as a file',
    ])
    expect(problems.join(' ')).not.toContain('canary-value-123')
  })

  it('checks the sign-in routes when they exist', async () => {
    const fetcher = site(
      { '/assets/index.js': 'ok' },
      {
        '/api/auth/config': () => Response.json({ enabled: true, web: true, devLogin: true }),
        '/api/auth/dev': () => Response.json({ access_token: 'x' }),
        '/api/auth/claim': () => Response.json({ access_token: 'x' }),
      },
    )
    const { problems } = await scanSite('https://site.example', fetcher)
    expect(problems).toEqual([
      '/api/auth/config: offers the development sign-in',
      '/api/auth/dev: the development shortcut answers',
      '/api/auth/claim: answers another site (200)',
    ])
  })
})
