/**
 * Turns the model into the presentation's scenes: at most six flows, each a short story with up to
 * seven actors and fourteen steps. The order is what the audience should see first: what a person can
 * do with the system (its features, in its own words), agents (at most two), requests to the API (at
 * most three), a background job, and an overview only when nothing else was found.
 *
 * Every step is a plain sentence in both languages, built from a template per kind of step. The people
 * in a scene wear plain names ("Recepção de leads", "Banco de dados", "Buscar leads"); each actor also
 * carries its technical name (`technical`), so the presentation can show either. Captions only ever
 * name an actor with its plain name, so swapping plain for technical is a whole-word replace. Brands
 * and model ids go to the note under each character. Nothing here guesses at behaviour the code doesn't
 * show: a step exists only because an import, a route or an agent's tool says so. When the details of
 * the code are given (the fields a form asks for, what a request sends, the e-mail's subject), the
 * sentences say those things too; without them the scenes keep their shorter wording.
 */
import type { Actor, ActorKind, Agent, Component, Dependency, Endpoint, External, ExternalKind, Flow, FlowStep, StepAction, Text } from '../shared/studio'
import { clip, cap, firstSentence, joinList, langOf } from './text'
import { fieldList, humanField, modelForResource, plainLabel, singularOf, taskPhraseOf, type DataModel, type FlowDetails, type Lang, type ScreenDetails } from './details'
import { isPlural, nameWith, plainAgentName, plainExternalName, plainPartName, plainToolName, type Prep } from './plain'
import type { Feature } from './features'
import { componentOf } from '../shared/components'
import { readableWord } from './words'

export type FlowInput = {
  components: Component[]
  dependencies: Dependency[]
  externals: External[]
  endpoints: Endpoint[]
  agents: Agent[]
  /** File path → ids of the components that file imports. Lets a route's scene follow its own file. */
  fileDeps?: Map<string, string[]>
  /** What the code says beyond the graph: fields, screens, sent data, e-mail subjects. Optional. */
  details?: FlowDetails
  /** What a person can do with the system, from its README, buttons and commands (`features.ts`). */
  features?: Feature[]
}

/** Scenes are kept small enough to follow on a screen. */
export const MAX_ACTORS = 7
export const MAX_STEPS = 14
export const MAX_FLOWS = 6

/** A caption is read in one glance on a screen, so the longest ones are shortened. */
const CAPTION_LIMIT = 120

/** Buttons that leave the screen rather than send the data, so a scene never says "clicks Cancel". */
const CANCEL_BUTTON = /cancel|fechar|voltar|sair|close|back|exit/i

/** A plain name in both languages, as it stands in a sentence (without article or preposition). */
type Name = Text

const PERSON: Actor = {
  id: 'person',
  name: { en: 'User', pt: 'Usuário' },
  kind: 'person',
  component: null,
  external: null,
  note: { en: 'Whoever uses the system.', pt: 'Quem usa o sistema.' },
}

/** Which character plays a part, by its layer. */
export const COMPONENT_KIND: Record<Component['layer'], ActorKind> = {
  interface: 'screen',
  api: 'api',
  security: 'security',
  logic: 'service',
  shared: 'service',
  infra: 'service',
  ai: 'agent',
  jobs: 'worker',
  data: 'database',
  tests: 'service',
}

const EXTERNAL_KIND: Record<ExternalKind, ActorKind> = {
  database: 'database',
  cache: 'cache',
  queue: 'queue',
  llm: 'llm',
  email: 'external',
  payment: 'external',
  messaging: 'external',
  storage: 'external',
  auth: 'external',
  http: 'external',
}

/** What each kind of outside service does, written after its brand in the character's note. */
const EXTERNAL_DOES: Record<ExternalKind, Text> = {
  database: { en: "keeps the system's data.", pt: 'guarda os dados do sistema.' },
  cache: { en: 'keeps ready answers so things run faster.', pt: 'guarda respostas prontas para ir mais rápido.' },
  queue: { en: 'holds tasks to be done later.', pt: 'guarda tarefas para serem feitas depois.' },
  llm: { en: 'answers and decides.', pt: 'responde e decide.' },
  email: { en: 'sends the e-mails.', pt: 'envia os e-mails.' },
  payment: { en: 'handles the payments.', pt: 'processa os pagamentos.' },
  messaging: { en: 'sends the messages.', pt: 'envia as mensagens.' },
  storage: { en: 'stores the files.', pt: 'guarda os arquivos.' },
  auth: { en: 'checks who is signing in.', pt: 'confere quem está entrando.' },
  http: { en: 'answers requests from outside.', pt: 'responde a pedidos de fora.' },
}

/** What the outside service does when a step sends something to it. */
const SENT: Partial<Record<ExternalKind, { pt: string; en: string }>> = {
  email: { pt: 'o e-mail', en: 'the e-mail' },
  payment: { pt: 'o pagamento', en: 'the payment' },
  messaging: { pt: 'a mensagem', en: 'the message' },
  storage: { pt: 'o arquivo', en: 'the file' },
}

const SEND_KINDS: ExternalKind[] = ['email', 'payment', 'messaging', 'storage']

type Ctx = {
  components: Component[]
  byId: Map<string, Component>
  deps: Dependency[]
  externals: External[]
  /** File path → the components its imports reach, so a route only shows the parts its own file uses. */
  fileDeps: Map<string, string[]>
  details: FlowDetails | null
}

/** The plain name of a part: its label when the model has one, otherwise worked out from the part itself. */
function nameOf(c: Component): Name {
  return c.label ?? plainPartName(c, [c])
}

/** The plain name of an outside service, from its kind; the brand goes to the note. */
function serviceName(e: External): Name {
  return plainExternalName(e.kind)
}

/** The actor for a component, with the layer's kind. */
function componentActor(c: Component): Actor {
  return {
    id: `c:${c.id}`,
    name: nameOf(c),
    technical: { pt: c.name, en: c.name },
    kind: COMPONENT_KIND[c.layer],
    component: c.id,
    external: null,
    note: c.summary,
  }
}

/** The actor for an outside service: its kind's plain name, and the brand in the note. */
function externalActor(e: External): Actor {
  const does = EXTERNAL_DOES[e.kind]
  return {
    id: `e:${e.id}`,
    name: serviceName(e),
    technical: { pt: e.name, en: e.name },
    kind: EXTERNAL_KIND[e.kind],
    component: null,
    external: e.id,
    note: {
      en: e.name ? `${e.name} ${does.en}` : cap(does.en),
      pt: e.name ? `${e.name} ${does.pt}` : cap(does.pt),
    },
  }
}

/** The component `from` depends on most among those matching `pred`. */
function heaviest(ctx: Ctx, from: string, pred: (c: Component) => boolean): Component | null {
  const targets = ctx.deps
    .filter((d) => d.from === from)
    .sort((a, b) => b.weight - a.weight)
  for (const d of targets) {
    const c = ctx.byId.get(d.to)
    if (c && c.id !== from && pred(c)) return c
  }
  return null
}

/** The component that depends on `to` most among those matching `pred`. */
function heaviestCaller(ctx: Ctx, to: string, pred: (c: Component) => boolean): Component | null {
  const callers = ctx.deps.filter((d) => d.to === to).sort((a, b) => b.weight - a.weight)
  for (const d of callers) {
    const c = ctx.byId.get(d.from)
    if (c && c.id !== to && pred(c)) return c
  }
  return null
}

/** The first outside service of the kinds that a component uses. */
function serviceUsedBy(ctx: Ctx, ids: string[], kinds: ExternalKind[]): External | null {
  for (const id of ids) {
    const hit = ctx.externals.find((e) => kinds.includes(e.kind) && e.usedBy.includes(id))
    if (hit) return hit
  }
  return null
}

/** How a method reads in a sentence: "criar", "listar", "ver"… and the English. */
function verbOf(method: string, path: string): { pt: string; en: string } {
  switch (method) {
    case 'GET':
      return readsOne(path) ? { pt: 'ver', en: 'view' } : { pt: 'listar', en: 'list' }
    case 'POST':
      return { pt: 'criar', en: 'create' }
    case 'PUT':
    case 'PATCH':
      return { pt: 'atualizar', en: 'update' }
    case 'DELETE':
      return { pt: 'apagar', en: 'delete' }
    default:
      return { pt: 'usar', en: 'use' }
  }
}

/** Route words that only say where a route lives: "/api/v1/public/…". */
const ROUTE_FILLER = /^(?:api|v\d+|public|private|rest)$/i

