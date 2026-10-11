/**
 * The studio's sign-in, as the screens see it. The work happens in the token vault
 * (`github/vault-core.ts`): GitHub's device flow (a short code typed on github.com), the token kept
 * in a worker the page can't read, and a sign-in that lasts 8 hours at most. This hook only mirrors
 * the vault's state, adds whether sign-in is set up on this server, and keeps a clock ticking for
 * the "your session ends in…" notice.
 */
import { useCallback, useEffect, useState } from 'react'
import type { Viewer } from '../shared/studio'
import { onVaultState, vault } from '../github/vault'
import type { VaultState } from '../github/vault-core'

export type DeviceCode = { userCode: string; verificationUri: string; expiresAt: number }

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out'; enabled: boolean; devLogin: boolean; error?: 'denied' | 'expired' | 'unavailable' }
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

/** Who is signed in, how long it lasts, and the commands to sign in and out. */
export function useSession() {
  const [config, setConfig] = useState<{ enabled: boolean; devLogin: boolean } | null>(null)
  const [vaultState, setVaultState] = useState<VaultState | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let live = true
    fetch('/api/auth/config')
      .then((r) => r.json() as Promise<{ enabled?: boolean; devLogin?: boolean }>)
      .catch(() => ({}) as { enabled?: boolean; devLogin?: boolean })
      .then((c) => live && setConfig({ enabled: !!c.enabled, devLogin: !!c.devLogin }))
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
  if (!config || !vaultState) state = { status: 'loading' }
  else if (vaultState.status === 'signed-in') state = { status: 'signed-in', user: vaultState.user, expiresAt: vaultState.expiresAt }
  else if (vaultState.status === 'waiting') state = { status: 'waiting', code: vaultState }
  else {
    const error = vaultState.reason === 'disabled' ? 'unavailable' : vaultState.reason
    state = { status: 'signed-out', ...config, ...(error ? { error } : {}) }
  }

  const signIn = useCallback(() => (config?.devLogin ? vault.dev() : vault.start()), [config])

  return { state, now, signIn, cancel: vault.cancel, signOut: vault.signOut }
}
