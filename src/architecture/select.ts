/**
 * Chooses which files of a repo are worth reading. Only code, the manifests that name its
 * dependencies and the prompt files an agent loads are read; generated, vendored and secret files
 * never are. When the repo is too big, the most telling files (manifests, then shallow source, tests
 * last) are kept and the rest is reported as left out.
 */
import { basenameOf, langOf } from './text'

/** One entry of GitHub's recursive tree. */
export type TreeEntry = { path: string; type: 'blob' | 'tree'; size?: number }

/** Read at most this many files and this many declared bytes. */
export const MAX_FILES = 700
export const MAX_BYTES = 7 * 1024 * 1024
/** Files bigger than this are generated or data, not code worth reading. */
export const MAX_FILE_BYTES = 200 * 1024

const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'vendor',
  'coverage',
  '__pycache__',
  '.git',
  '.venv',
  'venv',
  'site-packages',
  'target',
  'bin',
  'obj',
  'public',
])

const LOCKFILES = /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Pipfile\.lock|go\.sum|Cargo\.lock|composer\.lock|Gemfile\.lock|bun\.lockb?)$/
const MANIFEST = /^(package\.json|requirements[\w.-]*\.txt|pyproject\.toml|go\.mod|composer\.json|Gemfile|pom\.xml|build\.gradle(\.kts)?|docker-compose[\w.-]*\.ya?ml|compose\.ya?ml|Dockerfile|tsconfig\.json|jsconfig\.json|schema\.prisma|vercel\.json)$/
const PROMPT_EXT = /\.(md|txt|yaml|yml|json|jinja|j2|prompt)$/i
const NEVER = /(^\.env)|\.(pem|key|p12|pfx)$|secret|credential|id_rsa/i

/** Whether a path is a test file, by its folder or its name. */
export function isTestPath(path: string): boolean {
  const lower = path.toLowerCase()
  const name = basenameOf(lower)
  if (/(^|\/)(tests?|__tests__|spec)\//.test(lower)) return true
  if (/\.(test|spec)\.[a-z]+$/.test(name)) return true
  if (/^test_.*\.py$/.test(name) || /_test\.(go|py)$/.test(name)) return true
  return false
}

/** Manifests, prompt files, source and tests, in the order they are kept when the budget runs out. */
function tierOf(path: string): 0 | 1 | 2 {
  const name = basenameOf(path)
  if (MANIFEST.test(name)) return 0
  if (PROMPT_EXT.test(name)) return 0
  if (isTestPath(path)) return 2
  return 1
}

function excluded(path: string): boolean {
  const segs = path.split('/')
  if (segs.slice(0, -1).some((s) => EXCLUDED_DIRS.has(s))) return true
  if (path.includes('static/vendor/')) return true
  const name = basenameOf(path)
  if (/\.min\.(js|css)$/.test(name) || LOCKFILES.test(name) || /\.d\.ts$/.test(name)) return true
  return NEVER.test(name)
}

/** The files to read, most important first, and whether the budget left something out. */
export function selectFiles(tree: TreeEntry[]): { paths: string[]; truncated: boolean } {
  const candidates: { path: string; size: number; tier: 0 | 1 | 2 }[] = []
  for (const entry of tree) {
    if (entry.type !== 'blob' || typeof entry.path !== 'string') continue
    const path = entry.path
    if (excluded(path)) continue
    const name = basenameOf(path)
    const size = typeof entry.size === 'number' && entry.size >= 0 ? entry.size : 0
    if (size > MAX_FILE_BYTES) continue
    const isSource = langOf(path) !== null && !/\.d\.ts$/.test(name)
    const isPrompt = PROMPT_EXT.test(name) && path.toLowerCase().includes('prompt')
    if (!isSource && !MANIFEST.test(name) && !isPrompt) continue
    candidates.push({ path, size, tier: tierOf(path) })
  }
  candidates.sort((a, b) => a.tier - b.tier || a.path.split('/').length - b.path.split('/').length || (a.path < b.path ? -1 : 1))

  const paths: string[] = []
  let bytes = 0
  let truncated = false
  for (const c of candidates) {
    if (paths.length >= MAX_FILES || bytes + c.size > MAX_BYTES) {
      truncated = true
      continue
    }
    paths.push(c.path)
    bytes += c.size
  }
  return { paths, truncated }
}
