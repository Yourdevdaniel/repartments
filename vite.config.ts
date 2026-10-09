import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * In development, serve /api/building from the same handler the Vercel function uses. The token
 * comes from GITHUB_TOKEN, or else from the GitHub CLI if it's logged in; it stays in this process
 * and is never written anywhere. Answers are cached for ten minutes to go easy on GitHub.
 *
 * GITHUB_TOKEN from the environment or .env.local, else the GitHub CLI's token (on PATH or its usual install path). */
function readToken(): string | undefined {
  const fromEnv = process.env.GITHUB_TOKEN || loadEnv('development', process.cwd(), '').GITHUB_TOKEN
  if (fromEnv) return fromEnv
  for (const gh of ['gh', String.raw`"C:\Program Files\GitHub CLI\gh.exe"`]) {
    try {
      const token = execSync(`${gh} auth token`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      if (token) return token
    } catch {
      // Try the next way.
    }
  }
  return undefined
}

function devApi(): Plugin {
  const cache = new Map<string, { at: number; status: number; body: string }>()
  return {
    name: 'repartments-dev-api',
    configureServer(server) {
      let token = readToken()
      if (!token) server.config.logger.warn('No GITHUB_TOKEN and no logged-in GitHub CLI yet: /api/building will answer 503 until one is available.')
      server.middlewares.use('/api/building', async (req, res) => {
        const params = new URL(req.url ?? '', 'http://local').searchParams
        const user = params.get('user') ?? ''
        const after = params.get('after')
        const key = `${user.toLowerCase()}|${after ?? ''}`
        const hit = cache.get(key)
        let answer = hit && Date.now() - hit.at < 10 * 60_000 ? hit : null
        // Look again if there was no token at start-up (the CLI may have been logged in since).
        if (!token) token = readToken()
        if (!answer) {
          const { buildingFor } = (await server.ssrLoadModule('/server/handler.ts')) as typeof import('./server/handler')
          const result = await buildingFor(user, token, undefined, after)
          answer = { at: Date.now(), status: result.status, body: JSON.stringify(result.body) }
          if (result.cache === 'long') cache.set(key, answer)
        }
        res.statusCode = answer.status
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(answer.body)
      })
    },
  }
}

/**
 * In development, the studio's sign-in routes (`/api/auth/*`) run through the same code as the
 * Vercel functions. Without GITHUB_CLIENT_ID in `.env.local`, "Sign in" borrows the GitHub CLI's
 * token instead (`/api/auth/dev`), so the studio can be tried right away; that shortcut exists only
 * here, only for requests from this machine, never in the deployed functions.
 */
function devAuth(): Plugin {
  return {
    name: 'repartments-dev-auth',
    configureServer(server) {
      const file = loadEnv('development', process.cwd(), '')
      const env = {
        GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || file.GITHUB_CLIENT_ID,
        GITHUB_OAUTH_SCOPE: process.env.GITHUB_OAUTH_SCOPE || file.GITHUB_OAUTH_SCOPE,
      }
      server.middlewares.use('/api/auth', async (req, res) => {
        try {
          const { handleAuth } = (await server.ssrLoadModule('/server/auth.ts')) as typeof import('./server/auth')
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
          // Mounted at /api/auth, so req.url is the rest of the path.
          const request = new Request(new URL(`/api/auth${req.url ?? ''}`, `http://${req.headers.host ?? 'localhost'}`), {
            method: req.method,
            headers,
            body: chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined,
          })
          // Only someone on this machine may borrow the CLI's token, even if the dev server is exposed with --host.
          const local = /^(::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/.test(req.socket.remoteAddress ?? '')
          const response = await handleAuth(request, { env, devToken: local ? readToken : undefined })
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (err) {
          server.config.logger.error(String(err))
          res.statusCode = 500
          res.end()
        }
      })
    },
  }
}

/** The production security headers from vercel.json, so `vite preview` behaves like the real site. */
const productionHeaders = Object.fromEntries(
  (JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')).headers[0].headers as { key: string; value: string }[]).map(
    (h) => [h.key, h.value],
  ),
)

export default defineConfig({
  plugins: [react(), tailwindcss(), devApi(), devAuth()],
  preview: { headers: productionHeaders },
})