/** The fixed words of a route, without its parameters and filler: "/api/v1/leads/:id/send" → leads, send. */
function routeWords(path: string): string[] {
  return path.split('/').filter((s) => s && !/[:{<[$]/.test(s) && !ROUTE_FILLER.test(s))
}

/** The last fixed word of a route: "/api/leads/:id" → "leads". */
function resourceOf(path: string): string {
  const fixed = routeWords(path).pop()
  return (fixed ?? path).replace(/[^\p{L}\p{N}_-]/gu, '') || 'dados'
}

/** What a route does to its resource: one item, a list, or a change to it. */
type Mode = 'list' | 'one' | 'create' | 'update' | 'delete'

/**
 * Route words that keep the site running or only sign people in: no scene is about them. A webhook is
 * called by an outside service, not by the person the scenes follow.
 */
const PLUMBING = new Set([
  'health', 'healthz', 'healthcheck', 'ping', 'metrics', 'csrf', 'swagger', 'redoc', 'openapi', 'schema', 'docs',
  '__debug__', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'login', 'logout', 'signin', 'signout', 'entrar', 'sair',
  'refresh', 'token', 'me', 'senha', 'password', 'esqueci', 'redefinir', 'reset', 'webhook', 'webhooks', 'callback',
])

/** Words that are plumbing only as a route's first word: "/admin/" is Django's admin, "/media/…" its uploads. */
const PLUMBING_FIRST = new Set(['admin', 'django-admin', 'media', 'static', 'status'])

/**
 * A route that is not about what the system is for: a health check, CSRF, the admin, signing in or
 * out, a token refresh, a webhook, static files, API docs, the root page or a catch-all pattern.
 */
export function isPlumbing(path: string): boolean {
  if (/[(*]/.test(path)) return true
  const first = path.split('/').find(Boolean)?.toLowerCase()
  if (first && PLUMBING_FIRST.has(first)) return true
  const words = routeWords(path).map((w) => w.toLowerCase())
  if (words.length === 0 || words.some((w) => PLUMBING.has(w))) return true
  // Everything under "auth" is about signing in, except signing up.
  return words[0] === 'auth' && !SIGNUP.has(words[words.length - 1])
}

/** Last words of a route that sign a person up: "/auth/register/", "/auth/aluno/cadastro/". */
const SIGNUP = new Set(['register', 'registro', 'cadastro', 'cadastrar', 'signup', 'sign-up', 'sign_up'])

/** Words that name only where sign-up lives, not who signs up. */
const SIGNUP_PLACES = new Set(['auth', 'account', 'accounts', 'conta', 'contas', 'user', 'users', 'usuarios'])

/**
 * Last words of a route that name what it does to the thing before it: "/reservas/:id/cancelar". Some
 * are undone by a DELETE on the same route: "/profiles/:u/follow" is following, or no longer following.
 */
const ROUTE_ACTIONS = new Map<string, { verb: Text; mode: Mode; undo?: Text }>(
  (
    [
      [['follow', 'seguir'], { pt: 'seguir', en: 'follow' }, 'update', { pt: 'deixar de seguir', en: 'unfollow' }],
      [['favorite', 'favourite', 'favoritar'], { pt: 'favoritar', en: 'favorite' }, 'update', { pt: 'desfavoritar', en: 'unfavorite' }],
      [['like', 'curtir'], { pt: 'curtir', en: 'like' }, 'update', { pt: 'descurtir', en: 'unlike' }],
      [['cancelar', 'cancel'], { pt: 'cancelar', en: 'cancel' }, 'update'],
      [['confirmar', 'confirm'], { pt: 'confirmar', en: 'confirm' }, 'update'],
      [['recusar', 'rejeitar', 'reject', 'decline'], { pt: 'recusar', en: 'reject' }, 'update'],
      [['aceitar', 'accept'], { pt: 'aceitar', en: 'accept' }, 'update'],
      [['aprovar', 'approve'], { pt: 'aprovar', en: 'approve' }, 'update'],
      [['enviar', 'send'], { pt: 'enviar', en: 'send' }, 'update'],
      [['publicar', 'publish'], { pt: 'publicar', en: 'publish' }, 'update'],
      [['assinar', 'sign'], { pt: 'assinar', en: 'sign' }, 'update'],
      [['arquivar', 'archive'], { pt: 'arquivar', en: 'archive' }, 'update'],
      [['finalizar', 'concluir', 'finish', 'complete'], { pt: 'concluir', en: 'complete' }, 'update'],
      [['pagar', 'pay'], { pt: 'pagar', en: 'pay' }, 'update'],
      [['retirar'], { pt: 'retirar', en: 'pick up' }, 'update'],
      [['sincronizar', 'sync'], { pt: 'sincronizar', en: 'sync' }, 'update'],
      [['verificar', 'verify', 'validar', 'validate'], { pt: 'conferir', en: 'check' }, 'one'],
      [['exportar', 'export'], { pt: 'exportar', en: 'export' }, 'one'],
      [['baixar', 'download', 'pdf', 'csv'], { pt: 'baixar', en: 'download' }, 'one'],
    ] as [string[], Text, Mode, Text?][]
  ).flatMap(([words, verb, mode, undo]) => words.map((w) => [w, { verb, mode, ...(undo ? { undo } : {}) }] as [string, { verb: Text; mode: Mode; undo?: Text }])),
)

/**
 * What a route means in a scene: the verb, what it does, the thing it is about as people say it and
 * as the code writes it (`word`, null when the route does not name it), and its title.
 */
type Meaning = { verb: Text; mode: Mode; res: Text; word: string | null; title: Text }

/** The thing a scene is about when the route does not name it. */
const SOME_RECORD: Text = { pt: 'registro', en: 'record' }

function titled(verb: Text, res: Text | null): Text {
  return res ? { pt: `${cap(verb.pt)} ${res.pt}`, en: `${cap(verb.en)} ${res.en}` } : { pt: cap(verb.pt), en: cap(verb.en) }
}

/** A route word as people read it: "meus-dados" → "meus dados", "contracts" → "contratos", "analises" → "análises". */
function wordText(raw: string): Text {
  const w = raw.replace(/[^\p{L}\p{N}_-]/gu, '').replace(/[-_]+/g, ' ').trim()
  return w ? readableWord(w) : { pt: 'dados', en: 'data' }
}

/** A route word that names a thing: not an action, and long enough to say something ("f" in "/f/:token" does not). */
function namesThing(word: string | undefined): word is string {
  return !!word && word.length >= 3 && !ROUTE_ACTIONS.has(word.toLowerCase()) && !SIGNUP.has(word.toLowerCase())
}

function meaningOf(method: string, path: string): Meaning {
  const words = routeWords(path)
  const last = (words[words.length - 1] ?? '').toLowerCase()
  const before = words.slice(0, -1).reverse().find(namesThing)
  if (SIGNUP.has(last)) {
    const who = before && !SIGNUP_PLACES.has(before.toLowerCase()) ? before : null
    if (who) {
      const verb = { pt: 'cadastrar', en: 'sign up' }
      return { verb, mode: 'create', res: wordText(who), word: who, title: titled(verb, wordText(who)) }
    }
    const verb = { pt: 'criar', en: 'create' }
    const res = { pt: 'conta', en: 'account' }
    return { verb, mode: 'create', res, word: 'account', title: titled(verb, res) }
  }
  const action = ROUTE_ACTIONS.get(last)
  if (action) {
    const res = before ? wordText(before) : null
    const verb = method === 'DELETE' && action.undo ? action.undo : action.verb
    return { verb, mode: action.mode, res: res ?? SOME_RECORD, word: before ?? null, title: titled(verb, res) }
  }
  const verb = verbOf(method, path)
  const word = namesThing(words[words.length - 1]) ? resourceOf(path) : null
  const res = word ? wordText(word) : null
  return { verb, mode: modeOf(method, path), res: res ?? SOME_RECORD, word, title: titled(verb, res) }
}

/** The method that does what a mode says, for a route that does not say its own. */
const METHOD_OF_MODE: Record<Mode, string> = { list: 'GET', one: 'GET', create: 'POST', update: 'PATCH', delete: 'DELETE' }

/** The order in which the methods a screen calls a route with are told. */
const CALLED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE', 'GET']

/**
 * The routes a scene can tell. A route for any method (Django, DRF) becomes the methods the screens
 * call it with; when no screen calls it, what its words say (`cancelar`, `cadastro`), or reading it.
 */
function concreteRoutes(ep: Endpoint, details: FlowDetails | null): Endpoint[] {
  if (ep.method !== 'ANY') return [ep]
  const called = CALLED_METHODS.filter((m) => details?.calls.has(`${m} ${ep.path}`))
  if (called.length > 0) return called.map((method) => ({ ...ep, method }))
  const words = routeWords(ep.path)
  const last = (words[words.length - 1] ?? '').toLowerCase()
  const mode = SIGNUP.has(last) ? 'create' : (ROUTE_ACTIONS.get(last)?.mode ?? modeOf('GET', ep.path))
  return [{ ...ep, method: METHOD_OF_MODE[mode] }]
}

/**
 * A GET reads one thing when the route ends in an id ("/leads/:id") or is named by a singular word
 * ("/user", "/perfil", "/feed"); a plural word ("/leads") is a list.
 */
function readsOne(path: string): boolean {
  const last = path.split('/').filter(Boolean).pop() ?? ''
  if (/[:{<[$]/.test(last)) return true
  const word = routeWords(path).pop()
  return !!word && !/s$/i.test(word)
}

function modeOf(method: string, path: string): Mode {
  switch (method) {
    case 'GET':
      return readsOne(path) ? 'one' : 'list'
    case 'PUT':
    case 'PATCH':
      return 'update'
    case 'DELETE':
      return 'delete'
    default:
      return 'create'
  }
}

/** What the details add to one request: the screen that calls it, what it sends, and the words around it. */
type Known = {
  screen: ScreenDetails | null
  /** The fields the front-end call sends, as the code names them. */
  sent: string[]
  subject: string | null
  task: { pt: string; en: string } | null
  model: DataModel | null
}

/** Everything a request scene is made of, found from the graph. */
type RequestPlan = {
  endpoint: Endpoint
  api: Component
  screen: Component | null
  sec: Component | null
  svc: Component | null
  data: Component | null
  db: External | null
  send: External | null
  queue: External | null
  known: Known | null
}

function knownOf(details: FlowDetails | null, ep: Endpoint, src: Component): Known | null {
  if (!details) return null
  const call = details.calls.get(`${ep.method} ${ep.path}`)
  return {
    screen: call ? (details.screens.get(call.file) ?? null) : null,
    sent: call?.sent ?? [],
    subject: details.subjects.get(src.id)?.[0] ?? null,
    task: taskPhraseOf(details.tasks[0]),
    model: modelForResource(meaningOf(ep.method, ep.path).word ?? '', details.models),
  }
}

function planRequest(ctx: Ctx, ep: Endpoint): RequestPlan | null {
  const api = ctx.byId.get(ep.component)
  if (!api) return null
  const reach = new Set(ctx.fileDeps.get(ep.file) ?? [])
  const within = (c: Component) => reach.size === 0 || reach.has(c.id)
  const screen = heaviestCaller(ctx, api.id, (c) => c.layer === 'interface')
  const sec = heaviest(ctx, api.id, (c) => c.layer === 'security' && within(c))
  const svc = heaviest(ctx, api.id, (c) => c.layer === 'logic' && within(c))
  const data = heaviest(ctx, svc?.id ?? api.id, (c) => c.layer === 'data') ?? (svc ? heaviest(ctx, api.id, (c) => c.layer === 'data') : null)
  const owners = [data?.id, svc?.id, api.id].filter((x): x is string => !!x)
  const db = serviceUsedBy(ctx, owners, ['database'])
  const owner = svc?.id ?? api.id
  const send = serviceUsedBy(ctx, [owner, api.id], SEND_KINDS)
  const queue = serviceUsedBy(ctx, [owner, api.id], ['queue'])
  const known = knownOf(ctx.details, ep, svc ?? api)
  return { endpoint: ep, api, screen, sec, svc, data, db, send, queue, known }
}

/** Both languages of one caption, from one builder. */
function both(build: (lang: Lang) => string): Text {
  return { pt: build('pt'), en: build('en') }
}

/** Feminine words that end in -o. */
const FEMININE_IN_O = new Set(['foto', 'moto', 'tribo', 'libido'])

/**
 * Portuguese words ending in "a", "-ção", "-são", "-dade", "-gem", "-ise" or "-tude" are feminine
 * ("tarefa", "reserva", "análise"); the rest are taken as masculine.
 */
function feminine(word: string): boolean {
  return /(?:a|[cçs][aã]o|dade|gem|ise|tude)$/i.test(word) || FEMININE_IN_O.has(word.toLowerCase())
}

/** "um lead", "uma tarefa" in Portuguese; "a lead", "an order" in English. */
function oneOf(sing: string, lang: Lang): string {
  if (lang === 'en') return `${/^[aeiou]/i.test(sing) ? 'an' : 'a'} ${sing}`
  return `${feminine(sing) ? 'uma' : 'um'} ${sing}`
}

/** "o lead", "a tarefa". */
function theOne(sing: string, lang: Lang): string {
  return lang === 'en' ? `the ${sing}` : `${feminine(sing) ? 'a' : 'o'} ${sing}`
}

/** "o novo lead", "a nova tarefa". */
function newOne(sing: string, lang: Lang): string {
  return lang === 'en' ? `the new ${sing}` : `${feminine(sing) ? 'a nova' : 'o novo'} ${sing}`
}

/** "os leads", "as tarefas" in Portuguese; "the leads" in English. */
function theAll(plural: string, lang: Lang): string {
  if (lang === 'en') return `the ${plural}`
  return `${plural.endsWith('as') ? 'as' : 'os'} ${plural}`
}

/** The ending of a participle that agrees with the word: "guardado" or "guardada". */
function ending(sing: string): string {
  return feminine(sing) ? 'a' : 'o'
}

/** The list of fields, with fewer items when the whole caption would run past its limit. */
function fitList(items: string[], lang: Lang, build: (list: string) => string): string {
  let text = ''
  for (let max = 4; max >= 1; max--) {
    text = build(fieldList(items, lang, max))
    if (text.length <= CAPTION_LIMIT) return text
  }
  return clip(text, CAPTION_LIMIT)
}

/** The first button that sends the data; "Cancelar" and the like are not what the person does to save. */
function pickButton(buttons: string[]): string | null {
  return buttons.find((b) => !CANCEL_BUTTON.test(b)) ?? null
}

/** A name in a sentence, with its article and preposition. */
function at(prep: Prep, n: Name, lang: Lang, start = false): string {
  return nameWith(prep, n[lang], lang, start)
}

/** The verb that follows a name as its subject: plural names take the plural form ("as telas mostram"). */
function vb(n: Name, lang: Lang, sing: string, plur: string): string {
  return isPlural(n[lang], lang) ? plur : sing
}

/** What the person does on the screen, in one language. */
function personCaption(mode: Mode, screen: Name, screenTitle: string | null, fields: string[], button: string | null, res: string, lang: Lang): string {
  const sing = singularOf(res)
  // The screen's own title says which screen ("abre “Leads” nas páginas"), unless the part is already
  // named after it ("abre a tela de leads"). The part is always named, so renaming it reaches the caption.
  const titled = !!screenTitle && !screen[lang].toLowerCase().includes(screenTitle.toLowerCase())
  const open = titled
    ? lang === 'pt'
      ? `O usuário abre “${screenTitle}” ${at('em', screen, 'pt')}`
      : `The user opens “${screenTitle}” ${at('em', screen, 'en')}`
    : lang === 'pt'
      ? `O usuário abre ${at('none', screen, 'pt')}`
      : `The user opens ${at('none', screen, 'en')}`
  const withButton = (text: string) => (button ? `${text}${lang === 'pt' ? ` e clica em “${button}”` : ` and clicks “${button}”`}` : text)
  switch (mode) {
    case 'list':
      return lang === 'pt' ? `${open} para ver ${theAll(res, 'pt')}` : `${open} to see ${theAll(res, 'en')}`
    case 'one':
      return lang === 'pt' ? `${open} para ver ${oneOf(sing, 'pt')}` : `${open} to see ${oneOf(sing, 'en')}`
    case 'delete':
      return lang === 'pt' ? `${open} e pede para apagar ${oneOf(sing, 'pt')}` : `${open} and asks to delete ${oneOf(sing, 'en')}`
    default: {
      const verb = mode === 'create' ? ['preenche', 'fills in', 'criar', 'create'] : ['muda', 'changes', 'mudar', 'change']
      if (fields.length === 0) {
        return withButton(lang === 'pt' ? `${open} para ${verb[2]} ${oneOf(sing, 'pt')}` : `${open} to ${verb[3]} ${oneOf(sing, 'en')}`)
      }
      // "abre a tela, preenche A, B e C e clica em…": a comma before the list keeps the "e"s apart.
      const glue = button ? ',' : lang === 'pt' ? ' e' : ' and'
      return fitList(fields, lang, (list) => withButton(`${open}${glue} ${verb[lang === 'pt' ? 0 : 1]} ${list}`))
    }
  }
}

/** What the screen sends to the API, in one language. */
function screenToApiCaption(mode: Mode, sent: string[], res: string, screen: Name, api: Name, lang: Lang): string {
  const sing = singularOf(res)
  const items = sent.map((f) => humanField(f, lang))
  const sendLine = (head: string, tail: string) =>
    items.length ? fitList(items, lang, (list) => `${head} (${list}) ${tail}`) : `${head} ${tail}`
  const to = at('para', api, lang)
  const who = at('none', api, lang)
  const sc = at('none', screen, lang, true)
  const pt = lang === 'pt'
  switch (mode) {
    case 'list':
      return pt ? `${sc} ${vb(screen, 'pt', 'pede', 'pedem')} a lista de ${res} ${to}` : `${sc} ${vb(screen, 'en', 'asks', 'ask')} ${who} for the list of ${res}`
    case 'one':
      return pt ? `${sc} ${vb(screen, 'pt', 'pede', 'pedem')} ${oneOf(sing, 'pt')} ${to}` : `${sc} ${vb(screen, 'en', 'asks', 'ask')} ${who} for ${oneOf(sing, 'en')}`
    case 'delete':
      return pt
        ? `${sc} ${vb(screen, 'pt', 'pede', 'pedem')} para apagar ${oneOf(sing, 'pt')} ${at('em', api, 'pt')}`
        : `${sc} ${vb(screen, 'en', 'asks', 'ask')} ${who} to delete ${oneOf(sing, 'en')}`
    case 'update':
      return sendLine(pt ? `${sc} ${vb(screen, 'pt', 'envia', 'enviam')} as mudanças` : `${sc} ${vb(screen, 'en', 'sends', 'send')} the changes`, to)
    default:
      return sendLine(pt ? `${sc} ${vb(screen, 'pt', 'envia', 'enviam')} ${newOne(sing, 'pt')}` : `${sc} ${vb(screen, 'en', 'sends', 'send')} ${newOne(sing, 'en')}`, to)
  }
}

/** What the service does with the data, in the database, in one language. */
function databaseCaption(mode: Mode, items: string[], res: string, src: Name, db: Name, lang: Lang): string {
  const sing = singularOf(res)
  const who = at('none', src, lang, true)
  const where = at('em', db, lang)
  switch (mode) {
    case 'list':
      return lang === 'pt' ? `${who} ${vb(src, 'pt', 'procura', 'procuram')} ${theAll(res, 'pt')} ${where}` : `${who} ${vb(src, 'en', 'looks up', 'look up')} ${theAll(res, 'en')} ${where}`
    case 'one':
      return lang === 'pt' ? `${who} ${vb(src, 'pt', 'procura', 'procuram')} ${theOne(sing, 'pt')} pedid${ending(sing)} ${where}` : `${who} ${vb(src, 'en', 'looks up', 'look up')} the requested ${sing} ${where}`
    case 'update':
      return lang === 'pt' ? `${who} ${vb(src, 'pt', 'atualiza', 'atualizam')} ${theOne(sing, 'pt')} ${where}` : `${who} ${vb(src, 'en', 'updates', 'update')} the ${sing} ${where}`
    case 'delete':
      return lang === 'pt' ? `${who} ${vb(src, 'pt', 'apaga', 'apagam')} ${theOne(sing, 'pt')} ${where}` : `${who} ${vb(src, 'en', 'deletes', 'delete')} the ${sing} ${where}`
    default: {
      const humanItems = items.map((f) => humanField(f, lang))
      if (humanItems.length === 0) return lang === 'pt' ? `${who} ${vb(src, 'pt', 'guarda', 'guardam')} ${newOne(sing, 'pt')} ${where}` : `${who} ${vb(src, 'en', 'saves', 'save')} the new ${sing} ${where}`
      return fitList(humanItems, lang, (list) =>
        lang === 'pt' ? `${who} ${vb(src, 'pt', 'guarda', 'guardam')} ${newOne(sing, 'pt')} ${where}: ${list}` : `${who} ${vb(src, 'en', 'saves', 'save')} the new ${sing} ${where}: ${list}`,
      )
    }
  }
}

/** What the database answers to the service, in one language. */
function databaseReplyCaption(mode: Mode, res: string, db: Name, src: Name, lang: Lang): string {
  const sing = singularOf(res)
  const who = at('none', db, lang, true)
  const back = at('para', src, lang)
  const pt = lang === 'pt'
  switch (mode) {
    case 'list':
      return pt ? `${who} ${vb(db, 'pt', 'devolve', 'devolvem')} a lista de ${res} ${back}` : `${who} ${vb(db, 'en', 'returns', 'return')} the list of ${res} ${back}`
    case 'one':
      return pt ? `${who} ${vb(db, 'pt', 'devolve', 'devolvem')} ${theOne(sing, 'pt')} pedid${ending(sing)} ${back}` : `${who} ${vb(db, 'en', 'returns', 'return')} the requested ${sing} ${back}`
    case 'update':
      return pt ? `${who} ${vb(db, 'pt', 'confirma', 'confirmam')} ${back}: ${theOne(sing, 'pt')} foi atualizad${ending(sing)}` : `${who} ${vb(db, 'en', 'confirms', 'confirm')} ${back}: the ${sing} was updated`
    case 'delete':
      return pt ? `${who} ${vb(db, 'pt', 'confirma', 'confirmam')} ${back}: ${theOne(sing, 'pt')} foi apagad${ending(sing)}` : `${who} ${vb(db, 'en', 'confirms', 'confirm')} ${back}: the ${sing} was deleted`
    default:
      return pt ? `${who} ${vb(db, 'pt', 'confirma', 'confirmam')} ${back}: ${theOne(sing, 'pt')} foi guardad${ending(sing)}` : `${who} ${vb(db, 'en', 'confirms', 'confirm')} ${back}: the ${sing} was saved`
  }
}

/** What the screen shows once the answer is back, in one language. */
function showCaption(mode: Mode, res: string, screen: Name, lang: Lang): string {
  const sing = singularOf(res)
  const who = at('none', screen, lang, true)
  switch (mode) {
    case 'list':
      return lang === 'pt' ? `${who} ${vb(screen, 'pt', 'mostra', 'mostram')} a lista de ${res}` : `${who} ${vb(screen, 'en', 'shows', 'show')} the list of ${res}`
    case 'one':
      return lang === 'pt' ? `${who} ${vb(screen, 'pt', 'mostra', 'mostram')} ${theOne(sing, 'pt')}` : `${who} ${vb(screen, 'en', 'shows', 'show')} the ${sing}`
    case 'update':
      return lang === 'pt' ? `${who} ${vb(screen, 'pt', 'mostra', 'mostram')} que ${theOne(sing, 'pt')} foi atualizad${ending(sing)}` : `${who} ${vb(screen, 'en', 'shows', 'show')} that the ${sing} was updated`
    case 'delete':
      return lang === 'pt' ? `${who} ${vb(screen, 'pt', 'mostra', 'mostram')} que ${theOne(sing, 'pt')} foi apagad${ending(sing)}` : `${who} ${vb(screen, 'en', 'shows', 'show')} that the ${sing} was deleted`
    default:
      return lang === 'pt' ? `${who} ${vb(screen, 'pt', 'mostra', 'mostram')} que ${theOne(sing, 'pt')} foi salv${ending(sing)}` : `${who} ${vb(screen, 'en', 'shows', 'show')} that the ${sing} was saved`
  }
}

/** One request scene, with the parts of the plan it may use. */
function requestFlow(plan: RequestPlan, use: { sec: boolean; send: boolean; queue: boolean }): Flow {
  const { endpoint: ep, api, screen, known } = plan
  const sec = use.sec ? plan.sec : null
  const { verb, mode, res, title } = meaningOf(ep.method, ep.path)
  // Reading something rarely sends an e-mail or leaves a task behind, so only writes show them.
  const fetching = mode === 'list' || mode === 'one'
  const writes = !fetching
  const send = use.send && writes ? plan.send : null
  const queue = use.queue && writes ? plan.queue : null
  const svc = plan.svc
  const dbSvc = plan.db
  const an: Name = nameOf(api)
  const sn: Name | null = screen ? nameOf(screen) : null
  const secn: Name | null = sec ? nameOf(sec) : null
  const svcn: Name | null = svc ? nameOf(svc) : null
  const src = svc ?? api
  const srcn: Name = nameOf(src)
  const dbn: Name | null = dbSvc ? serviceName(dbSvc) : null
  const sendn: Name | null = send ? serviceName(send) : null
  const queuen: Name | null = queue ? serviceName(queue) : null
  const ref = { file: ep.file, line: ep.line }

  const actors: Actor[] = [PERSON]
  if (screen) actors.push(componentActor(screen))
  actors.push(componentActor(api))
  if (sec) actors.push(componentActor(sec))
  if (svc) actors.push(componentActor(svc))
  if (dbSvc) actors.push(externalActor(dbSvc))
  if (send) actors.push(externalActor(send))
  if (queue) actors.push(externalActor(queue))

  const steps: FlowStep[] = []
  const stepT = (from: string, to: string, action: StepAction, text: Text, say?: { pt: string; en: string }, at?: { file: string; line: number }) =>
    steps.push({ from, to, action, text, ...(say ? { say } : {}), ...(at ? { ref: at } : {}) })
  const step = (from: string, to: string, action: StepAction, pt: string, en: string, say?: { pt: string; en: string }, at?: { file: string; line: number }) =>
    stepT(from, to, action, { pt, en }, say, at)

  const screenFields = (known?.screen?.fields ?? []).map(plainLabel)
  const button = known && (mode === 'create' || mode === 'update') ? pickButton(known.screen?.buttons ?? []) : null

  if (screen && sn) {
    if (known) stepT('person', `c:${screen.id}`, 'ask', both((l) => personCaption(mode, sn, known.screen?.title ?? null, screenFields, button, res[l], l)), { pt: 'clique!', en: 'click!' })
    else step('person', `c:${screen.id}`, 'ask', `O usuário usa ${at('none', sn, 'pt')}`, `The user opens ${at('none', sn, 'en')}`, { pt: 'clique!', en: 'click!' })
    if (known) stepT(`c:${screen.id}`, `c:${api.id}`, 'ask', both((l) => screenToApiCaption(mode, known.sent, res[l], sn, an, l)), { pt: 'pedido!', en: 'request!' }, ref)
    else
      stepT(
        `c:${screen.id}`,
        `c:${api.id}`,
        'ask',
        both((l) => `${at('none', sn, l, true)} ${l === 'pt' ? `faz um pedido ${at('para', an, 'pt')}: ${verb.pt} ${res.pt}` : `sends a request ${at('para', an, 'en')}: ${verb.en} ${res.en}`}`),
        { pt: 'pedido!', en: 'request!' },
        ref,
      )
  } else {
    stepT(
      'person',
      `c:${api.id}`,
      'ask',
      both((l) => (l === 'pt' ? `O usuário faz um pedido ${at('para', an, 'pt')}: ${verb.pt} ${res.pt}` : `The user sends a request ${at('para', an, 'en')}: ${verb.en} ${res.en}`)),
      { pt: 'pedido!', en: 'request!' },
      ref,
    )
  }
  if (sec && secn) {
    stepT(`c:${api.id}`, `c:${sec.id}`, 'check', both((l) => (l === 'pt' ? `${at('none', secn, 'pt', true)} ${vb(secn, 'pt', 'confere', 'conferem')} se o usuário pode passar ${at('por', an, 'pt')}` : `${at('none', secn, 'en', true)} ${vb(secn, 'en', 'checks', 'check')} if the user can get in ${at('por', an, 'en')}`)), { pt: 'pode entrar?', en: 'allowed in?' })
    stepT(`c:${sec.id}`, `c:${api.id}`, 'reply', both((l) => (l === 'pt' ? `${at('none', secn, 'pt', true)} ${vb(secn, 'pt', 'libera', 'liberam')} o pedido ${at('para', an, 'pt')}` : `${at('none', secn, 'en', true)} ${vb(secn, 'en', 'lets', 'let')} the request through ${at('para', an, 'en')}`)), { pt: 'liberado', en: 'approved' })
  }
  if (svc && svcn) {
    stepT(`c:${api.id}`, `c:${svc.id}`, 'call', both((l) => (l === 'pt' ? `${at('none', an, 'pt', true)} ${vb(an, 'pt', 'passa', 'passam')} o trabalho ${at('para', svcn, 'pt')}` : `${at('none', an, 'en', true)} ${vb(an, 'en', 'hands', 'hand')} the work ${at('para', svcn, 'en')}`)), { pt: 'sua vez', en: 'your turn' })
  }
  if (dbSvc && dbn) {
    const srcId = svc ? `c:${svc.id}` : `c:${api.id}`
    const dbId = `e:${dbSvc.id}`
    const saysAction = fetching ? { pt: 'os dados?', en: 'the data?' } : { pt: 'guardar', en: 'save' }
    if (known) {
      const items = known.sent.length > 0 ? known.sent : (known.model?.fields ?? [])
      stepT(srcId, dbId, fetching ? 'fetch' : 'save', both((l) => databaseCaption(mode, items, res[l], srcn, dbn, l)), saysAction)
    } else if (fetching) {
      step(srcId, dbId, 'fetch', `${at('none', srcn, 'pt', true)} ${vb(srcn, 'pt', 'busca', 'buscam')} os dados ${at('em', dbn, 'pt')}`, `${at('none', srcn, 'en', true)} ${vb(srcn, 'en', 'fetches', 'fetch')} the data ${at('em', dbn, 'en')}`, saysAction)
    } else {
      step(srcId, dbId, 'save', `${at('none', srcn, 'pt', true)} ${vb(srcn, 'pt', 'guarda', 'guardam')} as mudanças ${at('em', dbn, 'pt')}`, `${at('none', srcn, 'en', true)} ${vb(srcn, 'en', 'saves', 'save')} the changes ${at('em', dbn, 'en')}`, saysAction)
    }
    if (known) {
      stepT(dbId, srcId, 'reply', both((l) => databaseReplyCaption(mode, res[l], dbn, srcn, l)), fetching ? { pt: 'aqui está', en: 'here you go' } : { pt: 'guardado!', en: 'saved!' })
    } else if (fetching) {
      step(dbId, srcId, 'reply', `${at('none', dbn, 'pt', true)} ${vb(dbn, 'pt', 'entrega', 'entregam')} os dados ${at('para', srcn, 'pt')}`, `${at('none', dbn, 'en', true)} ${vb(dbn, 'en', 'hands', 'hand')} over the data ${at('para', srcn, 'en')}`, { pt: 'aqui está', en: 'here you go' })
    } else {
      step(dbId, srcId, 'reply', `${at('none', dbn, 'pt', true)} ${vb(dbn, 'pt', 'confirma', 'confirmam')} ${at('para', srcn, 'pt')} que guardou`, `${at('none', dbn, 'en', true)} ${vb(dbn, 'en', 'confirms', 'confirm')} ${at('para', srcn, 'en')} it's saved`, { pt: 'guardado!', en: 'saved!' })
    }
  }
  // E-mails, payments and queued jobs happen before the answer goes back.
  if (send && sendn) {
    const what = SENT[send.kind] ?? { pt: 'os dados', en: 'the data' }
    const subject = known?.subject
    if (subject) {
      stepT(`c:${src.id}`, `e:${send.id}`, 'send', both((l) => (l === 'pt' ? `${at('none', srcn, 'pt', true)} ${vb(srcn, 'pt', 'envia', 'enviam')} o e-mail “${subject}” usando ${at('none', sendn, 'pt')}` : `${at('none', srcn, 'en', true)} ${vb(srcn, 'en', 'sends', 'send')} the e-mail “${subject}” using ${at('none', sendn, 'en')}`)), {
        pt: 'enviado!',
        en: 'sent!',
      })
    } else {
      step(`c:${src.id}`, `e:${send.id}`, 'send', `${at('none', srcn, 'pt', true)} ${vb(srcn, 'pt', 'envia', 'enviam')} ${what.pt} usando ${at('none', sendn, 'pt')}`, `${at('none', srcn, 'en', true)} ${vb(srcn, 'en', 'sends', 'send')} ${what.en} using ${at('none', sendn, 'en')}`, { pt: 'enviado!', en: 'sent!' })
    }
  }
  if (queue && queuen) {
    const task = known?.task
    if (task) {
      stepT(`c:${src.id}`, `e:${queue.id}`, 'queue', both((l) => (l === 'pt' ? `${at('none', srcn, 'pt', true)} ${vb(srcn, 'pt', 'deixa', 'deixam')} uma tarefa ${task.pt} ${at('em', queuen, 'pt')}` : `${at('none', srcn, 'en', true)} ${vb(srcn, 'en', 'leaves', 'leave')} a task ${task.en} ${at('em', queuen, 'en')}`)), {
        pt: 'pra depois',
        en: 'for later',
      })
    } else {
      step(`c:${src.id}`, `e:${queue.id}`, 'queue', `${at('none', srcn, 'pt', true)} ${vb(srcn, 'pt', 'deixa', 'deixam')} uma tarefa ${at('em', queuen, 'pt')}`, `${at('none', srcn, 'en', true)} ${vb(srcn, 'en', 'leaves', 'leave')} a task ${at('em', queuen, 'en')}`, { pt: 'pra depois', en: 'for later' })
    }
  }
  if (svc && svcn) {
    step(`c:${svc.id}`, `c:${api.id}`, 'reply', `${at('none', svcn, 'pt', true)} ${vb(svcn, 'pt', 'devolve', 'devolvem')} o resultado ${at('para', an, 'pt')}`, `${at('none', svcn, 'en', true)} ${vb(svcn, 'en', 'returns', 'return')} the result ${at('para', an, 'en')}`, { pt: 'pronto', en: 'done' })
  }
  if (screen && sn) {
    step(`c:${api.id}`, `c:${screen.id}`, 'reply', `${at('none', an, 'pt', true)} ${vb(an, 'pt', 'devolve', 'devolvem')} a resposta ${at('para', sn, 'pt')}`, `${at('none', an, 'en', true)} ${vb(an, 'en', 'sends', 'send')} back the answer ${at('para', sn, 'en')}`, { pt: 'resposta!', en: 'answer!' })
    if (known) stepT(`c:${screen.id}`, `c:${screen.id}`, 'show', both((l) => showCaption(mode, res[l], sn, l)), { pt: 'na tela!', en: 'on screen!' })
    else step(`c:${screen.id}`, `c:${screen.id}`, 'show', `${at('none', sn, 'pt', true)} ${vb(sn, 'pt', 'mostra', 'mostram')} o resultado na tela`, `${at('none', sn, 'en', true)} ${vb(sn, 'en', 'shows', 'show')} the result on the screen`, { pt: 'na tela!', en: 'on screen!' })
  } else {
    step(`c:${api.id}`, 'person', 'reply', `${at('none', an, 'pt', true)} ${vb(an, 'pt', 'devolve', 'devolvem')} a resposta`, `${at('none', an, 'en', true)} ${vb(an, 'en', 'sends', 'send')} back the answer`, { pt: 'resposta!', en: 'answer!' })
  }

  return {
    id: `request:${ep.method} ${ep.path}`,
    kind: 'request',
    title,
    // In words, not HTTP: what the person wants done, and who it passes through.
    summary: {
      pt: clip(
        `O caminho de um pedido para ${verb.pt} ${res.pt}: ${sn ? `${at('de', sn, 'pt')} ` : ''}até ${at('none', an, 'pt')}${svcn ? `, ${at('none', svcn, 'pt')}` : ''}${dbn ? ` e ${at('none', dbn, 'pt')}` : ''}, e de volta.`,
        400,
      ),
      en: clip(
        `How a request to ${verb.en} ${res.en} travels: ${sn ? `from ${at('none', sn, 'en')} ` : ''}to ${at('none', an, 'en')}${svcn ? `, ${at('none', svcn, 'en')}` : ''}${dbn ? ` and ${at('none', dbn, 'en')}` : ''}, and back.`,
        400,
      ),
    },
    actors,
    steps,
  }
}

/** Who the person of a journey is, when the page's folder or address says it ("(cliente)", "/aluno/…"). */
const ROLES = new Map<string, Text>([
  ['cliente', { pt: 'Cliente', en: 'Customer' }],
  ['clientes', { pt: 'Cliente', en: 'Customer' }],
  ['customer', { pt: 'Cliente', en: 'Customer' }],
  ['aluno', { pt: 'Aluno', en: 'Student' }],
  ['alunos', { pt: 'Aluno', en: 'Student' }],
  ['student', { pt: 'Aluno', en: 'Student' }],
  ['professor', { pt: 'Professor', en: 'Teacher' }],
  ['teacher', { pt: 'Professor', en: 'Teacher' }],
  ['paciente', { pt: 'Paciente', en: 'Patient' }],
  ['patient', { pt: 'Paciente', en: 'Patient' }],
  ['vendedor', { pt: 'Vendedor', en: 'Seller' }],
  ['seller', { pt: 'Vendedor', en: 'Seller' }],
  ['motorista', { pt: 'Motorista', en: 'Driver' }],
  ['driver', { pt: 'Motorista', en: 'Driver' }],
  ['organizador', { pt: 'Organizador', en: 'Organizer' }],
  ['org', { pt: 'Organizador', en: 'Organizer' }],
  ['admin', { pt: 'Administrador', en: 'Admin' }],
])

function roleOf(file: string, pagePath: string | null): Text | null {
  const words = [...file.split('/'), ...(pagePath ?? '').split('/')].map((s) => s.replace(/^\((.*)\)$/, '$1').toLowerCase())
  for (const w of words) {
    const role = ROLES.get(w)
    if (role) return role
  }
  return null
}

/** A Portuguese verb for one subject or many: "cancelar" → "cancela"/"cancelam", "conferir" → "confere", "concluir" → "conclui". */
function presentPt(verb: string, plural: boolean): string {
  const [head, ...rest] = verb.split(' ')
  const stem = head.slice(0, -2)
  const v = /uir$/.test(head) ? stem + (plural ? 'em' : 'i') : /ar$/.test(head) ? stem + (plural ? 'am' : 'a') : stem + (plural ? 'em' : 'e')
  return [v, ...rest].join(' ')
}

/** An English verb for one subject or many: "cancel" → "cancels", "sign up" → "signs up", "publish" → "publishes". */
function presentEn(verb: string, plural: boolean): string {
  if (plural) return verb
  const [head, ...rest] = verb.split(' ')
  return [/(?:s|sh|ch|x|z)$/.test(head) ? `${head}es` : `${head}s`, ...rest].join(' ')
}

/** Participles that are not the verb plus "-ado"/"-ido". */
const PT_PARTICIPLES = new Map([['pagar', 'pag'], ['aceitar', 'aceit']])
const EN_PARTICIPLES = new Map([['pay', 'paid'], ['send', 'sent'], ['cancel', 'cancelled'], ['sync', 'synced']])

/** "a reserva foi cancelada": the participle agreeing with the thing. */
function participlePt(verb: string, sing: string): string {
  const [head, ...rest] = verb.split(' ')
  const end = ending(sing)
  const irregular = PT_PARTICIPLES.get(head)
  const v = irregular ? irregular + end : /uir$/.test(head) ? `${head.slice(0, -2)}íd${end}` : /ar$/.test(head) ? `${head.slice(0, -2)}ad${end}` : `${head.slice(0, -2)}id${end}`
  return [v, ...rest].join(' ')
}

function participleEn(verb: string): string {
  const [head, ...rest] = verb.split(' ')
  const v = EN_PARTICIPLES.get(head) ?? (head.endsWith('e') ? `${head}d` : head.endsWith('y') && !/[aeiou]y$/.test(head) ? `${head.slice(0, -1)}ied` : `${head}ed`)
  return [v, ...rest].join(' ')
}

/** A speech bubble of at most three words. */
function bubble(text: string): string {
  const words = text.split(/\s+/)
  return words.length <= 3 ? text : `${words.slice(0, 2).join(' ')}…`
}

/** Everything a journey scene is made of: the request it ends in, the button, the page and the person. */
type JourneyPlan = { plan: RequestPlan; meaning: Meaning; button: string; confirm: boolean; page: string | null; role: Text | null }

/**
 * One journey: the person opens the page, presses the button (and confirms, when the screen asks),
 * the screen asks the system, the system does it in the database and tells by e-mail, and the
 * screen shows it done. Told in the person's steps, so a client sees the path of their own action.
 */
function journeyFlow(j: JourneyPlan, use: { sec: boolean; send: boolean }): Flow {
  const { plan, meaning, button, confirm, page, role } = j
  const { endpoint: ep, api, known } = plan
  const screen = plan.screen as Component
  const sec = use.sec ? plan.sec : null
  const svc = plan.svc
  const fetching = meaning.mode === 'list' || meaning.mode === 'one'
  const send = use.send && !fetching ? plan.send : null
  const dbSvc = plan.db
  const verb = meaning.verb
  const sing = singularOf(meaning.res.pt)
  const singEn = singularOf(meaning.res.en)
  const person: Actor = role ? { ...PERSON, name: role } : PERSON
  const p = { pt: `O ${person.name.pt.toLowerCase()}`, en: `The ${person.name.en.toLowerCase()}` }
  const sn = nameOf(screen)
  const an = nameOf(api)
  const secn = sec ? nameOf(sec) : null
  const svcn = svc ? nameOf(svc) : null
  const src = svc ?? api
  const srcn = nameOf(src)
  const dbn = dbSvc ? serviceName(dbSvc) : null
  const sendn = send ? serviceName(send) : null
  const ref = { file: ep.file, line: ep.line }
  const oneItem = /[:{<[$]/.test(ep.path.split('/').filter(Boolean).pop() ?? '') || ROUTE_ACTIONS.has((routeWords(ep.path).pop() ?? '').toLowerCase())
  const thing = { pt: meaning.mode === 'create' ? oneOf(sing, 'pt') : theOne(sing, 'pt'), en: meaning.mode === 'create' ? oneOf(singEn, 'en') : `the ${singEn}` }
  const done = { pt: participlePt(verb.pt, sing), en: participleEn(verb.en) }

  const actors: Actor[] = [person, componentActor(screen), componentActor(api)]
  if (sec) actors.push(componentActor(sec))
  if (svc) actors.push(componentActor(svc))
  if (dbSvc) actors.push(externalActor(dbSvc))
  if (send) actors.push(externalActor(send))

  const steps: FlowStep[] = []
  const step = (from: string, to: string, action: StepAction, text: Text, say: Text, at?: { file: string; line: number }) =>
    steps.push({ from, to, action, text, say, ...(at ? { ref: at } : {}) })
  const sc = (l: Lang) => at('none', sn, l, true)
  const scId = `c:${screen.id}`
  const apiId = `c:${api.id}`
  const srcId = `c:${src.id}`

  const titled = !!page && !sn.pt.toLowerCase().includes(page.toLowerCase())
  step('person', scId, 'ask', {
    pt: titled ? `${p.pt} abre “${page}” ${at('em', sn, 'pt')}` : `${p.pt} abre ${at('none', sn, 'pt')}`,
    en: titled ? `${p.en} opens “${page}” ${at('em', sn, 'en')}` : `${p.en} opens ${at('none', sn, 'en')}`,
  }, { pt: 'abrir', en: 'open' })
  step('person', scId, 'ask', {
    pt: oneItem ? `${p.pt} clica em “${button}” ${feminine(sing) ? 'numa' : 'num'} ${sing}` : `${p.pt} clica em “${button}”`,
    en: oneItem ? `${p.en} clicks “${button}” on ${oneOf(singEn, 'en')}` : `${p.en} clicks “${button}”`,
  }, { pt: bubble(button), en: bubble(button) })
  if (confirm) {
    step(scId, 'person', 'ask', {
      pt: `${sc('pt')} ${vb(sn, 'pt', 'pergunta', 'perguntam')} se ${p.pt.toLowerCase()} tem certeza`,
      en: `${sc('en')} ${vb(sn, 'en', 'asks', 'ask')} if ${p.en.toLowerCase()} is sure`,
    }, { pt: 'certeza?', en: 'sure?' })
    step('person', scId, 'reply', { pt: `${p.pt} confirma`, en: `${p.en} confirms` }, { pt: 'sim!', en: 'yes!' })
  }
  step(scId, apiId, 'ask', {
    pt: `${sc('pt')} ${vb(sn, 'pt', 'pede', 'pedem')} ${at('para', an, 'pt')} ${verb.pt} ${thing.pt}`,
    en: `${sc('en')} ${vb(sn, 'en', 'asks', 'ask')} ${at('none', an, 'en')} to ${verb.en} ${thing.en}`,
  }, { pt: 'pedido!', en: 'request!' }, ref)
  if (sec && secn) {
    step(apiId, `c:${sec.id}`, 'check', { pt: `${at('none', secn, 'pt', true)} ${vb(secn, 'pt', 'confere', 'conferem')} se ${p.pt.toLowerCase()} pode fazer isso`, en: `${at('none', secn, 'en', true)} ${vb(secn, 'en', 'checks', 'check')} if ${p.en.toLowerCase()} may do it` }, { pt: 'pode?', en: 'allowed?' })
    step(`c:${sec.id}`, apiId, 'reply', { pt: `${at('none', secn, 'pt', true)} ${vb(secn, 'pt', 'libera', 'liberam')} o pedido`, en: `${at('none', secn, 'en', true)} ${vb(secn, 'en', 'lets', 'let')} the request through` }, { pt: 'liberado', en: 'approved' })
  }
  if (svc && svcn) {
    step(apiId, `c:${svc.id}`, 'call', { pt: `${at('none', an, 'pt', true)} ${vb(an, 'pt', 'passa', 'passam')} o trabalho ${at('para', svcn, 'pt')}`, en: `${at('none', an, 'en', true)} ${vb(an, 'en', 'hands', 'hand')} the work ${at('para', svcn, 'en')}` }, { pt: 'sua vez', en: 'your turn' })
  }
  if (dbSvc && dbn) {
    const dbId = `e:${dbSvc.id}`
    if (fetching) {
      step(srcId, dbId, 'fetch', { pt: `${at('none', srcn, 'pt', true)} ${vb(srcn, 'pt', 'procura', 'procuram')} ${theOne(sing, 'pt')} ${at('em', dbn, 'pt')}`, en: `${at('none', srcn, 'en', true)} ${vb(srcn, 'en', 'looks up', 'look up')} the ${singEn} ${at('em', dbn, 'en')}` }, { pt: 'os dados?', en: 'the data?' })
      step(dbId, srcId, 'reply', { pt: `${at('none', dbn, 'pt', true)} ${vb(dbn, 'pt', 'devolve', 'devolvem')} ${theOne(sing, 'pt')} ${at('para', srcn, 'pt')}`, en: `${at('none', dbn, 'en', true)} ${vb(dbn, 'en', 'returns', 'return')} the ${singEn} ${at('para', srcn, 'en')}` }, { pt: 'aqui está', en: 'here you go' })
    } else {
      step(srcId, dbId, 'save', {
        pt: `${at('none', srcn, 'pt', true)} ${presentPt(verb.pt, isPlural(srcn.pt, 'pt'))} ${theOne(sing, 'pt')} ${at('em', dbn, 'pt')}`,
        en: `${at('none', srcn, 'en', true)} ${presentEn(verb.en, isPlural(srcn.en, 'en'))} the ${singEn} ${at('em', dbn, 'en')}`,
      }, { pt: 'guardar', en: 'save' })
      step(dbId, srcId, 'reply', {
        pt: `${at('none', dbn, 'pt', true)} ${vb(dbn, 'pt', 'confirma', 'confirmam')} ${at('para', srcn, 'pt')}: ${theOne(sing, 'pt')} foi ${done.pt}`,
        en: `${at('none', dbn, 'en', true)} ${vb(dbn, 'en', 'confirms', 'confirm')} ${at('para', srcn, 'en')}: the ${singEn} was ${done.en}`,
      }, { pt: 'feito!', en: 'done!' })
    }
  }
  if (send && sendn) {
    const what = SENT[send.kind] ?? { pt: 'os dados', en: 'the data' }
    const subject = known?.subject
    step(`c:${src.id}`, `e:${send.id}`, 'send', {
      pt: `${at('none', srcn, 'pt', true)} ${vb(srcn, 'pt', 'envia', 'enviam')} ${subject ? `o e-mail “${subject}”` : what.pt} usando ${at('none', sendn, 'pt')}`,
      en: `${at('none', srcn, 'en', true)} ${vb(srcn, 'en', 'sends', 'send')} ${subject ? `the e-mail “${subject}”` : what.en} using ${at('none', sendn, 'en')}`,
    }, { pt: 'enviado!', en: 'sent!' })
  }
  if (svc && svcn) {
    step(`c:${svc.id}`, apiId, 'reply', { pt: `${at('none', svcn, 'pt', true)} ${vb(svcn, 'pt', 'devolve', 'devolvem')} o resultado ${at('para', an, 'pt')}`, en: `${at('none', svcn, 'en', true)} ${vb(svcn, 'en', 'returns', 'return')} the result ${at('para', an, 'en')}` }, { pt: 'pronto', en: 'done' })
  }
  step(apiId, scId, 'reply', { pt: `${at('none', an, 'pt', true)} ${vb(an, 'pt', 'devolve', 'devolvem')} a resposta ${at('para', sn, 'pt')}`, en: `${at('none', an, 'en', true)} ${vb(an, 'en', 'sends', 'send')} back the answer ${at('para', sn, 'en')}` }, { pt: 'resposta!', en: 'answer!' })
  step(scId, scId, 'show', fetching
    ? { pt: `${sc('pt')} ${vb(sn, 'pt', 'mostra', 'mostram')} ${theOne(sing, 'pt')}`, en: `${sc('en')} ${vb(sn, 'en', 'shows', 'show')} the ${singEn}` }
    : { pt: `${sc('pt')} ${vb(sn, 'pt', 'mostra', 'mostram')} que ${theOne(sing, 'pt')} foi ${done.pt}`, en: `${sc('en')} ${vb(sn, 'en', 'shows', 'show')} that the ${singEn} was ${done.en}` },
    { pt: 'pronto!', en: 'done!' })

  return {
    id: `journey:${ep.method} ${ep.path}`,
    kind: 'journey',
    // A button of several words says the journey in the app's own words ("Sair da turma"); one word
    // ("Cancelar") is the verb, told with the thing: "O usuário cancela uma reserva".
    title: /\p{L}+\s+\p{L}/u.test(button)
      ? { pt: cap(button), en: cap(button) }
      : { pt: `${p.pt} ${presentPt(verb.pt, false)} ${oneOf(sing, 'pt')}`, en: `${p.en} ${presentEn(verb.en, false)} ${oneOf(singEn, 'en')}` },
    summary: {
      pt: clip(`O caminho de quem usa o sistema para ${verb.pt} ${oneOf(sing, 'pt')}: ${page ? `da página “${page}”` : `${at('de', sn, 'pt')}`}, pelo botão “${button}”, até ${at('none', dbn ?? srcn, 'pt')}, e de volta.`, 400),
      en: clip(`The path of a person who wants to ${verb.en} ${oneOf(singEn, 'en')}: from ${page ? `the “${page}” page` : at('none', sn, 'en')}, through the “${button}” button, to ${at('none', dbn ?? srcn, 'en')}, and back.`, 400),
    },
    actors,
    steps,
  }
}

/** Builds a journey, dropping the security check and then the e-mail until it fits the limits. */
function fitJourney(j: JourneyPlan): Flow {
  let flow = journeyFlow(j, { sec: true, send: true })
  for (const o of [{ sec: false, send: true }, { sec: false, send: false }]) {
    if (flow.actors.length <= MAX_ACTORS && flow.steps.length <= MAX_STEPS) break
    flow = journeyFlow(j, o)
  }
  return flow
}

/**
 * The journeys worth telling: buttons whose route does something to a thing (cancel, pay, approve,
 * sign up first, then delete, then create or change). Reading is not a journey. At most two, one per route.
 */
function journeyPlans(ctx: Ctx, endpoints: Endpoint[]): JourneyPlan[] {
  const out: (JourneyPlan & { rank: number; key: string; file: string })[] = []
  for (const action of ctx.details?.actions ?? []) {
    if (isPlumbing(action.path)) continue
    const found = endpoints.find((e) => e.path === action.path && (e.method === action.method || e.method === 'ANY'))
    const pageInfo = ctx.details?.pages?.get(action.file) ?? null
    // A button in a piece of a page is pressed on that page: the page's part is the screen.
    const screen = componentOf(pageInfo?.file ?? action.file, ctx.components)
    if (!found || !screen) continue
    const ep = { ...found, method: action.method }
    const key = `${ep.method} ${ep.path}`
    // One journey per route, and per button: a form's "Salvar" that creates or updates is one journey.
    if (out.some((j) => j.key === key || (j.file === action.file && j.button === action.button))) continue
    const meaning = meaningOf(ep.method, ep.path)
    const last = (routeWords(ep.path).pop() ?? '').toLowerCase()
    const named = ROUTE_ACTIONS.has(last) || SIGNUP.has(last)
    if (!named && (meaning.mode === 'list' || meaning.mode === 'one')) continue
    const plan = planRequest(ctx, ep)
    if (!plan) continue
    out.push({
      plan: { ...plan, screen },
      meaning,
      button: action.button,
      confirm: action.confirm,
      page: pageInfo?.name ?? ctx.details?.screens.get(action.file)?.title ?? null,
      role: roleOf(action.file, pageInfo?.path ?? null),
      rank: named ? 3 : meaning.mode === 'delete' ? 2 : 1,
      key,
      file: action.file,
    })
  }
  return out.sort((a, b) => b.rank - a.rank).slice(0, 2)
}

/** Builds a request scene, dropping optional parts until it fits the actor and step limits. */
function fitRequest(plan: RequestPlan): Flow {
  const options = [
    { sec: true, send: true, queue: true },
    { sec: true, send: true, queue: false },
    { sec: true, send: false, queue: false },
    { sec: false, send: false, queue: false },
  ]
  let flow = requestFlow(plan, options[0])
  for (const o of options) {
    flow = requestFlow(plan, o)
    if (flow.actors.length <= MAX_ACTORS && flow.steps.length <= MAX_STEPS) break
  }
  return flow
}

/** The name of a node in an agent's graph, as a reader sees it. */
function nodeLabel(agent: Agent, id: string, lang: Lang): string {
  const label = agent.graph.nodes.find((n) => n.id === id)?.label ?? id
  return plainToolName(label)[lang]
}

/** Plain text for the decision an agent makes: its explicit graph's branches, or the tools it can pick from. */
function decisionText(agent: Agent, name: Name): { pt: string; en: string } {
  if (agent.graph.explicit) {
    const from = agent.graph.nodes.find((n) => agent.graph.links.filter((l) => l.from === n.id && l.condition).length >= 2)
    if (from) {
      const branches = agent.graph.links.filter((l) => l.from === from.id && l.condition).slice(0, 3)
      return {
        pt: `${at('none', name, 'pt', true)} ${vb(name, 'pt', 'escolhe', 'escolhem')} o caminho: ${branches.map((l) => `se ${l.condition}, vai para ${nodeLabel(agent, l.to, 'pt')}`).join('; ')}`,
        en: `${at('none', name, 'en', true)} ${vb(name, 'en', 'picks', 'pick')} a path: ${branches.map((l) => `if ${l.condition}, goes to ${nodeLabel(agent, l.to, 'en')}`).join('; ')}`,
      }
    }
  }
  const n = agent.tools.length
  const names = joinList(agent.tools.slice(0, 3).map((t) => plainToolName(t.name).pt), 'pt')
  const namesEn = joinList(agent.tools.slice(0, 3).map((t) => plainToolName(t.name).en), 'en')
  return {
    pt: `${at('none', name, 'pt', true)} ${vb(name, 'pt', 'escolhe', 'escolhem')} ${n === 1 ? 'a ferramenta' : `entre ${n} ferramentas`}: ${names}`,
    en: `${at('none', name, 'en', true)} ${vb(name, 'en', 'chooses', 'choose')} ${n === 1 ? 'the tool' : `between ${n} tools`}: ${namesEn}`,
  }
}

/** One agent's scene: the message, the instructions, the model, its tool choices and the answer. */
function agentFlow(ctx: Ctx, agent: Agent, nTools: number): Flow {
  const comp = ctx.byId.get(agent.component)
  const caller = comp ? heaviestCaller(ctx, comp.id, (c) => c.layer === 'interface' || c.layer === 'api') : null
  const callerIsScreen = caller?.layer === 'interface'
  const llm =
    ctx.externals.find((e) => e.kind === 'llm' && e.name === agent.provider && (!comp || e.usedBy.includes(comp.id))) ??
    ctx.externals.find((e) => e.kind === 'llm' && !!comp && e.usedBy.includes(comp.id)) ??
    null
  const S: Name = plainAgentName(comp ?? null, agent.name)
  const llmName: Name = plainExternalName('llm')
  const M = agent.model ?? agent.provider
  const modelNote = agent.model && agent.provider ? { pt: `, de ${agent.provider},`, en: `, from ${agent.provider},` } : { pt: '', en: '' }
  const tools = agent.tools.slice(0, nTools)
  const agentActorId = `a:${agent.id}`
  const llmActorId = 'm'
  const callerName: Name | null = caller ? nameOf(caller) : null
  const toolName = (t: { name: string }): Name => plainToolName(t.name)

  const actors: Actor[] = [PERSON]
  if (caller) actors.push(componentActor(caller))
  const codeName = ` (no código: ${agent.name})`
  actors.push({
    id: agentActorId,
    name: S,
    technical: { pt: comp ? comp.name : agent.name, en: comp ? comp.name : agent.name },
    kind: 'agent',
    component: comp?.id ?? null,
    external: null,
    note: agent.instructions
      ? { en: clip(`${agent.instructions}${codeName}`, 200), pt: clip(`${agent.instructions}${codeName}`, 200) }
      : { en: `Decides what to do with the message${codeName}.`, pt: `Decide o que fazer com a mensagem${codeName}.` },
  })
  const modelId = agent.model ?? agent.provider
  actors.push({
    id: llmActorId,
    name: llmName,
    technical: { pt: modelId, en: modelId },
    kind: 'llm',
    component: null,
    external: llm?.id ?? null,
    note: {
      pt: `${M}${modelNote.pt} responde e decide.`,
      en: `${M}${modelNote.en} answers and decides.`,
    },
  })
  for (const t of tools) {
    actors.push({
      id: `t:${t.name}`,
      name: toolName(t),
      technical: { pt: t.name, en: t.name },
      kind: 'tool',
      component: null,
      external: null,
      note: {
        en: t.description ?? 'A tool the assistant can use.',
        pt: t.description ?? 'Uma ferramenta que o assistente pode usar.',
      },
    })
  }

  const steps: FlowStep[] = []
  const step = (from: string, to: string, action: StepAction, pt: string, en: string, say?: { pt: string; en: string }, at?: { file: string; line: number }) =>
    steps.push({ from, to, action, text: { pt, en }, ...(say ? { say } : {}), ...(at ? { ref: at } : {}) })
  const agentRef = { file: agent.file, line: agent.graph.nodes.find((n) => n.kind === 'llm')?.line ?? 1 }
  const sAgent = at('none', S, 'pt', true)
  const sAgentEn = at('none', S, 'en', true)
  const toAgent = at('para', S, 'pt')
  const toAgentEn = at('para', S, 'en')
  const askModelPt = at('a', llmName, 'pt')
  const askModelEn = at('a', llmName, 'en')
  const sLlm = at('none', llmName, 'pt', true)
  const sLlmEn = at('none', llmName, 'en', true)

  if (caller && callerName) {
    step('person', `c:${caller.id}`, 'ask', `O usuário manda uma mensagem ${at('para', callerName, 'pt')}`, `The user sends a message ${at('para', callerName, 'en')}`, { pt: 'oi!', en: 'hi!' })
    step(
      `c:${caller.id}`,
      agentActorId,
      'call',
      `${at('none', callerName, 'pt', true)} ${vb(callerName, 'pt', 'entrega', 'entregam')} a mensagem ${toAgent}`,
      `${at('none', callerName, 'en', true)} ${vb(callerName, 'en', 'hands', 'hand')} the message ${toAgentEn}`,
      { pt: 'a mensagem', en: 'the message' },
    )
  } else {
    step('person', agentActorId, 'ask', `O usuário manda uma mensagem ${toAgent}`, `The user sends a message ${toAgentEn}`, { pt: 'oi!', en: 'hi!' })
  }
  const firstSaid = agent.instructions ? firstSentence(agent.instructions, 90) : ''
  if (firstSaid) {
    step(agentActorId, agentActorId, 'think', `${sAgent} ${vb(S, 'pt', 'lê', 'leem')} as instruções: “${firstSaid}”`, `${sAgentEn} ${vb(S, 'en', 'reads', 'read')} its instructions: “${firstSaid}”`, { pt: 'instruções', en: 'instructions' })
  } else {
    step(agentActorId, agentActorId, 'think', `${sAgent} ${vb(S, 'pt', 'lê', 'leem')} a conversa`, `${sAgentEn} ${vb(S, 'en', 'reads', 'read')} the conversation`, { pt: 'a conversa', en: 'the chat' })
  }
  step(agentActorId, llmActorId, 'ask', `${sAgent} ${vb(S, 'pt', 'pergunta', 'perguntam')} ${askModelPt} o que fazer`, `${sAgentEn} ${vb(S, 'en', 'asks', 'ask')} ${askModelEn} what to do`, { pt: 'e agora?', en: 'now what?' })
  const firstTool = agent.tools[0] ? toolName(agent.tools[0]) : null
  step(llmActorId, agentActorId, 'reply', `${sLlm} ${vb(llmName, 'pt', 'sugere', 'sugerem')} ${at('a', S, 'pt')} usar uma ferramenta ou responder direto`, `${sLlmEn} ${vb(llmName, 'en', 'suggests', 'suggest')} ${at('none', S, 'en')} using a tool or answering directly`, {
    pt: firstTool ? `${firstTool.pt}?` : 'responder',
    en: firstTool ? `${firstTool.en}?` : 'answer',
  })
  if (agent.tools.length) {
    const d = decisionText(agent, S)
    step(agentActorId, agentActorId, 'decide', d.pt, d.en, { pt: 'qual delas?', en: 'which one?' })
    for (const t of tools) {
      const tn = toolName(t)
      step(
        agentActorId,
        `t:${t.name}`,
        'use-tool',
        `Se precisar, ${sAgent.charAt(0).toLowerCase() + sAgent.slice(1)} ${vb(S, 'pt', 'usa', 'usam')} a ferramenta “${tn.pt}”`,
        `If needed, ${sAgentEn.charAt(0).toLowerCase() + sAgentEn.slice(1)} ${vb(S, 'en', 'uses', 'use')} the “${tn.en}” tool`,
        { pt: tn.pt, en: tn.en },
        { file: t.file, line: t.line },
      )
      step(`t:${t.name}`, agentActorId, 'reply', `A ferramenta “${tn.pt}” devolve o resultado ${toAgent}`, `The “${tn.en}” tool returns the result ${toAgentEn}`, { pt: 'pronto', en: 'done' }, { file: t.file, line: t.line })
    }
  }
  if (agent.loop) {
    step(agentActorId, llmActorId, 'ask', `${sAgent} ${vb(S, 'pt', 'pergunta', 'perguntam')} de novo ${askModelPt}, com o resultado`, `${sAgentEn} ${vb(S, 'en', 'asks', 'ask')} ${askModelEn} again, with the result`, { pt: 'de novo!', en: 'again!' })
    step(llmActorId, agentActorId, 'reply', `${sLlm} ${vb(llmName, 'pt', 'escreve', 'escrevem')} a resposta final ${toAgent}`, `${sLlmEn} ${vb(llmName, 'en', 'writes', 'write')} the final answer ${toAgentEn}`, { pt: 'resposta', en: 'answer' })
  }
  if (callerIsScreen && caller && callerName) {
    step(agentActorId, `c:${caller.id}`, 'reply', `${sAgent} ${vb(S, 'pt', 'responde', 'respondem')} ao usuário`, `${sAgentEn} ${vb(S, 'en', 'answers', 'answer')} the user`, { pt: 'resposta!', en: 'answer!' }, agentRef)
    step(
      `c:${caller.id}`,
      `c:${caller.id}`,
      'show',
      `${at('none', callerName, 'pt', true)} ${vb(callerName, 'pt', 'mostra', 'mostram')} a resposta na tela`,
      `${at('none', callerName, 'en', true)} ${vb(callerName, 'en', 'shows', 'show')} the answer on the screen`,
      { pt: 'na tela!', en: 'on screen!' },
    )
  } else if (caller && callerName) {
    step(agentActorId, `c:${caller.id}`, 'reply', `${sAgent} ${vb(S, 'pt', 'devolve', 'devolvem')} a resposta ${at('para', callerName, 'pt')}`, `${sAgentEn} ${vb(S, 'en', 'sends', 'send')} the answer back ${at('para', callerName, 'en')}`, { pt: 'resposta!', en: 'answer!' }, agentRef)
    step(`c:${caller.id}`, 'person', 'reply', `${at('none', callerName, 'pt', true)} ${vb(callerName, 'pt', 'responde', 'respondem')} ao usuário`, `${at('none', callerName, 'en', true)} ${vb(callerName, 'en', 'answers', 'answer')} the user`, { pt: 'resposta!', en: 'answer!' })
  } else {
    step(agentActorId, 'person', 'reply', `${sAgent} ${vb(S, 'pt', 'responde', 'respondem')} ao usuário`, `${sAgentEn} ${vb(S, 'en', 'answers', 'answer')} the user`, { pt: 'resposta!', en: 'answer!' }, agentRef)
  }

  const n = agent.tools.length
  return {
    id: `agent:${agent.id}`,
    kind: 'agent',
    title: { pt: `Como ${at('none', S, 'pt')} decide`, en: `How ${at('none', S, 'en')} decides` },
    summary: {
      pt: clip(`${sAgent} ${vb(S, 'pt', 'lê', 'leem')} o pedido, ${vb(S, 'pt', 'pergunta', 'perguntam')} ${askModelPt} e decide se precisa usar uma ferramenta${n ? ` entre ${n}` : ''}.`, 400),
      en: clip(`${sAgentEn} ${vb(S, 'en', 'reads', 'read')} the request, ${vb(S, 'en', 'asks', 'ask')} ${askModelEn} and decides whether it needs a tool${n ? ` out of ${n}` : ''}.`, 400),
    },
    actors,
    steps,
  }
}

/** Builds an agent scene, using fewer tools when the scene would be too long. */
function fitAgent(ctx: Ctx, agent: Agent): Flow {
  let n = Math.min(2, agent.tools.length)
  let flow = agentFlow(ctx, agent, n)
  while (flow.steps.length > MAX_STEPS && n > 0) {
    n--
    flow = agentFlow(ctx, agent, n)
  }
  return flow
}

/** The background job scene: work goes onto a queue by one part and is done by a worker. */
function jobFlow(ctx: Ctx): Flow | null {
  const workers = ctx.components.filter((c) => c.layer === 'jobs')
  if (workers.length === 0) return null
  const incoming = (c: Component) => ctx.deps.filter((d) => d.to === c.id).reduce((s, d) => s + d.weight, 0)
  const worker = [...workers].sort((a, b) => incoming(b) - incoming(a))[0]
  const queue = ctx.externals.find((e) => e.kind === 'queue' && e.usedBy.some((id) => id !== worker.id)) ?? ctx.externals.find((e) => e.kind === 'queue') ?? null
  const producer =
    (queue ? ctx.components.find((c) => c.id !== worker.id && queue.usedBy.includes(c.id) && c.layer !== 'jobs') : undefined) ??
    heaviestCaller(ctx, worker.id, (c) => c.layer !== 'jobs' && c.layer !== 'tests')
  if (!producer) return null
  // The worker's own services, and the parts it hands work to, decide what it stores or sends.
  const owners = [worker.id, ...ctx.deps.filter((d) => d.from === worker.id).map((d) => d.to)]
  const db = serviceUsedBy(ctx, owners, ['database'])
  const send = serviceUsedBy(ctx, owners, SEND_KINDS)
  const task = ctx.details ? taskPhraseOf(ctx.details.tasks[0]) : null
  const subject = ctx.details?.subjects.get(worker.id)?.[0] ?? null

  const actors: Actor[] = [componentActor(producer)]
  if (queue) actors.push(externalActor(queue))
  actors.push(componentActor(worker))
  if (db) actors.push(externalActor(db))
  if (send) actors.push(externalActor(send))

  const steps: FlowStep[] = []
  const p = nameOf(producer)
  const w = nameOf(worker)
  const q = queue ? serviceName(queue) : null
  if (queue && q) {
    steps.push({
      from: `c:${producer.id}`,
      to: `e:${queue.id}`,
      action: 'queue',
      text: task
        ? both((l) => `${at('none', p, l, true)} ${vb(p, l, l === 'pt' ? 'deixa' : 'leaves', l === 'pt' ? 'deixam' : 'leave')} uma tarefa ${task[l]} ${at('em', q, l)}`)
        : both((l) => `${at('none', p, l, true)} ${vb(p, l, l === 'pt' ? 'deixa' : 'leaves', l === 'pt' ? 'deixam' : 'leave')} uma tarefa ${at('em', q, l)}`),
      say: { pt: 'pra depois', en: 'for later' },
    })
    steps.push({
      from: `e:${queue.id}`,
      to: `c:${worker.id}`,
      action: 'call',
      text: task
        ? both((l) => (l === 'pt' ? `A tarefa ${task.pt} é pega ${at('por', w, 'pt')} ${at('em', q, 'pt')}` : `The task ${task.en} is taken by ${at('por', w, 'en')} ${at('em', q, 'en')}`))
        : both((l) => (l === 'pt' ? `A tarefa é pega ${at('por', w, 'pt')} ${at('em', q, 'pt')}` : `The task is taken by ${at('por', w, 'en')} ${at('em', q, 'en')}`)),
      say: { pt: 'tarefa!', en: 'task!' },
    })
  } else {
    steps.push({
      from: `c:${producer.id}`,
      to: `c:${worker.id}`,
      action: 'call',
      text: both((l) => (l === 'pt' ? `${at('none', p, 'pt', true)} ${vb(p, 'pt', 'pede', 'pedem')} uma tarefa ${at('para', w, 'pt')}` : `${at('none', p, 'en', true)} ${vb(p, 'en', 'asks', 'ask')} ${at('none', w, 'en')} for a task`)),
      say: { pt: 'tarefa!', en: 'task!' },
    })
  }
  if (db) {
    const dbn = serviceName(db)
    steps.push({
      from: `c:${worker.id}`,
      to: `e:${db.id}`,
      action: 'save',
      text: both((l) => `O resultado é guardado ${at('em', dbn, l)}`),
      say: { pt: 'guardar', en: 'save' },
    })
  }
  if (send) {
    const sendn = serviceName(send)
    const what = SENT[send.kind] ?? { pt: 'os dados', en: 'the data' }
    steps.push({
      from: `c:${worker.id}`,
      to: `e:${send.id}`,
      action: 'send',
      text: subject
        ? both((l) => (l === 'pt' ? `O e-mail “${subject}” é enviado ${at('por', sendn, 'pt')}` : `The e-mail “${subject}” is sent ${at('por', sendn, 'en')}`))
        : both((l) => (l === 'pt' ? `${cap(what.pt)} é enviado ${at('por', sendn, 'pt')}` : `${cap(what.en)} is sent ${at('por', sendn, 'en')}`)),
      say: { pt: 'enviado!', en: 'sent!' },
    })
  }
  steps.push({
    from: `c:${worker.id}`,
    to: `c:${worker.id}`,
    action: 'reply',
    text: both((l) => `A tarefa é concluída ${at('por', w, l)}`),
    say: { pt: 'pronto!', en: 'done!' },
  })

  return {
    id: 'job',
    kind: 'job',
    title: { pt: 'Tarefas em segundo plano', en: 'Background tasks' },
    summary: {
      pt: 'Tarefas demoradas vão para uma fila e são feitas depois, em segundo plano.',
      en: 'Slow work goes into a queue and is done later, in the background.',
    },
    actors,
    steps,
  }
}

/** A short scene of the entry part and what it hands work to, for systems where nothing else was found. */
function overviewFlow(ctx: Ctx): Flow | null {
  const out = (id: string) => ctx.deps.filter((d) => d.from === id).sort((a, b) => b.weight - a.weight)
  const entries = ctx.components.filter((c) => c.entry && c.layer !== 'tests')
  const pool = entries.length ? entries : ctx.components.filter((c) => c.layer !== 'tests')
  const start = [...pool].sort((a, b) => out(b.id).length - out(a.id).length)[0]
  if (!start) return null
  const targets = out(start.id)
    .map((d) => ctx.byId.get(d.to))
    .filter((c): c is Component => !!c && c.id !== start.id)
    .slice(0, 5)
  if (targets.length === 0) return null
  const startName = nameOf(start)
  const steps: FlowStep[] = targets.map((t) => {
    const tn = nameOf(t)
    return {
      from: `c:${start.id}`,
      to: `c:${t.id}`,
      action: 'call',
      text: both((l) => `${at('none', startName, l, true)} ${vb(startName, l, l === 'pt' ? 'passa' : 'hands', l === 'pt' ? 'passam' : 'hand')} ${l === 'pt' ? 'o trabalho' : 'the work'} ${at('para', tn, l)}`),
      say: { pt: 'sua vez', en: 'your turn' },
    }
  })
  const actors = [componentActor(start), ...targets.map(componentActor)]
  return {
    id: 'overview',
    kind: 'overview',
    title: { pt: 'Visão geral', en: 'Overview' },
    summary: {
      pt: `Mostra como ${at('none', startName, 'pt')} ${vb(startName, 'pt', 'conversa', 'conversam')} com as outras partes do sistema.`,
      en: `Shows how ${at('none', startName, 'en')} ${vb(startName, 'en', 'works', 'work')} with the other parts of the system.`,
    },
    actors,
    steps,
  }
}

/** How a person reaches a feature, as a verb in each language. */
const REACH: Record<Feature['via'], Text> = {
  button: { pt: 'clica em', en: 'clicks' },
  command: { pt: 'manda', en: 'sends' },
  readme: { pt: 'usa', en: 'uses' },
}

/** The system itself, for a repo whose parts couldn't be read. */
const SYSTEM: Actor = {
  id: 'system',
  name: { en: 'System', pt: 'Sistema' },
  kind: 'screen',
  component: null,
  external: null,
  note: { en: 'What the person uses.', pt: 'O que a pessoa usa.' },
}

/**
 * "What you can do": the person uses each feature and the system answers. A button or command is
 * played by the part whose file holds it; a README feature by the screens, or by the system as a
 * whole when it has none. Names and descriptions are the repo's own; only the frame around them is a
 * template.
 */
function featuresFlow(ctx: Ctx, features: Feature[], min = 2): Flow | null {
  if (features.length < min) return null
  const visible = ctx.components.filter((c) => c.layer !== 'tests' && c.layer !== 'infra')
  // Without screens the system answers as a whole: "the business rules show the result" means nothing to a visitor.
  const main = [...visible].filter((c) => c.layer === 'interface').sort((a, b) => b.files - a.files)[0] ?? null
  const actors: Actor[] = [PERSON]
  const actorOf = (f: Feature): Actor => {
    // Only a code file belongs to a part: a README or a page at the root says nothing about who answers.
    const owner = f.ref && langOf(f.ref.file) ? componentOf(f.ref.file, ctx.components) : null
    const comp = owner && owner.layer !== 'tests' ? owner : main
    const actor = comp ? componentActor(comp) : SYSTEM
    const known = actors.find((a) => a.id === actor.id)
    if (known) return known
    if (actors.length >= MAX_ACTORS) return actors[1] ?? actor
    actors.push(actor)
    return actor
  }
  const steps: FlowStep[] = []
  for (const f of features) {
    const who = actorOf(f)
    const shows = both((l) => `${at('none', who.name, l, true)} ${vb(who.name, l, l === 'pt' ? 'mostra' : 'shows', l === 'pt' ? 'mostram' : 'show')} ${l === 'pt' ? 'o resultado' : 'the result'}`)
    // The author's own wording in each language when there is one; else the repo's, the same in both.
    const label: Text | null = f.text?.label ?? (f.label ? { pt: f.label, en: f.label } : null)
    const detail: Text | null = f.text?.detail ?? (f.detail ? { pt: f.detail, en: f.detail } : null)
    const answer: Text = detail ? both((l) => clip(cap(detail[l]), CAPTION_LIMIT)) : shows
    if (label) {
      if (steps.length + 2 > MAX_STEPS) break
      steps.push({
        from: PERSON.id,
        to: who.id,
        action: 'ask',
        text: both((l) => clip(`${at('none', PERSON.name, l, true)} ${REACH[f.via][l]} «${label[l]}»`, CAPTION_LIMIT)),
        say: both((l) => clip(label[l], 18)),
        ...(f.ref ? { ref: f.ref } : {}),
      })
      steps.push({ from: who.id, to: PERSON.id, action: 'show', text: answer, say: { pt: 'pronto!', en: 'done!' } })
    } else {
      if (steps.length + 1 > MAX_STEPS) break
      steps.push({ from: who.id, to: PERSON.id, action: 'show', text: answer, say: { pt: 'olha só', en: 'look' } })
    }
  }
  if (steps.length < 2) return null
  return {
    id: 'features',
    kind: 'features',
    title: { pt: 'O que dá para fazer', en: 'What you can do' },
    summary: {
      pt: 'Cada coisa que dá para fazer com o sistema, com o nome que ela tem nele.',
      en: 'Each thing you can do with the system, by the name it has in it.',
    },
    actors,
    steps,
  }
}

/** The "What you can do" scene alone, for features listed by the author (one is enough then). */
export function featuresScene(components: Component[], features: Feature[]): Flow | null {
  const named = components.map((c) => (c.label ? c : { ...c, label: plainPartName(c, components) }))
  const ctx: Ctx = { components: named, byId: new Map(named.map((c) => [c.id, c])), deps: [], externals: [], fileDeps: new Map(), details: null }
  return featuresFlow(ctx, features, 1)
}

/** The scenes of a repo, most telling first, within the limits. */
export function buildFlows(input: FlowInput): Flow[] {
  // Names are worked out among all the parts, so two parts that would share a plain name get told apart.
  const components = input.components.map((c) => (c.label ? c : { ...c, label: plainPartName(c, input.components) }))
  const ctx: Ctx = {
    components,
    byId: new Map(components.map((c) => [c.id, c])),
    deps: input.dependencies,
    externals: input.externals,
    fileDeps: input.fileDeps ?? new Map(),
    details: input.details ?? null,
  }
  const flows: Flow[] = []

  const features = featuresFlow(ctx, input.features ?? [])
  if (features) flows.push(features)

  // Journeys come right after: a client follows their own action from the page to the database.
  const journeys = journeyPlans(ctx, input.endpoints)
  for (const j of journeys) flows.push(fitJourney(j))
  const told = new Set(journeys.map((j) => `${j.plan.endpoint.method} ${j.plan.endpoint.path}`))

  for (const agent of input.agents.slice(0, 2)) {
    const comp = ctx.byId.get(agent.component)
    if (agent.component && !comp) continue
    flows.push(fitAgent(ctx, agent))
  }

  // Request scenes: the endpoints whose chains reach the most, POST first; one per API part and kind
  // of action, so creating and listing the same thing can both be shown.
  // Routes that only keep the site running, or whose words say nothing, are left out. Routes that name
  // their thing come first, and signing up after what the system is for.
  const plans = input.endpoints
    .filter((ep) => !isPlumbing(ep.path))
    .flatMap((ep) => concreteRoutes(ep, ctx.details))
    .filter((ep) => !told.has(`${ep.method} ${ep.path}`))
    .map((ep) => ({ ep, meaning: meaningOf(ep.method, ep.path) }))
    .filter(({ ep, meaning }) => meaning.word !== null || ROUTE_ACTIONS.has((routeWords(ep.path).pop() ?? '').toLowerCase()))
    .map(({ ep, meaning }) => ({ plan: planRequest(ctx, ep), meaning }))
    .filter((x): x is { plan: RequestPlan; meaning: Meaning } => x.plan !== null)
    .map(({ plan: p, meaning }) => ({
      plan: p,
      business: (meaning.word !== null ? 2 : 0) + (SIGNUP.has((routeWords(p.endpoint.path).pop() ?? '').toLowerCase()) ? 0 : 1),
      score:
        (p.screen ? 1 : 0) + (p.sec ? 1 : 0) + (p.svc ? 1 : 0) + (p.data ? 1 : 0) + (p.db ? 1 : 0) + (p.send ? 1 : 0) + (p.queue ? 1 : 0),
      method: { POST: 3, PUT: 2, PATCH: 2, GET: 1 }[p.endpoint.method] ?? 0,
    }))
    .sort((a, b) => b.business - a.business || b.score - a.score || b.method - a.method)
  const usedApis = new Set<string>()
  let requests = 0
  for (const { plan } of plans) {
    if (requests >= 3) break
    const kind = `${plan.api.id}|${plan.endpoint.method === 'GET' ? 'read' : 'write'}`
    if (usedApis.has(kind)) continue
    usedApis.add(kind)
    flows.push(fitRequest(plan))
    requests++
  }

  const job = jobFlow(ctx)
  if (job) flows.push(job)

  if (flows.length === 0) {
    const overview = overviewFlow(ctx)
    if (overview) flows.push(overview)
  }
  return flows.slice(0, MAX_FLOWS)
}
