/**
 * Branches, commit timelines, one commit's files and the churn heatmap, read from GitHub on behalf of
 * the signed-in person. Like `repos.ts`, only the fields the studio shows are copied out.
 */
import type {
  Branch,
  Churn,
  ChurnFile,
  CommitDetail,
  CommitFile,
  CommitFilters,
  CommitPage,
  CommitSummary,
  FileStatus,
} from '../shared/studio'
import { checkRepo, type GitHubClient, StudioFailure } from './client'

/** Patches longer than this are cut (on a line) so one huge generated file can't flood the answer. */
const PATCH_MAX = 60_000
/** GitHub lists at most this many files for one commit. */
const FILES_MAX = 300
/** How many commit details the churn walk fetches at once. */
const CHURN_CONCURRENCY = 6
const CHURN_DEFAULT = 30
const CHURN_MAX = 60
const COMMITS_PER_PAGE = 40
const BRANCHES_PER_PAGE = 100
const BRANCH_MAX = 200
const AUTHOR_MAX = 100

const SHA = /^[0-9a-f]{7,40}$/i
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/
const CONTROL = /[\u0000-\u001f\u007f]/

/** The fields of GitHub's commit object that we read. */
type RawCommit = {
  sha: string
  commit: { message: string; author: { name: string; date: string } | null }
  author: { login: string; avatar_url: string } | null
  parents: { sha: string }[]
  html_url: string
}

type RawCommitFile = {
  filename: string
  previous_filename?: string
  status: string
  additions: number
  deletions: number
  patch?: string
}

type RawCommitDetail = RawCommit & {
  stats: { additions: number; deletions: number; total: number }
  files?: RawCommitFile[]
}

const FILE_STATUSES: FileStatus[] = ['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged']

/** Splits a commit message into its headline (first line) and the trimmed rest. */
function splitMessage(message: string): { headline: string; body: string } {
  const text = message.replace(/\r\n/g, '\n')
  const i = text.indexOf('\n')
  if (i < 0) return { headline: text.trim(), body: '' }
  return { headline: text.slice(0, i).trim(), body: text.slice(i + 1).trim() }
}

function toCommitSummary(c: RawCommit): CommitSummary {
  const { headline, body } = splitMessage(c.commit.message)
  return {
    sha: c.sha,
    headline,
    body,
    author: {
      name: c.commit.author?.name ?? '',
      login: c.author?.login ?? null,
      avatarUrl: c.author?.avatar_url ?? null,
    },
    date: c.commit.author?.date ?? '',
    parents: c.parents.length,
    url: c.html_url,
  }
}

/** Cuts a patch to `PATCH_MAX` characters, preferring the last whole line before the cut. */
function capPatch(patch: string | null): { patch: string | null; truncated: boolean } {
  if (patch === null || patch.length <= PATCH_MAX) return { patch, truncated: false }
  const cut = patch.lastIndexOf('\n', PATCH_MAX)
  return { patch: patch.slice(0, cut > 0 ? cut : PATCH_MAX), truncated: true }
}

function toCommitFile(f: RawCommitFile): CommitFile {
  const { patch, truncated } = capPatch(f.patch ?? null)
  return {
    path: f.filename,
    previousPath: f.previous_filename ?? null,
    status: FILE_STATUSES.includes(f.status as FileStatus) ? (f.status as FileStatus) : 'changed',
    additions: f.additions,
    deletions: f.deletions,
    patch,
    truncated,
  }
}

function checkSha(sha: string): void {
  if (!SHA.test(sha)) throw new StudioFailure('invalid', 'bad commit sha')
}

function checkPage(page: number): void {
  if (!Number.isInteger(page) || page < 1 || page > 10_000) throw new StudioFailure('invalid', 'bad page')
}

/**
 * Checks the filters the timeline and the churn walk send to GitHub. Empty values are left out.
 * `YYYY-MM-DD` becomes the whole day in UTC (00:00:00Z for `since`, 23:59:59Z for `until`); full
 * ISO 8601 timestamps pass through once they parse.
 */
export function cleanFilters(input: Record<string, string | null | undefined>): CommitFilters {
  const out: CommitFilters = {}
  const branch = input.branch?.trim()
  if (branch) {
    if (branch.length > BRANCH_MAX || branch.includes('..') || CONTROL.test(branch)) throw new StudioFailure('invalid', 'bad branch')
    out.branch = branch
  }
  const author = input.author?.trim()
  if (author) {
    if (author.length > AUTHOR_MAX || CONTROL.test(author)) throw new StudioFailure('invalid', 'bad author')
    out.author = author
  }
  if (input.since) out.since = isoDate(input.since, 'start')
  if (input.until) out.until = isoDate(input.until, 'end')
  return out
}

