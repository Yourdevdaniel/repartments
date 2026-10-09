/**
 * Everything the studio asks GitHub, from the browser, with the signed-in person's token.
 *
 * The token lives only in this tab (see `session.ts`); these calls go from the browser straight to
 * api.github.com, so neither the token nor the code being read ever passes through Repartments'
 * server. Failures come out as `StudioApiError` with the studio's error codes.
 */
import { analyzeRepository } from '../architecture'
import { churn, commitDetail, listBranches, listCommits } from '../github/commits'
import { github, StudioFailure, type GitHubClient } from '../github/client'
import { listRepos, repoInfo } from '../github/repos'
import type { AnalysisEvent, ArchitectureModel, CommitFilters, StudioErrorCode, Viewer } from '../shared/studio'

export class StudioApiError extends Error {
  constructor(public code: StudioErrorCode) {
    super(code)
  }
}

let client: GitHubClient | null = null
let onExpired: (() => void) | null = null

/** Points every call at a token (or none, after signing out), and at what to do when GitHub stops accepting it. */
export function setToken(token: string | null, expired?: () => void) {
  client = token ? github(token) : null
  onExpired = expired ?? null
}

/** Runs one call, turning failures into `StudioApiError` and a refused token into "signed out". */
async function run<T>(work: (c: GitHubClient) => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!client) throw new StudioApiError('signed-out')
  try {
    const result = await work(client)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return result
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    const code = err instanceof StudioFailure ? err.code : 'unavailable'
    if (code === 'signed-out') onExpired?.()
    throw new StudioApiError(code)
  }
}

export const api = {
  /** Who the token belongs to. */
  viewer: (signal?: AbortSignal) =>
    run(async (c) => {
      const { data } = await c.get<{ login: string; name: string | null; avatar_url: string }>('/user', {}, signal)
      return { login: data.login, name: data.name, avatarUrl: data.avatar_url } satisfies Viewer
    }, signal),

  repos: (page: number, q: string, signal?: AbortSignal) => run((c) => listRepos(c, page, q), signal),
  repo: (owner: string, repo: string, signal?: AbortSignal) => run((c) => repoInfo(c, owner, repo), signal),
  branches: (owner: string, repo: string, signal?: AbortSignal) => run((c) => listBranches(c, owner, repo), signal),
  commits: (owner: string, repo: string, filters: CommitFilters, page: number, signal?: AbortSignal) =>
    run((c) => listCommits(c, owner, repo, filters, page), signal),
  commit: (owner: string, repo: string, sha: string, signal?: AbortSignal) => run((c) => commitDetail(c, owner, repo, sha), signal),
  /** Adds up the most recent `limit` commits matching the filters (each one is a GitHub call: keep it small). */
  churn: (owner: string, repo: string, filters: CommitFilters, limit: number, signal?: AbortSignal) =>
    run((c) => churn(c, owner, repo, filters, limit), signal),

  /** Reads the repo and builds its architecture model, here in the browser; `onProgress` gets each stage. */
  architecture: (
    owner: string,
    repo: string,
    branch: string | undefined,
    onProgress: (e: Extract<AnalysisEvent, { type: 'progress' }>) => void,
    signal?: AbortSignal,
  ): Promise<ArchitectureModel> => run((c) => analyzeRepository(c, owner, repo, branch, (p) => onProgress({ type: 'progress', ...p })), signal),
}
