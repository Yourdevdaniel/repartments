/**
 * What a leaked secret looks like, for the two checks that guard the studio's keys: the build's
 * output (`check-dist.mjs`, after every build, so a site carrying a secret is never published) and
 * a published site (`scan-site.mjs`, from the outside, like anyone could). Pure: text in, findings
 * out. A finding names the file and the kind of leak, never the leaked value, so the report itself
 * can be shown or logged safely.
 */

/** Secrets in the server's environment whose values must never reach a page. */
export const SENSITIVE_ENV = ['GITHUB_CLIENT_SECRET', 'GITHUB_TOKEN']

/** Shapes of secrets that are a leak wherever they appear, whatever their value. */
export const PATTERNS = [
  { kind: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
  { kind: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kind: 'secret written in the code', re: /\b(?:GITHUB_CLIENT_SECRET|GITHUB_TOKEN|SESSION_SECRET)\b["']?\s*[:=]\s*["'][^"'\s]{8,}/ },
]

/** The sensitive values set in an environment, ignoring empty or too-short ones (they'd match anything). */
export function secretsFrom(env) {
  return SENSITIVE_ENV.map((name) => ({ name, value: String(env[name] ?? '').trim() })).filter((s) => s.value.length >= 8)
}

/**
 * Every leak in some files: a secret's own value (from `secretsFrom`) or anything shaped like a
 * secret. `files` is a list of `{ name, text }`.
 */
export function findLeaks(files, secrets = []) {
  const found = []
  for (const file of files) {
    for (const p of PATTERNS) if (p.re.test(file.text)) found.push({ file: file.name, kind: p.kind })
    for (const s of secrets) if (file.text.includes(s.value)) found.push({ file: file.name, kind: `the value of ${s.name}` })
  }
  return found
}
