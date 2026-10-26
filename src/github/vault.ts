/**
 * The page's side of the token vault (`vault-core.ts`): starts the worker, passes sign-in commands
 * to it, hears the sign-in state, and turns GitHub requests into messages. The page's GitHub client
 * uses `vaultFetch` instead of `fetch`, sends no token (it never has one) and gets back an ordinary
 * `Response`.
 */
import type { Fetcher } from './client'
import type { VaultMessage, VaultRequest, VaultState } from './vault-core'
import VaultShared from './vault.worker?sharedworker'
import VaultDedicated from './vault.worker?worker'

type Port = { postMessage: (m: VaultRequest) => void; onmessage: ((e: MessageEvent<VaultMessage>) => void) | null }

let port: Port | null = null
let nextId = 1
const pending = new Map<number, { resolve: (r: Response) => void; reject: (e: Error) => void }>()
const listeners = new Set<(s: VaultState) => void>()
const claims = new Set<(ok: boolean) => void>()
let last: VaultState | null = null

function connect(): Port {
  if (port) return port
  if (typeof SharedWorker !== 'undefined') {
    const shared = new VaultShared({ name: 'repartments-vault' })
    port = shared.port as unknown as Port
  } else {
    port = new VaultDedicated({ name: 'repartments-vault' }) as unknown as Port
  }
  port.onmessage = (e) => {
    const m = e.data
    if (m.type === 'state') {
      last = m.state
      listeners.forEach((l) => l(m.state))
      return
    }
    if (m.type === 'claimed') {
      claims.forEach((done) => done(m.ok))
      claims.clear()
      return
    }
    const p = pending.get(m.id)
    if (!p) return
    pending.delete(m.id)
    if (m.type === 'refused') {
      // Shaped like GitHub's own answers, so the client's usual error handling applies.
      const status = m.reason === 'signed-out' ? 401 : m.reason === 'blocked' ? 403 : 0
      if (status) p.resolve(new Response(JSON.stringify({ message: m.reason }), { status }))
      else p.reject(new TypeError('network'))
      return
    }
    const empty = m.status === 204 || m.status === 205 || m.status === 304
    p.resolve(new Response(empty ? null : m.body, { status: m.status, headers: m.headers }))
  }
  port.postMessage({ type: 'hello' })
  return port
}

/** Hears every change of the sign-in state (and the current one right away, once known). */
export function onVaultState(listener: (s: VaultState) => void): () => void {
  listeners.add(listener)
  connect()
  if (last) listener(last)
  return () => listeners.delete(listener)
}

export const vault = {
  /** Starts GitHub's device flow; the code to type arrives as a `waiting` state. */
  start: () => connect().postMessage({ type: 'start' }),
  /** Back from "Continue with GitHub": the vault picks up the token the server left for it, if any. */
  claim: () =>
    new Promise<boolean>((done) => {
      claims.add(done)
      connect().postMessage({ type: 'claim' })
    }),
  /** Development only: sign in with the GitHub CLI's token. */
  dev: () => connect().postMessage({ type: 'dev' }),
  /** Signs in with a token the person made on GitHub; it goes to the vault, never to the server. */
  paste: (token: string) => connect().postMessage({ type: 'token', token }),
  cancel: () => connect().postMessage({ type: 'cancel' }),
  signOut: () => connect().postMessage({ type: 'sign-out' }),
}

/** `fetch` for GitHub through the vault: same shape, but the token is added on the other side. */
export const vaultFetch: Fetcher = (url, init) =>
  new Promise<Response>((resolve, reject) => {
    const signal = init.signal
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const id = nextId++
    pending.set(id, { resolve, reject })
    signal?.addEventListener('abort', () => {
      if (pending.delete(id)) reject(new DOMException('Aborted', 'AbortError'))
    })
    const body = typeof init.body === 'string' ? init.body : null
    connect().postMessage({ type: 'fetch', id, url, method: init.method ?? 'GET', body })
  })
