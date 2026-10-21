/**
 * Reads file contents from GitHub in bulk. Each GraphQL query asks for up to 60 blobs by their
 * `<commit>:<path>` expression, so a repo of hundreds of files costs a handful of requests.
 */
import { StudioFailure, type GitHubClient } from '../github/client'

/** Blobs per GraphQL query. */
export const BATCH = 60
/** Queries in flight at once. */
export const CONCURRENCY = 4

/**
 * A GraphQL string literal for `value`: backslashes, quotes and control characters are escaped, so a
 * path with odd characters can't end the string early.
 */
export function graphqlString(value: string): string {
  let out = '"'
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (ch === '\\') out += '\\\\'
    else if (ch === '"') out += '\\"'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (code < 0x20 || code === 0x7f) out += '\\u' + code.toString(16).padStart(4, '0')
    else out += ch
  }
  return out + '"'
}

/** The query that reads one batch of files at a commit. Aliases are f0, f1, … in the given order. */
export function blobQuery(sha: string, paths: string[]): string {
  const fields = paths.map((p, i) => `f${i}: object(expression: ${graphqlString(`${sha}:${p}`)}) { ... on Blob { text isBinary } }`)
  return `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields.join(' ')} } }`
}

type BlobAnswer = { text: string | null; isBinary: boolean | null } | null

/**
 * The texts of the given files at a commit. Binary files and files GitHub couldn't return are left
 * out; `onProgress` runs after every batch. A batch that fails for a reason other than the person's
 * access (a GitHub hiccup) is skipped, so one bad batch doesn't sink the whole analysis.
 */
export async function readFiles(
  client: GitHubClient,
  owner: string,
  name: string,
  sha: string,
  paths: string[],
  onProgress: (done: number, total: number) => void,
): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  const batches: string[][] = []
  for (let i = 0; i < paths.length; i += BATCH) batches.push(paths.slice(i, i + BATCH))
  let done = 0
  let next = 0

  async function run(batch: string[]) {
    try {
      const data = await client.graphql<{ repository: Record<string, BlobAnswer> | null }>(blobQuery(sha, batch), { owner, name })
      const repo = data.repository ?? {}
      batch.forEach((path, i) => {
        const blob = repo[`f${i}`]
        if (!blob || blob.isBinary || typeof blob.text !== 'string' || blob.text.includes('\u0000')) return
        files.set(path, blob.text)
      })
    } catch (err) {
      // The person's own access and rate limits still stop the analysis; anything else skips the batch.
      if (err instanceof StudioFailure && err.code !== 'unavailable') throw err
    }
    done += batch.length
    onProgress(Math.min(done, paths.length), paths.length)
  }

  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++]
      await run(batch)
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker))
  return files
}
