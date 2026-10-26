import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Every server file that runs on Vercel (tests aside). */
function serverFiles(): { name: string; text: string }[] {
  return ['server', 'api'].flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => ({ name: join(dir, f), text: readFileSync(join(dir, f), 'utf8') })),
  )
}

describe('server logs', () => {
  it('never print a secret, a token, a cookie or a request: only fixed words and GitHub’s error codes', () => {
    const risky = /env|secret|token|cookie|authori[sz]ation|headers|body|request|verifier/i
    const offenders: string[] = []
    for (const file of serverFiles()) {
      for (const call of file.text.matchAll(/console\.(?:log|info|warn|error|debug)\(([^\n]*)\)/g)) {
        // Only what is put into the message is checked: the fixed words may name a variable.
        for (const part of call[1].matchAll(/\$\{([^}]*)\}|(?:^|,)\s*([A-Za-z_][\w.?[\]'"]*)\s*(?=,|$)/g)) {
          const expr = part[1] ?? part[2]
          if (risky.test(expr)) offenders.push(`${file.name}: ${expr}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
