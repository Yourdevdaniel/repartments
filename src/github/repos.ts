/**
 * The repositories the signed-in person can read, and one repo's summary. Only the fields the studio
 * shows are copied out of GitHub's answers; e-mails, owners' extra profile data and URLs we don't use
 * are dropped on arrival.
 */
import type { RepoPage, RepoSummary } from '../shared/studio'
import { checkRepo, type GitHubClient, StudioFailure } from './client'

/** The fields of GitHub's repository object that we read. */
type RawRepo = {
  name: string
  full_name: string
  owner: { login: string }
  private: boolean
  description: string | null
  language: string | null
  pushed_at: string | null
  default_branch: string
  stargazers_count: number
  fork: boolean
  archived: boolean
}

const PAGE_SIZE = 30
const SEARCH_PAGE_SIZE = 100
const SEARCH_MAX_PAGES = 10
const SEARCH_WANTED = 30
const QUERY_MAX = 100

/** Copies the studio's fields out of one of GitHub's repository objects. */
export function toRepoSummary(r: RawRepo): RepoSummary {
  return {
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    description: r.description,
    language: r.language,
    pushedAt: r.pushed_at,
    defaultBranch: r.default_branch,
    stars: r.stargazers_count,
    fork: r.fork,
    archived: r.archived,
  }
}

function matches(repo: RepoSummary, q: string): boolean {
  const needle = q.toLowerCase()
  return [repo.name, repo.fullName, repo.description ?? ''].some((s) => s.toLowerCase().includes(needle))
}

function checkPage(page: number): void {
  if (!Number.isInteger(page) || page < 1 || page > 10_000) throw new StudioFailure('invalid', 'bad page')
}

/**
 * One page of the repos the person can read, most recently pushed first. With `q`, GitHub has no
 * search for "my repos", so this walks pages of 100 and keeps the names and descriptions that
 * contain `q`, until 30 matches are found (or ten pages were read). The walk stops on a page
 * boundary so `next` can point at a whole GitHub page, which means a search answer can hold a few
 * more than 30 repos.
 */
export async function listRepos(client: GitHubClient, page: number, q: string): Promise<RepoPage> {
  checkPage(page)
  const needle = q.trim()
  if (needle.length > QUERY_MAX) throw new StudioFailure('invalid', 'search too long')
  const affiliation = 'owner,collaborator,organization_member'

  if (!needle) {
    const { data, next } = await client.get<RawRepo[]>('/user/repos', {
      per_page: PAGE_SIZE,
      page,
      sort: 'pushed',
      affiliation,
    })
    return { repos: data.map(toRepoSummary), next: next ? page + 1 : null }
  }

  const repos: RepoSummary[] = []
  let current = page
  let more = false
  for (let walked = 0; walked < SEARCH_MAX_PAGES; walked++) {
    const { data, next } = await client.get<RawRepo[]>('/user/repos', {
      per_page: SEARCH_PAGE_SIZE,
      page: current,
      sort: 'pushed',
      affiliation,
    })
    for (const r of data) {
      const summary = toRepoSummary(r)
      if (matches(summary, needle)) repos.push(summary)
    }
    more = next
    current++
    if (!next || repos.length >= SEARCH_WANTED) break
  }
  return { repos, next: more ? current : null }
}

/** GET /repos/{owner}/{repo} as a RepoSummary. */
export async function repoInfo(client: GitHubClient, owner: string, repo: string): Promise<RepoSummary> {
  checkRepo(owner, repo)
  const { data } = await client.get<RawRepo>(`/repos/${owner}/${repo}`)
  return toRepoSummary(data)
}
