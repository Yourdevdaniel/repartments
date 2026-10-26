/**
 * The studio's sign-in, as the screens see it. The work happens on GitHub and in the token vault
 * (`github/vault-core.ts`): "Continue with GitHub" (off to github.com and back) or the device flow
 * (a short code typed on github.com), the token kept in a worker the page can't read, and a sign-in
 * that lasts 8 hours at most. This hook mirrors the vault's state, adds which sign-in this server
 * offers, picks up a sign-in coming back from GitHub, and keeps a clock ticking for the "your
 * session ends in…" notice.
 */
import { useCallback, useEffect, useState } from 'react'
import type { Viewer } from '../shared/studio'
import { onVaultState, vault } from '../github/vault'
import type { VaultState } from '../github/vault-core'

export type DeviceCode = { userCode: string; verificationUri: string; expiresAt: number }

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out'; enabled: boolean; web: boolean; devLogin: boolean; error?: 'denied' | 'expired' | 'unavailable' | 'rejected' }
  | { status: 'waiting'; code: DeviceCode }
  | { status: 'signed-in'; user: Viewer; expiresAt: number }

/** Minutes before the end of a sign-in when the studio starts warning. */
export const WARN_MINUTES = 10

/** "7 h 52 min", "9 min", "under a minute": what's left of a sign-in, in words. */
export function timeLeft(ms: number, lang: 'en' | 'pt'): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return lang === 'pt' ? 'menos de um minuto' : 'under a minute'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

type Landing = { claim: boolean; error?: 'denied' | 'unavailable' }

/** One claim per page load, even when React runs an effect twice in development. */
let claim: Promise<boolean> | null = null
const claimOnce = () => (claim ??= vault.claim())

/** What GitHub's return left in the address (`?signin=…`), read once and then taken out of it. */
function landing(): Landing {
  const params = new URLSearchParams(window.location.search)
  const signin = params.get('signin')
  if (!signin) return { claim: false }
  params.delete('signin')
  const rest = params.toString()
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`)
  if (signin === '1') return { claim: true }
  if (signin === 'denied') return { claim: false, error: 'denied' }
  return signin === 'off' ? { claim: false } : { claim: false, error: 'unavailable' }
}

/** Who is signed in, how long it lasts, and the commands to sign in and out. */
export function useSession() {
  const [config, setConfig] = useState<{ enabled: boolean; web: boolean; devLogin: boolean; install: string | null } | null>(null)
  const [vaultState, setVaultState] = useState<VaultState | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [back] = useState(landing)
  /** Back from GitHub, waiting for the vault to pick the token up: a loading screen, not the sign-in card. */
  const [claiming, setClaiming] = useState(back.claim)

  useEffect(() => {
    if (!back.claim) return
    let live = true
    void claimOnce().then(() => live && setClaiming(false))
    // A vault that never answers shouldn't leave the page waiting.
    const id = window.setTimeout(() => setClaiming(false), 10_000)
    return () => {
      live = false
      window.clearTimeout(id)
    }
  }, [back])

  useEffect(() => {
    let live = true
    fetch('/api/auth/config')
      .then((r) => r.json() as Promise<{ enabled?: boolean; web?: boolean; devLogin?: boolean; install?: string }>)
      .catch(() => ({}) as { enabled?: boolean; web?: boolean; devLogin?: boolean; install?: string })
      .then((c) => live && setConfig({ enabled: !!c.enabled, web: !!c.web, devLogin: !!c.devLogin, install: c.install ?? null }))
    const stop = onVaultState(setVaultState)
    // A vault that never answers (a browser blocking workers) shouldn't leave the page waiting.
    const late = window.setTimeout(() => setVaultState((s) => s ?? { status: 'signed-out', reason: 'unavailable' }), 5000)
    return () => {
      live = false
      stop()
      window.clearTimeout(late)
    }
  }, [])

  // A slow tick for the countdown; every 15 s is plenty for minutes.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [])

  let state: SessionState
  if (!config || !vaultState || claiming) state = { status: 'loading' }
  else if (vaultState.status === 'signed-in') state = { status: 'signed-in', user: vaultState.user, expiresAt: vaultState.expiresAt }
  else if (vaultState.status === 'waiting') state = { status: 'waiting', code: vaultState }
  else {
    const error = (vaultState.reason === 'disabled' ? 'unavailable' : vaultState.reason) ?? back.error
    state = { status: 'signed-out', enabled: config.enabled, web: config.web, devLogin: config.devLogin, ...(error ? { error } : {}) }
  }

  const signIn = useCallback(() => {
    // "Continue with GitHub": the whole page goes to GitHub and comes back to where it was.
    if (config?.web) window.location.assign(`/api/auth/login?next=${encodeURIComponent(window.location.pathname)}`)
    else if (config?.devLogin) vault.dev()
    else vault.start()
  }, [config])

  /** GitHub App only: where the person picks which repositories the app can read. */
  const install = config?.install ?? null

  return { state, now, install, signIn, paste: vault.paste, cancel: vault.cancel, signOut: vault.signOut }
}
