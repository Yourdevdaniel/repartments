import { describe, expect, it } from 'vitest'
import { MAX_SESSION_MS, Vault, type VaultMessage } from './vault-core'

/** A pretend world for the vault: a clock moved by hand, timers that fire when time passes, and fake servers. */
function world(answers: Record<string, (body: string | undefined) => unknown>) {
  let now = 1_000_000
  const timers: { at: number; fn: () => void; id: number }[] = []
  let nextId = 1
  const calls: { url: string; init: RequestInit }[] = []
  const messages: VaultMessage[] = []
  const vault = new Vault(
    {
      fetch: async (url, init) => {
        calls.push({ url, init })
        const key = Object.keys(answers).find((k) => url.startsWith(k))
        if (!key) return new Response('{}', { status: 404 })
        const body = answers[key](init.body as string | undefined)
        if (body instanceof Response) return body
        return new Response(JSON.stringify(body), { status: 200, headers: { link: '<x>; rel="next"' } })
      },
      now: () => now,
      base: 'https://site.example',
      setTimeout: (fn, ms) => {
        const id = nextId++
        timers.push({ at: now + ms, fn, id })
        return id
      },
      clearTimeout: (id) => {
        const i = timers.findIndex((t) => t.id === id)
        if (i >= 0) timers.splice(i, 1)
      },
    },
    (m) => messages.push(m),
  )
  /** Moves the clock and fires due timers, letting promises settle in between. */
  const pass = async (ms: number) => {
    const end = now + ms
    for (;;) {
      await new Promise((r) => setTimeout(r, 0))
      timers.sort((a, b) => a.at - b.at)
      const next = timers[0]
      if (!next || next.at > end) break
      timers.shift()
      now = next.at
      next.fn()
    }
    now = end
    await new Promise((r) => setTimeout(r, 0))
  }
  const states = () => messages.filter((m): m is Extract<VaultMessage, { type: 'state' }> => m.type === 'state').map((m) => m.state)
  return { vault, calls, messages, states, pass }
}

const signIn = (polls: unknown[]) => {
  let i = 0
  return world({
    'https://site.example/api/auth/device': () => ({ device_code: 'dev_123456789', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 }),
    'https://site.example/api/auth/token': () => polls[Math.min(i++, polls.length - 1)],
    'https://api.github.com/user': () => ({ login: 'ana', name: 'Ana', avatar_url: 'https://a' }),
    'https://api.github.com/repos/acme/crm/commits': () => [{ sha: 'abc' }],
  })
}

describe('Vault', () => {
  it('runs the device flow itself and tells pages who signed in, never the token', async () => {
    const w = signIn([{ error: 'authorization_pending' }, { access_token: 'ghu_secret', expires_in: 28800 }])
    void w.vault.handle({ type: 'start' }, () => undefined)
    await w.pass(1)
    expect(w.states().at(-1)).toMatchObject({ status: 'waiting', userCode: 'ABCD-1234' })
    await w.pass(11_000)
    expect(w.states().at(-1)).toMatchObject({ status: 'signed-in', user: { login: 'ana' } })
    expect(JSON.stringify(w.messages)).not.toContain('ghu_secret')
    // The device code stays inside too.
    expect(JSON.stringify(w.messages)).not.toContain('dev_123456789')
  })

  it('adds the token to the reads it allows, and refuses anything else', async () => {
    const w = signIn([{ access_token: 'ghu_secret' }])
    void w.vault.handle({ type: 'start' }, () => undefined)
    await w.pass(6_000)
    const replies: VaultMessage[] = []
    await w.vault.handle({ type: 'fetch', id: 1, url: 'https://api.github.com/repos/acme/crm/commits?page=1', method: 'GET', body: null }, (m) => replies.push(m))
    await w.vault.handle({ type: 'fetch', id: 2, url: 'https://api.github.com/repos/acme/crm/issues', method: 'POST', body: '{}' }, (m) => replies.push(m))
    expect(replies[0]).toMatchObject({ type: 'response', id: 1, status: 200, headers: { link: '<x>; rel="next"' } })
    expect(new Headers(w.calls.find((c) => c.url.includes('/commits'))!.init.headers).get('authorization')).toBe('Bearer ghu_secret')
    expect(replies[1]).toEqual({ type: 'refused', id: 2, reason: 'blocked' })
    expect(w.calls.some((c) => c.url.includes('/issues'))).toBe(false)
  })

  it('forgets the token after 8 hours, even when GitHub would accept it longer', async () => {
    const w = signIn([{ access_token: 'ghu_secret' }])
    void w.vault.handle({ type: 'start' }, () => undefined)
    await w.pass(6_000)
    const signedIn = w.states().at(-1)
    expect(signedIn?.status).toBe('signed-in')
    await w.pass(MAX_SESSION_MS)
    expect(w.states().at(-1)).toEqual({ status: 'signed-out', reason: 'expired' })
    const replies: VaultMessage[] = []
    await w.vault.handle({ type: 'fetch', id: 3, url: 'https://api.github.com/user', method: 'GET', body: null }, (m) => replies.push(m))
    expect(replies[0]).toEqual({ type: 'refused', id: 3, reason: 'signed-out' })
  })

  it('ends the sign-in when GitHub stops accepting the token', async () => {
    let user = 0
    const w = world({
      'https://site.example/api/auth/dev': () => ({ access_token: 'gho_cli' }),
      'https://api.github.com/user': () => (user++ === 0 ? { login: 'ana', name: null, avatar_url: '' } : new Response('{}', { status: 401 })),
    })
    await w.vault.handle({ type: 'dev' }, () => undefined)
    expect(w.states().at(-1)?.status).toBe('signed-in')
    await w.vault.handle({ type: 'fetch', id: 4, url: 'https://api.github.com/user', method: 'GET', body: null }, () => undefined)
    expect(w.states().at(-1)).toEqual({ status: 'signed-out', reason: 'expired' })
  })

  it('stops waiting when the person says no', async () => {
    const w = signIn([{ error: 'access_denied' }])
    void w.vault.handle({ type: 'start' }, () => undefined)
    await w.pass(6_000)
    expect(w.states().at(-1)).toEqual({ status: 'signed-out', reason: 'denied' })
  })
})

describe('Vault, after "Continue with GitHub"', () => {
  it('claims the token the server left for it, and tells pages who signed in', async () => {
    const w = world({
      'https://site.example/api/auth/claim': () => ({ access_token: 'ghu_abcdefgh1234', expires_in: 28800 }),
      'https://api.github.com/user': () => ({ login: 'ana', name: 'Ana', avatar_url: 'https://a' }),
    })
    const replies: VaultMessage[] = []
    await w.vault.handle({ type: 'claim' }, (m) => replies.push(m))
    await w.pass(0)
    expect(replies).toEqual([{ type: 'claimed', ok: true }])
    expect(w.calls[0].init.method).toBe('POST')
    expect(w.states().at(-1)).toMatchObject({ status: 'signed-in', user: { login: 'ana' } })
    expect(JSON.stringify(w.messages)).not.toContain('ghu_abcdefgh1234')
  })

  it('changes nothing when there is no token waiting (a reload of the page GitHub came back to)', async () => {
    const w = world({ 'https://site.example/api/auth/claim': () => new Response(JSON.stringify({ error: 'none' }), { status: 404 }) })
    const replies: VaultMessage[] = []
    await w.vault.handle({ type: 'claim' }, (m) => replies.push(m))
    await w.pass(0)
    expect(replies).toEqual([{ type: 'claimed', ok: false }])
    expect(w.states()).toEqual([])
  })
})
