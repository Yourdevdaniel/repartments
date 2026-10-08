/**
 * The architecture engine: reads a repo (through the signed-in person's GitHub client) and returns the
 * model the studio draws. Deterministic static analysis only: no model is called, no code is run.
 *
 * `analyzeRepository` does the GitHub reads and then calls `buildModel`, which is pure: the same tree
 * and file texts always give the same model, so it can be tested with small fixtures.
 */
import type { Agent, ArchitectureModel, Component, Dependency, Endpoint, External, Text } from '../shared/studio'
import { componentOf, dirOf } from '../shared/components'
import type { GitHubClient } from '../github/client'
import { agentsFrom, type AgentFile } from './agents'
import { buildComponents, type ComponentFile } from './components'
import { dataModelsOf, emailSubjectsOf, mergeScreenDetails, screenDetailsOf, sentFieldsOf, tasksOf, type CallDetails, type DataModel, type FlowDetails, type ScreenDetails } from './details'
import { readFiles } from './fetch'
import { callsOf, endpointsOf, matchCall, type RouteDef } from './endpoints'
import { databaseLabelOf, externalsFrom, imagesOf, type Usage } from './externals'
import { buildFlows } from './flows'
import { featuresOf, README } from './features'
import { indefiniteArticle, nameWith, plainAgentName, plainExternalName, plainLayerName, screenPartName, subjectOf } from './plain'
import { importsOf } from './imports'
import { normalizePath, createResolver } from './resolve'
import { selectFiles, type TreeEntry } from './select'
import { basenameOf, clip, count, joinList, langOf } from './text'

export type { TreeEntry } from './select'

export type Progress = (e: { stage: 'tree' | 'files' | 'graph' | 'flows'; done?: number; total?: number }) => void

/** Everything `buildModel` needs: the tree, the texts that were read, and whether either was cut. */
export type SourceInput = {
  repo: ArchitectureModel['repo']
  /** The whole recursive tree. */
  tree: TreeEntry[]
  /** Path → text, only for the files that were read. */
  files: Map<string, string>
  /** The tree or the file selection was cut. */
  truncated: boolean
  /** Defaults to now. */
  generatedAt?: string
}

const LANGUAGE_NAMES: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  vue: 'Vue',
  svelte: 'Svelte',
  py: 'Python',
  go: 'Go',
  java: 'Java',
  kt: 'Kotlin',
  rb: 'Ruby',
  php: 'PHP',
  cs: 'C#',
}


/** The order the layers are told in the model's summary. */
const LAYER_ORDER: Component['layer'][] = ['interface', 'api', 'security', 'logic', 'ai', 'jobs', 'data', 'shared', 'infra', 'tests']

/** Files of a language, top six by count. */
function languagesOf(paths: string[]): { name: string; files: number }[] {
  const counts = new Map<string, number>()
  for (const p of paths) {
    const ext = /\.([a-z0-9]+)$/i.exec(p)?.[1].toLowerCase() ?? ''
    const name = LANGUAGE_NAMES[ext]
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 6).map(([name, files]) => ({ name, files }))
}

/** The entry files a package.json names (`main`, `bin`), as repo paths. */
function entryFilesOf(path: string, text: string): string[] {
  try {
    const json = JSON.parse(text) as { main?: unknown; bin?: unknown }
    const values: string[] = []
    if (typeof json.main === 'string') values.push(json.main)
    if (typeof json.bin === 'string') values.push(json.bin)
    if (json.bin && typeof json.bin === 'object') for (const v of Object.values(json.bin)) if (typeof v === 'string') values.push(v)
    return values.map((v) => normalizePath(dirOf(path) ? `${dirOf(path)}/${v}` : v))
  } catch {
    return []
  }
}

/**
 * The one-paragraph summary of the whole system, in the words the presentation uses: parts by their
 * plain names, outside services by what they do, and the first agent's choices. No language names,
 * brands or model ids, since the people watching don't code.
 */
