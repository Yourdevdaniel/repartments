import { describe, expect, it } from 'vitest'
import { fitContain, pickFormat, videoFileName, wrapText } from './video'

describe('pickFormat', () => {
  it('prefers MP4, then WebM, and gives up when the browser records neither', () => {
    expect(pickFormat(() => true)).toEqual({ mime: 'video/mp4;codecs=avc1.640028', ext: 'mp4' })
    expect(pickFormat((m) => m.startsWith('video/webm'))).toEqual({ mime: 'video/webm;codecs=vp9', ext: 'webm' })
    expect(pickFormat((m) => m === 'video/webm')).toEqual({ mime: 'video/webm', ext: 'webm' })
    expect(pickFormat(() => false)).toBeNull()
  })
})

describe('fitContain', () => {
  it('fits a wider window into 16:9 with bands above and below, centred', () => {
    expect(fitContain(1600, 800, 1920, 1080)).toEqual({ x: 0, y: 60, w: 1920, h: 960 })
  })

  it('fits a taller window with bands at the sides', () => {
    expect(fitContain(1440, 900, 1920, 1080)).toEqual({ x: 96, y: 0, w: 1728, h: 1080 })
  })

  it('fills the frame when the source has no size yet', () => {
    expect(fitContain(0, 0, 1920, 1080)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 })
  })
})

describe('wrapText', () => {
  // One unit per character keeps the arithmetic obvious.
  const measure = (s: string) => s.length

  it('breaks at spaces without passing the width', () => {
    expect(wrapText(measure, 'o usuário abre a tela de leads', 12)).toEqual(['o usuário', 'abre a tela', 'de leads'])
  })

  it('keeps a word longer than the width on its own line', () => {
    expect(wrapText(measure, 'a configurações b', 6)).toEqual(['a', 'configurações', 'b'])
  })

  it('ends the last allowed line with an ellipsis when there is more', () => {
    const lines = wrapText(measure, 'um dois três quatro cinco seis sete', 10, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
    expect(lines[1].length).toBeLessThanOrEqual(10)
  })

  it('gives nothing for an empty caption', () => {
    expect(wrapText(measure, '   ', 10)).toEqual([])
  })
})

describe('videoFileName', () => {
  it('turns the repo into a safe file name', () => {
    expect(videoFileName('exemplo/crm', 'pt', 'mp4')).toBe('exemplo-crm-apresentacao.mp4')
    expect(videoFileName('Ação & Cia / app', 'en', 'webm')).toBe('Acao-Cia-app-presentation.webm')
    expect(videoFileName('///', 'pt', 'mp4')).toBe('repartments-apresentacao.mp4')
  })
})
