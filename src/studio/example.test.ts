import { describe, expect, it } from 'vitest'
import { wantsExample } from './example'

describe('wantsExample', () => {
  it('opens the example when the address asks for it', () => {
    expect(wantsExample('?example=1')).toBe(true)
    expect(wantsExample('?example')).toBe(true)
    expect(wantsExample('?lang=pt&example=1')).toBe(true)
  })
  it('leaves the studio alone otherwise', () => {
    expect(wantsExample('')).toBe(false)
    expect(wantsExample('?signin=1')).toBe(false)
    expect(wantsExample('?example=0')).toBe(false)
  })
})
