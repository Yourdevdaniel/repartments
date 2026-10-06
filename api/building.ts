/**
 * Vercel function: GET /api/building?user=<login>[&after=<cursor>]. The GitHub token lives only in
 * the server's environment (GITHUB_TOKEN, a fine-grained token with no repository permissions:
 * public data only).
 */
import { BRIEF_CACHE_HEADER, buildingFor, CACHE_HEADER } from '../server/handler.js'
import { clientKey, createLimiter } from '../server/limiter.js'

/** Requests that reach the function (the edge cache answers the rest): 20 a minute per visitor. */
const allow = createLimiter(20, 60_000)

const json = (body: unknown, status: number, cache: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
    },
  })

export async function GET(request: Request): Promise<Response> {
  if (!allow(clientKey(request.headers))) return json({ error: 'rate-limited' }, 429, 'no-store')
  const params = new URL(request.url).searchParams
  const answer = await buildingFor(params.get('user'), process.env.GITHUB_TOKEN, undefined, params.get('after'))
  const cache = answer.cache === 'long' ? CACHE_HEADER : answer.cache === 'brief' ? BRIEF_CACHE_HEADER : 'no-store'
  return json(answer.body, answer.status, cache)
}
