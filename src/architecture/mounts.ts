/**
 * Route lists mounted under a prefix in another file: FastAPI's `include_router(x.router, prefix=…)`,
 * Flask's `register_blueprint(bp, url_prefix=…)`, Express's `app.use('/api', router)` and Django's
 * `path('api/', include('app.urls'))`. A route declared as `@router.get("")` in a file mounted at
 * "/articles" is "/articles", and only the file that mounts it says so.
 *
 * `mountsOf` reads one file; `index.ts` resolves each mount to a file through the imports, and
 * `prefixesOf` joins the prefixes along the chain (main mounts api at "/api", api mounts articles at
 * "/articles": articles' routes are under "/api/articles").
 */
import { langOf, lineOf, stripComments } from './text'

/**
 * A list of routes mounted under a prefix: by the name the file uses for it, or by its module (Django,
 * Go). In Go the routes are those a function of that package registers on the group it is given (`func`).
 */
export type Mount = { prefix: string; line: number; name: string | null; spec: string | null; func?: string }

/** A mount prefix as an address: "^api/" → "/api", "/users/" → "/users", "" stays "". */
function prefixOf(raw: string): string {
  const p = raw.replace(/^\^/, '').replace(/\$$/, '').replace(/\/\?$/, '/').replace(/\/+$/, '').replace(/^\/+/, '')
  return p ? `/${p}` : ''
}

/** The text of a call's arguments, from the parenthesis that opens at `open` to the one that closes it. */
function argsAt(code: string, open: number): string {
  let depth = 0
  for (let i = open; i < code.length && i < open + 400; i++) {
    if (code[i] === '(') depth++
    else if (code[i] === ')' && --depth === 0) return code.slice(open + 1, i)
  }
  return code.slice(open + 1, open + 400)
}

/** The mounts a file declares. */
export function mountsOf(path: string, text: string): Mount[] {
  const lang = langOf(path)
  if (lang === 'go') return goMounts(text)
  if (lang !== 'py' && lang !== 'js') return []
  const code = stripComments(text, lang === 'py' ? 'hash' : 'slash')
  const line = lineOf(code)
  const out: Mount[] = []
  if (lang === 'py') {
    for (const m of code.matchAll(/\.(include_router|register_blueprint)\s*\(/g)) {
      const at = m.index ?? 0
      const args = argsAt(code, at + m[0].length - 1)
      const name = /^\s*([A-Za-z_][\w.]*)/.exec(args)?.[1]
      if (!name) continue
      const prefix = /\b(?:prefix|url_prefix)\s*=\s*(['"])([^'"]*)\1/.exec(args)?.[2] ?? ''
      out.push({ prefix: prefixOf(prefix), line: line(at), name, spec: null })
    }
    for (const m of code.matchAll(/\b(?:re_path|path|url)\(\s*r?(['"])([^'"]*)\1\s*,\s*include\(\s*(?:(['"])([^'"]+)\3|\(\s*(['"])([^'"]+)\5)/g)) {
      out.push({ prefix: prefixOf(m[2]), line: line(m.index ?? 0), name: null, spec: m[4] ?? m[6] })
    }
  } else {
    for (const m of code.matchAll(/\b[\w$]+\.use\(\s*(['"`])([^'"`]+)\1\s*,\s*(?:require\(\s*['"]([^'"]+)['"]\s*\)|([\w$.]+))\s*[,)]/g)) {
      out.push({ prefix: prefixOf(m[2]), line: line(m.index ?? 0), name: m[4] ?? null, spec: m[3] ?? null })
    }
  }
  return out
}

/**
 * Go: `users.UsersRegister(v1.Group("/users"))` hands a group to a function of another package, which
 * registers its routes on it. The group's prefix joins those of the groups it is made from in this file.
 */
function goMounts(text: string): Mount[] {
  const code = stripComments(text, 'slash')
  const line = lineOf(code)
  const imports = new Map<string, string>()
  for (const m of code.matchAll(/^\s*(?:import\s+)?(?:(\w+)\s+)?"([^"\n]+)"/gm)) imports.set(m[1] ?? m[2].split('/').pop() ?? '', m[2])
  const groups = new Map<string, string>()
  for (const m of code.matchAll(/\b(\w+)\s*:?=\s*(\w+)\.Group\(\s*"([^"]*)"/g)) groups.set(m[1], (groups.get(m[2]) ?? '') + prefixOf(m[3]))
  const out: Mount[] = []
  for (const m of code.matchAll(/\b(\w+)\.(\w+)\(\s*(\w+)\.Group\(\s*"([^"]*)"\s*\)\s*\)/g)) {
    const spec = imports.get(m[1])
    if (spec) out.push({ prefix: (groups.get(m[3]) ?? '') + prefixOf(m[4]), line: line(m.index ?? 0), name: null, spec, func: m[2] })
  }
  return out
}

/**
 * What each name a Python file imports may be, most likely first: `from a.b import c` makes `c` the
 * module `a.b.c` or a name inside `a.b`; `import a.b as c` makes it `a.b`.
 */
export function pythonImportedNames(text: string): Map<string, string[]> {
  const code = stripComments(text, 'hash')
  const out = new Map<string, string[]>()
  for (const m of code.matchAll(/^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n]+)/gm)) {
    const base = m[1]
    for (const part of m[2].replace(/[()]/g, ' ').split(',')) {
      const [name, alias] = part.trim().split(/\s+as\s+/)
      if (!/^\w+$/.test(name ?? '')) continue
      const joined = base.endsWith('.') ? `${base}${name}` : `${base}.${name}`
      out.set((alias ?? name).trim(), [joined, base])
    }
  }
  for (const m of code.matchAll(/^[ \t]*import[ \t]+([\w.]+)[ \t]+as[ \t]+(\w+)/gm)) out.set(m[2], [m[1]])
  return out
}

/** The prefix of each mounted file, joined along the chain from the files nobody mounts. A cycle stops. */
export function prefixesOf(targets: Map<string, { prefix: string; file: string }[]>): Map<string, string> {
  const mounted = new Set([...targets.values()].flat().map((t) => t.file))
  const out = new Map<string, string>()
  const walk = (file: string, prefix: string, seen: Set<string>) => {
    for (const t of targets.get(file) ?? []) {
      if (seen.has(t.file) || out.has(t.file)) continue
      const joined = `${prefix}${t.prefix}`
      out.set(t.file, joined)
      walk(t.file, joined, new Set([...seen, t.file]))
    }
  }
  for (const file of targets.keys()) if (!mounted.has(file)) walk(file, '', new Set([file]))
  return out
}
