/**
 * One GraphQL call per owner: their recent public repos, each with its main language, top-level file
 * names, the handful of manifests the analyzer reads (package.json, requirements.txt, compose…),
 * open pull requests and the default branch's check status.
 *
 * Manifest text only lives inside this function call; it is parsed into tags and dropped.
 */

/** Manifests we look for, at the root and in the usual monorepo folders. */
// Kept short on purpose: every path costs a lookup per repo, and a heavy query makes GitHub time out.
export const MANIFESTS = {
  packageJson: ['package.json', 'frontend/package.json', 'web/package.json', 'client/package.json', 'backend/package.json', 'server/package.json'],
  python: ['requirements.txt', 'backend/requirements.txt', 'pyproject.toml', 'backend/pyproject.toml'],
  compose: ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'],
  docker: ['Dockerfile', 'backend/Dockerfile'],
  other: ['pom.xml', 'build.gradle', 'go.mod', 'Cargo.toml', 'Gemfile', 'composer.json', 'pubspec.yaml'],
  // Game projects often sit in a subfolder; the root .gitignore still names the engine.
  ignore: ['.gitignore'],
} as const

const ALL = [...MANIFESTS.packageJson, ...MANIFESTS.python, ...MANIFESTS.compose, ...MANIFESTS.docker, ...MANIFESTS.other, ...MANIFESTS.ignore]

/** GraphQL aliases can't contain dots or slashes. */
export const alias = (path: string) => 'f_' + path.replace(/[^a-zA-Z0-9]/g, '_')

const files = ALL.map((p) => `${alias(p)}: object(expression: "HEAD:${p}") { ... on Blob { text byteSize } }`).join('\n        ')

/**
 * What each try asks for. GitHub gives up after about ten seconds (a 502 page instead of JSON), and
 * accounts with huge repos and thousands of pull requests hit that, so each retry asks for less: half
 * the floors, then also no pull requests or checks (the building goes up without those details).
 * The first building has up to 12 floors; the next ones, further down the street, have 6.
 */
const FIRST: Try[] = [
  { count: 12, details: true },
  { count: 6, details: true },
  { count: 6, details: false },
]
const NEXT: Try[] = FIRST.slice(1)
type Try = { count: number; details: boolean }

const DETAILS = `openPrs: pullRequests(states: OPEN) { totalCount }
        prs: pullRequests(states: OPEN, first: 5, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { mergeable } }
        defaultBranchRef { target { ... on Commit { statusCheckRollup { state } } } }`

const query = ({ count, details }: Try) => `query Building($login: String!, $after: String) {
  repositoryOwner(login: $login) {
    login
    avatarUrl
    ... on User { name }
    ... on Organization { name }
    repositories(first: ${count}, after: $after, privacy: PUBLIC, isFork: false, orderBy: { field: PUSHED_AT, direction: DESC }) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        description
        url
        stargazerCount
        createdAt
        pushedAt
        isArchived
        primaryLanguage { name color }
        root: object(expression: "HEAD:") { ... on Tree { entries { name type } } }
        workflows: object(expression: "HEAD:.github/workflows") { ... on Tree { entries { name } } }
        ${files}
        ${details ? DETAILS : ''}
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
  root: { entries: { name: string; type: string }[] } | null
  workflows: { entries: { name: string }[] } | null
  /** Left out by the lightest retry. */
  openPrs?: { totalCount: number }
  prs?: { nodes: { mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' }[] }
  defaultBranchRef?: { target: { statusCheckRollup: { state: string } | null } | null } | null
  [file: string]: unknown
}

export type RawOwner = {
  login: string
  avatarUrl: string
  name?: string | null
  repositories: { totalCount: number; pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: RawRepo[] }
}

export class GitHubError extends Error {
  constructor(public kind: 'not-found' | 'rate-limited' | 'unavailable', message: string) {
    super(message)
  }
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

type GraphQLAnswer = { data?: { repositoryOwner: RawOwner | null }; errors?: { type?: string; message: string }[] }

/**
 * One owner's repos, from the start or from `after` (the cursor where the previous building ended).
 * `partial` says a retry had to ask for less than the full building.
 */
export async function fetchOwner(
  login: string,
  token: string,
  fetcher: Fetcher = fetch,
  after: string | null = null,
  attempt = 0,
): Promise<{ owner: RawOwner; partial: boolean }> {
  const tries = after ? NEXT : FIRST
  let res: Response
  let json: GraphQLAnswer
  try {
    res = await fetcher('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'repartments',
      },
      body: JSON.stringify({ query: query(tries[attempt]), variables: { login, after } }),
    })
    if (res.status === 401) throw new GitHubError('unavailable', 'GitHub rejected the server token')
    if (res.status === 403 || res.status === 429) throw new GitHubError('rate-limited', 'GitHub rate limit')
    if (!res.ok) throw new GitHubError('unavailable', `GitHub answered ${res.status}`)
    json = (await res.json()) as GraphQLAnswer
  } catch (err) {
    const retryable = !(err instanceof GitHubError) || (err.kind === 'unavailable' && !err.message.includes('token'))
    if (retryable && attempt + 1 < tries.length) {
      await new Promise((r) => setTimeout(r, 700))
      return fetchOwner(login, token, fetcher, after, attempt + 1)
    }
    throw err instanceof GitHubError ? err : new GitHubError('unavailable', String(err))
  }
  if (json.errors?.some((e) => e.type === 'RATE_LIMITED')) throw new GitHubError('rate-limited', 'GitHub rate limit')
  const owner = json.data?.repositoryOwner
  if (!owner) throw new GitHubError('not-found', `No GitHub user or organization called ${login}`)
  return { owner, partial: attempt > 0 }
}
