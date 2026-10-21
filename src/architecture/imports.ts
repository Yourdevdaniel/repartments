/**
 * Finds what a file imports, in each language the analyser reads. Regexes over the code with its
 * comments blanked out, so a commented-out import never counts. Each import keeps the line it is on.
 *
 * Specs are returned as written (`crm.leads`, `./utils`, `@nestjs/core`, `.models` for Python's
 * relative imports). Turning them into files is `resolve.ts`'s job.
 */
import { langOf, lineOf, stripComments } from './text'

export type ImportRef = { spec: string; line: number }

const JS_PATTERNS: RegExp[] = [
  // import x from 'a', import {x} from "a" (also across lines), import type …, import 'a'
  /\bimport\s+(?:type\s+)?(?:[\w$*{}\s,]+?\s+from\s+)?['"]([^'"\n]+)['"]/g,
  // export * from 'a', export {x} from 'a'
  /\bexport\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*['"]([^'"\n]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
]

const IDENT = /^[A-Za-z_]\w*$/

/** The bare name of each item in an import list: "a as b, c" → ["a", "c"]. */
function importedNames(list: string): string[] {
  return list
    .replace(/[()]/g, ' ')
    .split(',')
    .map((p) => p.trim().split(/\s+as\s+/)[0].trim())
    .filter((n) => IDENT.test(n))
}

/** Every import of a file, deduplicated by spec and line. Unknown languages give nothing. */
export function importsOf(path: string, text: string): ImportRef[] {
  const lang = langOf(path)
  if (!lang) return []
  const code = stripComments(text, lang === 'js' || lang === 'go' || lang === 'jvm' || lang === 'cs' || lang === 'php' ? 'slash' : 'hash')
  const line = lineOf(code)
  const out: ImportRef[] = []
  const add = (spec: string, at: number) => {
    if (spec) out.push({ spec, line: line(at) })
  }

  if (lang === 'js') {
    for (const re of JS_PATTERNS) for (const m of code.matchAll(re)) add(m[1].trim(), m.index ?? 0)
  } else if (lang === 'py') {
    for (const m of code.matchAll(/^[ \t]*import[ \t]+([^\n]+)$/gm)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim()
        if (/^[A-Za-z_][\w.]*$/.test(name)) add(name, m.index ?? 0)
      }
    }
    for (const m of code.matchAll(/^[ \t]*from[ \t]+(\.*)([A-Za-z_][\w.]*)?[ \t]+import[ \t]+(\([^)]*\)|[^\n]*)/gm)) {
      const at = m.index ?? 0
      const dots = m[1]
      const module = dots + (m[2] ?? '')
      const names = importedNames(m[3])
      if (!m[2]) {
        // `from . import x` is the package's own module `x`, written `.x`.
        for (const n of names) add(dots + n, at)
        continue
      }
      add(module, at)
      for (const n of names) add(`${module}.${n}`, at)
    }
  } else if (lang === 'go') {
    for (const m of code.matchAll(/^[ \t]*import[ \t]+(?:[\w.]+[ \t]+)?"([^"\n]+)"/gm)) add(m[1], m.index ?? 0)
    for (const m of code.matchAll(/^[ \t]*import[ \t]*\(([\s\S]*?)\)/gm)) {
      const base = (m.index ?? 0) + m[0].indexOf('(') + 1
      for (const inner of m[1].matchAll(/"([^"\n]+)"/g)) add(inner[1], base + (inner.index ?? 0))
    }
  } else if (lang === 'jvm') {
    for (const m of code.matchAll(/^[ \t]*import[ \t]+(?:static[ \t]+)?([\w.]+(?:\.\*)?)/gm)) {
      add(m[1].replace(/\.\*$/, '').replace(/\.$/, ''), m.index ?? 0)
    }
  } else if (lang === 'rb') {
    for (const m of code.matchAll(/^[ \t]*require(_relative)?[ \t]*\(?[ \t]*['"]([^'"\n]+)['"]/gm)) {
      const name = m[2]
      const spec = m[1] ? (name.startsWith('.') ? name : './' + name) : name
      add(spec, m.index ?? 0)
    }
  } else if (lang === 'php') {
    for (const m of code.matchAll(/^[ \t]*(?:require_once|require|include_once|include)[ \t]*\(?[ \t]*['"]([^'"\n]+)['"]/gm)) add(m[1], m.index ?? 0)
    for (const m of code.matchAll(/^[ \t]*use[ \t]+([\w\\]+)(?:[ \t]+as[ \t]+\w+)?[ \t]*;/gm)) add(m[1].replace(/\\/g, '/'), m.index ?? 0)
  } else if (lang === 'cs') {
    for (const m of code.matchAll(/^[ \t]*using[ \t]+(?:static[ \t]+)?([\w.]+)[ \t]*;/gm)) add(m[1], m.index ?? 0)
  }

  const seen = new Set<string>()
  return out.filter((r) => {
    const key = `${r.spec}\u0000${r.line}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
