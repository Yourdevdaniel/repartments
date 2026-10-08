/**
 * The shapes of the studio: the signed-in part of Repartments, where someone connects their own
 * GitHub account, opens any repo they can read (private ones too), and gets an animated
 * presentation of how the system works and of its commits.
 *
 * Unlike the public building (`./types.ts`), nothing here crosses Repartments' server: the browser
 * reads GitHub with the person's own token (`src/github/*`), analyses the code itself
 * (`src/architecture/*`) and keeps the results in the tab. These types are the contract between
 * those modules and the screens, and the format of a saved presentation.
 */

/** A sentence in both languages the site speaks. */
export type Text = { en: string; pt: string }

// ─── Session ────────────────────────────────────────────────────────────────────────────────────

/** Who is signed in, as GitHub describes them. Never includes the token. */
export type Viewer = { login: string; name: string | null; avatarUrl: string }

/** Why something the studio asked for failed, whatever the cause was underneath. */
export type StudioErrorCode =
  | 'signed-out' // no token, or GitHub no longer accepts it
  | 'forbidden' // the token can't read that repo (or a request from another site to the sign-in relay)
  | 'not-found' // no such repo, commit or branch, or an empty repo
  | 'invalid' // a bad parameter
  | 'rate-limited' // GitHub's quota, or the sign-in relay's brake
  | 'login-disabled' // no GitHub app configured on this server
  | 'unavailable' // GitHub didn't answer properly

// ─── Repositories ───────────────────────────────────────────────────────────────────────────────

export type RepoSummary = {
  owner: string
  name: string
  /** "owner/name" */
  fullName: string
  private: boolean
  description: string | null
  /** GitHub's main language for the repo, if any. */
  language: string | null
  pushedAt: string | null
  defaultBranch: string
  stars: number
  fork: boolean
  archived: boolean
}

/** One page of the person's repos (`listRepos`): `next` is the page to ask for next, null at the end. */
export type RepoPage = { repos: RepoSummary[]; next: number | null }

// ─── Commits ────────────────────────────────────────────────────────────────────────────────────

export type Branch = { name: string; sha: string; protected: boolean }

/** `login` and `avatarUrl` are null when the commit's e-mail isn't linked to a GitHub account. */
export type CommitAuthor = { name: string; login: string | null; avatarUrl: string | null }

export type CommitSummary = {
  sha: string
  /** First line of the message. */
  headline: string
  /** The rest of the message, trimmed (often empty). */
  body: string
  author: CommitAuthor
  /** When it was authored (ISO 8601). */
  date: string
  /** More than one parent means a merge commit. */
  parents: number
  /** The commit's page on GitHub. */
  url: string
}

/** Filters for the commit timeline. All optional; dates are ISO 8601 (YYYY-MM-DD is fine). */
export type CommitFilters = {
  /** Branch name (or any ref). Defaults to the repo's default branch. */
  branch?: string
  /** GitHub login or e-mail, as GitHub's `author` filter takes it. */
  author?: string
  since?: string
  until?: string
}

/** One page of the commit timeline (`listCommits`). */
export type CommitPage = { commits: CommitSummary[]; next: number | null }

export type FileStatus = 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged'

export type CommitFile = {
  path: string
  /** For renames: where the file was before. */
  previousPath: string | null
  status: FileStatus
  additions: number
  deletions: number
  /** Unified diff hunks for this file. Null for binary files or when GitHub left it out. */
  patch: string | null
  /** The patch was cut short (it was too long to show whole). */
  truncated: boolean
}

/** One commit with the files it changed (`commitDetail`). */
export type CommitDetail = CommitSummary & {
  stats: { additions: number; deletions: number; total: number }
  files: CommitFile[]
  /** GitHub lists at most 300 files per commit; true when there were more. */
  filesTruncated: boolean
}

/** How much one file changed across the commits looked at. */
export type ChurnFile = { path: string; commits: number; additions: number; deletions: number }

/** How much each file changed over recent commits (`churn`), the busiest files first. */
export type Churn = {
  files: ChurnFile[]
  /** How many commits were added up (the most recent ones matching the filters, up to `limit`). */
  commits: number
  filters: CommitFilters
}

// ─── Architecture ───────────────────────────────────────────────────────────────────────────────

/**
 * Where a component sits in the system, from the screen down to the data. Used to stack the map's
 * bands and to pick each component's room in the presentation.
 */
export type Layer =
  | 'interface' // screens, pages, UI components
  | 'api' // routes, controllers, request handlers
  | 'security' // login, permissions, middleware that lets people in or not
  | 'logic' // services, domain rules, use cases
  | 'ai' // code that talks to a language model: agents, prompts, tools
  | 'jobs' // background tasks, queues, schedulers
  | 'data' // models, repositories, schemas, migrations
  | 'shared' // utilities, types, constants used everywhere
  | 'infra' // configuration, deploy, scripts
  | 'tests'

export const LAYERS: Layer[] = ['interface', 'api', 'security', 'logic', 'ai', 'jobs', 'data', 'shared', 'infra', 'tests']

/** A part of the system: a folder (or the loose files directly inside one) with one job. */
export type Component = {
  /** Stable id: the folder path, plus "#direct" when it only covers the loose files in it. */
  id: string
  /** Human name derived from the folder, e.g. "Leads" for `backend/apps/leads`. */
  name: string
  /** The folder it covers, relative to the repo root ("" for the root itself). */
  path: string
  /** Only the files directly in `path`, not its subfolders (they became components of their own). */
  direct: boolean
  layer: Layer
  /** Source files in it, and how many of them were read. */
  files: number
  lines: number
  /** Frameworks and libraries seen inside (React, Django, OpenAI…), most used first. */
  tech: string[]
  /** Something starts here: a main file, a server, an app's root. */
  entry: boolean
  /** One plain-language sentence about what it does, generated from what was found. */
  summary: Text
}

