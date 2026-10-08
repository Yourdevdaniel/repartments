/**
 * What a repo does for the people who use it, in its own words: the README's opening sentence and its
 * list of features, the buttons on its screens and the commands it answers (a bot's `/start`, a
 * command-line tool's `import`). The architecture alone can't say that a page draws a binary tree
 * step by step; the author's README and the app's own button labels can.
 *
 * Everything is read, never guessed: a feature exists because a README section lists it, a button
 * shows its label or a command is registered in the code. Labels and descriptions keep the author's
 * wording and language; only markdown, emoji and leftover punctuation are taken off.
 */
import { basenameOf, clip, firstSentence, lineOf } from './text'

/** One thing a person can do with the system. */
export type Feature = {
  /** Its name in the repo ("Passo a passo", "/start", "Importar"), without markdown or emoji; null for a feature told in one sentence. */
  label: string | null
  /** What it does, in the author's words: a sentence from the README or a command's help. */
  detail: string | null
  /** How the person reaches it: a button on a screen, a command they type, or a README line. */
  via: 'button' | 'command' | 'readme'
  /** Where the button or command is in the code. */
  ref: { file: string; line: number } | null
}

/** The README at the root, read along with the code. */
export const README = /^readme(\.[a-z]+)?\.md$/i

/** Most features a scene tells. */
export const MAX_FEATURES = 6

/** A label longer than this is a sentence, not a name. */
const LABEL_MAX = 48
const DETAIL_MAX = 110

/** README sections that list what the system does (and not how to install or run it). */
const FEATURE_HEADING = /funcionalidade|recursos|features?\b|como usar|modo de usar|\busage\b|how to use|what it does|what'?s in it|o que (o site |o app |ele |a ferramenta )?(vai )?faz(er)?\b|o que d[áa] (pra|para) fazer|capabilit|destaques|highlights/i
const SETUP_HEADING = /instala|install|rodar|run\b|running|setup|deploy|tecnologia|stack|estrutura|structure|licen|contrib|requisit|test/i

/** Buttons that move around rather than do something: never a feature. */
const NOISE = new Set(
  'ok cancel cancelar fechar close voltar back sair exit logout menu x sim nao não yes no anterior proximo próximo previous next prev mais menos more less ver ver mais see more open abrir'.split(' '),
)

/** Lower case, no accents, no symbols: how two labels are compared. */
export function keyOf(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, ' ')
    .trim()
}

/** Markdown down to its words: links, images, emphasis, code and HTML tags out. */
function plainMarkdown(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])[*_](\S[^*_]*?)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A label as it reads in a caption: no emoji or arrows in front, no colon or period after. */
export function cleanLabel(s: string): string {
  let label = plainMarkdown(s)
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/^[^\p{L}\p{N}/(]+/u, '')
    .replace(/[\s:;,.!—–-]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
  // "(bolinha no topo)" alone reads better without its brackets.
  if (/^\(.*\)$/.test(label)) label = label.slice(1, -1).trim()
  return label
}

function hasWords(s: string): boolean {
  return /\p{L}{2,}/u.test(s)
}

/** "**Label:** what it does", "**Label.** what it does", "**Label** — what it does", "Label: what it does". */
function splitLabel(text: string): { label: string | null; detail: string | null } {
  const bold = /^\s*(\*\*|__)(.+?)\1\s*[:.—–-]?\s*(.*)$/.exec(text)
  if (bold) {
    let label = cleanLabel(bold[2])
    let rest = plainMarkdown(bold[3])
    // "**Customer** (no account needed): picks a table…": the brackets belong to the name.
    const aside = /^\(([^)]{1,40})\)\s*[:—–-]\s*(.*)$/.exec(rest)
    if (aside) {
      label = `${label} (${aside[1]})`
      rest = aside[2]
    }
    if (label && label.length <= LABEL_MAX) return { label, detail: rest && hasWords(rest) ? firstSentence(rest, DETAIL_MAX) : null }
  }
  const plain = plainMarkdown(text)
  const colon = /^([^:]{2,40}):\s+(.+)$/.exec(plain)
  if (colon && !/https?$/i.test(colon[1])) return { label: cleanLabel(colon[1]), detail: firstSentence(colon[2], DETAIL_MAX) }
  return { label: null, detail: firstSentence(plain, DETAIL_MAX) }
}

