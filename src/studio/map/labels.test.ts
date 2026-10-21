import { describe, expect, it } from 'vitest'
import { fitText, filesLabel, wrapLabel } from './labels'

describe('wrapLabel', () => {
  it('keeps a short label on one line', () => {
    expect(wrapLabel('Clientes', 14)).toEqual(['Clientes'])
  })

  it('breaks a long label at a space, keeping the accents', () => {
    expect(wrapLabel('Inteligência artificial', 14)).toEqual(['Inteligência', 'artificial'])
    expect(wrapLabel('Regras de negócio', 14)).toEqual(['Regras de', 'negócio'])
  })

  it('cuts a word too long for one line instead of spilling it', () => {
    const [first] = wrapLabel('Supercalifragilisticexpialidocious', 10)
    expect(first.length).toBeLessThanOrEqual(10)
    expect(first.endsWith('…')).toBe(true)
  })

  it('never returns more than two lines', () => {
    expect(wrapLabel('um dois três quatro cinco seis sete oito nove dez', 8).length).toBeLessThanOrEqual(2)
  })
})

describe('fitText and filesLabel', () => {
  it('ellipsises a text that is too long', () => {
    expect(fitText('Negociações', 20)).toBe('Negociações')
    expect(fitText('Testes do servidor de produção', 10)).toBe('Testes do…')
  })

  it('writes the plural correctly in both languages', () => {
    expect(filesLabel(1, 'pt')).toBe('1 arquivo')
    expect(filesLabel(12, 'pt')).toBe('12 arquivos')
    expect(filesLabel(1, 'en')).toBe('1 file')
    expect(filesLabel(3, 'en')).toBe('3 files')
  })
})
