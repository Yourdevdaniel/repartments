/**
 * A small per-visitor brake on the public endpoint, so one script asking for thousands of different
 * usernames can't burn through the GitHub token's hourly allowance for everyone else.
 *
 * It lives in memory, so each server instance counts on its own: a best-effort guard on top of the
 * edge cache, not a hard quota.
 */
export function createLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; reset: number }>()
  return function allow(key: string): boolean {
    const t = now()
    const entry = hits.get(key)
    if (!entry || t >= entry.reset) {
      hits.set(key, { count: 1, reset: t + windowMs })
      // Keep the map from growing forever on a long-lived instance.
      if (hits.size > 5000) for (const [k, v] of hits) if (t >= v.reset) hits.delete(k)
      return true
    }
    entry.count++
    return entry.count <= limit
  }
}

/** The visitor's address as the platform reports it; a shared bucket when there is none. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip') || 'unknown'
}