function summaryOf(repoName: string, components: Component[], externals: External[], agents: Agent[], about: string | null = null): Text {
  const layers = LAYER_ORDER.filter((l) => components.some((c) => c.layer === l) && l !== 'tests').slice(0, 5)
  const kinds = [...new Set(externals.map((e) => e.kind))].slice(0, 4)
  const agent = agents[0]
  const agentComp = agent ? components.find((c) => c.id === agent.component) : undefined
  const agentName = plainAgentName(agentComp ?? null, agent?.name)
  const tools = agent?.tools.length ?? 0
  const pt: string[] = []
  const en: string[] = []
  // What the system is, in its author's words, before what it is made of.
  if (about) {
    const said = /[.!?…]$/.test(about) ? about : `${about}.`
    pt.push(said)
    en.push(said)
  }
  // Tests are counted out, as they are left out of the list that follows.
  const counted = components.filter((c) => c.layer !== 'tests').length
  if (counted) {
    pt.push(`O ${repoName} tem ${count(counted, 'parte', 'partes')}: ${joinList(layers.map((l) => nameWith('none', plainLayerName(l).pt, 'pt')), 'pt')}.`)
    en.push(`The ${repoName} has ${count(counted, 'part', 'parts')}: ${joinList(layers.map((l) => nameWith('none', plainLayerName(l).en, 'en')), 'en')}.`)
  } else if (!about) {
    pt.push(`O ${repoName} é um sistema.`)
    en.push(`The ${repoName} is a system.`)
  }
  if (kinds.length) {
    pt.push(`Usa ${joinList(kinds.map((k) => indefiniteArticle(plainExternalName(k).pt, 'pt')), 'pt')}.`)
    en.push(`It uses ${joinList(kinds.map((k) => indefiniteArticle(plainExternalName(k).en, 'en')), 'en')}.`)
  }
  if (agent && tools) {
    pt.push(`${nameWith('none', agentName.pt, 'pt', true)} escolhe entre ${count(tools, 'ferramenta', 'ferramentas')}.`)
    en.push(`${nameWith('none', agentName.en, 'en', true)} chooses between ${count(tools, 'tool', 'tools')}.`)
  }
  return { pt: clip(pt.join(' '), 400), en: clip(en.join(' '), 400) }
}

/**
 * A screens part whose folder names nothing ("pages") but that holds a single screen is named after
 * that screen's title: "Páginas" with a "Leads" heading becomes "Tela de leads". Parts with several
 * screens, or whose new name another part already wears, keep theirs.
 */
function titledScreens(components: Component[], files: Map<string, string>): Component[] {
  const taken = new Set(components.map((c) => c.label?.pt))
  return components.map((c) => {
    if (c.layer !== 'interface' || subjectOf(c.path)) return c
    const titles = new Set<string>()
    for (const [path, text] of files) {
      if (componentOf(path, components)?.id !== c.id) continue
      try {
        const title = screenDetailsOf(path, text).title
        if (title) titles.add(title.trim())
      } catch {
        // A screen that can't be read names nothing.
      }
    }
    const label = titles.size === 1 ? screenPartName([...titles][0]) : null
    if (!label || taken.has(label.pt)) return c
    taken.add(label.pt)
    return { ...c, label }
  })
}

/**
 * A part whose folder names nothing ("agent") but that holds a single agent wears the agent's name, so
 * the commits and the map call it what its scene does ("Assistente de atendimento" for `support`).
 */
function withAgentNames(components: Component[], agents: Agent[]): Component[] {
  const taken = new Set(components.map((c) => c.label?.pt))
  return components.map((c) => {
    if (subjectOf(c.path)) return c
    const own = agents.filter((a) => a.component === c.id)
    if (own.length !== 1) return c
    const label = plainAgentName(c, own[0].name)
    if (label.pt === plainAgentName(null).pt || taken.has(label.pt)) return c
    taken.add(label.pt)
    return { ...c, label }
  })
}

/**
 * What the scenes can say beyond the graph, read from the same texts: the data models, what each
 * screen shows (with the screens it imports), what each front-end call sends, the e-mail subjects and
 * the queues workers take from. A file that can't be read simply adds nothing.
 */
function flowDetailsOf(input: {
  files: Map<string, string>
  targetsOf: Map<string, string[]>
  compOf: (path: string) => string | null
  endpoints: Endpoint[]
}): FlowDetails {
  const { files, targetsOf, compOf, endpoints } = input
  const models: DataModel[] = []
  const tasks: string[] = []
  const screens = new Map<string, ScreenDetails>()
  const subjects = new Map<string, string[]>()
  const calls = new Map<string, CallDetails>()

  for (const [path, text] of files) {
    try {
      models.push(...dataModelsOf(path, text))
    } catch {
      // A file whose models can't be read is simply not drawn.
    }
    try {
      for (const t of tasksOf(text)) if (!tasks.includes(t)) tasks.push(t)
    } catch {
      // Same for queue names.
    }
    try {
      const own = screenDetailsOf(path, text)
      const imported = (targetsOf.get(path) ?? []).map((t) => screenDetailsOf(t, files.get(t) ?? ''))
      const merged = mergeScreenDetails([own, ...imported])
      if (merged.title || merged.buttons.length || merged.fields.length) screens.set(path, merged)
    } catch {
      // A screen that can't be read keeps the scene's wording.
    }
    if (!langOf(path)) continue
    const comp = compOf(path)
    try {
      if (comp) {
        const list = subjects.get(comp) ?? []
        for (const s of emailSubjectsOf(text)) if (!list.includes(s)) list.push(s)
        subjects.set(comp, list)
      }
    } catch {
      // E-mail subjects that can't be read are not drawn.
    }
    try {
      for (const call of callsOf(path, text)) {
        const hit = matchCall(call.url, endpoints, call.method)
        if (!hit) continue
        const key = `${hit.method} ${hit.path}`
        const sent = call.method === 'GET' ? [] : sentFieldsOf(text, call.line)
        const prev = calls.get(key)
        if (!prev || (prev.sent.length === 0 && sent.length > 0)) calls.set(key, { file: path, sent })
      }
    } catch {
      // A call that can't be read is not matched to its screen.
    }
  }
  return { models, calls, screens, subjects, tasks }
}

