/**
 * Facts the scenes can tell beyond the graph: the data a system keeps, what a screen shows, what a
 * request sends and what an e-mail says. They are read from the code's own words, following the
 * shapes the common frameworks use (Prisma, Django, SQLAlchemy, Mongoose, TypeORM, Sequelize, JSX and
 * templates), so a shape nobody wrote here yields nothing rather than a guess. Secrets, ids and
 * timestamps never leave this file.
 */
import { callsOf } from './endpoints'
import { singularWord } from './words'
import { joinList, lineOf, stripComments } from './text'

export type Lang = 'pt' | 'en'

/** A table or document the code describes, with the fields a reader needs. */
export type DataModel = { name: string; fields: string[]; line: number }

/** What a screen shows: its heading, its buttons and the fields it asks for. */
export type ScreenDetails = { title: string | null; buttons: string[]; fields: string[] }

/** The file that makes a front-end call to a route, and the fields that call sends. */
export type CallDetails = { file: string; sent: string[] }

/** Everything the scenes can say beyond the graph. Any part may be empty when the code shows nothing. */
export type FlowDetails = {
  models: DataModel[]
  /**
   * Front-end calls, keyed by the route they reach: "POST /leads". A route for any method (Django) is
   * keyed by the method the call uses, so "POST /contracts/" and "GET /contracts/" can both be there.
   */
  calls: Map<string, CallDetails>
  /** What each file's screen shows, with the screens it imports folded in. */
  screens: Map<string, ScreenDetails>
  /** E-mail subjects, keyed by component id. */
  subjects: Map<string, string[]>
  /** Names of the queues that workers take tasks from. */
  tasks: string[]
  /**
   * The pages a person opens, by the file of the screen each shows, and by the files of the pieces it
   * imports: the page's address, its name and its own file.
   */
  pages?: Map<string, { path: string; name: string; file: string }>
  /** Buttons that call a route: the screen's file, the button's words, the route reached and whether it asks to confirm. */
  actions?: ButtonCall[]
}

/** A button on a screen and the route it reaches, as the scenes use it. */
export type ButtonCall = { file: string; button: string; method: string; path: string; confirm: boolean }

/** Most items kept for one list of fields or buttons. */
const LIST_LIMIT = 6
/** A longer text is not a label anyone reads at a glance, so it is dropped. */
const TEXT_LIMIT = 40
/** Ids and timestamps: the reader never needs them. */
const SKIPPED = new Set(['id', 'createdat', 'updatedat', 'deletedat'])
/** Words that mark a field as a secret or a personal number; they are never shown. */
const SENSITIVE = new Set(['password', 'passwd', 'hash', 'salt', 'token', 'secret', 'otp', 'cpf', 'ssn', 'card'])
const SCALAR_FIELD = /^\s*(\w+)\s+(?:String|Int|Float|Boolean|DateTime|Decimal|BigInt|Json|Bytes)\b/
const SCREEN_EXTENSIONS = new Set(['tsx', 'jsx', 'vue', 'svelte', 'html'])

