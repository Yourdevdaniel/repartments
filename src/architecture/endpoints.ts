/**
 * The HTTP routes a file declares, and the calls a front-end makes to them. Each framework's way of
 * writing a route is a small regex; a call (`fetch('/api/leads')`) is matched to a route by a shared
 * normal form, so `/api/leads/:id`, `/leads/{id}` and `/leads/${id}` all meet the same route.
 */
import { isTestPath } from './select'
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

/** Django's regex paths as plain paths: `^` and `$` go, `/?` becomes `/`, `(?P<name>…)` becomes `<name>`. */
function djangoPath(p: string): string {
  return p.replace(/^\^/, '').replace(/\$$/, '').replace(/\(\?P<(\w+)>[^)]*\)/g, '<$1>').replace(/\/\?/g, '/')
}

/** The actions `Route::resource` registers, in Laravel's order. `member` actions take the `{param}` segment. */
const RESOURCE_ACTIONS: { name: string; methods: string[]; member: boolean; suffix: string }[] = [
  { name: 'index', methods: ['GET'], member: false, suffix: '' },
  { name: 'create', methods: ['GET'], member: false, suffix: '/create' },
  { name: 'store', methods: ['POST'], member: false, suffix: '' },
  { name: 'show', methods: ['GET'], member: true, suffix: '' },
  { name: 'edit', methods: ['GET'], member: true, suffix: '/edit' },
  { name: 'update', methods: ['PUT', 'PATCH'], member: true, suffix: '' },
  { name: 'destroy', methods: ['DELETE'], member: true, suffix: '' },
]

/** The parameter a Laravel resource names after its last segment: `categories` -> `category`. A simple rule, not a full inflector. */
const singular = (word: string) => (/ies$/.test(word) ? word.replace(/ies$/, 'y') : word.replace(/s$/, ''))

