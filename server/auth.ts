/**
 * Signing in to the studio with GitHub's **device flow**: the same "enter this code on github.com"
 * sign-in the GitHub CLI uses. It needs only the app's *client ID*, which is public, never a client
 * secret, so this server keeps no key of any kind.
 *
 * GitHub's sign-in endpoints (`github.com/login/...`) can't be called from a web page (they don't
 * allow cross-site requests), so these two routes pass the requests along, unchanged, and remember
 * nothing. The token GitHub hands back goes straight to the person's browser tab; every studio call
 * after that goes from the browser to api.github.com directly.
 *
 *   GET  /api/auth/config  → { enabled, devLogin? }        is sign-in set up here?
 *   POST /api/auth/device  → { user_code, verification_uri, device_code, interval, expires_in }
 *   POST /api/auth/token   { device_code } → { access_token, expires_in? } or { error, interval? }
 *   GET  /api/auth/dev     → { access_token }   development only: the GitHub CLI's token
 */
import { clientKey, createLimiter } from './limiter.js'

export type AuthEnv = {
  /** The GitHub App's (or OAuth App's) client ID, with "Enable Device Flow" ticked. Public. */
  GITHUB_CLIENT_ID?: string
  /** OAuth App only: scopes to ask for. `repo` reads private repos; GitHub Apps ignore it. */
  GITHUB_OAUTH_SCOPE?: string
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

export type AuthOptions = {
  env: AuthEnv
  fetcher?: Fetcher
  /** Development only (the Vite plugin passes it, the deployed functions never do). */
  devToken?: () => string | undefined
}

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE } })
}

/** GitHub's device codes are short opaque strings. */
const DEVICE_CODE = /^[A-Za-z0-9_-]{8,128}$/

/** Errors GitHub's polling endpoint answers with, passed on as they are. */
const POLL_ERRORS = new Set(['authorization_pending', 'slow_down', 'expired_token', 'access_denied', 'incorrect_device_code', 'device_flow_disabled'])

const startBrake = createLimiter(20, 60_000)
const pollBrake = createLimiter(60, 60_000)

/** Calls from this site's own pages only: a custom header other sites can't send without asking. */
const fromSite = (request: Request) => {
  if (!request.headers.get('x-requested-with')) return false
  const origin = request.headers.get('origin')
  return !origin || origin === new URL(request.url).origin
}

async function askGitHub(fetcher: Fetcher, url: string, body: Record<string, string>): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'repartments' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function handleAuth(request: Request, { env, fetcher = fetch, devToken }: AuthOptions): Promise<Response> {
  const route = new URL(request.url).pathname.replace(/\/+$/, '')
  const method = request.method.toUpperCase()
  const clientId = env.GITHUB_CLIENT_ID?.trim()

  if (route === '/api/auth/config' && method === 'GET') {
    return json({ enabled: !!clientId, ...(devToken && !clientId ? { devLogin: true } : {}) })
  }

  if (route === '/api/auth/dev' && method === 'GET' && devToken) {
    const token = devToken()
    return token ? json({ access_token: token }) : json({ error: 'unavailable' }, 503)
  }

  if (route === '/api/auth/device' && method === 'POST') {
    if (!clientId) return json({ error: 'login-disabled' }, 503)
    if (!fromSite(request)) return json({ error: 'forbidden' }, 403)
    if (!startBrake(clientKey(request.headers))) return json({ error: 'rate-limited' }, 429)
    const answer = await askGitHub(fetcher, 'https://github.com/login/device/code', { client_id: clientId, scope: env.GITHUB_OAUTH_SCOPE ?? 'repo' })
    if (!answer || typeof answer.device_code !== 'string' || typeof answer.user_code !== 'string') {
      return json({ error: answer?.error === 'device_flow_disabled' ? 'login-disabled' : 'unavailable' }, 502)
    }
    return json({
      device_code: answer.device_code,
      user_code: answer.user_code,
      verification_uri: typeof answer.verification_uri === 'string' ? answer.verification_uri : 'https://github.com/login/device',
      expires_in: Number(answer.expires_in) || 900,
      interval: Number(answer.interval) || 5,
    })
  }

  if (route === '/api/auth/token' && method === 'POST') {
    if (!clientId) return json({ error: 'login-disabled' }, 503)
    if (!fromSite(request)) return json({ error: 'forbidden' }, 403)
    if (!pollBrake(clientKey(request.headers))) return json({ error: 'slow_down', interval: 10 })
    const body = (await request.json().catch(() => null)) as { device_code?: unknown } | null
    const code = typeof body?.device_code === 'string' ? body.device_code : ''
    if (!DEVICE_CODE.test(code)) return json({ error: 'invalid' }, 400)
    const answer = await askGitHub(fetcher, 'https://github.com/login/oauth/access_token', {
      client_id: clientId,
      device_code: code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    })
    if (!answer) return json({ error: 'unavailable' }, 502)
    if (typeof answer.access_token === 'string') {
      return json({ access_token: answer.access_token, ...(typeof answer.expires_in === 'number' ? { expires_in: answer.expires_in } : {}) })
    }
    const error = typeof answer.error === 'string' && POLL_ERRORS.has(answer.error) ? answer.error : 'unavailable'
    return json({ error, ...(typeof answer.interval === 'number' ? { interval: answer.interval } : {}) })
  }

  return json({ error: 'not-found' }, 404)
}
