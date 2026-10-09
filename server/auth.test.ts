import { describe, expect, it } from 'vitest'
import { handleAuth, type AuthOptions } from './auth'

const BASE = 'https://studio.example'
const env = { GITHUB_CLIENT_ID: 'Iv1.public' }

/** A pretend github.com: answers by URL, records what was sent. */
function fakeGitHub(answers: Record<string, unknown>) {
  const calls: { url: string; body: Record<string, string> }[] = []
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    return new Response(JSON.stringify(answers[url] ?? {}), { status: url in answers ? 200 : 404 })
  }
  return { calls, fetcher }
}

const post = (path: string, body: unknown = {}, headers: Record<string, string> = { 'x-requested-with': 'repartments', origin: BASE }) =>
  new Request(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

const run = (request: Request, options: Partial<AuthOptions> = {}) => handleAuth(request, { env, ...options })

describe('/api/auth/config', () => {
  it('says whether sign-in is set up, and offers the CLI shortcut only in development without an app', async () => {
    expect(await (await run(new Request(`${BASE}/api/auth/config`))).json()).toEqual({ enabled: true })
    expect(await (await handleAuth(new Request(`${BASE}/api/auth/config`), { env: {} })).json()).toEqual({ enabled: false })
    expect(await (await handleAuth(new Request(`${BASE}/api/auth/config`), { env: {}, devToken: () => 't' })).json()).toEqual({ enabled: false, devLogin: true })
  })
})

describe('/api/auth/device', () => {
  it('asks GitHub for a device code with the public client ID only, never a secret', async () => {
    const gh = fakeGitHub({
      'https://github.com/login/device/code': { device_code: 'dc_123456789', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 899, interval: 5 },
    })
    const res = await run(post('/api/auth/device'), { fetcher: gh.fetcher })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ device_code: 'dc_123456789', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 899, interval: 5 })
    expect(gh.calls[0].body).toEqual({ client_id: 'Iv1.public', scope: 'repo' })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('refuses requests from other sites and is off without a client ID', async () => {
    expect((await run(post('/api/auth/device', {}, {}))).status).toBe(403)
    expect((await run(post('/api/auth/device', {}, { 'x-requested-with': 'x', origin: 'https://evil.example' }))).status).toBe(403)
    expect((await handleAuth(post('/api/auth/device'), { env: {} })).status).toBe(503)
  })
})

describe('/api/auth/token', () => {
  it('passes the token straight back once the person approves', async () => {
    const gh = fakeGitHub({ 'https://github.com/login/oauth/access_token': { access_token: 'ghu_abc', expires_in: 28800, refresh_token: 'ghr_never_sent' } })
    const res = await run(post('/api/auth/token', { device_code: 'dc_123456789' }), { fetcher: gh.fetcher })
    expect(await res.json()).toEqual({ access_token: 'ghu_abc', expires_in: 28800 })
    expect(gh.calls[0].body).toEqual({ client_id: 'Iv1.public', device_code: 'dc_123456789', grant_type: 'urn:ietf:params:oauth:grant-type:device_code' })
  })

  it('passes on "still waiting" and "slow down" so the page keeps polling at the right pace', async () => {
    const gh = fakeGitHub({ 'https://github.com/login/oauth/access_token': { error: 'slow_down', interval: 10 } })
    expect(await (await run(post('/api/auth/token', { device_code: 'dc_123456789' }), { fetcher: gh.fetcher })).json()).toEqual({ error: 'slow_down', interval: 10 })
  })

  it('rejects a malformed device code without calling GitHub', async () => {
    const gh = fakeGitHub({})
    expect((await run(post('/api/auth/token', { device_code: '../../x' }), { fetcher: gh.fetcher })).status).toBe(400)
    expect(gh.calls).toHaveLength(0)
  })
})

describe('/api/auth/dev', () => {
  it('exists only when the development server offers a token', async () => {
    expect((await run(new Request(`${BASE}/api/auth/dev`))).status).toBe(404)
    expect(await (await run(new Request(`${BASE}/api/auth/dev`), { devToken: () => 'gho_cli' })).json()).toEqual({ access_token: 'gho_cli' })
  })
})
