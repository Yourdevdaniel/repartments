/**
 * One GraphQL call per owner: their recent public repos, each with its languages, top-level file
 * names, the handful of manifests the analyzer reads (package.json, requirements.txt, compose…),
 * open pull requests and the default branch's check status.
 *
 * Manifest text only lives inside this function call; it is parsed into tags and dropped.
 */

/** Manifests we look for, at the root and in the usual monorepo folders. */
export const MANIFESTS = {
  packageJson: ['package.json', 'frontend/package.json', 'web/package.json', 'client/package.json', 'app/package.json', 'server/package.json', 'backend/package.json', 'api/package.json'],
  python: ['requirements.txt', 'backend/requirements.txt', 'server/requirements.txt', 'api/requirements.txt', 'pyproject.toml', 'backend/pyproject.toml', 'requirements-dev.txt', 'requirements/base.txt'],
  compose: ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'],
  docker: ['Dockerfile', 'backend/Dockerfile', 'frontend/Dockerfile', 'server/Dockerfile'],
  other: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'go.mod', 'Cargo.toml', 'Gemfile', 'composer.json', 'pubspec.yaml'],
} as const

const ALL = [...MANIFESTS.packageJson, ...MANIFESTS.python, ...MANIFESTS.compose, ...MANIFESTS.docker, ...MANIFESTS.other]

/** GraphQL aliases can't contain dots or slashes. */
export const alias = (path: string) => 'f_' + path.replace(/[^a-zA-Z0-9]/g, '_')

const files = ALL.map((p) => `${alias(p)}: object(expression: "HEAD:${p}") { ... on Blob { text byteSize } }`).join('\n        ')

export const QUERY = `query Building($login: String!) {
  repositoryOwner(login: $login) {
    login
    avatarUrl
    ... on User { name }
    ... on Organization { name }
    repositories(first: 12, privacy: PUBLIC, isFork: false, orderBy: { field: PUSHED_AT, direction: DESC }) {
      nodes {
        name
        description
        url
        stargazerCount
        createdAt
        pushedAt
        isArchived
        primaryLanguage { name color }
        languages(first: 8, orderBy: { field: SIZE, direction: DESC }) { totalSize edges { size node { name color } } }
        root: object(expression: "HEAD:") { ... on Tree { entries { name type } } }
        workflows: object(expression: "HEAD:.github/workflows") { ... on Tree { entries { name } } }
        ${files}
        openPrs: pullRequests(states: OPEN) { totalCount }
        prs: pullRequests(states: OPEN, first: 10) { nodes { mergeable } }
        defaultBranchRef { target { ... on Commit { statusCheckRollup { state } } } }
      }
    }
  }
}`

export type RawBlob = { text: string | null; byteSize: number } | null

export type RawRepo = {
  name: string
  description: string | null
  url: string
  stargazerCount: number
  createdAt: string
  pushedAt: string
  isArchived: boolean
  primaryLanguage: { name: string; color: string | null } | null
  languages: { totalSize: number; edges: { size: number; node: { name: string; color: string | null } }[] }
  root: { entries: { name: string; type: string }[] } | null
  workflows: { entries: { name: string }[] } | null
  openPrs: { totalCount: number }
  prs: { nodes: { mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' }[] }
  defaultBranchRef: { target: { statusCheckRollup: { state: string } | null } | null } | null
  [file: string]: unknown
}

export type RawOwner = {
  login: string
  avatarUrl: string
  name?: string | null
  repositories: { nodes: RawRepo[] }
}

export class GitHubError extends Error {
  constructor(public kind: 'not-found' | 'rate-limited' | 'unavailable', message: string) {
    super(message)
  }
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

export async function fetchOwner(login: string, token: string, fetcher: Fetcher = fetch): Promise<RawOwner> {
  const res = await fetcher('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'repartments',
    },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  })
  if (res.status === 401) throw new GitHubError('unavailable', 'GitHub rejected the server token')
  if (res.status === 403 || res.status === 429) throw new GitHubError('rate-limited', 'GitHub rate limit')
  if (!res.ok) throw new GitHubError('unavailable', `GitHub answered ${res.status}`)
  const json = (await res.json()) as { data?: { repositoryOwner: RawOwner | null }; errors?: { type?: string; message: string }[] }
  if (json.errors?.some((e) => e.type === 'RATE_LIMITED')) throw new GitHubError('rate-limited', 'GitHub rate limit')
  const owner = json.data?.repositoryOwner
  if (!owner) throw new GitHubError('not-found', `No GitHub user or organization called ${login}`)
  return owner
}
