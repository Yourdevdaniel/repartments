import { describe, expect, it } from 'vitest'
import { componentChurn, heatColor, heatRatio, touchedComponents } from './heat'
import { sampleChurn, sampleCommit, sampleModel } from './sample'

describe('componentChurn', () => {
  it('adds up the lines of every file under each component', () => {
    const totals = componentChurn(sampleModel.components, sampleChurn.files)
    expect(totals.get('backend/services/clientes')).toEqual({ additions: 420, deletions: 130, total: 550 })
    expect(totals.get('backend/api/routes')).toEqual({ additions: 300, deletions: 90, total: 390 })
  })

  it('leaves out files that no component covers', () => {
    const totals = componentChurn(sampleModel.components, [{ path: 'README.md', additions: 5, deletions: 1 }])
    expect(totals.size).toBe(0)
  })
})

describe('touchedComponents', () => {
  it('counts the files of a commit in each component it touched', () => {
    const touched = touchedComponents(sampleModel.components, sampleCommit.files)
    expect(touched.get('backend/agents/assistente')).toBe(1)
    expect(touched.get('backend/services/clientes')).toBe(1)
    expect(touched.get('frontend/src/pages')).toBe(1)
    expect(touched.has('deploy')).toBe(false)
  })

  it('counts a renamed file once per component even when both paths are in it', () => {
    const touched = touchedComponents(sampleModel.components, [
      { path: 'backend/auth/novo.py', previousPath: 'backend/auth/antigo.py' },
    ])
    expect(touched.get('backend/auth')).toBe(1)
  })
});

describe('heatRatio', () => {
  it('is 0 for nothing and 1 for the hottest', () => {
    expect(heatRatio(0, 10)).toBe(0)
    expect(heatRatio(10, 10)).toBe(1)
    expect(heatRatio(5, 0)).toBe(0)
  })

  it('grows with the value but less than linearly, so quiet parts stay visible', () => {
    expect(heatRatio(2, 100)).toBeGreaterThan(0.1)
    expect(heatRatio(25, 100)).toBeGreaterThan(heatRatio(10, 100))
  })
})

describe('heatColor', () => {
  it('runs from pale cream to deep rust', () => {
    expect(heatColor(0)).toBe('#fff7ec')
    expect(heatColor(1)).toBe('#c2410c')
    expect(heatColor(0.5)).toBe('#f28c28')
  })

  it('gets darker as the value rises', () => {
    const sum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)
    }
    const steps = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => sum(heatColor(t)))
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1])
  })

  it('clamps values outside the scale', () => {
    expect(heatColor(-1)).toBe(heatColor(0))
    expect(heatColor(3)).toBe(heatColor(1))
  })
})
