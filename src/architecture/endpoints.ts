/**
 * The HTTP routes a file declares, and the calls a front-end makes to them. Each framework's way of
 * writing a route is a small regex; a call (`fetch('/api/leads')`) is matched to a route by a shared
 * normal form, so `/api/leads/:id`, `/leads/{id}` and `/leads/${id}` all meet the same route.
 */
import { basenameOf, langOf, lineOf, stripComments } from './text'

export type RouteDef = { method: string; path: string; line: number }
export type CallDef = { method: string; url: string; line: number }

/** Keeps a route's path as the framework wrote it, with a leading slash. */
export function routePath(p: string): string {
  let s = p.trim().replace(/^\^/, '').replace(/\$$/, '').replace(/\$\{(\w+)\}/g, ':$1')
  if (!s.startsWith('/')) s = '/' + s
  return s.replace(/\/{2,}/g, '/')
}

/** Joins a controller's prefix and a method's path. */
function joinRoute(prefix: string, sub: string): string {
  const a = prefix.replace(/\/+$/, '')
  const b = sub.replace(/^\/+/, '')
  return routePath(b ? `${a}/${b}` : a || '/')
}

const isPathFile = (path: string) => /\.(tsx|jsx|vue|svelte)$/i.test(path)

/** Routes declared in a file. Front-end component files declare none. */
export function endpointsOf(path: string, text: string): RouteDef[] {
  const lang = langOf(path)
  if (!lang || isPathFile(path)) return []
  const code = stripComments(text, lang === 'py' || lang === 'rb' ? 'hash' : 'slash')
  const line = lineOf(code)
  const out: RouteDef[] = []
  const add = (method: string, p: string, at: number) => out.push({ method: method.toUpperCase(), path: routePath(p), line: line(at) })
  const name = basenameOf(path)

  if (lang === 'py') {
    // FastAPI and Flask: @app.get("/x"), @router.post("/x"), @bp.route("/x", methods=["POST"])
    for (const m of code.matchAll(/@\w+\.(get|post|put|patch|delete|route)\(\s*(['"])([^'"\n]*)\2([^)\n]*)\)/g)) {
      const at = m.index ?? 0
      if (m[1] !== 'route') {
        add(m[1], m[3], at)
        continue
      }
      const methods = /methods\s*=\s*\[([^\]]*)\]/.exec(m[4])
      const list = methods ? [...methods[1].matchAll(/['"](\w+)['"]/g)].map((x) => x[1]) : ['GET']
      for (const method of list) add(method, m[3], at)
    }
    if (name === 'urls.py') {
      // Django: path('leads/', views.leads) and DRF's router.register(r'leads', …) → any method.
      for (const m of code.matchAll(/\bre_?path\(\s*r?(['"])([^'"\n]*)\1|\bpath\(\s*r?(['"])([^'"\n]*)\3\s*,/g)) {
        add('ANY', m[2] ?? m[4] ?? '', m.index ?? 0)
      }
      for (const m of code.matchAll(/\.register\(\s*r?(['"])([^'"\n]*)\1/g)) {
        const p = m[2].replace(/\/?$/, '/')
        add('ANY', p, m.index ?? 0)
      }
    }
  }

  if (lang === 'rb' && name === 'routes.rb') {
    for (const m of code.matchAll(/^[ \t]*resources\s+:(\w+)/gm)) add('ANY', m[1], m.index ?? 0)
    for (const m of code.matchAll(/^[ \t]*(get|post|put|patch|delete)\s+['"]([^'"\n]+)['"]/gm)) add(m[1], m[2], m.index ?? 0)
  }

  if (lang === 'php') {
    for (const m of code.matchAll(/\bRoute::(get|post|put|patch|delete|any)\(\s*(['"])([^'"\n]*)\2/g)) {
      add(m[1] === 'any' ? 'ANY' : m[1], m[3], m.index ?? 0)
    }
  }

  if (lang === 'jvm' && /Mapping\b/.test(code)) {
    // Spring: a class-level @RequestMapping is a prefix for the method mappings after it.
    let prefix = ''
    for (const m of code.matchAll(/@(RequestMapping|GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping)(\([^)\n]*\))?/g)) {
      const args = m[2] ?? ''
      const first = /"([^"\n]*)"/.exec(args)?.[1] ?? ''
      const at = m.index ?? 0
      if (m[1] === 'RequestMapping') {
        const after = code.slice(at + m[0].length, at + m[0].length + 300)
        if (/^\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:public\s+|abstract\s+|final\s+)*(class|interface)\b/.test(after)) {
          prefix = first
          continue
        }
        const method = /RequestMethod\.(\w+)/.exec(args)?.[1] ?? 'ANY'
        add(method, joinRoute(prefix, first), at)
        continue
      }
      const method = m[1].replace('Mapping', '').toUpperCase()
      add(method, joinRoute(prefix, first), at)
    }
  }

  if (lang === 'js' && code.includes('@Controller')) {
    // NestJS: @Controller('leads') on the class, @Get(':id') on the methods.
    let prefix = ''
    for (const m of code.matchAll(/@(Controller|Get|Post|Put|Patch|Delete|All)\b(\(([^)\n]*)\))?/g)) {
      const arg = /(['"])([^'"\n]*)\1/.exec(m[3] ?? '')?.[2] ?? ''
      const at = m.index ?? 0
      if (m[1] === 'Controller') {
        prefix = arg
        continue
      }
      add(m[1] === 'All' ? 'ANY' : m[1], joinRoute(prefix, arg), at)
    }
  }

  if (lang === 'js') {
    // Express, Fastify, Hono, Koa. `api.` only counts in files that really start a server.
    const server = /express\(|Router\(|new Hono|fastify\(|new Koa|createServer\(|listen\(/.test(code)
    // Receivers named like `app`, `router`, `leadsRouter`, `apiRouter`; `api` only when the file starts a server.
    const names = server ? '[\\w$]*(?:[Rr]outer|[Rr]outes?|[Aa]pp|[Ss]erver|[Aa]pi)|r|fastify|hono|koa' : '[\\w$]*(?:[Rr]outer|[Rr]outes?|[Aa]pp|[Ss]erver)|r|fastify|hono|koa'
    const re = new RegExp(`\\b(?:${names})\\.(get|post|put|patch|delete|all)\\(\\s*(['"\`])([^'"\`\\n]*)\\2`, 'g')
    for (const m of code.matchAll(re)) add(m[1] === 'all' ? 'ANY' : m[1], m[3], m.index ?? 0)

    // Next.js pages/api and app-router route.ts files: the path comes from the file path.
    const pages = /(^|\/)pages\/api\/(.+)\.(ts|tsx|js|jsx|mjs)$/.exec(path)
    if (pages) {
      const rest = pages[2].replace(/(^|\/)index$/, '')
      add('ANY', '/api/' + rest, 0)
    }
    const app = /(^|\/)app\/((?:.*\/)?)route\.(ts|tsx|js|jsx|mjs)$/.exec(path)
    if (app) {
      const segs = app[2].split('/').filter((s) => s && !/^\(.*\)$/.test(s))
      const base = '/' + segs.join('/')
      const methods = [...code.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)]
      if (methods.length) for (const m of methods) add(m[1], base, m.index ?? 0)
      else add('ANY', base, 0)
    }
    // Vercel: api/**/*.ts at the root of the repo.
    const vercel = /^api\/(.+)\.(ts|js|mjs)$/.exec(path)
    if (vercel && !pages) {
      const rest = vercel[1].replace(/(^|\/)index$/, '')
      const methods = [...code.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)]
      const base = '/api/' + rest
      if (methods.length) for (const m of methods) add(m[1], base, m.index ?? 0)
      else add('ANY', base, 0)
    }
  }

  // Deduplicate the same route found twice (a Next.js file can match two rules).
  const seen = new Set<string>()
  return out.filter((r) => {
    const key = `${r.method} ${r.path} ${r.line}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** The HTTP calls a front-end file makes: fetch, $fetch, useFetch and axios-style client methods. */
export function callsOf(path: string, text: string): CallDef[] {
  if (langOf(path) !== 'js') return []
  const code = stripComments(text, 'slash')
  const line = lineOf(code)
  const out: CallDef[] = []
  const add = (method: string, raw: string, at: number) => {
    let url = raw.replace(/\$\{[^}]*\}/g, '{param}')
    url = url.replace(/^https?:\/\/[^/]+/, '')
    url = url.replace(/^\{param\}(?=\/)/, '')
    if (!url.startsWith('/')) return
    out.push({ method: method.toUpperCase(), url, line: line(at) })
  }
  for (const m of code.matchAll(/(?<![\w$.])(?:fetch|\$fetch|useFetch)\(\s*(?:(['"])([^'"\n]*)\1|`([^`\n]*)`)/g)) {
    const at = m.index ?? 0
    const window = code.slice(at, at + 300)
    const method = /method\s*:\s*['"](\w+)['"]/.exec(window)?.[1] ?? 'GET'
    add(method, m[2] ?? m[3] ?? '', at)
  }
  for (const m of code.matchAll(/\b(?:axios|api|http|apiClient|httpClient|client|request|\w+Api|\w+Client|\w+Http)\.(get|post|put|patch|delete)\(\s*(?:(['"])([^'"\n]*)\2|`([^`\n]*)`)/g)) {
    add(m[1], m[3] ?? m[4] ?? '', m.index ?? 0)
  }
  return out
}

/**
 * The normal form of a route or a call URL: origin, query and trailing slash removed, a leading
 * `/api` ignored, and every parameter (`:id`, `{id}`, `<int:id>`, `[id]`, `${id}`) turned into `{}`.
 */
export function routeKey(url: string): string {
  let s = url.replace(/^https?:\/\/[^/]+/, '').split(/[?#]/)[0]
  s = s.replace(/\/+$/, '')
  s = s.replace(/^\/api(?=\/|$)/, '')
  s = s.replace(/\$\{[^}]*\}|\{[^}]*\}|<[^>]*>|\[[^\]]*\]|:[A-Za-z_]\w*/g, '{}')
  return (s || '/').toLowerCase()
}

/**
 * The route a call goes to: the same method first, then a route for any method, then any route on
 * the same path. Null when no route has that path.
 */
export function matchCall<E extends { method: string; path: string }>(url: string, endpoints: E[], method?: string): E | null {
  const key = routeKey(url)
  const same = endpoints.filter((e) => routeKey(e.path) === key)
  if (same.length === 0) return null
  const m = (method ?? 'GET').toUpperCase()
  return same.find((e) => e.method === m) ?? same.find((e) => e.method === 'ANY') ?? same[0]
}
