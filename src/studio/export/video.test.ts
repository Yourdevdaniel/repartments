import { describe, expect, it, vi } from 'vitest'
import { breathe, fitContain, sceneFrames, videoFileName, wrapText } from './video'

describe('sceneFrames', () => {
  it('gives 30 frames for each second of story, fewer when it plays faster', () => {
    expect(sceneFrames(12, 1)).toBe(360)
    expect(sceneFrames(12, 1.5)).toBe(240)
    expect(sceneFrames(12, 2)).toBe(180)
    expect(sceneFrames(12, 0.5)).toBe(720)
  })

  it('never gives an empty scene, nor divides by a zero speed', () => {
    expect(sceneFrames(0, 1)).toBe(1)
    expect(sceneFrames(10, 0)).toBe(300)
  })
})

describe('breathe', () => {
  it('comes back without a timer, so fake timers never hold it', async () => {
    vi.useFakeTimers()
    try {
      await expect(breathe()).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
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
