/**
 * Small helpers shared by the analyser: code scanning without comments, line numbers, language
 * detection, and the little string tools every generated sentence needs (lists in both languages,
 * clipping to a length, names people can read).
 */

/** The language a file is written in, from its extension; null for anything the analyser doesn't read. */
export function langOf(path: string): 'js' | 'py' | 'go' | 'jvm' | 'rb' | 'php' | 'cs' | null {
  const m = /\.([a-z0-9]+)$/i.exec(path)
  switch (m?.[1].toLowerCase()) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
    case 'vue':
    case 'svelte':
      return 'js'
    case 'py':
      return 'py'
    case 'go':
      return 'go'
    case 'java':
    case 'kt':
      return 'jvm'
    case 'rb':
      return 'rb'
    case 'php':
      return 'php'
    case 'cs':
      return 'cs'
    default:
      return null
  }
}

/** The file name without its folder. */
export function basenameOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? path : path.slice(i + 1)
}

/**
 * Blanks out comments but keeps strings, so the regexes that follow never match inside a comment and
 * line numbers stay the same. `slash` is `//` and `/* *\/`; `hash` is Python and Ruby `#` (with
 * triple-quoted strings kept whole, since docstrings and prompts live there).
 */
export function stripComments(text: string, style: 'slash' | 'hash'): string {
  const out: string[] = []
  const n = text.length
  let i = 0
  const blank = (ch: string) => (ch === '\n' ? '\n' : ' ')
  while (i < n) {
    const c = text[i]
    const d = text[i + 1]
    if (style === 'slash' && c === '/' && d === '/') {
      while (i < n && text[i] !== '\n') out.push(blank(text[i++]))
      continue
    }
    if (style === 'slash' && c === '/' && d === '*') {
      out.push('  ')
      i += 2
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) out.push(blank(text[i++]))
      if (i < n) {
        out.push('  ')
        i += 2
      }
      continue
    }
    if (style === 'hash' && c === '#') {
      while (i < n && text[i] !== '\n') out.push(blank(text[i++]))
      continue
    }
    if (c === '"' || c === "'" || (style === 'slash' && c === '`')) {
      const triple = style === 'hash' && text.startsWith(c.repeat(3), i)
      if (triple) {
        const end = text.indexOf(c.repeat(3), i + 3)
        const stop = end < 0 ? n : end + 3
        out.push(text.slice(i, stop))
        i = stop
        continue
      }
      let j = i + 1
      while (j < n && text[j] !== c) {
        if (text[j] === '\\') {
          j += 2
          continue
        }
        // Ordinary quotes end at the line; only template literals and triple quotes span lines.
        if (c !== '`' && text[j] === '\n') break
        j++
      }
      const end = j < n && text[j] === c ? j + 1 : j
      out.push(text.slice(i, end))
      i = end
      continue
    }
    out.push(c)
    i++
  }
  return out.join('')
}

/** A function from a character index to its 1-based line number, with the newlines indexed once. */
export function lineOf(text: string): (index: number) => number {
  const starts: number[] = []
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i)
  return (index: number) => {
    let lo = 0
    let hi = starts.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (starts[mid] < index) lo = mid + 1
      else hi = mid
    }
    return lo + 1
  }
}

/** Joins items as a list in the language: "a, b e c" or "a, b and c". */
export function joinList(items: string[], lang: 'pt' | 'en'): string {
  const xs = items.filter(Boolean)
  if (xs.length <= 1) return xs[0] ?? ''
  return xs.slice(0, -1).join(', ') + (lang === 'pt' ? ' e ' : ' and ') + xs[xs.length - 1]
}

/** Collapses whitespace and cuts at a word boundary with "…" when longer than `max`. */
export function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  const base = space > max * 0.5 ? cut.slice(0, space) : cut
  return base.replace(/[\s,;:.]+$/, '') + '…'
}

/** The first sentence of a text, clipped to `max` characters. */
export function firstSentence(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  const m = /^.*?[.!?](?=\s|$)/.exec(t)
  return clip(m ? m[0] : t, max)
}

/** "payment_flow-v2" → "Payment Flow V2". Keeps the letters the code used. */
export function titleWords(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

/** Upper-cases the first letter. */
export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** A URL-safe id: "Banco de dados" → "banco-de-dados". */
export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** "1 parte" / "9 partes". */
export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
