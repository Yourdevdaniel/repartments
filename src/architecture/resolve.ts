/**
 * Turns an import spec into a file of the repo, a package from outside it, or nothing (the standard
 * library, a generated file, something the analyser can't follow). Every language has its own rules
 * but they all answer through the same `Resolver`, and nothing here reads the network.
 */
import { dirOf } from '../shared/components'
import { basenameOf, langOf, stripComments } from './text'

export type Resolution = { file: string } | { package: string } | null
export type Resolver = (fromPath: string, spec: string) => Resolution

const JS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte']

const NODE_BUILTINS = new Set(
  'assert buffer child_process cluster console constants crypto dgram dns domain events fs http http2 https module net os path perf_hooks process punycode querystring readline repl stream string_decoder sys timers tls tty url util v8 vm worker_threads zlib test'.split(' '),
)

const STDLIB_PY = new Set(
  'os sys json re typing datetime logging asyncio time math random collections functools itertools pathlib subprocess uuid enum dataclasses abc io csv hashlib hmac base64 urllib http socket threading multiprocessing unittest string textwrap shutil tempfile glob copy pickle sqlite3 traceback warnings inspect contextlib decimal fractions statistics secrets argparse configparser email smtplib ssl zipfile tarfile gzip struct array queue heapq bisect operator weakref types importlib platform signal select codecs locale getpass pprint html xml unicodedata calendar numbers cmath timeit doctest ast dis __future__ builtins'.split(
    ' ',
  ),
)

/** Normalises a repo path: drops `.` and empty segments and resolves `..`. */
export function normalizePath(p: string): string {
  const stack: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') stack.pop()
    else stack.push(seg)
  }
  return stack.join('/')
}

/** Joins a folder and a relative path, normalised. */
function join(dir: string, rel: string): string {
  return normalizePath(dir ? `${dir}/${rel}` : rel)
}

/** The package a bare JS specifier belongs to: `@nestjs/core/x` → `@nestjs/core`, `lodash/fp` → `lodash`. */
function jsPackageName(spec: string): string {
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/')
  return spec.split('/')[0]
}

/** Parses a tsconfig-style file: comments and trailing commas are tolerated; a bad file gives null. */
function parseJsonLoose(text: string): Record<string, unknown> | null {
  try {
    const cleaned = stripComments(text, 'slash').replace(/,(\s*[}\]])/g, '$1')
    const value: unknown = JSON.parse(cleaned)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

type Alias = { pattern: string; targets: string[] }
type JsConfig = { dir: string; base: string | null; aliases: Alias[] }

function jsConfigsOf(paths: string[], files: Map<string, string>): JsConfig[] {
  const out: JsConfig[] = []
  for (const path of paths) {
    const name = basenameOf(path)
    if (name !== 'tsconfig.json' && name !== 'jsconfig.json') continue
    const text = files.get(path)
    if (text === undefined) continue
    const json = parseJsonLoose(text)
    const options = (json?.compilerOptions ?? {}) as Record<string, unknown>
    const dir = dirOf(path)
    const baseUrl = typeof options.baseUrl === 'string' ? options.baseUrl : null
    const base = join(dir, baseUrl ?? '.')
    const paths2 = options.paths && typeof options.paths === 'object' ? (options.paths as Record<string, unknown>) : {}
    const aliases: Alias[] = Object.entries(paths2)
      .map(([pattern, targets]) => ({
        pattern,
        targets: Array.isArray(targets) ? targets.filter((t): t is string => typeof t === 'string').map((t) => (base ? join(base, t) : t)) : [],
      }))
      .filter((a) => a.targets.length > 0)
      .sort((a, b) => b.pattern.length - a.pattern.length)
    out.push({ dir, base: baseUrl === null ? null : base, aliases })
  }
  return out
}

