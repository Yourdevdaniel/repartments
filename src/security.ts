/**
 * Trusted Types: the browser's guard against script injection through the DOM. With
 * `require-trusted-types-for 'script'` in the CSP (vercel.json), every place that could turn a
 * string into code (innerHTML, a script's src, new Worker(url)…) refuses plain strings and asks
 * this "default" policy instead. The policy allows only one thing the app actually does, loading a
 * script from this same site (the token vault's worker, code-split chunks), and turns everything
 * else down, so a string that sneaked into the page can never become HTML or a script.
 *
 * Imported first, before anything else runs. Browsers without Trusted Types simply skip it (the
 * rest of the CSP still applies there).
 */
type Policy = { createScriptURL?: (url: string) => string | null; createHTML?: (html: string) => string | null; createScript?: (s: string) => string | null }
type TrustedTypes = { createPolicy: (name: string, rules: Policy) => unknown; defaultPolicy: unknown }

const tt = (globalThis as { trustedTypes?: TrustedTypes }).trustedTypes

/** Whether a script URL points at this site (and nowhere else). */
export function sameSiteScript(url: string, origin: string): boolean {
  try {
    const u = new URL(url, origin)
    return u.origin === origin && (u.protocol === 'https:' || u.protocol === 'http:')
  } catch {
    return false
  }
}

if (tt && !tt.defaultPolicy) {
  tt.createPolicy('default', {
    createScriptURL: (url) => (sameSiteScript(url, location.origin) ? url : null),
    // No HTML or script from strings, ever: React renders text, and nothing else should need it.
    createHTML: () => null,
    createScript: () => null,
  })
}
