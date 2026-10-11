import { describe, expect, it } from 'vitest'
import { sameSiteScript } from './security'
import { timeLeft } from './studio/session'

describe('sameSiteScript', () => {
  it('lets the site load its own scripts and nothing from elsewhere', () => {
    const origin = 'https://repartments.example'
    expect(sameSiteScript('/assets/vault.worker-abc.js', origin)).toBe(true)
    expect(sameSiteScript('https://repartments.example/assets/x.js', origin)).toBe(true)
    expect(sameSiteScript('https://evil.example/x.js', origin)).toBe(false)
    expect(sameSiteScript('javascript:alert(1)', origin)).toBe(false)
    expect(sameSiteScript('data:text/javascript,alert(1)', origin)).toBe(false)
  })
})

describe('timeLeft', () => {
  it('says what is left of a sign-in in words', () => {
    expect(timeLeft(8 * 3600_000, 'pt')).toBe('8 h')
    expect(timeLeft(7 * 3600_000 + 52 * 60_000, 'pt')).toBe('7 h 52 min')
    expect(timeLeft(9 * 60_000 + 30_000, 'pt')).toBe('9 min')
    expect(timeLeft(20_000, 'pt')).toBe('menos de um minuto')
    expect(timeLeft(20_000, 'en')).toBe('under a minute')
  })
})
