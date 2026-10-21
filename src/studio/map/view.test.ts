import { describe, expect, it } from 'vitest'
import { clampScale, fitView, MAX_SCALE, MIN_SCALE, panBy, zoomAt } from './view'

describe('view', () => {
  it('keeps zoom between the readable limits', () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE)
    expect(clampScale(99)).toBe(MAX_SCALE)
    expect(clampScale(1.2)).toBe(1.2)
  })

  it('fits the content in the window and centres it', () => {
    const v = fitView(800, 600, 1000, 500, 0)
    expect(v.scale).toBeCloseTo(0.8)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo((600 - 500 * 0.8) / 2)
  })

  it('never fits beyond the zoom limits, and copes with an unmeasured window', () => {
    expect(fitView(4000, 4000, 10, 10).scale).toBe(MAX_SCALE)
    expect(fitView(0, 0, 1000, 1000).scale).toBe(1)
    expect(fitView(0, 0, 0, 0).scale).toBe(1)
  })

  it('zooms around the pointer, which stays where it was', () => {
    const v = { scale: 1, x: 0, y: 0 }
    const z = zoomAt(v, 2, 100, 50)
    expect(z.scale).toBe(2)
    // the content point under the pointer before zooming must stay under it
    expect(((100 - v.x) / v.scale) * z.scale + z.x).toBeCloseTo(100)
    expect(((50 - v.y) / v.scale) * z.scale + z.y).toBeCloseTo(50)
  })

  it('does not zoom past the limits', () => {
    expect(zoomAt({ scale: MAX_SCALE, x: 0, y: 0 }, 2, 0, 0).scale).toBe(MAX_SCALE)
  })

  it('pans by a window offset', () => {
    expect(panBy({ scale: 1.5, x: 10, y: 20 }, 5, -3)).toEqual({ scale: 1.5, x: 15, y: 17 })
  })
})
