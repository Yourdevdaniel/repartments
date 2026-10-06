import { describe, expect, it } from 'vitest'
import { clampOrbit, HOME, isHome, MAX_TURN, MAX_ZOOM, zoomAt } from './orbit'

describe('zoomAt', () => {
  it('keeps the point under the pointer still', () => {
    const scale = 50
    const before = { ...HOME, s: 0.3, y: -0.2, zoom: 1.5 }
    const after = zoomAt(before, 2, 120, -80, scale)
    // World offset of the pointed-at spot from the shot's centre, before and after.
    const spot = (o: typeof before, px: number, base: number) => base + px / (scale * o.zoom)
    expect(spot(after, 120, after.s)).toBeCloseTo(spot(before, 120, before.s))
    expect(spot(after, -80, after.y)).toBeCloseTo(spot(before, -80, before.y))
  })

  it('stops at the zoom limits', () => {
    expect(zoomAt(HOME, 100, 0, 0, 50).zoom).toBe(MAX_ZOOM)
  })
})

describe('clampOrbit', () => {
  it('keeps the tower centred when not zoomed in', () => {
    expect(isHome(clampOrbit({ ...HOME, s: 3, y: -2 }, 0.36, 12, 16))).toBe(true)
  })

  it('lets a zoomed-in view slide, but not off the tower', () => {
    const o = clampOrbit({ az: 0, zoom: 2, s: 100, y: -100 }, 0.36, 12, 16)
    expect(o.s).toBe(3)
    expect(o.y).toBe(-4)
  })

  it('never turns round to the back of the tower', () => {
    expect(0.36 + clampOrbit({ ...HOME, az: 5 }, 0.36, 12, 16).az).toBeCloseTo(MAX_TURN)
    expect(0.36 + clampOrbit({ ...HOME, az: -5 }, 0.36, 12, 16).az).toBeCloseTo(-MAX_TURN)
  })
})

describe('isHome', () => {
  it('tells an untouched view from a moved one', () => {
    expect(isHome(HOME)).toBe(true)
    expect(isHome({ ...HOME, zoom: 1.4 })).toBe(false)
  })
})
