/**
 * The token vault: where the signed-in person's GitHub token lives, inside a worker, out of reach of
 * the page's scripts. The page never sees the token, not even at sign-in: after "Continue with
 * GitHub" the vault itself claims the token the server left in a cookie only its claim route reads,
 * and with the device flow it asks the sign-in relay for a code and polls it. It keeps the token in
 * its own memory and makes GitHub requests on the page's behalf, but only the reads the studio
 * needs (`allow.ts`).
 *
 * A sign-in lasts 8 hours at most (a GitHub App's own tokens expire then too); after that the vault
 * forgets the token and tells every page. Whenever the vault lets go of a token (signing out, the 8
 * hours ending), it also asks the server to revoke it at GitHub, so a copy of it, wherever it might
 * be, stops working too (with "Continue with GitHub"; the device flow has no secret to do that).
 * Closing every tab of the site ends the worker, and the token with it.
 *
 * This file is the vault's logic with its surroundings passed in (fetch, clock, timers), so it can
 * be tested; `vault.worker.ts` plugs it into a real worker.
 */
import { allowed } from './allow'

/** The longest a sign-in lasts, whatever kind of token GitHub gave. */
export const MAX_SESSION_MS = 8 * 60 * 60 * 1000

export type VaultUser = { login: string; name: string | null; avatarUrl: string }

/** What every page is told about the sign-in. Never includes the token. */
export type VaultState =
  | { status: 'signed-out'; reason?: 'denied' | 'expired' | 'unavailable' | 'disabled' }
  | { status: 'waiting'; userCode: string; verificationUri: string; expiresAt: number }
  | { status: 'signed-in'; user: VaultUser; expiresAt: number }

/** Messages from a page. */
export type VaultRequest =
  | { type: 'hello' }
  | { type: 'start' }
  | { type: 'claim' }
  | { type: 'dev' }
  | { type: 'cancel' }
  | { type: 'sign-out' }
  | { type: 'fetch'; id: number; url: string; method: string; body: string | null }

/** Messages to pages: the sign-in state (to everyone), or the answer to one page's request. */
export type VaultMessage =
  | { type: 'state'; state: VaultState }
  | { type: 'response'; id: number; status: number; headers: Record<string, string>; body: string }
  | { type: 'refused'; id: number; reason: 'blocked' | 'signed-out' | 'network' }
  /** The answer to a claim: whether a token was waiting (the page stops showing "signing in…"). */
  | { type: 'claimed'; ok: boolean }

export type VaultDeps = {
  fetch: (url: string, init: RequestInit) => Promise<Response>
  now: () => number
  /** Where the sign-in relay lives (the site's origin). */
  base: string
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (id: unknown) => void
}

/** Response headers the page's GitHub client reads (paging and rate limits). */
const PASS_HEADERS = ['link', 'x-ratelimit-remaining', 'content-type']

export class Vault {
  private token: string | null = null
  private state: VaultState = { status: 'signed-out' }
  private flow: { cancelled: boolean } | null = null
  private expiry: unknown = null

  constructor(
    private deps: VaultDeps,
    /** Sends a message to every connected page. */
    private broadcast: (message: VaultMessage) => void,
  ) {}

  private set(state: VaultState) {
    this.state = state
    this.broadcast({ type: 'state', state })
  }

  /** Asks the server to end a token at GitHub; best effort, nothing waits for it. */
  private revoke(token: string) {
    this.relay('/api/auth/revoke', { access_token: token }).catch(() => undefined)
  }

  private forget(reason?: Extract<VaultState, { status: 'signed-out' }>['reason']) {
    if (this.token) this.revoke(this.token)
    this.token = null
    if (this.flow) this.flow.cancelled = true
    this.flow = null
    if (this.expiry !== null) this.deps.clearTimeout(this.expiry)
    this.expiry = null
    this.set(reason ? { status: 'signed-out', reason } : { status: 'signed-out' })
  }