/** `from` imports `to` (component ids); `weight` counts the imports. */
export type Dependency = { from: string; to: string; weight: number }

export type ExternalKind = 'database' | 'cache' | 'queue' | 'llm' | 'email' | 'payment' | 'messaging' | 'storage' | 'auth' | 'http'

/** A service the system talks to but doesn't contain: PostgreSQL, OpenAI, Stripe, an e-mail API… */
export type External = { id: string; name: string; kind: ExternalKind; usedBy: string[] }

/** An HTTP route the code declares. `path` keeps the framework's own parameter syntax. */
export type Endpoint = { method: string; path: string; file: string; line: number; component: string }

export type AgentTool = { name: string; description: string | null; file: string; line: number }

/** One box of an agent's decision graph. */
export type AgentNode = {
  id: string
  label: string
  kind: 'start' | 'instructions' | 'llm' | 'decision' | 'tool' | 'node' | 'human' | 'end'
  /** Where it was found, when it maps to code. */
  file?: string
  line?: number
}
/** An arrow between two boxes; `condition` is the branch label when the arrow is one of several. */
export type AgentLink = { from: string; to: string; condition: string | null }

/** Code that hands decisions to a language model, and what it can decide between. */
export type Agent = {
  id: string
  /** From the code (`Agent(name=…)`, a class or variable name) or the file name. */
  name: string
  file: string
  component: string
  /** "OpenAI", "Anthropic", "Google", "LangChain"… */
  provider: string
  /** Model id written in the code, if any ("gpt-4o", "claude-…"). */
  model: string | null
  /** "LangGraph", "OpenAI Agents SDK", "Vercel AI SDK", "CrewAI"… null for direct SDK calls. */
  framework: string | null
  /** The start of its system prompt / instructions, whitespace collapsed, at most ~400 characters. */
  instructions: string | null
  tools: AgentTool[]
  /** Explicit (a LangGraph graph) or inferred from the tool loop. */
  graph: { nodes: AgentNode[]; links: AgentLink[]; explicit: boolean }
  /** It keeps calling the model until no more tools are needed. */
  loop: boolean
}

/** Someone in a presentation scene. Becomes a character in the flat. */
export type ActorKind =
  | 'person' // whoever uses the system
  | 'screen'
  | 'api'
  | 'security'
  | 'service'
  | 'agent'
  | 'llm'
  | 'tool'
  | 'worker'
  | 'queue'
  | 'database'
  | 'cache'
  | 'external'

export type Actor = {
  /** Unique within its flow. */
  id: string
  /** Shown on the character's name tag: a component's name, a tool's name, "Usuário"/"User"… */
  name: Text
  kind: ActorKind
  /** The component or external service it stands for, if any. */
  component: string | null
  external: string | null
  /** What it does, in a sentence. */
  note: Text
}

/** What happens in one step of a scene; picks the animation and the prop being handed over. */
export type StepAction =
  | 'ask' // asks for something (a letter)
  | 'check' // checks who is asking
  | 'call' // hands work to another part
  | 'fetch' // reads data
  | 'save' // writes data
  | 'think' // an agent reads its instructions / the conversation
  | 'decide' // an agent picks what to do next
  | 'use-tool' // an agent calls one of its tools
  | 'reply' // an answer goes back (a parcel)
  | 'show' // the answer appears on screen
  | 'queue' // leaves a job for later
  | 'send' // sends something out (an e-mail, a message, an outside API)

export type FlowStep = {
  /** Actor ids. `from === to` for something an actor does on their own (think, decide). */
  from: string
  to: string
  action: StepAction
  /** The caption, a full short sentence. */
  text: Text
  /** The speech bubble, one to three words. */
  say?: Text
  /** Where in the code this step comes from. */
  ref?: { file: string; line: number }
}

/**
 * One scene of the presentation: a request, an agent's decision, a background job. The studio also
 * makes scenes of commits in the browser (`commit`: the author visiting the parts they changed;
 * `activity`: which parts change the most), which never come from the analysis.
 */
export type Flow = {
  id: string
  kind: 'request' | 'agent' | 'job' | 'overview' | 'commit' | 'activity'
  title: Text
  summary: Text
  actors: Actor[]
  steps: FlowStep[]
}

export type ArchitectureModel = {
  version: 1
  repo: { owner: string; name: string; branch: string; sha: string; private: boolean }
  generatedAt: string
  stats: {
    /** Files in the repo's tree, files read, and their lines. */
    files: number
    analyzed: number
    lines: number
    /** The repo was too big to read whole; the rest was left out. */
    truncated: boolean
    languages: { name: string; files: number }[]
  }
  /** One paragraph about the whole system. */
  summary: Text
  components: Component[]
  dependencies: Dependency[]
  externals: External[]
  endpoints: Endpoint[]
  agents: Agent[]
  /** The presentation's scenes, most telling first. */
  flows: Flow[]
}

/** What the analysis reports while it works (`progress`), and how it ends. */
export type AnalysisEvent =
  | { type: 'progress'; stage: 'tree' | 'files' | 'graph' | 'flows'; done?: number; total?: number }
  | { type: 'done'; model: ArchitectureModel }
  | { type: 'error'; error: StudioErrorCode }