/** A plain .js file that is a React screen: it imports React and holds JSX ("src/components/Login.js"). */
function isJsxScreen(path: string, code: string): boolean {
  return /\.m?js$/i.test(path) && /\bfrom\s+['"]react(?:-native)?['"]|\bReact\./.test(code) && /<[A-Za-z][\w.]*[\s>/]/.test(code)
}

/** A file that draws a screen, by its extension or, for a plain .js file, by its content. */
function isScreen(path: string, code: string): boolean {
  return SCREEN_EXTENSIONS.has(extOf(path)) || isJsxScreen(path, code)
}
const SEND_OBJECT = /JSON\.stringify\s*\(\s*\{|\b(?:axios|api|http)\.(?:post|put|patch)\s*\([^,)]*,\s*\{/

const IRREGULAR_PLURALS = new Map([
  ['people', 'person'],
  ['men', 'man'],
  ['women', 'woman'],
  ['children', 'child'],
])

/** Queue task names, as the reader hears them. */
const TASKS = new Map([
  ['followup', { pt: 'de retorno', en: 'for follow-up' }],
  ['email', { pt: 'de e-mail', en: 'for e-mail' }],
  ['notification', { pt: 'de aviso', en: 'for notifications' }],
  ['report', { pt: 'de relatório', en: 'for reports' }],
  ['export', { pt: 'de exportação', en: 'for exports' }],
  ['import', { pt: 'de importação', en: 'for imports' }],
])

/** Single words of field names, in Portuguese. English keeps the words as they are. */
const WORDS = new Map([
  ['name', 'nome'],
  ['email', 'e-mail'],
  ['company', 'empresa'],
  ['phone', 'telefone'],
  ['address', 'endereço'],
  ['city', 'cidade'],
  ['state', 'estado'],
  ['country', 'país'],
  ['zip', 'CEP'],
  ['status', 'situação'],
  ['title', 'título'],
  ['description', 'descrição'],
  ['price', 'preço'],
  ['amount', 'valor'],
  ['value', 'valor'],
  ['total', 'total'],
  ['quantity', 'quantidade'],
  ['date', 'data'],
  ['notes', 'observações'],
  ['note', 'observação'],
  ['message', 'mensagem'],
  ['owner', 'responsável'],
  ['customer', 'cliente'],
  ['client', 'cliente'],
  ['user', 'usuário'],
  ['product', 'produto'],
  ['order', 'pedido'],
  ['deal', 'negócio'],
  ['stage', 'etapa'],
  ['source', 'origem'],
  ['type', 'tipo'],
  ['code', 'código'],
  ['category', 'categoria'],
  ['tag', 'etiqueta'],
  ['comment', 'comentário'],
  ['subject', 'assunto'],
  ['body', 'texto'],
  ['text', 'texto'],
  ['reason', 'motivo'],
  ['priority', 'prioridade'],
  ['due', 'vencimento'],
  ['deadline', 'prazo'],
  ['start', 'início'],
  ['end', 'fim'],
  ['time', 'hora'],
  ['duration', 'duração'],
  ['discount', 'desconto'],
  ['payment', 'pagamento'],
  ['plan', 'plano'],
  ['website', 'site'],
  ['budget', 'orçamento'],
  ['score', 'pontuação'],
  ['rating', 'avaliação'],
  ['level', 'nível'],
  ['language', 'idioma'],
  ['color', 'cor'],
  ['size', 'tamanho'],
  ['weight', 'peso'],
  ['file', 'arquivo'],
  ['image', 'imagem'],
  ['photo', 'foto'],
  ['document', 'documento'],
  ['number', 'número'],
  ['role', 'função'],
  ['team', 'equipe'],
  ['department', 'setor'],
  ['url', 'link'],
  ['username', 'nome de usuário'],
])

/** Whole phrases, checked before single words: "company name" is a phrase, not two words. */
const PHRASES = new Map([
  ['first name', 'nome'],
  ['last name', 'sobrenome'],
  ['full name', 'nome completo'],
  ['company name', 'nome da empresa'],
  ['contact name', 'nome do contato'],
  ['phone number', 'telefone'],
  ['zip code', 'CEP'],
  ['postal code', 'CEP'],
  ['birth date', 'data de nascimento'],
  ['created by', 'criado por'],
  ['updated by', 'atualizado por'],
  ['followed up at', 'data do retorno'],
  ['due date', 'data de vencimento'],
  ['email address', 'e-mail'],
  ['unit price', 'preço unitário'],
  ['total price', 'preço total'],
  ['last contact at', 'data do último contato'],
  ['user name', 'nome de usuário'],
])

function extOf(path: string): string {
  return /\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase() ?? ''
}

function idx(m: RegExpMatchArray): number {
  return m.index ?? 0
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Words of a name: "companyName", "company_name" and "company-name" all give company and name. */
function wordsOf(name: string): string[] {
  return name
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
}

/** A field a reader may see: not an id, not a timestamp, not a secret. */
function isPlainField(name: string): boolean {
  const words = wordsOf(name)
  if (SKIPPED.has(words.join(''))) return false
  return !words.some((w) => SENSITIVE.has(w)) && !words.join('').includes('apikey')
}

function plainFields(names: string[]): string[] {
  const out: string[] = []
  for (const n of names) if (isPlainField(n) && !out.includes(n) && out.length < LIST_LIMIT) out.push(n)
  return out
}

function addUnique(list: string[], value: string | null | undefined): void {
  if (value && !list.includes(value) && list.length < LIST_LIMIT) list.push(value)
}

/** A label, placeholder or button text that is plain words: no expressions, no markup, not too long. */
function literal(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null) return null
  const t = raw.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t || t.length > TEXT_LIMIT || /[{}<>]/.test(t)) return null
  return t
}

/**
 * The words of a label: the text before the first element inside it (`<label>Nome<input …/></label>`),
 * or the text of its elements when it has no text of its own.
 */
function labelText(raw: string): string | null {
  return literal(raw.split('<')[0]) ?? literal(raw.replace(/<(?:[^>{]|\{[^{}]*\})*>/g, ' '))
}

/** The value of one attribute in a tag; `:placeholder` and `data-name` are not matched. */
function attrOf(tag: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)
  return m ? (m[1] ?? m[2]) : undefined
}

/** The index of the character that closes the bracket opened at `open`, skipping strings. */
function closeOf(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (c === '"' || c === "'" || c === '`') {
      i = endOfString(text, i)
      continue
    }
    if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return text.length
}

/** The index of the quote that ends the string starting at `start`. Ordinary strings end at the line. */
function endOfString(text: string, start: number): number {
  const q = text[start]
  for (let j = start + 1; j < text.length; j++) {
    const c = text[j]
    if (c === '\\') j++
    else if (c === q) return j
    else if (c === '\n' && q !== '`') return j
  }
  return text.length
}

/** The top-level keys of the object literal whose `{` is at `open`: `name: x`, shorthand `name`, not spreads. */
function keysOf(text: string, open: number): string[] {
  const end = closeOf(text, open)
  const entries: string[] = []
  let depth = 0
  let start = open + 1
  for (let i = open; i < end; i++) {
    const c = text[i]
    if (c === '"' || c === "'" || c === '`') {
      i = endOfString(text, i)
      continue
    }
    if ('{[('.includes(c)) depth++
    else if ('}])'.includes(c)) depth--
    else if (c === ',' && depth === 1) {
      entries.push(text.slice(start, i))
      start = i + 1
    }
  }
  entries.push(text.slice(start, end))
  const keys: string[] = []
  for (const raw of entries) {
    const m = /^(?:'([^']+)'|"([^"]+)"|`([^`]+)`|([A-Za-z_$][\w$]*))\s*(?::|$)/.exec(raw.trim())
    if (m) keys.push(m[1] ?? m[2] ?? m[3] ?? m[4])
  }
  return keys
}

/** The character offset where a 1-based line starts. */
function offsetOfLine(text: string, line: number): number {
  let at = 0
  for (let l = 1; l < line; l++) {
    const next = text.indexOf('\n', at)
    if (next < 0) return text.length
    at = next + 1
  }
  return at
}

function prismaModels(code: string): DataModel[] {
  const line = lineOf(code)
  const out: DataModel[] = []
  for (const m of code.matchAll(/^model\s+(\w+)\s*\{/gm)) {
    const open = idx(m) + m[0].length - 1
    const body = code.slice(open + 1, closeOf(code, open))
    const names = body
      .split('\n')
      .map((row) => SCALAR_FIELD.exec(row)?.[1])
      .filter((n): n is string => !!n)
    out.push({ name: m[1], fields: plainFields(names), line: line(idx(m)) })
  }
  return out
}

/** Django (`class X(models.Model)`) and SQLAlchemy (`class X(Base)`, `Column` or `mapped_column`). */
function pythonModels(code: string): DataModel[] {
  const lines = code.split('\n')
  const out: DataModel[] = []
  lines.forEach((row, i) => {
    const m = /^class\s+(\w+)\s*\(([^)]*)\)\s*:/.exec(row)
    if (!m || !/\b(?:models\.Model|db\.Model|DeclarativeBase|Base|Model)\b/.test(m[2])) return
    const names: string[] = []
    for (let j = i + 1; j < lines.length; j++) {
      const body = lines[j]
      if (body.trim() && !/^\s/.test(body)) break
      const f = /^\s+(\w+)\s*(?::[^=]*)?=\s*(models\.(\w+)|(?:sa\.|sqlalchemy\.)?(?:Column|mapped_column)\b)/.exec(body)
      if (!f) continue
      if (['ForeignKey', 'OneToOneField', 'ManyToManyField'].includes(f[3] ?? '')) continue
      names.push(f[1])
    }
    out.push({ name: m[1], fields: plainFields(names), line: i + 1 })
  })
  return out
}

/** Mongoose, TypeORM and Sequelize models in JavaScript or TypeScript. */
function jsModels(code: string): DataModel[] {
  const line = lineOf(code)
  const out: DataModel[] = []
  // model('Lead', new Schema({ ... }))
  for (const m of code.matchAll(/\bmodel\s*\(\s*['"](\w+)['"]\s*,\s*new\s+(?:mongoose\.)?Schema\s*\(\s*\{/g)) {
    out.push({ name: m[1], fields: plainFields(keysOf(code, idx(m) + m[0].length - 1)), line: line(idx(m)) })
  }
  // const LeadSchema = new Schema({ ... })
  for (const m of code.matchAll(/\b(?:const|let|var)\s+(\w+?)Schema\s*=\s*new\s+(?:mongoose\.)?Schema\s*\(\s*\{/g)) {
    out.push({ name: capital(m[1]), fields: plainFields(keysOf(code, idx(m) + m[0].length - 1)), line: line(idx(m)) })
  }
  // sequelize.define('Lead', { ... })
  for (const m of code.matchAll(/\.define\s*\(\s*['"](\w+)['"]\s*,\s*\{/g)) {
    out.push({ name: m[1], fields: plainFields(keysOf(code, idx(m) + m[0].length - 1)), line: line(idx(m)) })
  }
  // @Entity() class Lead { @Column() name: string }
  for (const m of code.matchAll(/@Entity\s*\([^)]*\)\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)[^{]*\{/g)) {
    const open = idx(m) + m[0].length - 1
    const body = code.slice(open, closeOf(code, open))
    const names = [...body.matchAll(/@(?:Column|PrimaryColumn|PrimaryGeneratedColumn)\b(?:\([^)]*\))?\s*(?:@\w+(?:\([^)]*\))?\s*)*(\w+)\s*[?!]?\s*:/g)].map((x) => x[1])
    out.push({ name: m[1], fields: plainFields(names), line: line(idx(m)) })
  }
  return out
}

/** The data models a file describes, with the fields a reader needs. Ids, timestamps and secrets are left out. */
export function dataModelsOf(path: string, text: string): DataModel[] {
  const found = extOf(path) === 'py' ? pythonModels(stripComments(text, 'hash')) : [...prismaModels(stripComments(text, 'slash')), ...jsModels(stripComments(text, 'slash'))]
  const seen = new Set<string>()
  return found.filter((m) => {
    if (seen.has(m.name)) return false
    seen.add(m.name)
    return true
  })
}

/**
 * A heading that names a screen ("Leads", "Meus contratos"): a few words, not a sentence ("Seu trabalho
 * merece mais que um print."), a question or a numbered clause of a document shown on it ("1. DO OBJETO").
 */
function namesScreen(heading: string | null): heading is string {
  return !!heading && heading.split(' ').length <= 5 && !/[.!?…:]$/.test(heading) && !/^\d+[.)]?\s/.test(heading)
}

/**
 * The screen's title from its headings: the first `<h1>` that names a screen. When its `<h1>` is an
 * expression (`{estudio.nome}`) the title can't be read, and a section's `<h2>` ("Salas") would only
 * mislead, so there is none; `<h2>`s count only when every `<h1>` is a sentence or there is no `<h1>`.
 */
function headingTitle(code: string): string | null {
  for (const level of ['1', '2']) {
    for (const m of code.matchAll(new RegExp(String.raw`<h${level}\b(?:[^>{]|\{[^{}]*\})*>([\s\S]*?)<\/h${level}>`, 'gi'))) {
      if (/[{}]/.test(m[1])) {
        if (level === '1') return null
        continue
      }
      const text = literal(m[1])
      if (namesScreen(text)) return text
    }
  }
  return null
}

/** What a screen shows, from a component or page file. Anything that is not a screen gives nothing. */
export function screenDetailsOf(path: string, text: string): ScreenDetails {
  const empty: ScreenDetails = { title: null, buttons: [], fields: [] }
  const code = stripComments(text, 'slash')
  if (!isScreen(path, code)) return empty
  const docTitle = /document\.title\s*=\s*(['"`])([^'"`]*)\1/.exec(code)
  const title = headingTitle(code) ?? literal(docTitle?.[2])

  const buttons: string[] = []
  for (const m of code.matchAll(/<button\b(?:[^>{]|\{[^{}]*\})*>([\s\S]*?)<\/button>/gi)) addUnique(buttons, literal(m[1]))
  const inputs = [...code.matchAll(/<(input|select|textarea)\b((?:[^>{]|\{[^{}]*\})*)>/gi)].map((m) => m[2])
  for (const tag of inputs) if (/\btype\s*=\s*["']submit["']/i.test(tag)) addUnique(buttons, literal(attrOf(tag, 'value')))

  const fieldTags = inputs.filter((tag) => !/\btype\s*=\s*["'](?:submit|button|reset|hidden|image)["']/i.test(tag))
  const fields: string[] = []
  for (const m of code.matchAll(/<label\b(?:[^>{]|\{[^{}]*\})*>([\s\S]*?)<\/label>/gi)) addUnique(fields, labelText(m[1]))
  for (const tag of fieldTags) {
    addUnique(fields, literal(attrOf(tag, 'placeholder')))
    addUnique(fields, literal(attrOf(tag, 'aria-label')))
  }
  if (fields.length === 0) {
    for (const tag of fieldTags) {
      const name = attrOf(tag, 'name')
      if (name) addUnique(fields, humanField(name, 'pt'))
    }
  }
  return { title, buttons, fields }
}

/** A button on a screen that makes a call: its words, its line, the call, and whether the screen asks "are you sure?" first. */
export type ScreenAction = { button: string; line: number; method: string; url: string; confirm: boolean }

/** Asking the person to confirm: `confirm(…)` in a browser, `Alert.alert(…)` in React Native, an app's own `confirmar(…)`. */
const CONFIRM = /\b(?:window\.)?confirm\s*\(|\bAlert\.alert\s*\(|\b(?:confirmar|perguntar|askConfirm|confirmAction)\s*\(/

/** A named piece of code a handler can call: `const x = …`, `function x(…)`, a class method `x(…) {`. */
const DECLARATION = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=|\bfunction\s+([A-Za-z_$][\w$]*)\s*\(|^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/

/** An opening tag, with its attributes and whether it closes itself; only those with a press handler or a submit type count. */
const OPEN_TAG = /<([A-Za-z][\w.]*)\b((?:[^>{]|\{(?:[^{}]|\{[^{}]*\})*\})*?)(\/?)>/g

/** Attributes an app's own button takes its words from: `title`, `label`, `titulo`, `rotulo`, `texto`. */
const LABEL_ATTRS = ['title', 'label', 'titulo', 'rotulo', 'texto', 'text', 'aria-label', 'accessibilityLabel']

/** What happens on a press: the JSX handler or Vue's `@click`. */
function handlerOf(attrs: string): string | null {
  const jsx = /\bon(?:Click|Press)\s*=\s*\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/.exec(attrs)?.[1]
  return jsx ?? /@click(?:\.\w+)*\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? null
}

/**
 * The buttons of a screen that make a call, each with the call it makes. A button is linked to a call
 * when its handler names the code that makes it (`cancelar.mutate(id)` for `const cancelar =
 * useMutation(… api('/reservas/1/cancelar') …)`), or names a function that names it; a submit button
 * takes its form's `onSubmit`. Only what the file itself shows: a call in another file is not followed.
 */
export function screenActionsOf(path: string, text: string): ScreenAction[] {
  const code = stripComments(text, 'slash')
  if (!isScreen(path, code)) return []
  const calls = callsOf(path, text)
  if (calls.length === 0) return []
  const lines = code.split('\n')
  const line = lineOf(code)

  // Each declaration runs to the brace that closes the first one opened on its line, or is that one line.
  const decls: { name: string; start: number; end: number }[] = []
  let offset = 0
  lines.forEach((l, i) => {
    const m = DECLARATION.exec(l)
    const name = m?.[1] ?? m?.[2] ?? m?.[3]
    if (name && !/^(?:if|for|while|switch|catch|return)$/.test(name)) {
      const brace = l.indexOf('{', (m?.index ?? 0) + (m?.[0].length ?? 0) - 1)
      const end = brace < 0 ? i + 2 : line(closeOf(code, offset + brace)) + 1
      decls.push({ name, start: i + 1, end: Math.max(end, i + 2) })
    }
    offset += l.length + 1
  })
  const bodyOf = (d: { start: number; end: number }) => lines.slice(d.start - 1, d.end - 1).join('\n')
  const holderOf = (ln: number) => decls.filter((d) => d.start <= ln && ln < d.end).pop() ?? null
  const mentions = (body: string, name: string) => new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(body)

  const out: ScreenAction[] = []
  for (const m of code.matchAll(OPEN_TAG)) {
    const attrs = m[2]
    if (!/\bon(?:Click|Press)\s*=|@click|\btype\s*=\s*["']submit["']/.test(attrs)) continue
    const after = (m.index ?? 0) + m[0].length
    const close = m[3] ? -1 : code.indexOf(`</${m[1]}>`, after)
    const inner = close < 0 ? null : code.slice(after, close)
    const label = LABEL_ATTRS.map((a) => literal(attrOf(attrs, a))).find(Boolean) ?? literal(inner)
    // "×" or "+" says nothing a caption can quote.
    if (!label || !/\p{L}/u.test(label)) continue
    let handler = handlerOf(attrs)
    if (handler === null && /\btype\s*=\s*["']submit["']/.test(attrs)) {
      const before = code.slice(0, m.index ?? 0)
      const forms = [...before.matchAll(/\bonSubmit\s*=\s*\{((?:[^{}]|\{[^{}]*\})*)\}|@submit(?:\.\w+)*\s*=\s*"([^"]*)"/g)]
      const last = forms[forms.length - 1]
      handler = last ? (last[1] ?? last[2] ?? null) : null
    }
    if (!handler) continue
    const used = decls.filter((d) => mentions(handler as string, d.name))
    for (const call of calls) {
      const holder = holderOf(call.line)
      if (!holder) continue
      const direct = used.includes(holder)
      const through = !direct && used.find((d) => d !== holder && mentions(bodyOf(d), holder.name))
      if (!direct && !through) continue
      const confirm = CONFIRM.test(handler) || CONFIRM.test(bodyOf(holder)) || (!!through && CONFIRM.test(bodyOf(through)))
      out.push({ button: label, line: line(m.index ?? 0), method: call.method, url: call.url, confirm })
    }
  }
  return out
}

/** One screen made of several files: the first title found, and every button and field, once each. */
export function mergeScreenDetails(list: ScreenDetails[]): ScreenDetails {
  const out: ScreenDetails = { title: null, buttons: [], fields: [] }
  for (const s of list) {
    if (out.title === null) out.title = s.title
    for (const b of s.buttons) addUnique(out.buttons, b)
    for (const f of s.fields) addUnique(out.fields, f)
  }
  return out
}

/**
 * The fields a call sends: the keys of the object literal in `JSON.stringify({ … })` or
 * `axios.post(url, { … })` that starts within about fifteen lines after the call's line.
 */
export function sentFieldsOf(text: string, line: number): string[] {
  const code = stripComments(text, 'slash')
  const from = offsetOfLine(code, line)
  const to = offsetOfLine(code, line + 15)
  const m = SEND_OBJECT.exec(code.slice(from, to))
  if (!m) return []
  return plainFields(keysOf(code, from + idx(m) + m[0].length - 1))
}

/** The e-mail subjects written as literals: `subject: '…'`, `subject="…"`. Templates with values are skipped. */
export function emailSubjectsOf(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/\bsubject\s*[:=]\s*(?:'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`)/g)) {
    const s = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\s+/g, ' ').trim()
    if (s && s.length <= 80 && !s.includes('${') && !out.includes(s)) out.push(s)
  }
  return out
}

/** The names of the queues that workers take tasks from: `new Worker('followups', …)`. */
export function tasksOf(text: string): string[] {
  const out: string[] = []
  for (const m of stripComments(text, 'slash').matchAll(/new\s+Worker\s*\(\s*['"]([\w.-]+)['"]/g)) {
    if (!out.includes(m[1])) out.push(m[1])
  }
  return out
}

/** The Portuguese or English phrase for a queue's task, when the name is one we know; null otherwise. */
export function taskPhraseOf(queue: string | undefined): { pt: string; en: string } | null {
  if (!queue) return null
  return TASKS.get(singularOf(queue.toLowerCase())) ?? null
}

/** The singular of a route's word: "leads" → "lead", "categories" → "category", "statuses" → "status". */
export function singularOf(word: string): string {
  const w = word.toLowerCase()
  const irregular = IRREGULAR_PLURALS.get(w) ?? singularWord(w)
  if (irregular) return irregular
  if (w.length <= 3 || /(?:us|is)$/.test(w)) return w
  // Portuguese: "avaliacoes"/"avaliações" → "avaliacao"/"avaliação", "postagens" → "postagem".
  // English words in -oes ("shoes") have no c or s before it.
  const pt = /([cçs])(õ|o)es$/.exec(w)
  if (pt) return `${w.slice(0, -pt[0].length)}${pt[1]}${pt[2] === 'õ' ? 'ão' : 'ao'}`
  if (/gens$/.test(w)) return `${w.slice(0, -4)}gem`
  if (/ies$/.test(w)) return `${w.slice(0, -3)}y`
  if (/(?:sses|xes|ches|shes|uses)$/.test(w)) return w.slice(0, -2)
  if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1)
  return w
}

/** The data model a route's resource stands for: "leads" → Lead, "categories" → Category. */
export function modelForResource(resource: string, models: DataModel[]): DataModel | null {
  const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const wanted = new Set([flat(resource), flat(singularOf(resource))])
  return models.find((m) => wanted.has(flat(m.name))) ?? null
}

/**
 * A field name as a reader would say it. Whole phrases first, then single words; anything else keeps
 * its humanized English, since a word-by-word guess reads worse ("empresa nome").
 */
export function humanField(name: string, lang: Lang): string {
  const words = wordsOf(name)
  const phrase = words.join(' ')
  if (lang === 'en' || words.length === 0) return phrase || name
  return PHRASES.get(phrase) ?? (words.length === 1 ? WORDS.get(phrase) : undefined) ?? phrase
}

/** A label from a screen, as it reads inside a sentence: "Nome" → "nome", "E-mail" → "e-mail", "CPF" stays. */
export function plainLabel(text: string): string {
  return /^\p{Lu}(?!\p{Lu})/u.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text
}

/** Up to `max` items joined naturally, then "e mais N" (or "and N more") for the rest. */
export function fieldList(fields: string[], lang: Lang, max = 4): string {
  const items = [...new Set(fields.filter(Boolean))]
  const shown = items.slice(0, max)
  const rest = items.length - shown.length
  if (shown.length === 0) return ''
  if (rest <= 0) return joinList(shown, lang)
  return lang === 'pt' ? `${shown.join(', ')} e mais ${rest}` : `${shown.join(', ')} and ${rest} more`
}
