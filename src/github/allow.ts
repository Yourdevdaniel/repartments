/**
 * What the token vault agrees to send to GitHub on the page's behalf. Everything the studio needs
 * is a read: a handful of REST paths with GET, and GraphQL queries. Anything else (a POST to a REST
 * path, a GraphQL mutation, another host) is refused, so even a script that got into the page, or
 * a token with write access (an OAuth App's `repo` scope), can't be used to change a repository.
 */

const API = 'https://api.github.com'
const OWNER = '[A-Za-z0-9-]{1,39}'
const REPO = '[\\w.-]{1,100}'

/** The REST paths the studio reads (see `repos.ts`, `commits.ts` and `architecture/fetch.ts`). */
const READS = [
  /^\/user$/,
  /^\/user\/repos$/,
  new RegExp(`^/repos/${OWNER}/${REPO}$`),
  new RegExp(`^/repos/${OWNER}/${REPO}/branches$`),
  new RegExp(`^/repos/${OWNER}/${REPO}/commits$`),
  new RegExp(`^/repos/${OWNER}/${REPO}/commits/[^/]{1,250}$`),
  new RegExp(`^/repos/${OWNER}/${REPO}/git/trees/[^/]{1,250}$`),
]

/**
 * Whether a GraphQL document only reads. String literals are blanked out first (file paths inside
 * them could contain any word), then the document must be a single query and mention no mutation
 * or subscription.
 */
export function readOnlyQuery(query: string): boolean {
  const code = query.replace(/"""[\s\S]*?"""/g, '""').replace(/"(?:\\.|[^"\\\n])*"/g, '""')
  if (/\b(mutation|subscription)\b/.test(code)) return false
  const start = code.trimStart()
  return start.startsWith('query') || start.startsWith('{')
}

/** Whether the vault may make this request. */
export function allowed(method: string, url: string, body: string | null): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.origin !== API || u.username || u.password) return false
  const path = decodeURIComponent(u.pathname)
  if (path.includes('..')) return false
  const verb = method.toUpperCase()
  if (verb === 'GET') return body === null && READS.some((r) => r.test(u.pathname))
  if (verb === 'POST' && u.pathname === '/graphql' && !u.search) {
    try {
      const parsed = JSON.parse(body ?? '') as { query?: unknown }
      return typeof parsed.query === 'string' && readOnlyQuery(parsed.query)
    } catch {
      return false
    }
  }
  return false
}