/** The quoted names in a PHP array literal: `['put', 'patch']` -> ['put', 'patch']. */
const listOf = (s: string) => [...s.matchAll(/['"](\w+)['"]/g)].map((x) => x[1])

/** A Laravel route group with a prefix: the `{…}` body it covers, from `start` to `end` (offsets in the code). */
type PhpGroup = { start: number; end: number; prefix: string }

/** The prefixed groups of a Laravel file, outermost first. A group is `Route::group([... 'prefix' => …], fn)` or `Route::prefix(…)->…->group(fn)`. */
function phpGroups(code: string): PhpGroup[] {
  const groups: PhpGroup[] = []
  // Counting braces finds the closing `}`. Braces inside a string are balanced in route paths, so this holds in practice.
  const bodyEnd = (open: number) => {
    let depth = 0
    for (let i = open; i < code.length; i++) {
      if (code[i] === '{') depth++
      else if (code[i] === '}' && --depth === 0) return i
    }
    return code.length
  }
  const addGroup = (m: RegExpMatchArray, prefix: string) => {
    const start = (m.index ?? 0) + m[0].length - 1 // the match ends on the group's opening `{`
    groups.push({ start, end: bodyEnd(start), prefix })
  }
  for (const m of code.matchAll(/\bRoute::group\(\s*\[([^\n]*?)\]\s*,\s*function\s*\([^)]*\)\s*(?:use\s*\([^)]*\)\s*)?\{/g)) {
    const prefix = /['"]prefix['"]\s*=>\s*['"]([^'"\n]*)['"]/.exec(m[1])?.[1]
    if (prefix !== undefined) addGroup(m, prefix)
  }
  // Middleware and other calls may come before `prefix` or between it and `group`.
  for (const m of code.matchAll(/\bRoute::(?:\w+\([^()\n]*\)\s*->\s*)*prefix\(\s*(['"])([^'"\n]*)\1\s*\)(?:\s*->\s*\w+\([^()\n]*\))*\s*->\s*group\(\s*function\s*\([^)]*\)\s*(?:use\s*\([^)]*\)\s*)?\{/g)) {
    addGroup(m, m[2])
  }
  return groups.sort((a, b) => a.start - b.start)
}

/** An open Rails block: a `scope`/`namespace` prefix, a `resources`/`resource` with its name and param, or `collection`/`member`/other. */
type RbFrame = { kind: 'scope' | 'resources' | 'resource' | 'collection' | 'member' | 'other'; path?: string; base?: string; param?: string }

/** The words of a Rails list value: `[:index, :show]`, `%i[index show]`, `:index` -> index, show. */
const rbWords = (s: string): string[] => s.replace(/%[iIwW]?\[|[[\]]/g, ' ').match(/\w+/g) ?? []

/** The `only:`, `except:`, `param:`, `path:` and `on:` options of a Rails call, as their raw values. */
function rbOptions(args: string): Record<string, string> {
  const opts: Record<string, string> = {}
  for (const m of args.matchAll(/\b(only|except|param|path|on)\s*:\s*(%[iIwW]?\[[^\]]*\]|\[[^\]]*\]|'[^']*'|"[^"]*"|:\w+)/g)) opts[m[1]] = m[2]
  return opts
}

/** The path a Rails block sits at, from every block around it, outermost first. A resources block adds its member path, or its nested path when a child sits in its body. */
function rbCtx(stack: RbFrame[]): string {
  let p = ''
  stack.forEach((f, i) => {
    const next = stack[i + 1]?.kind
    if (f.kind === 'scope') p = joinRoute(p, f.path ?? '')
    else if (f.kind === 'resource') p = joinRoute(p, f.base ?? '')
    else if (f.kind === 'resources') {
      // A `collection do` block sits at the plain path; a `member do` block and a nested child sit under `:param`.
      if (next === 'collection') p = joinRoute(p, f.base ?? '')
      else if (next === 'member') p = joinRoute(p, `${f.base}/:${f.param}`)
      // A nested child takes the parent's singular and param: articles + slug -> `:article_slug`.
      else p = joinRoute(p, `${f.base}/:${singular(f.base ?? '')}_${f.param}`)
    }
  })
  return p
}

/** The actions `resources` registers, in Rails' order. `member` actions take the `:param` segment. */
const RB_RESOURCES_ACTIONS: { name: string; methods: string[]; member: boolean; suffix: string }[] = [
  { name: 'index', methods: ['GET'], member: false, suffix: '' },
  { name: 'create', methods: ['POST'], member: false, suffix: '' },
  { name: 'new', methods: ['GET'], member: false, suffix: '/new' },
  { name: 'show', methods: ['GET'], member: true, suffix: '' },
  { name: 'edit', methods: ['GET'], member: true, suffix: '/edit' },
  { name: 'update', methods: ['PATCH', 'PUT'], member: true, suffix: '' },
  { name: 'destroy', methods: ['DELETE'], member: true, suffix: '' },
]

/** The actions `resource` (singular) registers, in Rails' order: no index, and no id, so none is a member action. */
const RB_SINGLETON_ACTIONS = [
  { name: 'create', methods: ['POST'], member: false, suffix: '' },
  { name: 'new', methods: ['GET'], member: false, suffix: '/new' },
  { name: 'edit', methods: ['GET'], member: false, suffix: '/edit' },
  { name: 'show', methods: ['GET'], member: false, suffix: '' },
  { name: 'update', methods: ['PATCH', 'PUT'], member: false, suffix: '' },
  { name: 'destroy', methods: ['DELETE'], member: false, suffix: '' },
]

/**
 * One line of routes.rb, given the blocks open above it. `emit` gets each route's method and path.
 * Returns the block the line opens, if it opens one that matters, so the caller can push it.
 */
function rbLine(body: string, stack: RbFrame[], emit: (method: string, path: string) => void): RbFrame | null {
  const kw = /^(resources|resource|scope|namespace|collection|member|get|post|put|patch|delete)\b/.exec(body)
  if (!kw) return null
  const keyword = kw[1]
  const rest = body.slice(kw[0].length)
  const opts = rbOptions(rest)
  // The first `:symbol` or quoted string of the call, after the options are removed.
  const bare = rest.replace(/\b(only|except|param|path|on|module|controller|as)\s*:\s*(%[iIwW]?\[[^\]]*\]|\[[^\]]*\]|'[^']*'|"[^"]*"|:\w+)/g, '')
  const hasOwner = stack.some((f) => f.kind === 'resources' || f.kind === 'resource')

  if (keyword === 'resources' || keyword === 'resource') {
    // `resources :a, :b`: every name gets the same actions. A block over several names is not nested here.
    const names = [...bare.matchAll(/:(\w+)|['"](\w+)['"]/g)].map((m) => m[1] ?? m[2] ?? '')
    const param = opts.param ? rbWords(opts.param)[0] ?? 'id' : 'id'
    const only = opts.only !== undefined ? rbWords(opts.only) : undefined
    const except = opts.except !== undefined ? rbWords(opts.except) : undefined
    const here = rbCtx(stack)
    const singleton = keyword === 'resource'
    for (const base of names) {
      let actions = singleton ? RB_SINGLETON_ACTIONS : RB_RESOURCES_ACTIONS
      if (only) actions = actions.filter((a) => only.includes(a.name))
      if (except) actions = actions.filter((a) => !except.includes(a.name))
      for (const a of actions) {
        const p = a.member ? `${base}/:${param}${a.suffix}` : `${base}${a.suffix}`
        for (const method of a.methods) emit(method, joinRoute(here, p))
      }
    }
    if (names.length !== 1) return null
    return { kind: singleton ? 'resource' : 'resources', base: names[0], param }
  }

  if (keyword === 'scope' || keyword === 'namespace') {
    // `scope path: '/api'` or `scope '/api'`, `scope :api`; `namespace :admin` is the same. `module:` alone adds no path.
    const quoted = opts.path !== undefined ? /['"]([^'"]*)['"]/.exec(opts.path)?.[1] : undefined
    const first = /:(\w+)|['"]([^'"]*)['"]/.exec(bare)
    return { kind: 'scope', path: quoted ?? first?.[1] ?? first?.[2] ?? '' }
  }

  if (keyword === 'collection' || keyword === 'member') return { kind: keyword }

  // get/post/put/patch/delete. `on:` places it on the collection or member; a symbol needs that or a collection/member block.
  const v = /^(get|post|put|patch|delete)\s+(?::(\w+)|(['"])([^'"\n]+)\3)/.exec(body)
  if (!v) return null
  const on = /\bon:\s*:(\w+)/.exec(rest)?.[1]
  const top = stack[stack.length - 1]
  const inBlock = top?.kind === 'collection' || top?.kind === 'member'
  // A symbol route (`get :feed`) names a collection or member action, so it needs `on:` or a collection/member block, and a resources block around it.
  if (v[2] !== undefined && !hasOwner) return null
  if (v[2] !== undefined && !on && !inBlock) return null
  if (on !== undefined && (!hasOwner || (on !== 'collection' && on !== 'member'))) return null
  const frames: RbFrame[] = on === 'collection' || on === 'member' ? [...stack, { kind: on }] : stack
  emit(v[1].toUpperCase(), joinRoute(rbCtx(frames), v[2] ?? v[4] ?? ''))
  return null
}

/** Routes declared in a file. Front-end component files and test files declare none. */
export function endpointsOf(path: string, text: string): RouteDef[] {
  const lang = langOf(path)
  if (!lang || isPathFile(path) || isTestPath(path)) return []
  const code = stripComments(text, lang === 'py' || lang === 'rb' ? 'hash' : 'slash')
  const line = lineOf(code)
  const out: RouteDef[] = []
  const add = (method: string, p: string, at: number) => out.push({ method: method.toUpperCase(), path: routePath(p), line: line(at) })
  const name = basenameOf(path)

  if (lang === 'py') {
    // FastAPI and Flask: @app.get("/x"), @router.post("/x"), @bp.route("/x", methods=["POST"])
    // The arguments run to the ')' that ends the decorator, the one before the next decorator or the
    // `def`: a methods tuple `('POST',)` has parentheses of its own, and FastAPI's arguments often run
    // over several lines.
    for (const m of code.matchAll(/@\w+\.(get|post|put|patch|delete|route)\(\s*(['"])([^'"\n]*)\2([\s\S]*?)\)[ \t]*\r?\n\s*(?=@|(?:async\s+)?def\b)/g)) {
      const at = m.index ?? 0
      if (m[1] !== 'route') {
        add(m[1], m[3], at)
        continue
      }
      // Flask takes methods as a list or a tuple; without it the route answers GET only.
      const methods = /methods\s*=\s*[\[(]([^\])]*)[\])]/.exec(m[4])
      const list = methods ? [...methods[1].matchAll(/['"](\w+)['"]/g)].map((x) => x[1]) : ['GET']
      for (const method of list) add(method, m[3], at)
    }
    if (name === 'urls.py') {
      // Django: path('leads/', views.leads) and DRF's router.register(r'leads', …) → any method.
      // path('api/', include(…)) only mounts another list of routes, so it is not a route itself.
      // `url` is the older regex form of path, and re_path takes regexes too, so both get the same cleanup.
      for (const m of code.matchAll(/\b(?:re_?path|url|path)\(\s*r?(['"])([^'"\n]*)\1/g)) {
        const at = m.index ?? 0
        const after = code.slice(at + m[0].length, at + m[0].length + 40)
        if (/^\s*,?\s*include\s*\(/.test(after)) continue
        add('ANY', djangoPath(m[2]), at)
      }
      for (const m of code.matchAll(/\.register\(\s*r?(['"])([^'"\n]*)\1/g)) {
        const p = m[2].replace(/\/?$/, '/')
        add('ANY', p, m.index ?? 0)
      }
    }
  }

  if (lang === 'rb' && name === 'routes.rb') {
    // Rails nests by blocks: `resources :articles do` wraps the lines until its `end`. A stack of open blocks gives each line its path.
    const stack: RbFrame[] = []
    let off = 0
    for (const raw of code.split('\n')) {
      const at = off
      off += raw.length + 1
      const text = raw.trim()
      // Only `do` blocks are counted, so an `end` closes the innermost one. Other keywords are not in routes files.
      if (/^end\b/.test(text)) {
        stack.pop()
        continue
      }
      const doMatch = /\bdo(\s*\|[^|]*\|)?$/.exec(text)
      const body = doMatch ? text.slice(0, doMatch.index).trim() : text
      const frame = rbLine(body, stack, (method, p) => add(method, p, at))
      // A `do` line we do not know (Rails.application.routes.draw, constraints, defaults) still opens a block, with no prefix.
      if (doMatch) stack.push(frame ?? { kind: 'other' })
    }
  }

  if (lang === 'php') {
    // Routes are collected, then added in source order, so a resource and a plain route keep the order they were written in.
    const found: { method: string; path: string; at: number }[] = []
    for (const m of code.matchAll(/\bRoute::(get|post|put|patch|delete|any)\(\s*(['"])([^'"\n]*)\2/g)) {
      found.push({ method: m[1], path: m[3], at: m.index ?? 0 })
    }
    // Route::match(['put', 'patch'], 'user', …): one route per listed method.
    for (const m of code.matchAll(/\bRoute::match\(\s*\[([^\]\n]*)\]\s*,\s*(['"])([^'"\n]*)\2/g)) {
      for (const method of listOf(m[1])) found.push({ method, path: m[3], at: m.index ?? 0 })
    }
    // Route::resource and apiResource: one route per action, with the names and paths Laravel gives them.
    // The options run to the statement's `;`, since they are often written over several lines.
    for (const m of code.matchAll(/\bRoute::(resource|apiResource)\(\s*(['"])([^'"\n]*)\2\s*,\s*(['"])[^'"\n]*\4([^;]*)/g)) {
      const at = m.index ?? 0
      const base = m[3].replace(/^\/+|\/+$/g, '')
      const param = `{${singular(base.split('/').pop() ?? base)}}`
      // An apiResource leaves out create and edit, since an API has no forms to show.
      let actions = RESOURCE_ACTIONS.filter((a) => m[1] === 'resource' || (a.name !== 'create' && a.name !== 'edit'))
      // `only` and `except` come as an option array or as a chained call; `only` narrows first, then `except` drops more.
      const only = /(?:['"]only['"]\s*=>|->\s*only\s*\()\s*\[([^\]]*)\]/.exec(m[5])
      const except = /(?:['"]except['"]\s*=>|->\s*except\s*\()\s*\[([^\]]*)\]/.exec(m[5])
      if (only) {
        const keep = listOf(only[1])
        actions = actions.filter((a) => keep.includes(a.name))
      }
      if (except) {
        const drop = listOf(except[1])
        actions = actions.filter((a) => !drop.includes(a.name))
      }
      for (const a of actions) {
        const p = a.member ? `${base}/${param}${a.suffix}` : `${base}${a.suffix}`
        for (const method of a.methods) found.push({ method, path: p, at })
      }
    }
    // A route inherits the prefix of every group it sits inside, outermost first.
    const groups = phpGroups(code)
    found.sort((a, b) => a.at - b.at)
    for (const r of found) {
      let prefix = ''
      for (const g of groups) if (g.start < r.at && r.at < g.end) prefix = joinRoute(prefix, g.prefix)
      add(r.method, joinRoute(prefix, r.path), r.at)
    }
  }

  if (lang === 'jvm' && /Mapping\b/.test(code)) {
    // Spring: a class-level @RequestMapping is a prefix for the method mappings after it.
    let prefix = ''
    for (const m of code.matchAll(/@(RequestMapping|GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping)(\([^)\n]*\))?/g)) {
      const args = m[2] ?? ''
      // The path is path= or value= when named, else the first string literal.
      const first = /\b(?:path|value)\s*=\s*"([^"\n]*)"/.exec(args)?.[1] ?? /"([^"\n]*)"/.exec(args)?.[1] ?? ''
      const at = m.index ?? 0
      if (m[1] === 'RequestMapping') {
        const after = code.slice(at + m[0].length, at + m[0].length + 300)
        if (/^\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:public\s+|abstract\s+|final\s+)*(class|interface)\b/.test(after)) {
          prefix = first
          continue
        }
        // method = POST, method = RequestMethod.POST or method = {GET, POST}; no method means any method.
        const methodArg = /\bmethod\s*=\s*(\{[^}]*\}|[\w.]+)/.exec(args)?.[1] ?? ''
        const methods = [...methodArg.matchAll(/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\b/g)].map((x) => x[1])
        for (const method of methods.length ? methods : ['ANY']) add(method, joinRoute(prefix, first), at)
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

  if (lang === 'go') {
    // gin, echo, fiber and chi call a method on the router: `r.GET("/x", h)`, `r.Get("/x", h)`. Only a literal path followed by
    // a comma counts, since the handler always follows; that leaves out `c.Get("user")` and `m.GET(path, h)`.
    // A Go router path starts with `/` (or is empty), which keeps `params.Get("id")`-like values out.
    const plausible = (p: string) => p === '' || p.startsWith('/')
    type GoEv =
      | { at: number; kind: 'func' }
      | { at: number; kind: 'group'; name: string; recv: string; sub: string }
      | { at: number; kind: 'route'; recv: string; methods: string[]; path: string }
    const evs: GoEv[] = []
    // Each top-level func is its own scope: a parameter such as `r *gin.RouterGroup` must not pick up a group from another func.
    for (const m of code.matchAll(/^func\b/gm)) evs.push({ at: m.index ?? 0, kind: 'func' })
    // `v1 := r.Group("/api")` and `v1 = r.Group("/api")`: the group's routes take its prefix.
    for (const m of code.matchAll(/(?<![\w.])([A-Za-z_]\w*)\s*:?=\s*([A-Za-z_]\w*)\.Group\(\s*(["`])([^"`\n]*)\3/g)) {
      if (plausible(m[4])) evs.push({ at: m.index ?? 0, kind: 'group', name: m[1], recv: m[2], sub: m[4] })
    }
    for (const m of code.matchAll(/(?<![\w.])([A-Za-z_]\w*)\.(GET|POST|PUT|PATCH|DELETE|Get|Post|Put|Patch|Delete)\(\s*(["`])([^"`\n]*)\3\s*,/g)) {
      if (plausible(m[4])) evs.push({ at: m.index ?? 0, kind: 'route', recv: m[1], methods: [m[2].toUpperCase()], path: m[4] })
    }
    // gorilla/mux: `r.HandleFunc("/x", h).Methods("POST")`, the list may be on the next line. Without `.Methods` the route answers any method.
    // net/http's `http.HandleFunc` has no `.Methods` either, so it also reads as ANY.
    for (const m of code.matchAll(/(?<![\w.])([A-Za-z_]\w*)\.HandleFunc\(\s*(["`])([^"`\n]*)\2/g)) {
      if (!plausible(m[3])) continue
      const at = m.index ?? 0
      // The handler may hold parentheses of its own, like `http.HandlerFunc(f)`; `;` ends the statement.
      const tail = /^(?:[^\n()";]|\([^\n()]*\))*\)\s*\.Methods\(([^)\n]*)\)/.exec(code.slice(at + m[0].length, at + m[0].length + 300))
      // `http.MethodPost` is the constant form of "POST".
      const list = tail ? [...tail[1].matchAll(/"(\w+)"|\bhttp\.Method(\w+)/g)].map((x) => (x[1] ?? x[2]).toUpperCase()) : []
      evs.push({ at, kind: 'route', recv: m[1], methods: list.length ? list : ['ANY'], path: m[3] })
    }
    // Replayed in file order, so a route sees only the groups written above it, and a reassigned name takes its latest prefix.
    evs.sort((a, b) => a.at - b.at)
    const prefixOf = new Map<string, string>()
    for (const e of evs) {
      if (e.kind === 'func') prefixOf.clear()
      else if (e.kind === 'group') prefixOf.set(e.name, joinRoute(prefixOf.get(e.recv) ?? '', e.sub))
      else for (const method of e.methods) add(method, joinRoute(prefixOf.get(e.recv) ?? '', e.path), e.at)
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
  // `relative` is for an API client's own methods, whose paths may leave out the leading slash.
  const add = (method: string, raw: string, at: number, joined: boolean, relative: boolean) => {
    let url = raw.replace(/\$\{[^}]*\}/g, '{param}')
    url = url.replace(/^https?:\/\/[^/]+/, '')
    url = url.replace(/^\{param\}(?=\/)/, '')
    if (relative && /^[A-Za-z]/.test(url)) url = `/${url}`
    if (!url.startsWith('/')) return
    // '/articles/' + slug: the rest of the path is a parameter.
    if (joined) url = url.endsWith('/') ? `${url}{param}` : `${url}/{param}`
    out.push({ method: method.toUpperCase(), url, line: line(at) })
  }
  const URL_ARG = String.raw`\(\s*(?:(?<q>['"])([^'"\n]*)\k<q>|\x60([^\x60\n]*)\x60)(\s*\+)?`
  // fetch, and wrappers called the same way: api('/x', { method: 'POST' }).
  for (const m of code.matchAll(new RegExp(String.raw`(?<![\w$.])(?:fetch|\$fetch|useFetch|api|apiFetch|apiRequest|request|http|fetcher|callApi|fetchApi)` + URL_ARG, 'g'))) {
    const at = m.index ?? 0
    const window = code.slice(at, at + 300)
    const method = /method\s*:\s*['"](\w+)['"]/.exec(window)?.[1] ?? 'GET'
    add(method, m[2] ?? m[3] ?? '', at, !!m[4], false)
  }
  for (const m of code.matchAll(new RegExp(String.raw`\b(?:axios|api|http|apiClient|httpClient|client|request|requests|\w+Api|\w+Client|\w+Http|\w+Service)\.(get|post|put|patch|delete|del)` + URL_ARG, 'g'))) {
    add(m[1] === 'del' ? 'delete' : m[1], m[3] ?? m[4] ?? '', m.index ?? 0, !!m[5], true)
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
