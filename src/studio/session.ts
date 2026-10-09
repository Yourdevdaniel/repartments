/**
 * The studio's sign-in, with GitHub's device flow: the page shows a short code, the person types it
 * on github.com and approves, and GitHub hands this tab a token. No client secret, no server-side
 * session, no cookie: the token is kept in this tab's `sessionStorage` (gone when the tab closes),
 * and every studio call goes from here to api.github.com directly.
 *
 * The two sign-in calls go through `/api/auth/*` only because GitHub's sign-in endpoints refuse
 * requests made by web pages; that relay stores nothing (see `server/auth.ts`).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Viewer } from '../shared/studio'
import { api, StudioApiError, setToken } from './api'

const KEY = 'studio:token'

type Saved = { token: string; exp: number | null }

function load(): Saved | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Saved | null
    if (!saved || typeof saved.token !== 'string') return null
    if (saved.exp !== null && saved.exp <= Date.now()) return null
    return saved
  } catch {
    return null
  }
}

function save(saved: Saved | null) {
  try {
    if (saved) sessionStorage.setItem(KEY, JSON.stringify(saved))
    else sessionStorage.removeItem(KEY)
  } catch {
    // Storage blocked: the sign-in lasts until the page reloads.
  }
}

export type DeviceCode = { userCode: string; verificationUri: string; expiresAt: number }

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out'; enabled: boolean; devLogin: boolean; error?: 'denied' | 'expired' | 'unavailable' }
  | { status: 'waiting'; code: DeviceCode }
  | { status: 'signed-in'; user: Viewer }

const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'repartments' }

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) })
  return (await res.json()) as T
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = window.setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      window.clearTimeout(id)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

/** Who is signed in; `signIn` starts the device flow, `cancel` stops waiting, `signOut` forgets the token. */
export function useSession() {
  const [state, setState] = useState<SessionState>({ status: 'loading' })
  const config = useRef({ enabled: false, devLogin: false })
  const flow = useRef<AbortController | null>(null)

  const signedOut = useCallback((error?: 'denied' | 'expired' | 'unavailable') => {
    save(null)
    setToken(null)
    setState({ status: 'signed-out', ...config.current, error })
  }, [])

  /** Keeps a token: checks it with GitHub and shows who it belongs to. */
  const adopt = useCallback(
    async (token: string, expiresIn: number | null) => {
      setToken(token, () => signedOut('expired'))
      try {
        const user = await api.viewer()
        save({ token, exp: expiresIn ? Date.now() + expiresIn * 1000 : null })
        setState({ status: 'signed-in', user })
      } catch (err) {
        signedOut(err instanceof StudioApiError && err.code === 'signed-out' ? 'expired' : 'unavailable')
      }
    },
    [signedOut],
  )

  useEffect(() => {
    let live = true
    fetch('/api/auth/config')
      .then((r) => r.json() as Promise<{ enabled?: boolean; devLogin?: boolean }>)
      .catch(() => ({}) as { enabled?: boolean; devLogin?: boolean })
      .then(async (c) => {
        if (!live) return
        config.current = { enabled: !!c.enabled, devLogin: !!c.devLogin }
        const saved = load()
        if (saved) await adopt(saved.token, saved.exp ? (saved.exp - Date.now()) / 1000 : null)
        else setState({ status: 'signed-out', ...config.current })
      })
    return () => {
      live = false
      flow.current?.abort()
    }
  }, [adopt])

  const signIn = useCallback(async () => {
    flow.current?.abort()
    const ctrl = new AbortController()
    flow.current = ctrl
    try {
      if (config.current.devLogin) {
        const dev = await fetch('/api/auth/dev').then((r) => r.json() as Promise<{ access_token?: string }>)
        if (dev.access_token) return adopt(dev.access_token, null)
        return signedOut('unavailable')
      }
      const start = await post<{ device_code?: string; user_code?: string; verification_uri?: string; expires_in?: number; interval?: number }>('/api/auth/device')
      if (!start.device_code || !start.user_code) return signedOut('unavailable')
      const code: DeviceCode = {
        userCode: start.user_code,
        verificationUri: start.verification_uri ?? 'https://github.com/login/device',
        expiresAt: Date.now() + (start.expires_in ?? 900) * 1000,
      }
      setState({ status: 'waiting', code })
      // Poll at GitHub's pace until the person approves, says no, or the code runs out.
      let interval = (start.interval ?? 5) * 1000
      while (Date.now() < code.expiresAt) {
        await wait(interval, ctrl.signal)
        const answer = await post<{ access_token?: string; expires_in?: number; error?: string; interval?: number }>('/api/auth/token', {
          device_code: start.device_code,
        })
        if (answer.access_token) return adopt(answer.access_token, answer.expires_in ?? null)
        if (answer.error === 'slow_down') interval = Math.max(interval + 5000, (answer.interval ?? 0) * 1000)
        else if (answer.error === 'access_denied') return signedOut('denied')
        else if (answer.error !== 'authorization_pending') return signedOut(answer.error === 'expired_token' ? 'expired' : 'unavailable')
      }
      signedOut('expired')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') signedOut('unavailable')
    }
  }, [adopt, signedOut])

  const cancel = useCallback(() => {
    flow.current?.abort()
    signedOut()
  }, [signedOut])

  return { state, signIn, cancel, signOut: cancel, expired: () => signedOut('expired') }
}