/** A README or an HTML page: read for what the system does, not as code. */
function isDocument(path: string): boolean {
  const name = basenameOf(path)
  return README.test(name) || /\.html?$/i.test(name)
}

/**
 * The whole model from a tree and the file texts. Never throws on odd input: a file that can't be
 * read is skipped, and a missing piece leaves that part of the model empty.
 */
export function buildModel(input: SourceInput): ArchitectureModel {
  return buildModelWith(input, () => undefined)
}

function buildModelWith(input: SourceInput, progress: (stage: 'graph' | 'flows') => void): ArchitectureModel {
  const tree = Array.isArray(input.tree) ? input.tree.filter((e) => e && e.type === 'blob' && typeof e.path === 'string') : []
  const read = input.files instanceof Map ? input.files : new Map<string, string>()
  // The README and the HTML pages tell what the system does (features.ts); the code analysis below
  // never sees them, so a README that mentions PostgreSQL doesn't count as using it.
  const files = new Map([...read].filter(([p]) => !isDocument(p)))
  const treePaths = tree.map((e) => e.path)
  const allPaths = [...new Set([...treePaths, ...files.keys()])]
  const sources = [...files.keys()].filter((p) => langOf(p) !== null).sort()
  const sourceSet = new Set(sources)
  const filesSet = new Set(files.keys())

  progress('graph')

  const resolver = createResolver(allPaths, files)
  const packagesOf = new Map<string, string[]>()
  const targetsOf = new Map<string, string[]>()
  const readFilesOf = new Map<string, string[]>()
  const refsOf = new Map<string, ReturnType<typeof importsOf>>()
  for (const src of sources) {
    try {
      const text = files.get(src) ?? ''
      const refs = importsOf(src, text)
      refsOf.set(src, refs)
      const packages: string[] = []
      const targets: string[] = []
      const read: string[] = []
      for (const r of refs) {
        const res = resolver(src, r.spec)
        if (!res) continue
        if ('file' in res) {
          if (res.file === src) continue
          if (sourceSet.has(res.file)) targets.push(res.file)
          if (filesSet.has(res.file)) read.push(res.file)
        } else packages.push(res.package)
      }
      packagesOf.set(src, [...new Set(packages)])
      targetsOf.set(src, [...new Set(targets)])
      readFilesOf.set(src, [...new Set(read)])
    } catch {
      packagesOf.set(src, [])
      targetsOf.set(src, [])
      readFilesOf.set(src, [])
    }
  }

  // Routes per file, from the frameworks' own syntax.
  const routesOf = new Map<string, RouteDef[]>()
  for (const src of sources) {
    try {
      routesOf.set(src, endpointsOf(src, files.get(src) ?? ''))
    } catch {
      routesOf.set(src, [])
    }
  }

  // Components.
  const entryFiles: string[] = []
  for (const p of filesSet) if (/(^|\/)package\.json$/.test(p)) entryFiles.push(...entryFilesOf(p, files.get(p) ?? ''))
  const databaseLabel = databaseLabelOf([...files].map(([path, text]) => ({ path, text })))
  const componentFiles: ComponentFile[] = sources.map((p) => {
    const text = files.get(p) ?? ''
    return {
      path: p,
      lines: text.length ? text.split('\n').length : 0,
      text,
      packages: packagesOf.get(p) ?? [],
      routes: (routesOf.get(p) ?? []).map((r) => `${r.method} ${r.path}`),
    }
  })
  const components = titledScreens(buildComponents({ files: componentFiles, repoName: input.repo.name, entryFiles }), files)
  const compOf = (path: string): string | null => componentOf(path, components)?.id ?? null
  const layerById = new Map(components.map((c) => [c.id, c.layer]))

  const endpoints: Endpoint[] = []
  for (const src of sources) {
    const comp = compOf(src)
    if (!comp) continue
    for (const r of routesOf.get(src) ?? []) endpoints.push({ method: r.method, path: r.path, file: src, line: r.line, component: comp })
  }

  // Dependencies: imports between components, and front-end calls that reach a route.
  const weights = new Map<string, number>()
  const addDep = (from: string | null, to: string | null) => {
    if (!from || !to || from === to) return
    const key = `${from}\u0000${to}`
    weights.set(key, (weights.get(key) ?? 0) + 1)
  }
  for (const src of sources) {
    const from = compOf(src)
    for (const t of targetsOf.get(src) ?? []) addDep(from, compOf(t))
    try {
      for (const call of callsOf(src, files.get(src) ?? '')) {
        const hit = matchCall(call.url, endpoints, call.method)
        if (hit) addDep(from, hit.component)
      }
    } catch {
      // A call that can't be read is simply not drawn.
    }
  }
  const dependencies: Dependency[] = [...weights]
    .map(([key, weight]) => {
      const [from, to] = key.split('\u0000')
      return { from, to, weight }
    })
    .filter((d) => layerById.get(d.from) !== 'tests' && layerById.get(d.to) !== 'tests')
    .sort((a, b) => b.weight - a.weight || (a.from + a.to < b.from + b.to ? -1 : 1))

  // Outside services, and the agents that call models.
  const usages: Usage[] = []
  for (const src of sources) {
    const comp = compOf(src)
    if (!comp || layerById.get(comp) === 'tests') continue
    usages.push({ component: comp, packages: packagesOf.get(src) ?? [], text: files.get(src) ?? '' })
  }
  const images = [...files].filter(([p]) => /(^|\/)(docker-)?compose[\w.-]*\.ya?ml$/.test(p)).flatMap(([, text]) => imagesOf(text))
  const serviceIds = components.filter((c) => ['data', 'logic', 'api', 'jobs', 'ai'].includes(c.layer)).map((c) => c.id)
  const externals = externalsFrom({ usages, images, serviceIds, databaseLabel })

  const agentFiles: AgentFile[] = sources.map((p) => ({
    path: p,
    text: files.get(p) ?? '',
    packages: packagesOf.get(p) ?? [],
    imports: readFilesOf.get(p) ?? [],
  }))
  const agents = agentsFrom(agentFiles, (p) => compOf(p) ?? '').filter((a) => a.component !== '')

  const fileDeps = new Map<string, string[]>()
  for (const src of sources) {
    const ids = [...new Set((targetsOf.get(src) ?? []).map((t) => compOf(t)).filter((x): x is string => !!x))]
    fileDeps.set(src, ids)
  }

  progress('flows')
  const details = flowDetailsOf({ files, targetsOf, compOf, endpoints })
  const parts = withAgentNames(components, agents)
  const told = featuresOf(read, input.repo.description ?? null)
  const flows = buildFlows({ components: parts, dependencies, externals, endpoints, agents, fileDeps, details, features: told.features })

  const lines = [...files.values()].reduce((n, t) => n + (t ? t.split('\n').length : 0), 0)
  return {
    version: 1,
    repo: input.repo,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    stats: {
      files: tree.length,
      analyzed: files.size,
      lines,
      truncated: input.truncated,
      languages: languagesOf(sources),
    },
    summary: summaryOf(input.repo.name, parts, externals, agents, told.about),
    components: parts,
    dependencies,
    externals,
    endpoints,
    agents,
    flows,
  }
}

