/**
 * Groups the source files into the parts of the system (4 to 16 components). Folders are the starting
 * point: each top-level folder is a candidate, and a candidate that holds too much of the code is split
 * into its subfolders. Wrapper folders (`src`, `app`, `packages`…) never count as a part on their own.
 *
 * Each component also gets a layer (from the screen down to the data), the frameworks seen inside, an
 * entry flag and a plain sentence. Pure: it takes the files' texts and imports and returns the parts.
 */
import type { Component, Layer, Text } from '../shared/studio'
import { dirOf } from '../shared/components'
import { callsModel, llmProviderOf, matchPackage } from './externals'
import { basenameOf, joinList, titleWords } from './text'
import { isTestPath } from './select'

/** Folders that only group other folders; they are looked through, never named. */
export const WRAPPERS = new Set(['src', 'app', 'lib', 'packages', 'apps', 'internal', 'pkg', 'source'])

/** Folder names that say little on their own; the parent folder is put in front of them ("Backend Routes"). */
const GENERIC = new Set(
  'components pages routes services modules features views screens api controllers handlers middleware lib utils helpers hooks models db agent agents jobs workers tests prompts tools'.split(' '),
)

/** At most this many components. */
export const MAX_COMPONENTS = 16

/** Layers in the order ties are broken. */
const LAYER_ORDER: Layer[] = ['api', 'data', 'ai', 'jobs', 'security', 'interface', 'logic', 'shared', 'infra', 'tests']

/** Words in a path that point at a layer. Each segment that matches adds 2 (`api` only 1). */
const WORDS: Partial<Record<Layer, string[]>> = {
  interface: 'components component pages page views view screens screen ui layouts layout templates template'.split(' '),
  api: 'routes route router routers controllers controller handlers handler endpoints endpoint resolvers resolver graphql urls api'.split(' '),
  security: 'auth middleware permissions permission guards guard security jwt login'.split(' '),
  logic: 'services service domain usecases usecase use_cases core business logic'.split(' '),
  ai: 'agents agent llm ai prompts prompt chains chain tools tool'.split(' '),
  jobs: 'tasks task jobs job workers worker queues queue cron consumers consumer celery'.split(' '),
  data: 'models model entities entity repositories repository db database schema schemas migrations migration dao prisma'.split(' '),
  shared: 'utils util helpers helper common shared types type constants lib'.split(' '),
  infra: 'config settings infra deploy scripts'.split(' '),
}