  private relay(path: string, body?: unknown): Promise<Record<string, unknown>> {
    const init: RequestInit = body === undefined
      ? {}
      : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'repartments' }, body: JSON.stringify(body) }
    return this.deps.fetch(new URL(path, this.deps.base).toString(), init).then((r) => r.json() as Promise<Record<string, unknown>>)
  }

  /** Keeps a fresh token: asks GitHub who it belongs to and starts the 8-hour clock. */
  private async adopt(token: string, expiresIn: number | null) {
    let user: VaultUser
    try {
      const res = await this.deps.fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } })
      if (!res.ok) {
        this.revoke(token)
        return this.forget(res.status === 401 ? 'expired' : 'unavailable')
      }
      const u = (await res.json()) as { login: string; name: string | null; avatar_url: string }
      user = { login: u.login, name: u.name ?? null, avatarUrl: u.avatar_url ?? '' }
    } catch {
      this.revoke(token)
      return this.forget('unavailable')
    }
    const lasts = Math.min(MAX_SESSION_MS, expiresIn ? expiresIn * 1000 : MAX_SESSION_MS)
    this.token = token
    this.expiry = this.deps.setTimeout(() => this.forget('expired'), lasts)
    this.set({ status: 'signed-in', user, expiresAt: this.deps.now() + lasts })
  }

  /** The device flow: a code for the person to type on github.com, then polling until they approve. */
  private async start() {
    if (this.flow) this.flow.cancelled = true
    const flow = { cancelled: false }
    this.flow = flow
    let begin: Record<string, unknown>
    try {
      begin = await this.relay('/api/auth/device', {})
    } catch {
      return this.forget('unavailable')
    }
    if (typeof begin.device_code !== 'string' || typeof begin.user_code !== 'string') {
      return this.forget(begin.error === 'login-disabled' ? 'disabled' : 'unavailable')
    }
    const expiresAt = this.deps.now() + (Number(begin.expires_in) || 900) * 1000
    this.set({
      status: 'waiting',
      userCode: begin.user_code,
      verificationUri: typeof begin.verification_uri === 'string' ? begin.verification_uri : 'https://github.com/login/device',
      expiresAt,
    })
    let interval = (Number(begin.interval) || 5) * 1000
    while (this.deps.now() < expiresAt) {
      await new Promise<void>((resolve) => this.deps.setTimeout(resolve, interval))
      if (flow.cancelled) return
      let answer: Record<string, unknown>
      try {
        answer = await this.relay('/api/auth/token', { device_code: begin.device_code })
      } catch {
        continue
      }
      if (flow.cancelled) return
      if (typeof answer.access_token === 'string') {
        this.flow = null
        return this.adopt(answer.access_token, typeof answer.expires_in === 'number' ? answer.expires_in : null)
      }
      if (answer.error === 'slow_down') interval = Math.max(interval + 5000, (Number(answer.interval) || 0) * 1000)
      else if (answer.error === 'access_denied') return this.forget('denied')
      else if (answer.error !== 'authorization_pending') return this.forget(answer.error === 'expired_token' ? 'expired' : 'unavailable')
    }
    if (!flow.cancelled) this.forget('expired')
  }

  /**
   * After "Continue with GitHub": the server left the token in a cookie that only its claim route
   * reads, once. Nothing waiting (a reload of the page GitHub came back to) changes nothing.
   */
  private async claim(): Promise<boolean> {
    try {
      const answer = await this.relay('/api/auth/claim', {})
      if (typeof answer.access_token === 'string') {
        await this.adopt(answer.access_token, typeof answer.expires_in === 'number' ? answer.expires_in : null)
        return this.state.status === 'signed-in'
      }
      if (answer.error === 'none') return false
    } catch {
      // Falls through.
    }
    this.forget('unavailable')
    return false
  }

  /** Development only: the relay hands over the GitHub CLI's token (it refuses outside a dev server). */
  private async dev() {
    try {
      const answer = await this.relay('/api/auth/dev')
      if (typeof answer.access_token === 'string') return this.adopt(answer.access_token, null)
    } catch {
      // Falls through.
    }
    this.forget('unavailable')
  }

  /** A GitHub request for the page, if it's one of the reads the studio makes. */
  private async proxy(req: Extract<VaultRequest, { type: 'fetch' }>, reply: (m: VaultMessage) => void) {
    if (!allowed(req.method, req.url, req.body)) return reply({ type: 'refused', id: req.id, reason: 'blocked' })
    if (!this.token || this.state.status !== 'signed-in' || this.deps.now() >= this.state.expiresAt) {
      if (this.token) this.forget('expired')
      return reply({ type: 'refused', id: req.id, reason: 'signed-out' })
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json' }
    if (req.body !== null) headers['Content-Type'] = 'application/json'
    let res: Response
    try {
      res = await this.deps.fetch(req.url, { method: req.method.toUpperCase(), headers, body: req.body ?? undefined })
    } catch {
      return reply({ type: 'refused', id: req.id, reason: 'network' })
    }
    // GitHub stopped accepting the token (revoked, expired): forget it everywhere.
    if (res.status === 401) this.forget('expired')
    const out: Record<string, string> = {}
    for (const h of PASS_HEADERS) {
      const v = res.headers.get(h)
      if (v !== null) out[h] = v
    }
    reply({ type: 'response', id: req.id, status: res.status, headers: out, body: await res.text() })
  }

  /** One message from a page; `reply` answers that page only. */
  async handle(message: VaultRequest, reply: (m: VaultMessage) => void): Promise<void> {
    switch (message.type) {
      case 'hello':
        return reply({ type: 'state', state: this.state })
      case 'start':
        return this.start()
      case 'claim':
        return reply({ type: 'claimed', ok: await this.claim() })
      case 'dev':
        return this.dev()
      case 'cancel':
      case 'sign-out':
        return this.forget()
      case 'fetch':
        return this.proxy(message, reply)
    }
  }
}
