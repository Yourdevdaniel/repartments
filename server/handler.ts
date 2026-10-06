/**
 * The building endpoint, independent of where it runs (a Vercel function in production, a Vite
 * middleware in development): validate the name, ask GitHub, analyze, answer with tags only.
 */
import type { Building, BuildingError } from '../src/shared/types'
import { analyze } from './analyze.js'
import { fetchOwner, GitHubError, type Fetcher } from './github.js'

/** GitHub's own rules: letters, digits and single hyphens, up to 39 characters. */
export const USERNAME = /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/

/** GitHub's page cursors are short base64 strings. */
const CURSOR = /^[A-Za-z0-9+/=_-]{1,200}$/

export type Answer = { status: number; body: Building | BuildingError; cache: boolean }

/** `after` asks for the next building down the street: the repos after the ones already shown. */
export async function buildingFor(login: string | null, token: string | undefined, fetcher?: Fetcher, after: string | null = null): Promise<Answer> {
  if (!login || !USERNAME.test(login) || (after !== null && !CURSOR.test(after))) return { status: 400, body: { error: 'invalid-user' }, cache: false }
  if (!token) return { status: 503, body: { error: 'unavailable' }, cache: false }
  try {
    const owner = await fetchOwner(login, token, fetcher, after)
    const page = owner.repositories
    // Archived repos stay out while at least three active ones remain; otherwise they're kept, so an
    // account of mostly finished projects still gets a building instead of an empty lot.
    const active = owner.repositories.nodes.filter((r) => !r.isArchived)
    const repos = active.length >= 3 ? active : owner.repositories.nodes
    if (!repos.length) return { status: 404, body: { error: 'no-repos' }, cache: true }
    const apartments = repos.map(analyze).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return {
      status: 200,
      body: {
        owner: { login: owner.login, name: owner.name ?? null, avatarUrl: owner.avatarUrl },
        apartments,
        next: page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null,
        total: page.totalCount,
        fetched: page.nodes.length,
      },
      cache: true,
    }
  } catch (err) {
    if (err instanceof GitHubError) {
      const status = err.kind === 'not-found' ? 404 : err.kind === 'rate-limited' ? 429 : 502
      return { status, body: { error: err.kind }, cache: err.kind === 'not-found' }
    }
    return { status: 502, body: { error: 'unavailable' }, cache: false }
  }
}

/** Fresh for an hour at the edge, then served stale for a day while it refreshes in the background. */
export const CACHE_HEADER = 'public, s-maxage=3600, stale-while-revalidate=86400'
