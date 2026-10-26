import { describe, expect, it } from 'vitest'
import { sameSiteScript } from './security'

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
