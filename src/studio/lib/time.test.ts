import { describe, expect, it } from 'vitest'
import { clock, dayLabel, relativeTime } from './time'
import { errorCode, errorText } from './messages'

describe('relativeTime', () => {
  const now = new Date('2026-03-10T12:00:00Z')

  it('says how long ago in days, in each language', () => {
    expect(relativeTime('2026-03-07T12:00:00Z', now, 'en')).toBe('3 days ago')
    expect(relativeTime('2026-03-07T12:00:00Z', now, 'pt')).toBe('há 3 dias')
  })

  it('uses the friendly words for yesterday and for right now', () => {
    expect(relativeTime('2026-03-09T12:00:00Z', now, 'en')).toBe('yesterday')
    expect(relativeTime('2026-03-10T11:59:40Z', now, 'en')).toBe('now')
  })

  it('gives an empty text for a date that does not parse', () => {
    expect(relativeTime('', now, 'pt')).toBe('')
  })
})

describe('dayLabel', () => {
  const now = new Date(2026, 2, 10, 15)

  it('names today and yesterday', () => {
    expect(dayLabel(new Date(2026, 2, 10, 1), now, 'pt')).toBe('Hoje')
    expect(dayLabel(new Date(2026, 2, 9, 23), now, 'pt')).toBe('Ontem')
    expect(dayLabel(new Date(2026, 2, 9), now, 'en')).toBe('Yesterday')
  })

  it('writes other days out, with the year only from another year', () => {
    expect(dayLabel(new Date(2026, 1, 20), now, 'en')).toBe('Friday, February 20')
    expect(dayLabel(new Date(2025, 11, 31), now, 'en')).toMatch(/2025/)
    expect(dayLabel(new Date(2026, 1, 20), now, 'pt')).toMatch(/fevereiro/)
  })
})

describe('clock', () => {
  it('shows the time of day as HH:mm', () => {
    expect(clock(new Date(2026, 2, 10, 9, 5), 'en')).toMatch(/09:05/)
  })
})

describe('errorText', () => {
  it('gives a Portuguese sentence with its accents for every error code', () => {
    expect(errorText('signed-out', 'pt')).toBe('Sua sessão terminou. Entre de novo para continuar.')
    expect(errorText('rate-limited', 'pt')).toContain('Muitas consultas')
    expect(errorText('not-found', 'pt')).toContain('Não encontramos')
  })

  it('gives English sentences too', () => {
    expect(errorText('forbidden', 'en')).toContain('GitHub')
  })

  it('reads an unknown code as GitHub not answering', () => {
    expect(errorText('what', 'en')).toBe(errorText('unavailable', 'en'))
  })
})

describe('errorCode', () => {
  it('reads the code from a studio error and falls back to unavailable', () => {
    expect(errorCode(Object.assign(new Error('x'), { code: 'forbidden' }))).toBe('forbidden')
    expect(errorCode(new TypeError('boom'))).toBe('unavailable')
    expect(errorCode(null)).toBe('unavailable')
  })
})
