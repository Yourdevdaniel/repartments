import { describe, expect, it } from 'vitest'
import { clientKey, createLimiter } from './limiter'

describe('createLimiter', () => {
  it('lets a visitor through up to the limit, then says no until the window resets', () => {
    let t = 0
    const allow = createLimiter(2, 1000, () => t)
    expect([allow('a'), allow('a'), allow('a')]).toEqual([true, true, false])
    expect(allow('b')).toBe(true)
    t = 1000
    expect(allow('a')).toBe(true)
  })
})

describe('clientKey', () => {
  it('takes the first address the proxy forwarded', () => {
    expect(clientKey(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7')
    expect(clientKey(new Headers())).toBe('unknown')
  })
})
