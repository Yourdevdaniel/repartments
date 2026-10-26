import { describe, expect, it } from 'vitest'
import { POLICY, POLICY_LEAD, POLICY_UPDATED } from './policy'

const texts = (lang: 'pt' | 'en') =>
  [POLICY_LEAD[lang], ...POLICY.flatMap((s) => [s.title[lang], ...s.paragraphs.map((p) => p[lang]), ...(s.items ?? []).flatMap((i) => [i.title[lang], i.text[lang]])])].join('\n')

describe('privacy policy', () => {
  it('says everything in both languages', () => {
    for (const s of POLICY) {
      for (const t of [s.title, ...s.paragraphs, ...(s.items ?? []).flatMap((i) => [i.title, i.text])]) {
        expect(t.pt.trim()).not.toBe('')
        expect(t.en.trim()).not.toBe('')
      }
    }
    expect(Number.isNaN(new Date(`${POLICY_UPDATED}T00:00:00`).getTime())).toBe(false)
  })

  it('says the site sets no cookies, now that the studio sign-in is gone', () => {
    expect(texts('pt')).toMatch(/não usa cookies/)
    expect(texts('en')).toMatch(/uses no cookies/)
  })

  it('names who else handles the data and the international transfer', () => {
    for (const lang of ['pt', 'en'] as const) {
      expect(texts(lang)).toMatch(/GitHub/)
      expect(texts(lang)).toMatch(/Vercel/)
      expect(texts(lang)).toMatch(/art\. 33/)
      expect(texts(lang)).toMatch(/art\. 18/)
    }
  })
})
