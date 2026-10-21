/**
 * Signing in to the studio with GitHub, two ways:
 *
 * - **"Continue with GitHub"** (when `GITHUB_CLIENT_SECRET` is set): the usual button. The page
 *   goes to GitHub, the person approves, GitHub comes back to `/api/auth/callback` with a code, and
 *   this server trades the code for a token. GitHub only makes that trade with the app's *client
 *   secret* (even with PKCE, which is used too), so the secret lives in the server's environment and
 *   nowhere else. The token is handed to the browser in a cookie that only `/api/auth/claim` reads,
 *   once, within two minutes: no token in an address, a page or a log.
 * - **The device flow** (client ID only): the "enter this code on github.com" sign-in the GitHub
 *   CLI uses, with no secret at all.
 *
 * GitHub's sign-in endpoints (`github.com/login/...`) can't be called from a web page (they don't
 * allow cross-site requests), so these routes pass the requests along and remember nothing: no
 * session, no database. The token goes to the person's browser, where the vault keeps it; every
 * studio call after that goes from the browser to api.github.com directly.
 *
 *   GET  /api/auth/config    → { enabled, web, devLogin? }   is sign-in set up here, and which kind?
 *   GET  /api/auth/login     ?next=/studio/…  → 302 to GitHub
 *   GET  /api/auth/callback  ?code&state      → 302 back to the studio, token in a short cookie
 *   POST /api/auth/claim     → { access_token, expires_in? }  once; the vault calls it
 *   POST /api/auth/revoke    { access_token } → { revoked }   signing out ends the token at GitHub too
 *   POST /api/auth/device    → { user_code, verification_uri, device_code, interval, expires_in }
 *   POST /api/auth/token     { device_code } → { access_token, expires_in? } or { error, interval? }
 *   GET  /api/auth/dev       → { access_token }   development only: the GitHub CLI's token
 */
import { clientKey, createLimiter } from './limiter.js'