/** Builds the resolver for one repo. `paths` are every file in the tree; `files` the ones read. */
export function createResolver(paths: string[], files: Map<string, string>): Resolver {
  const set = new Set(paths)
  const configs = jsConfigsOf(paths, files)

  // Python: every dotted suffix of every module path, so `crm.leads.views` finds `backend/crm/leads/views.py`.
  const pyIndex = new Map<string, string[]>()
  const localNames = new Set<string>()
  for (const p of paths) {
    if (!p.endsWith('.py')) continue
    let mod = p.slice(0, -3)
    if (mod.endsWith('/__init__')) mod = mod.slice(0, -'/__init__'.length)
    else if (mod === '__init__') continue
    const segs = mod.split('/').filter(Boolean)
    for (const s of segs) localNames.add(s)
    for (let i = 0; i < segs.length; i++) {
      const key = segs.slice(i).join('.')
      const list = pyIndex.get(key) ?? []
      list.push(p)
      pyIndex.set(key, list)
    }
  }

  // Go: the module path from go.mod, and the non-test files of each folder.
  let goModule: string | null = null
  for (const [path, text] of files) {
    if (basenameOf(path) !== 'go.mod') continue
    const m = /^module\s+(\S+)/m.exec(text)
    if (m) {
      goModule = m[1]
      break
    }
  }
  const goDirs = new Map<string, string[]>()
  for (const p of [...paths].sort()) {
    if (!p.endsWith('.go') || p.endsWith('_test.go')) continue
    const list = goDirs.get(dirOf(p)) ?? []
    list.push(p)
    goDirs.set(dirOf(p), list)
  }

  // Java and Kotlin: dotted names of the files, and of their folders (to recognise local packages).
  const jvmIndex = new Map<string, string>()
  const jvmPackages = new Set<string>()
  for (const p of paths) {
    if (!/\.(java|kt|scala)$/.test(p)) continue
    const segs = p.replace(/\.(java|kt|scala)$/, '').split('/')
    for (let i = 0; i < segs.length; i++) if (!jvmIndex.has(segs.slice(i).join('.'))) jvmIndex.set(segs.slice(i).join('.'), p)
    const dirSegs = segs.slice(0, -1)
    for (let i = 1; i <= dirSegs.length; i++) jvmPackages.add(dirSegs.slice(0, i).join('.'))
  }

  /** The first existing file among a base path and the given extensions and index files. */
  function fileCandidates(base: string, exts: string[], mapJs: boolean): string | null {
    const candidates: string[] = []
    if (set.has(base)) candidates.push(base)
    const js = mapJs ? /\.(m?js|cjs|jsx?)$/.exec(base) : null
    if (js) {
      const stem = base.slice(0, -js[0].length)
      for (const e of ['.ts', '.tsx', '.js', '.jsx']) candidates.push(stem + e)
    }
    for (const e of exts) candidates.push(base + e)
    for (const e of exts) candidates.push(`${base}/index${e}`)
    return candidates.find((c) => set.has(c)) ?? null
  }

  function jsAliasFile(from: string, spec: string): string | null {
    const dir = dirOf(from)
    const config = configs
      .filter((c) => c.dir === '' || dir === c.dir || dir.startsWith(c.dir + '/'))
      .sort((a, b) => b.dir.length - a.dir.length)[0]
    if (!config) return null
    for (const alias of config.aliases) {
      let rest: string | null = null
      if (alias.pattern.endsWith('*')) {
        const pre = alias.pattern.slice(0, -1)
        if (spec.startsWith(pre)) rest = spec.slice(pre.length)
      } else if (spec === alias.pattern) rest = ''
      if (rest === null) continue
      for (const target of alias.targets) {
        const found = fileCandidates(normalizePath(target.replace('*', rest)), JS_EXTS, true)
        if (found) return found
      }
    }
    if (config.base !== null) return fileCandidates(join(config.base, spec), JS_EXTS, true)
    return null
  }

  function jsResolve(from: string, spec: string): Resolution {
    if (/^[a-z]+:/i.test(spec)) return null
    if (spec === '.' || spec === '..' || spec.startsWith('./') || spec.startsWith('../')) {
      const found = fileCandidates(join(dirOf(from), spec), JS_EXTS, true)
      return found ? { file: found } : null
    }
    const alias = jsAliasFile(from, spec)
    if (alias) return { file: alias }
    if (spec.startsWith('@/') || spec.startsWith('~/')) {
      // Without a tsconfig, `@/x` usually means the `src` folder of the nearest project.
      const rest = spec.slice(2)
      const segs = dirOf(from).split('/').filter(Boolean)
      for (let i = segs.length; i >= 0; i--) {
        const found = fileCandidates(join(segs.slice(0, i).join('/'), `src/${rest}`), JS_EXTS, true)
        if (found) return { file: found }
      }
      return null
    }
    if (NODE_BUILTINS.has(spec) || NODE_BUILTINS.has(spec.split('/')[0])) return null
    return { package: jsPackageName(spec) }
  }

  function pyFileFor(p: string): string | null {
    const cands = p ? [`${p}.py`, `${p}/__init__.py`] : ['__init__.py']
    return cands.find((c) => set.has(c)) ?? null
  }

  function pyResolve(from: string, spec: string): Resolution {
    const dots = /^\.+/.exec(spec)?.[0].length ?? 0
    if (dots) {
      const rest = spec.slice(dots)
      let base = dirOf(from)
      for (let i = 1; i < dots; i++) base = dirOf(base)
      const parts = rest ? rest.split('.') : []
      for (let k = parts.length; k >= 0; k--) {
        const found = pyFileFor(join(base, parts.slice(0, k).join('/')))
        if (found) return { file: found }
      }
      return null
    }
    const parts = spec.split('.')
    const fromDir = dirOf(from)
    for (let k = parts.length; k >= 1; k--) {
      const hits = pyIndex.get(parts.slice(0, k).join('.'))
      if (hits?.length) return { file: bestByFolder(hits, fromDir) }
    }
    const top = parts[0]
    if (localNames.has(top) || STDLIB_PY.has(top)) return null
    return { package: top }
  }

  function goResolve(spec: string): Resolution {
    if (goModule && (spec === goModule || spec.startsWith(goModule + '/'))) {
      const rel = spec.slice(goModule.length).replace(/^\//, '')
      const file = goDirs.get(rel)?.[0]
      return file ? { file } : null
    }
    if (!spec.split('/')[0].includes('.')) return null
    return { package: spec }
  }

  function jvmResolve(spec: string): Resolution {
    const parts = spec.split('.')
    for (let k = parts.length; k >= 1; k--) {
      const hit = jvmIndex.get(parts.slice(0, k).join('.'))
      if (hit) return { file: hit }
    }
    if (/^(java|javax|kotlin|kotlinx|android|scala)\./.test(spec)) return null
    for (let k = parts.length; k >= 1; k--) if (jvmPackages.has(parts.slice(0, k).join('.'))) return null
    return { package: spec }
  }

  /** A file for a path written without its extension, looked up anywhere in the repo. */
  function suffixFile(rel: string, ext: string, caseless: boolean): string | null {
    const want = caseless ? (rel + ext).toLowerCase() : rel + ext
    for (const p of paths) {
      const have = caseless ? p.toLowerCase() : p
      if (have === want || have.endsWith('/' + want)) return p
    }
    return null
  }

  function rbResolve(from: string, spec: string): Resolution {
    if (spec.startsWith('./') || spec.startsWith('../')) {
      const found = fileCandidates(join(dirOf(from), spec), ['.rb'], false)
      return found ? { file: found } : null
    }
    const file = suffixFile(spec.replace(/\.rb$/, ''), '.rb', false)
    return file ? { file } : null
  }

  function phpResolve(from: string, spec: string): Resolution {
    if (spec.startsWith('./') || spec.startsWith('../')) {
      const found = fileCandidates(join(dirOf(from), spec), ['.php'], false)
      return found ? { file: found } : null
    }
    const file = suffixFile(spec.replace(/\.php$/, ''), '.php', true)
    return file ? { file } : null
  }

  /** Among candidate files, the one sharing the most leading folders with the importer (ties: shorter path). */
  function bestByFolder(hits: string[], fromDir: string): string {
    const from = fromDir.split('/').filter(Boolean)
    const score = (p: string) => {
      const dir = dirOf(p).split('/').filter(Boolean)
      let n = 0
      while (n < dir.length && n < from.length && dir[n] === from[n]) n++
      return n
    }
    return [...hits].sort((a, b) => score(b) - score(a) || a.length - b.length)[0]
  }

  return (from, spec) => {
    if (!spec) return null
    try {
      switch (langOf(from)) {
        case 'js':
          return jsResolve(from, spec)
        case 'py':
          return pyResolve(from, spec)
        case 'go':
          return goResolve(spec)
        case 'jvm':
          return jvmResolve(spec)
        case 'rb':
          return rbResolve(from, spec)
        case 'php':
          return phpResolve(from, spec)
        default:
          return null
      }
    } catch {
      return null
    }
  }
}
