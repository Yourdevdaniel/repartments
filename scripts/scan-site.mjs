/**
 * Looks at a published site from the outside, the way anyone could, for leaked secrets:
 *
 * - every script and stylesheet the page loads (and the ones those load), for secret values and
 *   anything shaped like a secret, and whether their source maps are published;
 * - files that must never be served (`.env*`, `.git/`, the server's code, the Vercel project): each
 *   must answer 404 or the site's own page, never the file;
 * - the sign-in routes: `/api/auth/config` says only what it should, the development shortcut
 *   doesn't exist, and the token hand-over refuses other sites;
 * - the security headers the token vault relies on (CSP, HSTS, nosniff, no framing).
 *
 * With the real secrets in this environment (`.env.local`), it also looks for their exact values.
 * It never prints a response body or a value: only what was checked and what failed.
 *
 *   npm run check:site -- https://repartments.vercel.app
 */
import { pathToFileURL } from 'node:url'
import { findLeaks, secretsFrom } from './leaks.mjs'

/** Paths that must never be served as files. */
export const NEVER_SERVED = [
  '/.env',
  '/.env.local',
  '/.env.production',
  '/.env.development',
  '/.git/config',
  '/.git/HEAD',
  '/.vercel/project.json',
  '/package.json',
  '/vercel.json',
  '/vite.config.ts',
  '/server/auth.ts',
  '/server/building.ts',
  '/api/auth/login.ts',
]

/** What /api/auth/config may say, and nothing more. */
const CONFIG_KEYS = new Set(['enabled', 'web', 'devLogin'])

/**
 * Scans the site at `base`; `fetcher` is `fetch` (or a fake in tests). Returns what was checked and
 * the problems found, each in one line without any secret in it.
 */
export async function scanSite(base, fetcher = fetch, secrets = []) {
  const site = base.replace(/\/+$/, '')
  const problems = []
  const checked = []
  const text = async (path, init) => {
    const res = await fetcher(site + path, { redirect: 'manual', ...init })
    return { res, body: await res.text() }
  }

  // The page and its headers.
  const home = await text('/')
  checked.push('home page')
  const h = (name) => home.res.headers.get(name) ?? ''
  const csp = h('content-security-policy')
  if (!/script-src 'self'/.test(csp)) problems.push(`headers: no Content-Security-Policy with script-src 'self'`)
  if (!/require-trusted-types-for 'script'/.test(csp)) problems.push(`headers: the CSP doesn't require Trusted Types`)
  if (!h('strict-transport-security')) problems.push('headers: no Strict-Transport-Security')
  if (!/nosniff/i.test(h('x-content-type-options'))) problems.push('headers: no X-Content-Type-Options: nosniff')
  if (!/deny/i.test(h('x-frame-options')) && !/frame-ancestors 'none'/.test(csp)) problems.push('headers: the site can be framed')

  // Every script and stylesheet, following the ones that load others.
  const files = [{ name: '/', text: home.body }]
  const queue = [...home.body.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])
  const seen = new Set()
  while (queue.length) {
    const path = queue.shift()
    if (seen.has(path)) continue
    seen.add(path)
    const { res, body } = await text(path)
    if (!res.ok) continue
    files.push({ name: path, text: body })
    for (const m of body.matchAll(/["'`(/](assets\/[\w.-]+\.(?:js|css))/g)) queue.push(`/${m[1]}`)
    if (path.endsWith('.js')) {
      const map = await fetcher(`${site}${path}.map`, { redirect: 'manual' })
      if (map.status === 200 && /json/.test(map.headers.get('content-type') ?? '')) problems.push(`${path}.map: source map is published (the original code can be read)`)
    }
  }
  checked.push(`${files.length - 1} scripts and stylesheets`)
  for (const l of findLeaks(files, secrets)) problems.push(`${l.file}: ${l.kind}`)

  // Files that must never be served: 404, or the site's own page (the single-page fallback).
  for (const path of NEVER_SERVED) {
    const { res, body } = await text(path)
    if (res.status === 200 && body !== home.body) problems.push(`${path}: served as a file`)
  }
  checked.push(`${NEVER_SERVED.length} paths that must never be served`)

  // The sign-in routes.
  const config = await text('/api/auth/config')
  // A site without the studio answers with its own page (or 404): nothing to check there.
  if (config.res.ok && /json/.test(config.res.headers.get('content-type') ?? '')) {
    let keys = []
    try {
      keys = Object.keys(JSON.parse(config.body))
    } catch {
      problems.push('/api/auth/config: not JSON')
    }
    for (const k of keys) if (!CONFIG_KEYS.has(k)) problems.push(`/api/auth/config: says more than it should (${k})`)
    if (keys.includes('devLogin')) problems.push('/api/auth/config: offers the development sign-in')
    const dev = await text('/api/auth/dev')
    if (dev.res.status === 200 && dev.body !== home.body) problems.push('/api/auth/dev: the development shortcut answers')
    const claim = await text('/api/auth/claim', { method: 'POST', headers: { origin: 'https://another-site.example' } })
    if (claim.res.status !== 403 && claim.res.status !== 404) problems.push(`/api/auth/claim: answers another site (${claim.res.status})`)
    checked.push('sign-in routes')
  } else {
    checked.push('sign-in routes (not on this site)')
  }
  if (secrets.length) checked.push(`the exact values of ${secrets.map((s) => s.name).join(' and ')}`)
  return { checked, problems }
}

// Run from the command line.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const base = process.argv[2]
  if (!base) {
    console.error('Usage: npm run check:site -- https://your-site')
    process.exit(2)
  }
  const { loadEnv } = await import('vite')
  const secrets = secretsFrom({ ...loadEnv('production', process.cwd(), ''), ...process.env })
  const { checked, problems } = await scanSite(base, fetch, secrets)
  console.log(`Checked ${base}: ${checked.join('; ')}.`)
  if (problems.length) {
    console.error(`✗ ${problems.length} problem(s):`)
    for (const p of problems) console.error(`  ${p}`)
    process.exit(1)
  }
  console.log('✓ No leaks found.')
}