function isoDate(value: string, edge: 'start' | 'end'): string {
  const v = value.trim()
  if (DATE_ONLY.test(v)) {
    const day = new Date(`${v}T00:00:00Z`)
    if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== v) throw new StudioFailure('invalid', 'bad date')
    return edge === 'start' ? `${v}T00:00:00Z` : `${v}T23:59:59Z`
  }
  if (!ISO.test(v) || Number.isNaN(Date.parse(v))) throw new StudioFailure('invalid', 'bad date')
  return v
}

/** Names of the branches (the default one first), read from the first page GitHub gives. */
export async function listBranches(client: GitHubClient, owner: string, repo: string): Promise<Branch[]> {
  checkRepo(owner, repo)
  const [{ data }, info] = await Promise.all([
    client.get<{ name: string; commit: { sha: string }; protected: boolean }[]>(`/repos/${owner}/${repo}/branches`, {
      per_page: BRANCHES_PER_PAGE,
    }),
    client.get<{ default_branch: string }>(`/repos/${owner}/${repo}`),
  ])
  const branches = data.map((b) => ({ name: b.name, sha: b.commit.sha, protected: b.protected }))
  const def = info.data.default_branch
  return branches.sort((a, b) => (a.name === def ? -1 : b.name === def ? 1 : 0))
}

/** One page of the commit timeline for the given filters, newest first, as GitHub orders them. */
export async function listCommits(
  client: GitHubClient,
  owner: string,
  repo: string,
  filters: CommitFilters,
  page: number,
): Promise<CommitPage> {
  checkRepo(owner, repo)
  checkPage(page)
  const f = cleanFilters(filters)
  const { data, next } = await client.get<RawCommit[]>(`/repos/${owner}/${repo}/commits`, {
    sha: f.branch,
    author: f.author,
    since: f.since,
    until: f.until,
    per_page: COMMITS_PER_PAGE,
    page,
  })
  return { commits: data.map(toCommitSummary), next: next ? page + 1 : null }
}

/** One commit with its files and their patches (each patch cut to 60 000 characters at most). */
export async function commitDetail(client: GitHubClient, owner: string, repo: string, sha: string): Promise<CommitDetail> {
  checkRepo(owner, repo)
  checkSha(sha)
  const { data } = await client.get<RawCommitDetail>(`/repos/${owner}/${repo}/commits/${sha}`)
  const files = (data.files ?? []).map(toCommitFile)
  return {
    ...toCommitSummary(data),
    stats: { additions: data.stats.additions, deletions: data.stats.deletions, total: data.stats.total },
    files,
    filesTruncated: (data.files?.length ?? 0) >= FILES_MAX,
  }
}

/**
 * Adds up how much each file changed over the most recent `limit` commits matching the filters.
 * Details are fetched with at most six requests in flight. Busiest files first (by commits touched,
 * then by lines changed), and at most 300 of them.
 */
export async function churn(
  client: GitHubClient,
  owner: string,
  repo: string,
  filters: CommitFilters,
  limit: number = CHURN_DEFAULT,
): Promise<Churn> {
  checkRepo(owner, repo)
  if (!Number.isInteger(limit) || limit < 1 || limit > CHURN_MAX) throw new StudioFailure('invalid', 'bad limit')
  const clean = cleanFilters(filters)

  const shas: string[] = []
  for (let page = 1; shas.length < limit; page++) {
    const { commits, next } = await listCommits(client, owner, repo, clean, page)
    shas.push(...commits.map((c) => c.sha))
    if (!next) break
  }
  const wanted = shas.slice(0, limit)

  const details = await mapLimited(wanted, CHURN_CONCURRENCY, (sha) => commitDetail(client, owner, repo, sha))

  const byPath = new Map<string, ChurnFile>()
  for (const d of details) {
    for (const f of d.files) {
      const entry = byPath.get(f.path) ?? { path: f.path, commits: 0, additions: 0, deletions: 0 }
      entry.commits++
      entry.additions += f.additions
      entry.deletions += f.deletions
      byPath.set(f.path, entry)
    }
  }
  const files = [...byPath.values()]
    .sort((a, b) => b.commits - a.commits || b.additions + b.deletions - (a.additions + a.deletions))
    .slice(0, FILES_MAX)
  return { files, commits: details.length, filters: clean }
}

/** Runs `fn` over `items` with at most `limit` calls in flight, keeping the input order in the result. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
