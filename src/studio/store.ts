/**
 * What the studio keeps while the tab is open, and the presentation file it can save and open.
 *
 * - The last architecture model of each repo, so switching tabs or reloading doesn't re-read it.
 * - The presenter's script edits per repo.
 *
 * Both live in `sessionStorage`, like the sign-in: the model holds file paths and the start of an
 * AI agent's instructions from what may be a client's private code, so nothing stays on the
 * computer after the tab closes. Keeping a presentation is a deliberate act: "Save presentation".
 *
 * Browser storage can be missing or full (private windows, blocked site data): every access is
 * wrapped, and the studio works without it, just forgetting on reload.
 */
import type { ArchitectureModel, CommitDetail, FileStatus } from '../shared/studio'
import { NO_EDITS, type ScriptEdits } from '../scene/tour'

const modelKey = (owner: string, repo: string) => `studio:model:${owner.toLowerCase()}/${repo.toLowerCase()}`
const editsKey = (owner: string, repo: string) => `studio:edits:${owner.toLowerCase()}/${repo.toLowerCase()}`

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Full or blocked: it just won't be remembered.
  }
}

export const store = {
  model: (owner: string, repo: string) => {
    const m = read<ArchitectureModel>(modelKey(owner, repo))
    return m && isModel(m) ? m : null
  },
  saveModel: (m: ArchitectureModel) => write(modelKey(m.repo.owner, m.repo.name), m),
  edits: (owner: string, repo: string): ScriptEdits => ({ ...NO_EDITS, ...read<ScriptEdits>(editsKey(owner, repo)) }),
  saveEdits: (owner: string, repo: string, edits: ScriptEdits) => write(editsKey(owner, repo), edits),
}

/**
 * The file "Save presentation" downloads: the model, the presenter's edits and the commits on
 * screen (their file lists, never their code), so the whole show opens later without signing in.
 */
export type PresentationFile = { kind: 'repartments-presentation'; version: 1; model: ArchitectureModel; edits: ScriptEdits; commits: CommitDetail[] }

export function presentationFile(model: ArchitectureModel, edits: ScriptEdits, commits: CommitDetail[]): PresentationFile {
  // Diffs stay out: the scenes only need which files changed and by how much.
  return { kind: 'repartments-presentation', version: 1, model, edits, commits: commits.map((c) => ({ ...c, files: c.files.map((f) => ({ ...f, patch: null })) })) }
}

const STATUSES: FileStatus[] = ['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged']
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0)

/** Commits from an opened file, rebuilt field by field so nothing unexpected rides along. */
function cleanCommits(list: unknown): CommitDetail[] {
  if (!Array.isArray(list)) return []
  return list.slice(0, 60).flatMap((raw): CommitDetail[] => {
    const c = raw as Partial<CommitDetail>
    if (!c || typeof c.sha !== 'string' || !Array.isArray(c.files)) return []
    return [
      {
        sha: str(c.sha, 40),
        headline: str(c.headline, 300),
        body: str(c.body),
        author: { name: str(c.author?.name, 100), login: c.author?.login ? str(c.author.login, 40) : null, avatarUrl: null },
        date: str(c.date, 40),
        parents: num(c.parents),
        url: /^https:\/\/github\.com\//.test(str(c.url)) ? str(c.url, 300) : 'https://github.com',
        stats: { additions: num(c.stats?.additions), deletions: num(c.stats?.deletions), total: num(c.stats?.total) },
        files: c.files.slice(0, 300).map((f) => ({
          path: str(f?.path, 500),
          previousPath: null,
          status: STATUSES.includes(f?.status as FileStatus) ? (f.status as FileStatus) : 'changed',
          additions: num(f?.additions),
          deletions: num(f?.deletions),
          patch: null,
          truncated: false,
        })),
        filesTruncated: !!c.filesTruncated,
      },
    ]
  })
}

const isText = (t: unknown): boolean => !!t && typeof (t as { en: unknown }).en === 'string' && typeof (t as { pt: unknown }).pt === 'string'
const isList = (v: unknown) => Array.isArray(v)

/**
 * A light check that a model has the shape the studio draws from. Opened files come from anywhere,
 * so anything off is refused instead of half-rendered. (Everything is shown as text, never as HTML.)
 */
export function isModel(m: unknown): m is ArchitectureModel {
  const x = m as ArchitectureModel
  return (
    !!x &&
    x.version === 1 &&
    !!x.repo &&
    typeof x.repo.owner === 'string' &&
    typeof x.repo.name === 'string' &&
    isText(x.summary) &&
    [x.components, x.dependencies, x.externals, x.endpoints, x.agents, x.flows].every(isList) &&
    x.components.every((c) => typeof c.id === 'string' && typeof c.name === 'string' && isText(c.summary)) &&
    x.flows.every(
      (f) =>
        typeof f.id === 'string' &&
        isText(f.title) &&
        isText(f.summary) &&
        isList(f.actors) &&
        f.actors.every((a) => typeof a.id === 'string' && isText(a.name)) &&
        isList(f.steps) &&
        f.steps.every((s) => typeof s.from === 'string' && typeof s.to === 'string' && isText(s.text)),
    )
  )
}

/** Reads an opened file: the presentation, or null if it isn't one of ours. */
export function parsePresentation(text: string): PresentationFile | null {
  if (text.length > 8_000_000) return null
  try {
    const file = JSON.parse(text) as PresentationFile
    if (file?.kind !== 'repartments-presentation' || file.version !== 1 || !isModel(file.model)) return null
    const e = file.edits ?? NO_EDITS
    const edits: ScriptEdits = {
      actors: typeof e.actors === 'object' && e.actors ? e.actors : {},
      steps: typeof e.steps === 'object' && e.steps ? e.steps : {},
      titles: typeof e.titles === 'object' && e.titles ? e.titles : {},
      hidden: isList(e.hidden) ? e.hidden.filter((h) => typeof h === 'string') : [],
    }
    return { ...file, edits, commits: cleanCommits(file.commits) }
  } catch {
    return null
  }
}

/** Offers a JSON file to save. */
export function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