export type AuthEnv = {
  /** The GitHub App's (or OAuth App's) client ID, with "Enable Device Flow" ticked. Public. */
  GITHUB_CLIENT_ID?: string
  /** OAuth App only: scopes to ask for. `repo` reads private repos; GitHub Apps ignore it. */
  GITHUB_OAUTH_SCOPE?: string
  /** The app's client secret, for "Continue with GitHub". Secret: set it as a sensitive variable. */
  GITHUB_CLIENT_SECRET?: string
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

/** GitHub's codes and our state values: short opaque strings. */
const OPAQUE = /^[A-Za-z0-9_-]{8,256}$/
/** Where "Continue with GitHub" may come back to: the studio's own pages. */
const NEXT = /^\/studio(\/[\w.-]+){0,2}$/

/** The cookie that carries the sign-in's state and PKCE verifier across GitHub, for ten minutes. */
const FLOW_COOKIE = 'gh_flow'
/** The cookie that hands the token to the vault: read once by /api/auth/claim, gone in two minutes. */
const HANDOFF_COOKIE = 'gh_handoff'

const startBrake = createLimiter(20, 60_000)
const pollBrake = createLimiter(60, 60_000)

/** 32 random bytes, URL-safe: the state and the PKCE verifier. */
function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** PKCE's S256 challenge: the verifier's SHA-256, URL-safe. */
export async function challengeOf(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
}

function cookieOf(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

/** A cookie only this site's server reads: no page script, no other site, HTTPS only. */
function cookie(name: string, value: string, path: string, maxAge: number, sameSite: 'Lax' | 'Strict'): string {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=${sameSite}`
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, ...NO_STORE })
  for (const c of cookies) headers.append('Set-Cookie', c)
  return new Response(null, { status: 302, headers })
}

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
    // GitHub explains a refusal in the body ("device_flow_disabled", "Not Found" for an unknown client
    // ID), sometimes with an error status, so the body is read either way.
    const answer = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (answer && typeof answer === 'object') return answer
    return null
  } catch {
    return null
  }
}

export async function handleAuth(request: Request, { env, fetcher = fetch, devToken }: AuthOptions): Promise<Response> {
  const route = new URL(request.url).pathname.replace(/\/+$/, '')
  const method = request.method.toUpperCase()
  const clientId = env.GITHUB_CLIENT_ID?.trim()

  const secret = env.GITHUB_CLIENT_SECRET?.trim()
  const origin = new URL(request.url).origin
  const callbackUrl = `${origin}/api/auth/callback`

  if (route === '/api/auth/config' && method === 'GET') {
    return json({ enabled: !!clientId, web: !!(clientId && secret), ...(devToken && !clientId ? { devLogin: true } : {}) })
  }

  // "Continue with GitHub": off to GitHub, remembering the state and the PKCE verifier in a cookie.
  if (route === '/api/auth/login' && method === 'GET') {
    if (!clientId || !secret) return redirect('/studio?signin=off')
    if (!startBrake(clientKey(request.headers))) return redirect('/studio?signin=busy')
    const asked = new URL(request.url).searchParams.get('next') ?? ''
    const next = NEXT.test(asked) ? asked : '/studio'
    const state = randomToken()
    const verifier = randomToken()
    const authorize = new URL('https://github.com/login/oauth/authorize')
    authorize.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      state,
      code_challenge: await challengeOf(verifier),
      code_challenge_method: 'S256',
      scope: env.GITHUB_OAUTH_SCOPE ?? 'repo',
      allow_signup: 'true',
    }).toString()
    // Lax, so the cookie comes back when GitHub sends the person here; the next page is ours.
    return redirect(authorize.toString(), [cookie(FLOW_COOKIE, `${state}.${verifier}.${base64url(new TextEncoder().encode(next))}`, '/api/auth', 600, 'Lax')])
  }

  // Back from GitHub: check the state, trade the code for a token, hand it over in a short cookie.
  if (route === '/api/auth/callback' && method === 'GET') {
    const params = new URL(request.url).searchParams
    const clear = cookie(FLOW_COOKIE, '', '/api/auth', 0, 'Lax')
    const [state, verifier, nextB64] = (cookieOf(request, FLOW_COOKIE) ?? '').split('.')
    let next = '/studio'
    try {
      const decoded = new TextDecoder().decode(Uint8Array.from(atob((nextB64 ?? '').replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))
      if (NEXT.test(decoded)) next = decoded
    } catch {
      // The studio's front page, then.
    }
    const back = (signin: string, cookies: string[] = [clear]) => redirect(`${next}?signin=${signin}`, cookies)
    if (params.get('error') === 'access_denied') return back('denied')
    const code = params.get('code') ?? ''
    // A state that doesn't match the one this browser set out with: a forged or replayed return.
    if (!clientId || !secret || !state || !verifier || params.get('state') !== state || !OPAQUE.test(code)) return back('failed')
    const answer = await askGitHub(fetcher, 'https://github.com/login/oauth/access_token', {
      client_id: clientId,
      client_secret: secret,
      code,
      redirect_uri: callbackUrl,
      code_verifier: verifier,
    })
    if (!answer || typeof answer.access_token !== 'string' || !OPAQUE.test(answer.access_token)) {
      console.warn(`GitHub refused the sign-in code: ${String(answer?.error ?? 'no answer')}`)
      return back('failed')
    }
    const expires = typeof answer.expires_in === 'number' ? `.${Math.round(answer.expires_in)}` : ''
    return back('1', [clear, cookie(HANDOFF_COOKIE, `${answer.access_token}${expires}`, '/api/auth/claim', 120, 'Strict')])
  }

  // Signing out (or the 8 hours ending): the token stops working at GitHub too, not only in this
  // browser. Only GitHub's API can do it, with the app's client ID and secret, so it happens here.
  if (route === '/api/auth/revoke' && method === 'POST') {
    if (!fromSite(request)) return json({ error: 'forbidden' }, 403)
    if (!clientId || !secret) return json({ revoked: false })
    if (!pollBrake(clientKey(request.headers))) return json({ error: 'rate-limited' }, 429)
    const body = (await request.json().catch(() => null)) as { access_token?: unknown } | null
    const token = typeof body?.access_token === 'string' ? body.access_token : ''
    if (!OPAQUE.test(token)) return json({ error: 'invalid' }, 400)
    try {
      const res = await fetcher(`https://api.github.com/applications/${encodeURIComponent(clientId)}/token`, {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'repartments',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ access_token: token }),
      })
      return json({ revoked: res.status === 204 })
    } catch {
      return json({ revoked: false })
    }
  }

  // The vault picks the token up, once.
  if (route === '/api/auth/claim' && method === 'POST') {
    if (!fromSite(request)) return json({ error: 'forbidden' }, 403)
    const [token, expires] = (cookieOf(request, HANDOFF_COOKIE) ?? '').split('.')
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE })
    headers.append('Set-Cookie', cookie(HANDOFF_COOKIE, '', '/api/auth/claim', 0, 'Strict'))
    if (!token || !OPAQUE.test(token)) return new Response(JSON.stringify({ error: 'none' }), { status: 404, headers })
    const body = { access_token: token, ...(Number(expires) > 0 ? { expires_in: Number(expires) } : {}) }
    return new Response(JSON.stringify(body), { status: 200, headers })
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
      // Shows up in the server's log: the usual causes are a mistyped client ID or "Enable Device Flow" left off.
      console.warn(`GitHub refused the device code: ${String(answer?.error ?? 'no answer')}`)
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
