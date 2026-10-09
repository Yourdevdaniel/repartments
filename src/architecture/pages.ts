/**
 * The pages of a site or an app: the addresses a person opens, and the screen each one shows. Two
 * kinds of source, both read without running anything:
 *
 * - **Routers in the code** (`pageRoutesOf`): React Router's `<Route path element>` and route objects
 *   (`createBrowserRouter`, Vue Router), in files that import a router.
 * - **Files that are pages by where they sit** (`filePageOf`): Next.js `pages/` and `app/**\/page.tsx`,
 *   Expo Router's `app/`, Nuxt's `pages/`, under the folder of a package.json that uses the framework.
 *
 * A page names the component it shows; `index.ts` resolves that name to a file through the imports,
 * so the scenes can say "abre a página “Minhas reservas”" for the screen that makes a call.
 */
import { lineOf, stripComments } from './text'

/** A page a router declares: its address, where, and the component it shows (by name, or by module for a lazy import). */
export type PageRoute = { path: string; line: number; component: string | null; spec: string | null }

/** A framework that routes by files, and the folder of the package.json that uses it. */
export type PageRoot = { kind: 'next' | 'expo' | 'nuxt'; dir: string }

/** Files that use a router, so a `path:` elsewhere (an API client's config, say) is not taken for a page. */
const ROUTER_IMPORT = /['"](?:react-router(?:-dom)?|vue-router|@tanstack\/react-router|wouter)['"]/

/** Components that only send the person elsewhere. */
const NOT_A_PAGE = new Set(['Navigate', 'Redirect', 'Outlet', 'Fragment', 'Suspense'])

/** The name of the page component in an element: the innermost one, past wrappers like `<Protegida>`. */
function innermost(element: string): string | null {
  const tags = [...element.matchAll(/<([A-Z][\w.]*)/g)].map((m) => m[1]).filter((t) => !NOT_A_PAGE.has(t))
  return tags.length ? tags[tags.length - 1] : null
}

/** The pages a router file declares. Files without a router give nothing; a catch-all `*` is not a page. */
export function pageRoutesOf(path: string, text: string): PageRoute[] {
  if (!/\.(jsx?|tsx?|mjs|vue)$/i.test(path) || !ROUTER_IMPORT.test(text)) return []
  const code = stripComments(text, 'slash')
  const line = lineOf(code)
  const out: PageRoute[] = []
  const add = (p: string, at: number, component: string | null, spec: string | null) => {
    if (!p || p.includes('*') || (!component && !spec)) return
    out.push({ path: p.startsWith('/') ? p : `/${p}`, line: line(at), component, spec })
  }

  // <Route path="/x" element={<X />} />, and React Router 5's component={X}.
  for (const m of code.matchAll(/<Route\b((?:[^>{]|\{(?:[^{}]|\{[^{}]*\})*\})*)\/?>/g)) {
    const attrs = m[1]
    const p = /\bpath\s*=\s*(?:\{\s*)?(['"`])([^'"`]*)\1/.exec(attrs)?.[2]
    if (p === undefined) continue
    const element = /\belement\s*=\s*\{([\s\S]*)\}/.exec(attrs)?.[1]
    const component = element ? innermost(element) : (/\bcomponent\s*=\s*\{\s*([A-Z]\w*)\s*\}/.exec(attrs)?.[1] ?? null)
    add(p, m.index ?? 0, component, null)
  }

  // { path: '/x', element: <X />, Component: X, component: X | () => import('./X.vue') }
  for (const m of code.matchAll(/\bpath\s*:\s*(['"`])([^'"`]*)\1/g)) {
    const at = m.index ?? 0
    const rest = code.slice(at + m[0].length, at + m[0].length + 240)
    const own = rest.split(/\bpath\s*:/)[0]
    const element = /\belement\s*:\s*(<[\s\S]*?\/?>)/.exec(own)?.[1]
    const named = /\b[cC]omponent\s*:\s*([A-Z]\w*)/.exec(own)?.[1]
    const lazy = /\b[cC]omponent\s*:\s*\(\s*\)\s*=>\s*import\(\s*(['"`])([^'"`]+)\1/.exec(own)?.[2]
    add(m[2], at, element ? innermost(element) : (named ?? null), lazy ?? null)
  }
  return out
}

/** The module each name a file imports comes from, lazy imports (`lazy(() => import('./X'))`) included. */
export function importedNames(text: string): Map<string, string> {
  const code = stripComments(text, 'slash')
  const out = new Map<string, string>()
  for (const m of code.matchAll(/\bimport\s+(?:type\s+)?([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?\s*from\s*['"]([^'"\n]+)['"]/g)) {
    if (m[1]) out.set(m[1], m[3])
    for (const part of (m[2] ?? '').split(',')) {
      const [orig, alias] = part.trim().split(/\s+as\s+/)
      const name = (alias ?? orig ?? '').trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.set(name, m[3])
    }
  }
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=\s*(?:React\.)?(?:lazy|defineAsyncComponent|dynamic)\(\s*\(\s*\)\s*=>\s*import\(\s*['"`]([^'"`]+)['"`]/g)) {
    out.set(m[1], m[2])
  }
  return out
}

/** The frameworks that route by files, each at the folder of the package.json that depends on it. */
export function pageRootsOf(manifests: Map<string, string>): PageRoot[] {
  const out: PageRoot[] = []
  for (const [path, text] of manifests) {
    if (!/(^|\/)package\.json$/.test(path)) continue
    let deps: Record<string, unknown> = {}
    try {
      const json = JSON.parse(text) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> }
      deps = { ...(json.dependencies ?? {}), ...(json.devDependencies ?? {}) }
    } catch {
      continue
    }
    const dir = path.replace(/\/?package\.json$/, '')
    if ('next' in deps) out.push({ kind: 'next', dir })
    else if ('expo-router' in deps) out.push({ kind: 'expo', dir })
    else if ('nuxt' in deps) out.push({ kind: 'nuxt', dir })
  }
  return out
}

/** A file-route segment as an address segment: "[slug]" → ":slug"; route groups "(shop)" and slots "@modal" vanish. */
function addressOf(segments: string[]): string {
  const parts = segments
    .filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@'))
    .map((s) => s.replace(/^\[\.{3}(\w+)\]$/, ':$1').replace(/^\[\[?(\w+)\]?\]$/, ':$1'))
    .filter((s) => s !== 'index')
  return '/' + parts.join('/')
}

/**
 * The address of a file that is a page by where it sits, or null. Next.js: `pages/**` (not `pages/api`,
 * not `_app`/`_document`/`_error`) and `app/**\/page.*`; Expo Router: `app/**` (not `_layout` or
 * `+not-found`); Nuxt: `pages/**.vue`. Only under a folder whose package.json uses that framework.
 */
export function filePageOf(path: string, roots: PageRoot[]): string | null {
  for (const root of roots) {
    const prefix = root.dir ? `${root.dir}/` : ''
    if (!path.startsWith(prefix)) continue
    const rel = path.slice(prefix.length)
    const ext = /\.(tsx|jsx|ts|js|vue)$/.exec(rel)
    if (!ext) continue
    const segments = rel.slice(0, -ext[0].length).split('/')
    const file = segments[segments.length - 1]
    if (root.kind === 'next') {
      const base = segments[0] === 'src' ? segments.slice(1) : segments
      if (base[0] === 'pages') {
        if (base[1] === 'api' || file.startsWith('_') || ext[1] === 'vue') continue
        return addressOf(base.slice(1))
      }
      if (base[0] === 'app' && file === 'page') return addressOf(base.slice(1, -1))
      continue
    }
    if (root.kind === 'expo') {
      if (segments[0] !== 'app' || file.startsWith('_') || file.startsWith('+') || ext[1] === 'vue') continue
      return addressOf(segments.slice(1))
    }
    if (segments[0] === 'pages' && ext[1] === 'vue') return addressOf(segments.slice(1))
  }
  return null
}

/** A code name or an address word as people read it: "MinhasReservas" or "minhas-reservas" → "Minhas reservas". */
function words(raw: string): string {
  const text = raw
    .replace(/([a-zà-ÿ0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b(Page|Screen|View|Pagina|Tela)\b/g, '')
    .trim()
    .toLowerCase()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

/** The name of a page as people read it: its screen's short title, else its component's name, else its address. */
export function pageNameOf(page: { path: string; title: string | null; component: string | null }, lang: 'pt' | 'en' = 'pt'): string {
  // A title of five words or more is a slogan ("Seu próximo ensaio começa aqui"), not the page's name.
  const title = page.title?.replace(/^[^\p{L}\p{N}]+/u, '').trim()
  if (title && title.split(/\s+/).length <= 4) return title
  const fromComponent = page.component ? words(page.component) : ''
  if (fromComponent) return fromComponent
  const last = page.path.split('/').filter((s) => s && !s.startsWith(':')).pop()
  if (last) return words(last)
  return lang === 'pt' ? 'Início' : 'Home'
}
