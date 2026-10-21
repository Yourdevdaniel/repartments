/**
 * Runs right after `vite build` (`npm run build`, which is also what Vercel runs): reads every file
 * the site is about to publish and fails the build if one carries a secret, either the value of a
 * secret set in this environment (on Vercel, the real ones; locally, those in `.env.local`) or
 * anything shaped like one. Vite only puts `VITE_`-prefixed variables in the page, so this should
 * never fire; it's there so a mistake (a `define`, a hard-coded key, a copied file) stops the
 * deploy instead of reaching the site. Values are never printed.
 *
 *   node scripts/check-dist.mjs [folder]   (default: dist)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { loadEnv } from 'vite'
import { findLeaks, secretsFrom } from './leaks.mjs'

const root = process.argv[2] ?? 'dist'

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

// Binary files are read byte for byte too: a secret is plain text wherever it hides.
const files = walk(root).map((path) => ({ name: relative(process.cwd(), path), text: readFileSync(path).toString('latin1') }))
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env }
const secrets = secretsFrom(env)
const leaks = findLeaks(files, secrets)

if (leaks.length) {
  console.error(`✗ The build carries secrets; nothing should be published:`)
  for (const l of leaks) console.error(`  ${l.file}: ${l.kind}`)
  process.exit(1)
}
console.log(`✓ No secrets in ${root}/ (${files.length} files, checked against ${secrets.length ? secrets.map((s) => s.name).join(' and ') : 'patterns only'})`)
