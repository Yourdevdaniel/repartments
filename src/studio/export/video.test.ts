import { describe, expect, it, vi } from 'vitest'
import { fitContain, framePacer, pickFormat, videoBitrate, videoFileName, wrapText } from './video'

/** The frames a pacer keeps out of a screen's frames drawn at `times`, and the gaps between them. */
function kept(times: number[], onSteady = () => {}) {
  const pace = framePacer(onSteady)
  const out = times.filter((t) => pace.keep(t))
  return { out, gaps: out.slice(1).map((t, i) => Math.round(t - out[i])) }
}
const screen = (hz: number, from = 0, n = 300) => Array.from({ length: n }, (_, i) => from + (i * 1000) / hz)

describe('framePacer', () => {
  it('keeps every second frame of a 75 Hz screen, evenly, never 2 then 3', () => {
    const { out, gaps } = kept(screen(75))
    expect(out.length).toBeGreaterThan(100)
    expect(new Set(gaps)).toEqual(new Set([27]))
  })

  it('keeps every second frame at 60 Hz and every fifth at 144 Hz', () => {
    expect(new Set(kept(screen(60)).gaps)).toEqual(new Set([33]))
    expect(new Set(kept(screen(144)).gaps)).toEqual(new Set([35]))
  })

  it('keeps the spacing when the screen’s frames come a little early or late', () => {
    const shaky = screen(75).map((t, i) => t + [0, 1.5, -1.2, 0.8, -1.5][i % 5])
    for (const gap of kept(shaky).gaps) expect(Math.abs(gap - 26.7)).toBeLessThan(4)
  })

  it('starts only once the scene has run a second without stalls, and says so once', () => {
    const onSteady = vi.fn()
    // The scene goes in (a stall), runs half a second, stalls again as the residents load, then runs smoothly.
    const times = [0, ...screen(75, 400, 38), ...screen(75, 1600)]
    const { out } = kept(times, onSteady)
    expect(onSteady).toHaveBeenCalledTimes(1)
    expect(out[0]).toBeGreaterThan(2600)
    expect(out[0]).toBeLessThan(2700)
  })

  it('records every frame of a machine too slow to ever run smoothly', () => {
    const { out, gaps } = kept(Array.from({ length: 200 }, (_, i) => i * 80))
    expect(out.length).toBeGreaterThan(100)
    expect(new Set(gaps)).toEqual(new Set([80]))
  })

  it('knows the video’s frame rate well before the video starts', () => {
    const onSteady = vi.fn()
    const pace = framePacer(onSteady)
    expect(pace.fps).toBe(0)
    for (const t of screen(75, 0, 40)) expect(pace.keep(t)).toBe(false)
    expect(pace.fps).toBeCloseTo(37.5)
    expect(onSteady).not.toHaveBeenCalled()
  })
})

describe('videoBitrate', () => {
  it('keeps the bits per frame of 3 Mbit/s at 30 fps, so the file stays about 22 MB a minute', () => {
    expect(videoBitrate(30)).toBe(3_000_000)
    expect(videoBitrate(37.5)).toBe(2_400_000)
    expect(videoBitrate(28.8)).toBe(3_125_000)
  })
})

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
