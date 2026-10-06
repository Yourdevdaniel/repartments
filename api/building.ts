/**
 * Vercel function: GET /api/building?user=<login>. The GitHub token lives only in the server's
 * environment (GITHUB_TOKEN, a fine-grained token with no repository permissions: public data only).
 */
import { buildingFor, CACHE_HEADER } from '../server/handler'

export async function GET(request: Request): Promise<Response> {
  const user = new URL(request.url).searchParams.get('user')
  const answer = await buildingFor(user, process.env.GITHUB_TOKEN)
  return new Response(JSON.stringify(answer.body), {
    status: answer.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': answer.cache ? CACHE_HEADER : 'no-store',
    },
  })
}
