/**
 * A small GitHub client for the studio, running in the browser as the signed-in person: it calls
 * api.github.com directly with their own token (GitHub's API allows that from any site, CORS
 * included), so the token and the code it reads never pass through Repartments' server.
 *
 * Every failure becomes a `StudioFailure` with one of the studio's error codes, so the screens never
 * have to read GitHub's status codes themselves.
 */
import type { StudioErrorCode } from '../shared/studio'

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

export class StudioFailure extends Error {
  constructor(
    public code: StudioErrorCode,
    message: string = code,
  ) {
    super(message)
  }
}

const API = 'https://api.github.com'

/** GitHub owner and repo names: letters, digits, `-`, `_` and `.` (and never just dots). */
export const OWNER = /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/
export const REPO = /^(?!\.+$)[\w.-]{1,100}$/

/** Throws `invalid` unless both names look like GitHub's. */
export function checkRepo(owner: string | null, repo: string | null): { owner: string; repo: string } {
  if (!owner || !repo || !OWNER.test(owner) || !REPO.test(repo)) throw new StudioFailure('invalid', 'bad owner or repo name')
  return { owner, repo }
}

function failureFor(res: Response): StudioFailure {
  if (res.status === 401) return new StudioFailure('signed-out', 'GitHub no longer accepts this token')
  // GitHub answers 403 both for "you can't" and for "slow down"; the remaining quota tells them apart.
  if (res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')) return new StudioFailure('rate-limited')
  if (res.status === 403) return new StudioFailure('forbidden')
  if (res.status === 404) return new StudioFailure('not-found')
  if (res.status === 409) return new StudioFailure('not-found', 'empty repository')
  if (res.status === 422) return new StudioFailure('invalid', 'GitHub rejected the parameters')
  return new StudioFailure('unavailable', `GitHub answered ${res.status}`)
}

/** Whether GitHub's `Link` header points at a next page. */
export function hasNextPage(link: string | null): boolean {
  return !!link && /<[^>]+>;\s*rel="next"/.test(link)
}

export type GitHubClient = {
  /** GET a REST path ("/repos/o/r/commits"), with query parameters; undefined values are left out. */
  get<T>(path: string, query?: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<{ data: T; next: boolean }>
  /** One GraphQL query. */
  graphql<T>(query: string, variables: Record<string, unknown>, signal?: AbortSignal): Promise<T>
}

/**
 * The client for one token. Only headers GitHub accepts from a browser are sent (no User-Agent or
 * API-version header: browsers set the first, and the default version is the stable one).
 */
export function github(token: string, fetcher: Fetcher = (url, init) => fetch(url, init)): GitHubClient {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }

  async function call(url: string, init: RequestInit): Promise<Response> {
    let res: Response
    try {
      res = await fetcher(url, init)
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
      throw new StudioFailure('unavailable', String(err))
    }
    if (!res.ok) throw failureFor(res)
    return res
  }

  return {
    async get<T>(path: string, query: Record<string, string | number | undefined> = {}, signal?: AbortSignal) {
      const url = new URL(API + path)
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
      const res = await call(url.toString(), { headers, signal })
      return { data: (await res.json()) as T, next: hasNextPage(res.headers.get('link')) }
    },
    async graphql<T>(query: string, variables: Record<string, unknown>, signal?: AbortSignal) {
      const res = await call(`${API}/graphql`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal,
      })
      const json = (await res.json()) as { data?: T; errors?: { type?: string; message: string }[] }
      if (json.errors?.some((e) => e.type === 'RATE_LIMITED')) throw new StudioFailure('rate-limited')
      if (json.errors?.some((e) => e.type === 'NOT_FOUND')) throw new StudioFailure('not-found')
      if (!json.data) throw new StudioFailure('unavailable', json.errors?.[0]?.message ?? 'empty GraphQL answer')
      return json.data
    },
  }
}