/** Source patterns that point at a layer, each adds 3 to it. */
const CONTENT: { layer: Layer; re: RegExp; weight?: number }[] = [
  {
    layer: 'api',
    re: /@app\.(get|post|put|patch|delete|route)\(|@router\.(get|post|put|patch|delete)\(|\b(app|router)\.(get|post|put|patch|delete)\(\s*['"`]|@(Get|Post|Put|Patch|Delete|Controller|RestController|RequestMapping)\b|@api_view|JsonResponse|\bRoute::(get|post|put|patch|delete)\(|export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/,
  },
  { layer: 'data', re: /models\.Model|\bdb\.Model|@Entity\b|mongoose\.Schema|declarative_base|new PrismaClient|@Table\b/ },
  { layer: 'jobs', re: /@shared_task|@app\.task|@celery|new Worker\(/ },
  { layer: 'security', re: /\bjwt\.|passport\.|bcrypt/, weight: 1 },
  { layer: 'interface', re: /createRoot\(|ReactDOM\.render|from\s+['"]react['"]/, weight: 2 },
  // A file that starts a server is the system's bootstrap, not business logic.
  { layer: 'infra', re: /\bapp\.listen\(|uvicorn\.run\(|http\.ListenAndServe\(/, weight: 2 },
]

/** The layer of one file, from its folders, name, extension and content. Ties go to the earlier layer in LAYER_ORDER. */
export function layerOf(path: string, text: string, packages: string[]): Layer {
  if (isTestPath(path)) return 'tests'
  const score = new Map<Layer, number>()
  const add = (layer: Layer, n: number) => score.set(layer, (score.get(layer) ?? 0) + n)
  const segments = path
    .toLowerCase()
    .split('/')
    .map((s, i, all) => (i === all.length - 1 ? s.replace(/\.[a-z0-9]+$/, '') : s))
  for (const seg of segments) {
    for (const layer of Object.keys(WORDS) as Layer[]) {
      if (WORDS[layer]?.includes(seg)) add(layer, layer === 'api' && seg === 'api' ? 1 : 2)
    }
    if (/^\(.*\)$/.test(seg)) add('interface', 1)
  }
  if (/\.(tsx|jsx|vue|svelte)$/i.test(path)) add('interface', 3)
  if (/(^|\/)urls\.py$/.test(path)) add('api', 3)
  if (/(^|\/)views\.py$/.test(path)) add('api', 2)
  if (/(^|\/)settings(\.[a-z]+)?$/.test(path)) add('infra', 2)
  if (callsModel(packages)) add('ai', 4)
  for (const c of CONTENT) if (c.re.test(text)) add(c.layer, c.weight ?? 3)

  let best: Layer = 'logic'
  let bestScore = 0
  for (const layer of LAYER_ORDER) {
    const s = score.get(layer) ?? 0
    if (s > bestScore) {
      best = layer
      bestScore = s
    }
  }
  return best
}

/** The layer of a whole component: its tests if they are most of it, else the most common layer of the rest. */
function layerOfComponent(layers: Layer[]): Layer {
  const rest = layers.filter((l) => l !== 'tests')
  if (rest.length === 0) return 'tests'
  if (layers.length - rest.length > rest.length) return 'tests'
  const counts = new Map<Layer, number>()
  for (const l of rest) counts.set(l, (counts.get(l) ?? 0) + 1)
  let best: Layer = rest[0]
  for (const layer of LAYER_ORDER) {
    if (layer === 'tests') continue
    if ((counts.get(layer) ?? 0) > (counts.get(best) ?? 0)) best = layer
  }
  return best
}

/** Frameworks and services that show up in a package name, by the name the people reading know them under. */
const TECH: [string, string][] = [
  ['react', 'React'],
  ['@react-three/fiber', 'React Three Fiber'],
  ['next', 'Next.js'],
  ['vue', 'Vue'],
  ['nuxt', 'Nuxt'],
  ['svelte', 'Svelte'],
  ['@angular/core', 'Angular'],
  ['three', 'Three.js'],
  ['tailwindcss', 'Tailwind CSS'],
  ['django', 'Django'],
  ['flask', 'Flask'],
  ['fastapi', 'FastAPI'],
  ['sqlalchemy', 'SQLAlchemy'],
  ['express', 'Express'],
  ['@nestjs/core', 'NestJS'],
  ['fastify', 'Fastify'],
  ['hono', 'Hono'],
  ['koa', 'Koa'],
  ['org.springframework', 'Spring'],
  ['@prisma/client', 'Prisma'],
  ['prisma', 'Prisma'],
  ['mongoose', 'Mongoose'],
  ['celery', 'Celery'],
  ['github.com/gin-gonic/gin', 'Gin'],
  ['github.com/gofiber/fiber', 'Fiber'],
  ['github.com/labstack/echo', 'Echo'],
]

/** The frameworks and model providers a file's packages point to. */
export function techOf(packages: string[]): string[] {
  const out: string[] = []
  for (const pkg of packages) {
    const hit = TECH.find(([key]) => matchPackage(pkg, key))
    if (hit) out.push(hit[1])
    const llm = llmProviderOf([pkg])
    if (llm) {
      out.push(llm.provider)
      if (llm.framework) out.push(llm.framework)
    }
  }
  return [...new Set(out)]
}

/** One source file as the component builder sees it. */
export type ComponentFile = {
  path: string
  lines: number
  text: string
  /** Packages it imports (from the resolver). */
  packages: string[]
  /** Its routes as "POST /leads". */
  routes: string[]
}

export type ComponentInput = {
  files: ComponentFile[]
  repoName: string
  /** The database the repo names in its config, if any. */
  databaseLabel: string | null
  /** Files that start something: the `main` of a package.json, a bin script. */
  entryFiles?: string[]
}

type Cand = { path: string; direct: boolean; files: string[] }

/** The part of a folder a file belongs to: the first subfolder that isn't a wrapper. */
function effectiveChild(file: string, base: string): string {
  const dir = dirOf(file)
  const rel = base ? dir.slice(base.length + 1) : dir
  const segs = rel ? rel.split('/') : []
  let prefix = base
  for (const s of segs) {
    prefix = prefix ? `${prefix}/${s}` : s
    if (!WRAPPERS.has(s)) return prefix
  }
  return prefix
}

/** The subfolders of a candidate (wrappers looked through), and its loose files as a direct part. */
function childrenOf(c: Cand): { children: Cand[]; direct: Cand | null } {
  const loose: string[] = []
  const groups = new Map<string, string[]>()
  for (const f of c.files) {
    if (dirOf(f) === c.path) {
      loose.push(f)
      continue
    }
    const key = effectiveChild(f, c.path)
    const list = groups.get(key) ?? []
    list.push(f)
    groups.set(key, list)
  }
  return {
    children: [...groups].map(([path, files]) => ({ path, direct: false, files })),
    direct: loose.length ? { path: c.path, direct: true, files: loose } : null,
  }
}

const lastSegment = (path: string) => path.split('/').pop() ?? ''

function shouldSplit(c: Cand, total: number): boolean {
  if (WRAPPERS.has(lastSegment(c.path))) return true
  if (!(c.files.length > 0.3 * total || c.files.length > 40)) return false
  return childrenOf(c).children.length >= 2
}

/** The name of a part: its folder, with the parent in front when the folder name says little on its own. */
function nameOf(path: string, repoName: string): string {
  const segs = path ? path.split('/') : []
  const nonWrapper = segs.filter((s) => !WRAPPERS.has(s))
  if (nonWrapper.length === 0) return titleWords(repoName)
  const last = nonWrapper[nonWrapper.length - 1]
  const parent = nonWrapper.length > 1 ? nonWrapper[nonWrapper.length - 2] : null
  // `frontend/src/lib` is a part of its own: "Frontend Lib". `src` and `app` only name their parent.
  const tail = segs[segs.length - 1]
  if (tail !== last && !['src', 'app', 'source'].includes(tail)) return `${titleWords(last)} ${titleWords(tail)}`
  if (GENERIC.has(last.toLowerCase()) && parent) return `${titleWords(parent)} ${titleWords(last)}`
  return titleWords(last)
}

/** A plain sentence for what the part does, from its layer and what was found in it. */
function summaryFor(layer: Layer, routes: string[], providers: string[], databaseLabel: string | null): Text {
  switch (layer) {
    case 'interface':
      return { en: 'Shows the screens the person uses.', pt: 'Mostra as telas que a pessoa usa.' }
    case 'api':
      return routes.length
        ? {
            en: `Takes the system's requests, such as ${joinList(routes.slice(0, 2), 'en')}.`,
            pt: `Recebe os pedidos do sistema, como ${joinList(routes.slice(0, 2), 'pt')}.`,
          }
        : { en: "Takes the system's requests.", pt: 'Recebe os pedidos do sistema.' }
    case 'security':
      return { en: 'Checks who can get in and what each person may do.', pt: 'Confere quem pode entrar e o que cada pessoa pode fazer.' }
    case 'logic':
      return { en: 'Applies the business rules.', pt: 'Aplica as regras do negócio.' }
    case 'ai':
      return providers.length
        ? { en: `Talks to ${joinList(providers, 'en')} to decide what to do.`, pt: `Conversa com ${joinList(providers, 'pt')} para decidir o que fazer.` }
        : { en: 'Uses an AI model to decide what to do.', pt: 'Usa um modelo de IA para decidir o que fazer.' }
    case 'jobs':
      return { en: 'Runs background tasks, away from the screen.', pt: 'Executa tarefas em segundo plano, fora da tela.' }
    case 'data':
      return databaseLabel
        ? { en: `Stores and fetches the data (${databaseLabel}).`, pt: `Guarda e busca os dados (${databaseLabel}).` }
        : { en: 'Stores and fetches the data.', pt: 'Guarda e busca os dados.' }
    case 'shared':
      return { en: 'Helper functions and types used in many places.', pt: 'Funções e tipos usados em várias partes.' }
    case 'infra':
      return { en: 'Configures and publishes the system.', pt: 'Configura e publica o sistema.' }
    case 'tests':
      return { en: 'Tests that check the rest keeps working.', pt: 'Testes que garantem que o resto funciona.' }
  }
}

/** The components of a repo. Returns nothing for a repo without source files. */
export function buildComponents(input: ComponentInput): Component[] {
  const files = input.files
  const total = files.length
  if (total === 0) return []
  const byPath = new Map(files.map((f) => [f.path, f]))
  const entryFiles = new Set(input.entryFiles ?? [])

  // One candidate per top-level folder, and the loose root files as a direct part.
  const tops = new Map<string, string[]>()
  for (const f of files) {
    const dir = dirOf(f.path)
    const top = dir ? dir.split('/')[0] : ''
    const list = tops.get(top) ?? []
    list.push(f.path)
    tops.set(top, list)
  }
  let cands: Cand[] = [...tops].map(([path, list]) => ({ path, direct: path === '', files: list }))

  const stuck = new Set<string>()
  for (let guard = 0; guard < 500; guard++) {
    const target = cands
      .filter((c) => !c.direct && !stuck.has(c.path))
      .sort((a, b) => b.files.length - a.files.length || (a.path < b.path ? -1 : 1))
      .find((c) => shouldSplit(c, total))
    if (!target) break
    const wrapper = WRAPPERS.has(lastSegment(target.path))
    const { children, direct } = childrenOf(target)
    if (!wrapper && children.length < 2) {
      stuck.add(target.path)
      continue
    }
    const next = [...children, ...(direct ? [direct] : [])]
    if (!wrapper && cands.length - 1 + next.length > MAX_COMPONENTS) {
      stuck.add(target.path)
      continue
    }
    cands = cands.filter((c) => c !== target).concat(next)
  }
  if (cands.length > MAX_COMPONENTS) cands = [...cands].sort((a, b) => b.files.length - a.files.length).slice(0, MAX_COMPONENTS)

  // Names: unique, prefixing the parent folder when two parts share a name.
  const names = cands.map((c) => (c.path === '' ? titleWords(input.repoName) : nameOf(c.path, input.repoName)))
  const seen = new Map<string, number>()
  const uniqueNames = names.map((name, i) => {
    const c = cands[i]
    const n = seen.get(name) ?? 0
    seen.set(name, n + 1)
    if (n === 0) return name
    const parent = c.path.split('/').filter((s) => !WRAPPERS.has(s)).slice(-2, -1)[0]
    return parent ? `${titleWords(parent)} ${name}` : `${name} ${n + 1}`
  })

  const out: Component[] = []
  cands.forEach((c, i) => {
    const members = c.files.map((p) => byPath.get(p)).filter((f): f is ComponentFile => !!f)
    if (members.length === 0) return
    const layers = members.map((f) => layerOf(f.path, f.text, f.packages))
    const layer = layerOfComponent(layers)
    const tech = new Map<string, number>()
    for (const f of members) for (const t of techOf(f.packages)) tech.set(t, (tech.get(t) ?? 0) + 1)
    const routes = [...new Set(members.flatMap((f) => f.routes))]
    const providers = [...new Set(members.flatMap((f) => llmProviderOf(f.packages)?.provider ?? []))]
    const entry = members.some((f) => isEntry(f, entryFiles))
    const id = c.path + (c.direct ? '#direct' : '')
    out.push({
      id,
      name: uniqueNames[i],
      path: c.path,
      direct: c.direct,
      layer,
      files: members.length,
      lines: members.reduce((sum, f) => sum + f.lines, 0),
      tech: [...tech].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5).map(([t]) => t),
      entry,
      summary: summaryFor(layer, routes, providers, input.databaseLabel),
    })
  })
  return out
}

const ENTRY_CONTENT =
  /if\s+__name__\s*==\s*['"]__main__['"]|createRoot\(|ReactDOM\.render\(|app\.listen\(|uvicorn\.run\(|http\.ListenAndServe\(/

/** Whether a file starts something: a main file at a source root, a server, or one the package.json names. */
function isEntry(f: ComponentFile, entryFiles: Set<string>): boolean {
  if (entryFiles.has(f.path)) return true
  const name = basenameOf(f.path)
  const dir = dirOf(f.path)
  const sourceRoot = dir === '' || WRAPPERS.has(lastSegment(dir))
  if (sourceRoot && /^(main|index)\.[a-z]+$/i.test(name)) return true
  if (/^(app|manage|wsgi|asgi)\.py$/.test(name) || /^server\.(ts|tsx|js|mjs|cjs|py|go)$/.test(name)) return true
  return ENTRY_CONTENT.test(f.text)
}