/** The README's opening sentence and the features its sections list. */
export function readmeOf(text: string): { about: string | null; features: Feature[] } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let fence = false
  // Blocks of the document: headings, list items and paragraphs, with the heading they sit under.
  type Block = { kind: 'heading'; level: number; text: string } | { kind: 'item' | 'para' | 'row'; text: string; heading: { level: number; text: string } | null; firstH2Seen: boolean }
  const blocks: Block[] = []
  let heading: { level: number; text: string } | null = null
  let firstH2Seen = false
  let para: string[] = []
  // 0 outside a table; 1 once its header's separator line has passed.
  let tableRow = 0
  const flush = () => {
    if (para.length) blocks.push({ kind: 'para', text: para.join(' '), heading, firstH2Seen })
    para = []
  }
  for (const raw of lines) {
    if (/^\s*(```|~~~)/.test(raw)) {
      flush()
      fence = !fence
      continue
    }
    if (fence) continue
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw)
    if (h) {
      flush()
      heading = { level: h[1].length, text: plainMarkdown(h[2]) }
      if (h[1].length >= 2) firstH2Seen = true
      blocks.push({ kind: 'heading', level: h[1].length, text: heading.text })
      continue
    }
    const item = /^ {0,1}[-*+]\s+(.*)$/.exec(raw)
    if (item) {
      flush()
      blocks.push({ kind: 'item', text: item[1], heading, firstH2Seen })
      continue
    }
    if (/^\s*\|/.test(raw)) {
      flush()
      // A table's rows after its header: "| Feature | … | What it does |".
      const cells = raw.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) tableRow = 1
      else if (tableRow > 0 && cells.length >= 2) blocks.push({ kind: 'row', text: `**${cells[0]}** — ${cells[cells.length - 1]}`, heading, firstH2Seen })
      continue
    }
    tableRow = 0
    if (!raw.trim() || /^\s*(>|<|!\[|\[!\[|---|___|\*\*\*)/.test(raw) || /^\s{2,}[-*+]\s/.test(raw)) {
      flush()
      continue
    }
    // A continuation line of a list item belongs to the item.
    const last = blocks[blocks.length - 1]
    if (!para.length && last && last.kind === 'item' && /^\s{2,}\S/.test(raw)) {
      last.text += ' ' + raw.trim()
      continue
    }
    para.push(raw.trim())
  }
  flush()

  // The opening sentence: the first real paragraph before the second-level sections.
  let about: string | null = null
  for (const b of blocks) {
    if (b.kind !== 'para') continue
    if (b.firstH2Seen) break
    const words = plainMarkdown(b.text)
    if (words.split(' ').length < 5 || !hasWords(words)) continue
    about = firstSentence(words, 220)
    break
  }

  const features: Feature[] = []
  const seen = new Set<string>()
  const add = (text: string) => {
    const { label, detail } = splitLabel(text)
    const key = keyOf(label ?? detail ?? '')
    if (!key || seen.has(key) || !hasWords(label ?? detail ?? '')) return
    seen.add(key)
    features.push({ label, detail, via: 'readme', ref: null })
  }
  const inFeatures = (h: { level: number; text: string } | null) => !!h && FEATURE_HEADING.test(h.text) && !SETUP_HEADING.test(h.text)
  for (const b of blocks) {
    if (b.kind === 'heading') continue
    if (inFeatures(b.heading)) {
      // Items, and paragraphs that open with a bold name ("**Limpa.** Tira os None…").
      if (b.kind === 'item' || b.kind === 'row' || /^\s*(\*\*|__)[^*_]{2,48}\1/.test(b.text)) add(b.text)
    } else if (!b.firstH2Seen && b.kind === 'item' && /^\s*(\*\*|__)/.test(b.text)) {
      // A README without a features section often lists them, in bold, right under its opening.
      add(b.text)
    }
  }
  return { about, features }
}

/** The page's own title, unless it is a template's default. */
export function htmlTitleOf(html: string): string | null {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html)
  if (!m) return null
  const title = m[1].replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
  if (!hasWords(title) || /^(vite|react|vue|svelte|angular|next|nuxt)\b.*\bapp\b|^(vite \+ \w+|react app|vite app|document|home|index|untitled|my app|app)$/i.test(title)) return null
  return title
}

/**
 * Where a tag's attributes end: the first `>` outside quotes and braces, so `onClick={() => go(1)}`
 * doesn't end the tag early.
 */
function attrsEnd(text: string, from: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = from; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'" || ch === '`') quote = ch
    else if (ch === '{') depth++
    else if (ch === '}') depth = Math.max(0, depth - 1)
    else if (ch === '>' && depth === 0) return i
  }
  return -1
}

/** Text inside a tag as the person sees it: expressions, inner tags and entities out. */
function visibleText(inner: string): string {
  let out = ''
  let depth = 0
  for (const ch of inner.replace(/\{\{[\s\S]*?\}\}/g, ' ')) {
    if (ch === '{') depth++
    else if (ch === '}') depth = Math.max(0, depth - 1)
    else if (depth === 0) out += ch
  }
  return out
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*["'\`]([^"'\`]*)["'\`]\\s*\\})`, 'i').exec(attrs)
  return m ? (m[1] ?? m[2] ?? m[3] ?? '').trim() : null
}

const CLICK = /(?:^|\s)(?:onClick|onclick|@click|v-on:click|\(click\)|on:click)\s*=/

/** The buttons (and clickable elements) of a screen file, with the label a person sees. */
export function buttonsOf(path: string, text: string): Feature[] {
  if (!/\.(jsx|tsx|vue|svelte|html?)$/i.test(path)) return []
  const out: Feature[] = []
  const line = lineOf(text)
  const tag = /<([a-zA-Z][\w-]*)\b/g
  let m: RegExpExecArray | null
  while ((m = tag.exec(text))) {
    const name = m[1].toLowerCase()
    const end = attrsEnd(text, tag.lastIndex)
    if (end < 0) break
    const attrs = text.slice(tag.lastIndex, end)
    const selfClosing = attrs.trimEnd().endsWith('/')
    const isButton = name === 'button' || /role\s*=\s*["']button["']/i.test(attrs) || CLICK.test(attrs) || (name === 'input' && /type\s*=\s*["'](button|submit)["']/i.test(attrs))
    if (!isButton) continue
    let label = ''
    if (name === 'input') label = attr(attrs, 'value') ?? ''
    else if (!selfClosing) {
      const close = text.toLowerCase().indexOf(`</${name}`, end)
      if (close > end && close - end < 2000) label = visibleText(text.slice(end + 1, close))
    }
    label = cleanLabel(label)
    if (!hasWords(label)) label = cleanLabel(attr(attrs, 'aria-label') ?? attr(attrs, 'title') ?? '')
    if (!hasWords(label) || label.length > LABEL_MAX || NOISE.has(keyOf(label))) continue
    out.push({ label, detail: null, via: 'button', ref: { file: path, line: line(m.index) } })
  }
  return out
}

/** Commands a bot answers or a command-line tool takes, with their help text when the code has it. */
export function commandsOf(path: string, text: string): Feature[] {
  if (!/\.(py|js|ts|mjs|cjs)$/i.test(path)) return []
  const out: Feature[] = []
  const line = lineOf(text)
  const bot = /telegram|telegraf|aiogram|discord|grammy/i.test(text)
  const push = (name: string, detail: string | null, index: number, slash: boolean) => {
    const label = slash ? `/${name.replace(/^\//, '')}` : name
    out.push({ label, detail: detail ? firstSentence(detail, DETAIL_MAX) : null, via: 'command', ref: { file: path, line: line(index) } })
  }
  const patterns: { re: RegExp; slash: boolean }[] = [
    // python-telegram-bot, aiogram, pyTelegramBotAPI
    { re: /CommandHandler\(\s*["'](\w+)["']/g, slash: true },
    { re: /Command\(\s*(?:commands\s*=\s*)?\[?\s*["'](\w+)["']/g, slash: true },
    { re: /message_handler\(\s*commands\s*=\s*\[\s*["'](\w+)["']/g, slash: true },
    // discord.py
    { re: /@\w+(?:\.tree)?\.(?:command|slash_command|hybrid_command)\(\s*name\s*=\s*["']([\w-]+)["'](?:[^)]*?description\s*=\s*["']([^"']+)["'])?/g, slash: true },
    // argparse sub-commands
    { re: /add_parser\(\s*["']([\w-]+)["'](?:[^)]*?help\s*=\s*["']([^"']+)["'])?/g, slash: false },
  ]
  for (const p of patterns) {
    let m: RegExpExecArray | null
    while ((m = p.re.exec(text))) push(m[1], m[2] ?? null, m.index, p.slash)
  }
  // Telegraf / commander / yargs: `.command('name')`, with `.description('…')` or a second argument.
  const js = /\.command\(\s*["'`]\/?([\w-]+)[^"'`]*["'`]\s*(?:,\s*["'`]([^"'`]+)["'`])?\s*\)(?:\s*\.description\(\s*["'`]([^"'`]+)["'`])?/g
  let c: RegExpExecArray | null
  while ((c = js.exec(text))) push(c[1], c[2] ?? c[3] ?? null, c.index, bot)
  // click / typer: the function's name and the first line of its docstring.
  const deco = /@\w+\.command\([^)]*\)\s*\n(?:\s*@[^\n]*\n)*\s*def\s+(\w+)\s*\([^)]*\)[^:]*:\s*\n\s*(?:"""|''')\s*([^\n]*)/g
  // A one-line docstring ends on the same line: its closing quotes aren't part of the help.
  while ((c = deco.exec(text))) push(c[1].replace(/_/g, '-'), c[2].replace(/\s*("""|''')\s*$/, '') || null, c.index, false)
  const seen = new Set<string>()
  return out.filter((f) => {
    const key = f.label ?? ''
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * The features to tell, best first: README features the code confirms (a button or command with the
 * same name), the rest of the README's list, then commands, then buttons. At most `MAX_FEATURES`.
 */
export function mergeFeatures(readme: Feature[], code: Feature[]): Feature[] {
  const byKey = new Map<string, Feature>()
  for (const f of code) if (f.label && !byKey.has(keyOf(f.label))) byKey.set(keyOf(f.label), f)
  const confirmed: Feature[] = []
  const told: Feature[] = []
  const used = new Set<string>()
  for (const f of readme) {
    const match = f.label ? byKey.get(keyOf(f.label)) : undefined
    if (match) {
      confirmed.push({ ...f, via: match.via, ref: match.ref, label: match.label })
      used.add(keyOf(match.label ?? ''))
    } else told.push(f)
  }
  const rest = [...code.filter((f) => f.via === 'command'), ...code.filter((f) => f.via === 'button')].filter((f) => {
    const key = keyOf(f.label ?? '')
    if (used.has(key)) return false
    used.add(key)
    return true
  })
  return [...confirmed, ...told, ...rest].slice(0, MAX_FEATURES)
}

/** The README among the read files, at the root (or the shallowest one). */
export function readmePath(paths: Iterable<string>): string | null {
  let best: string | null = null
  for (const p of paths) {
    if (!README.test(basenameOf(p))) continue
    if (best === null || p.split('/').length < best.split('/').length) best = p
  }
  return best
}

/** What the system is and what it lets people do, from its README, its pages and its code. */
export function featuresOf(files: Map<string, string>, description: string | null = null): { about: string | null; features: Feature[] } {
  const readme = readmePath(files.keys())
  const fromReadme = readme ? readmeOf(files.get(readme) ?? '') : { about: null, features: [] }
  const code: Feature[] = []
  let title: string | null = null
  const paths = [...files.keys()].sort((a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : 1))
  for (const p of paths) {
    const text = files.get(p) ?? ''
    try {
      if (/\.html?$/i.test(p) && title === null && basenameOf(p).toLowerCase() === 'index.html') title = htmlTitleOf(text)
      code.push(...commandsOf(p, text), ...buttonsOf(p, text))
    } catch {
      // A file that doesn't parse adds nothing.
    }
  }
  const about = fromReadme.about ?? (description?.trim() ? clip(description.trim(), 220) : null) ?? title
  return { about, features: mergeFeatures(fromReadme.features, code) }
}
