import { describe, expect, it } from 'vitest'
import { clip, count, firstSentence, joinList, langOf, lineOf, slug, stripComments, titleWords } from './text'

describe('joinList', () => {
  it('joins with the right conjunction in each language', () => {
    expect(joinList(['a', 'b', 'c'], 'pt')).toBe('a, b e c')
    expect(joinList(['a', 'b', 'c'], 'en')).toBe('a, b and c')
    expect(joinList(['a', 'b'], 'pt')).toBe('a e b')
    expect(joinList(['solo'], 'en')).toBe('solo')
    expect(joinList([], 'pt')).toBe('')
  })
})

describe('clip and firstSentence', () => {
  it('cuts at a word boundary and adds an ellipsis', () => {
    const out = clip('um texto bem comprido que não cabe inteiro aqui', 20)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out).toBe('um texto bem…')
  })

  it('leaves short text alone and collapses whitespace', () => {
    expect(clip('  oi \n   tudo  bem ', 50)).toBe('oi tudo bem')
  })

  it('keeps the first sentence only', () => {
    expect(firstSentence('Procura leads pelo nome. Use com cuidado.', 120)).toBe('Procura leads pelo nome.')
    expect(firstSentence('sem ponto final', 120)).toBe('sem ponto final')
  })
})

describe('names', () => {
  it('turns folder and code names into titles', () => {
    expect(titleWords('payment_flow-v2')).toBe('Payment Flow V2')
    expect(titleWords('leads')).toBe('Leads')
  })

  it('makes url-safe ids, removing accents', () => {
    expect(slug('Banco de dados')).toBe('banco-de-dados')
    expect(slug('Mercado Pago')).toBe('mercado-pago')
    expect(slug('Pagar.me')).toBe('pagar-me')
  })

  it('counts with the right singular or plural', () => {
    expect(count(1, 'parte', 'partes')).toBe('1 parte')
    expect(count(9, 'parte', 'partes')).toBe('9 partes')
  })
})

describe('langOf and lineOf', () => {
  it('recognises the languages the analyser reads', () => {
    expect(langOf('a/b.tsx')).toBe('js')
    expect(langOf('x.py')).toBe('py')
    expect(langOf('x.kt')).toBe('jvm')
    expect(langOf('x.md')).toBeNull()
    expect(langOf('Dockerfile')).toBeNull()
  })

  it('gives 1-based line numbers for any index', () => {
    const line = lineOf('a\nbb\nccc')
    expect([line(0), line(1), line(2), line(3), line(5), line(7)]).toEqual([1, 1, 2, 2, 3, 3])
  })
})

describe('stripComments in hash style', () => {
  it('keeps hashes inside strings and drops them in comments', () => {
    expect(stripComments('x = "#not" # gone', 'hash')).toBe('x = "#not"       ')
  })
})
