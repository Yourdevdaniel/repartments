import { describe, expect, it } from 'vitest'
import { challengeOf, handleAuth, type AuthOptions } from './auth'

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
    expect(await (await run(new Request(`${BASE}/api/auth/config`))).json()).toEqual({ enabled: true, web: false })
    expect(await (await handleAuth(new Request(`${BASE}/api/auth/config`), { env: {} })).json()).toEqual({ enabled: false, web: false })
    expect(await (await handleAuth(new Request(`${BASE}/api/auth/config`), { env: {}, devToken: () => 't' })).json()).toEqual({ enabled: false, web: false, devLogin: true })
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

  it('tells an app without the device flow apart from GitHub being unreachable, whatever the status', async () => {
    const answer = (body: unknown, status: number) => async () => new Response(JSON.stringify(body), { status })
    const off = await run(post('/api/auth/device'), { fetcher: answer({ error: 'device_flow_disabled' }, 400) })
    expect(await off.json()).toEqual({ error: 'login-disabled' })
    const unknown = await run(post('/api/auth/device'), { fetcher: answer({ error: 'Not Found' }, 404) })
    expect(await unknown.json()).toEqual({ error: 'unavailable' })
    const down = await run(post('/api/auth/device'), { fetcher: async () => new Response('<html>', { status: 503 }) })
    expect(await down.json()).toEqual({ error: 'unavailable' })
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

describe('"Continue with GitHub"', () => {
  const web = { GITHUB_CLIENT_ID: 'Iv1.public', GITHUB_CLIENT_SECRET: 'shh' }
  const get = (path: string, cookie?: string) => new Request(BASE + path, { headers: cookie ? { cookie } : {} })
  const flowCookie = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith('gh_flow='))!
  const valueOf = (setCookie: string) => setCookie.split(';')[0].split('=').slice(1).join('=')

  /** Starts a sign-in and returns where GitHub was asked to send the person back, and the cookie. */
  async function begin(next = '/studio/ana/crm') {
    const res = await handleAuth(get(`/api/auth/login?next=${encodeURIComponent(next)}`), { env: web })
    expect(res.status).toBe(302)
    const to = new URL(res.headers.get('location')!)
    return { to, cookie: `gh_flow=${valueOf(flowCookie(res))}`, setCookie: flowCookie(res) }
  }

  it('says when it is set up: client ID and secret both', async () => {
    expect(await (await handleAuth(get('/api/auth/config'), { env: web })).json()).toEqual({ enabled: true, web: true })
    expect(await (await handleAuth(get('/api/auth/config'), { env })).json()).toEqual({ enabled: true, web: false })
  })

  it('sends the person to GitHub with a state and a PKCE challenge, never the secret', async () => {
    const { to, setCookie } = await begin()
    expect(to.origin + to.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(to.searchParams.get('client_id')).toBe('Iv1.public')
    expect(to.searchParams.get('redirect_uri')).toBe(`${BASE}/api/auth/callback`)
    expect(to.searchParams.get('code_challenge_method')).toBe('S256')
    expect(to.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(to.toString()).not.toContain('shh')
    // The verifier stays in this browser, in a cookie scripts can't read.
    expect(setCookie).toMatch(/HttpOnly; Secure; SameSite=Lax/)
    const [state, verifier] = valueOf(setCookie).split('.')
    expect(state).toBe(to.searchParams.get('state'))
    expect(await challengeOf(verifier)).toBe(to.searchParams.get('code_challenge'))
  })

  it('goes back only to the studio’s own pages', async () => {
    const { cookie, to } = await begin('https://evil.example/x')
    const gh = fakeGitHub({ 'https://github.com/login/oauth/access_token': { access_token: 'ghu_abcdefgh1234' } })
    const res = await handleAuth(get(`/api/auth/callback?code=abcdef123456&state=${to.searchParams.get('state')}`, cookie), { env: web, fetcher: gh.fetcher })
    expect(res.headers.get('location')).toBe('/studio?signin=1')
  })

  it('trades the code with the secret and the verifier, and hands the token over in a two-minute cookie', async () => {
    const { cookie, to } = await begin()
    const gh = fakeGitHub({ 'https://github.com/login/oauth/access_token': { access_token: 'ghu_abcdefgh1234', expires_in: 28800 } })
    const res = await handleAuth(get(`/api/auth/callback?code=abcdef123456&state=${to.searchParams.get('state')}`, cookie), { env: web, fetcher: gh.fetcher })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/studio/ana/crm?signin=1')
    expect(gh.calls[0].body).toMatchObject({ client_id: 'Iv1.public', client_secret: 'shh', code: 'abcdef123456', redirect_uri: `${BASE}/api/auth/callback` })
    expect(gh.calls[0].body.code_verifier).toBe(cookie.split('=')[1].split('.')[1])
    const handoff = res.headers.getSetCookie().find((c) => c.startsWith('gh_handoff='))!
    expect(handoff).toMatch(/^gh_handoff=ghu_abcdefgh1234\.28800; Path=\/api\/auth\/claim; Max-Age=120; HttpOnly; Secure; SameSite=Strict$/)
    // Never in the address.
    expect(res.headers.get('location')).not.toContain('ghu_')
  })

  it('refuses a return whose state doesn’t match, and says so when the person cancels', async () => {
    const { cookie } = await begin()
    const gh = fakeGitHub({ 'https://github.com/login/oauth/access_token': { access_token: 'ghu_abcdefgh1234' } })
    const forged = await handleAuth(get('/api/auth/callback?code=abcdef123456&state=someone-elses-state', cookie), { env: web, fetcher: gh.fetcher })
    expect(forged.headers.get('location')).toBe('/studio/ana/crm?signin=failed')
    expect(gh.calls).toHaveLength(0)
    const noCookie = await handleAuth(get('/api/auth/callback?code=abcdef123456&state=x'), { env: web, fetcher: gh.fetcher })
    expect(noCookie.headers.get('location')).toBe('/studio?signin=failed')
    const denied = await handleAuth(get('/api/auth/callback?error=access_denied&state=x', cookie), { env: web })
    expect(denied.headers.get('location')).toBe('/studio/ana/crm?signin=denied')
  })

  it('lets the site’s own pages claim the token once', async () => {
    const claim = (cookie?: string, headers = { 'x-requested-with': 'repartments', origin: BASE }) =>
      handleAuth(new Request(`${BASE}/api/auth/claim`, { method: 'POST', headers: { ...headers, ...(cookie ? { cookie } : {}) } }), { env: web })
    const res = await claim('gh_handoff=ghu_abcdefgh1234.28800')
    expect(await res.json()).toEqual({ access_token: 'ghu_abcdefgh1234', expires_in: 28800 })
    expect(res.headers.getSetCookie()[0]).toMatch(/^gh_handoff=; Path=\/api\/auth\/claim; Max-Age=0/)
    expect((await claim()).status).toBe(404)
    expect((await claim('gh_handoff=ghu_abcdefgh1234', { 'x-requested-with': 'x', origin: 'https://evil.example' })).status).toBe(403)
  })

  it('sends people back with a note when it isn’t set up', async () => {
    const res = await handleAuth(get('/api/auth/login'), { env })
    expect(res.headers.get('location')).toBe('/studio?signin=off')
  })
})
