/**
 * Everything the studio asks GitHub, from the browser, as the signed-in person.
 *
 * The page never holds the token: requests go through the token vault (`github/vault.ts`), a worker
 * that keeps the token, adds it, and only lets through the reads the studio needs. From there they
 * go straight to api.github.com, so neither the token nor the code being read passes through
 * Repartments' server. Failures come out as `StudioApiError` with the studio's error codes.
 */
import { analyzeRepository } from '../architecture'
import { churn, commitDetail, listBranches, listCommits } from '../github/commits'
import { github, StudioFailure, type GitHubClient } from '../github/client'
import { listRepos, repoInfo } from '../github/repos'
import { vaultFetch } from '../github/vault'
import type { AnalysisEvent, ArchitectureModel, CommitFilters, StudioErrorCode } from '../shared/studio'

export class StudioApiError extends Error {
  constructor(public code: StudioErrorCode) {
    super(code)
  }
}

/** One client for the whole page: no token of its own, the vault adds it. */
const client: GitHubClient = github(null, vaultFetch)

/** Runs one call, turning failures into `StudioApiError`. A refused token signs out in the vault. */
async function run<T>(work: (c: GitHubClient) => Promise<T>, signal?: AbortSignal): Promise<T> {
  try {
    const result = await work(client)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return result
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new StudioApiError(err instanceof StudioFailure ? err.code : 'unavailable')
  }
}

export const api = {
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
