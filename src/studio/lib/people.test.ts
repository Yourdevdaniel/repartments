import { describe, expect, it } from 'vitest'
import { initials } from './people'

describe('initials', () => {
  it('takes the first and last word, in capitals', () => {
    expect(initials('Ana Souza')).toBe('AS')
    expect(initials('  bia  ')).toBe('B')
    expect(initials('Ana Beatriz Lima')).toBe('AL')
    expect(initials('Évelyn')).toBe('É')
  })

  it('falls back to a question mark for a blank name', () => {
    expect(initials('   ')).toBe('?')
  })
})
