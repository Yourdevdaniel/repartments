import { describe, expect, it } from 'vitest'
import { accentuate, readableWord, singularWord } from './words'

describe('readableWord', () => {
  it('translates a known English route word for the Portuguese captions, and keeps it for the English ones', () => {
    expect(readableWord('contracts')).toEqual({ pt: 'contratos', en: 'contracts' })
    expect(readableWord('profile')).toEqual({ pt: 'perfil', en: 'profile' })
  })

  it('puts back the accents of a Portuguese word written in ASCII, and translates it for English', () => {
    expect(readableWord('analises')).toEqual({ pt: 'análises', en: 'analyses' })
    expect(readableWord('estudio')).toEqual({ pt: 'estúdio', en: 'studio' })
    expect(readableWord('avaliacoes')).toEqual({ pt: 'avaliações', en: 'reviews' })
  })

  it('translates a phrase only when it knows every word, and leaves unknown words as they are', () => {
    expect(readableWord('meus dados')).toEqual({ pt: 'meus dados', en: 'meus dados' })
    expect(readableWord('zorblax')).toEqual({ pt: 'zorblax', en: 'zorblax' })
  })
})

describe('singularWord', () => {
  it('knows the singular of irregular Portuguese plurals', () => {
    expect(singularWord('perfis')).toBe('perfil')
    expect(singularWord('avaliações')).toBe('avaliação')
    expect(singularWord('festivais')).toBe('festival')
    expect(singularWord('leads')).toBeNull()
  })
})

describe('accentuate', () => {
  it('only restores accents, word by word, and keeps the capital letter', () => {
    expect(accentuate('Minha banda gestao')).toBe('Minha banda gestão')
    expect(accentuate('Estudio detalhe')).toBe('Estúdio detalhe')
    expect(accentuate('Post detail')).toBe('Post detail')
  })
})
