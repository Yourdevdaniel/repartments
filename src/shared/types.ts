/**
 * The only shape that crosses from the server to the browser. It carries derived tags and public
 * facts (name, description, stars, open PRs, check status), never file contents, routes, payloads
 * or secrets: what a repo is made of, not what it does.
 */

export type Role =
  | 'frontend'
  | 'backend'
  | 'database'
  | 'cache'
  | 'worker'
  | 'security'
  | 'tests'
  | 'devops'
  | 'mobile'
  | 'coder'

/** One technology living in the flat. `tech` is a display name such as "Django". */
export type Resident = { tech: string; role: Role; color: string }

export type RepoStatus = {
  /** Latest checks on the default branch. */
  ci?: 'passing' | 'failing'
  /** Open pull requests, and whether any can't be merged cleanly. */
  prs?: { open: number; conflict?: boolean }
}

export type Apartment = {
  name: string
  description: string | null
  url: string
  stars: number
  createdAt: string
  pushedAt: string
  language: { name: string; color: string }
  residents: Resident[]
  status: RepoStatus
}

export type Building = {
  owner: { login: string; name: string | null; avatarUrl: string }
  /** Ground floor first: the oldest repo at the bottom, each new one a new block on top. */
  apartments: Apartment[]
}

export type BuildingError = { error: 'invalid-user' | 'not-found' | 'no-repos' | 'rate-limited' | 'unavailable' }