/**
 * Reads the repo's default branch (or the given one), its tree and the chosen files, then builds the
 * model. Reports progress as it goes; GitHub failures come out as `StudioFailure`s.
 */
export async function analyzeRepository(
  client: GitHubClient,
  owner: string,
  repo: string,
  branch: string | undefined,
  onProgress: Progress,
): Promise<ArchitectureModel> {
  onProgress({ stage: 'tree' })
  const info = await client.get<{ default_branch?: string; private?: boolean; description?: string | null }>(`/repos/${owner}/${repo}`)
  const useBranch = branch || info.data.default_branch || 'main'
  const commit = await client.get<{ sha?: string }>(`/repos/${owner}/${repo}/commits/${encodeURIComponent(useBranch)}`)
  const sha = commit.data.sha ?? ''
  const treeRes = await client.get<{ tree?: TreeEntry[]; truncated?: boolean }>(`/repos/${owner}/${repo}/git/trees/${sha}`, { recursive: 1 })
  const entries = Array.isArray(treeRes.data.tree) ? treeRes.data.tree : []
  const selected = selectFiles(entries)
  const files = await readFiles(client, owner, repo, sha, selected.paths, (done, total) => onProgress({ stage: 'files', done, total }))
  return buildModelWith(
    {
      repo: { owner, name: repo, branch: useBranch, sha, private: info.data.private === true, description: typeof info.data.description === 'string' ? info.data.description : null },
      tree: entries,
      files,
      truncated: treeRes.data.truncated === true || selected.truncated,
    },
    (stage) => onProgress({ stage }),
  )
}
