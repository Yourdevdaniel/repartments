import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { defineConfig, type Plugin } from 'vite'

/**
 * In development, serve /api/building from the same handler the Vercel function uses. The token
 * comes from GITHUB_TOKEN, or else from the GitHub CLI if it's logged in; it stays in this process
 * and is never written anywhere. Answers are cached for ten minutes to go easy on GitHub.
 */
function devApi(): Plugin {
  const cache = new Map<string, { at: number; status: number; body: string }>()
  return {
    name: 'repartments-dev-api',
    configureServer(server) {
      let token = process.env.GITHUB_TOKEN
      if (!token) {
        try {
          token = execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
        } catch {
          server.config.logger.warn('No GITHUB_TOKEN and no logged-in GitHub CLI: /api/building will answer 503.')
        }
      }
      server.middlewares.use('/api/building', async (req, res) => {
        const user = new URL(req.url ?? '', 'http://local').searchParams.get('user') ?? ''
        const key = user.toLowerCase()
        const hit = cache.get(key)
        let answer = hit && Date.now() - hit.at < 10 * 60_000 ? hit : null
        if (!answer) {
          const { buildingFor } = (await server.ssrLoadModule('/server/handler.ts')) as typeof import('./server/handler')
          const result = await buildingFor(user, token)
          answer = { at: Date.now(), status: result.status, body: JSON.stringify(result.body) }
          if (result.cache) cache.set(key, answer)
        }
        res.statusCode = answer.status
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(answer.body)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
})
