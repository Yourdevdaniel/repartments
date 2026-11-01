import { describe, expect, it } from 'vitest'
import { lotCount, neighborhood, reposAhead } from './lot'
import { TOWER } from './Tower'

describe('neighborhood', () => {
  it('gives the same street back for the same owner and building', () => {
    expect(neighborhood('octocat', 2)).toEqual(neighborhood('OctoCat', 2))
  })

  it('changes the scenery from one building to the next', () => {
    const a = neighborhood('octocat', 1)
    const b = neighborhood('octocat', 2)
    expect(a.neighbors).not.toEqual(b.neighbors)
    expect([a.block, b.block]).toEqual(['B', 'C'])
  })

  it('keeps the first building as it always looked, apart from the neighbours', () => {
    expect(neighborhood('octocat', 0)).toMatchObject({ palette: 0, block: null, street: 0, mirror: false })
  })

  it('never builds next door over the tower or its trees', () => {
    for (let lot = 0; lot < 20; lot++) {
      for (const n of neighborhood('octocat', lot).neighbors) {
        expect(Math.abs(n.x) - n.width / 2).toBeGreaterThanOrEqual(TOWER.width / 2 + 3)
      }
    }
  })
})

describe('lotCount', () => {
  it('fits the first 12 repos in one building and six in each after', () => {
    expect(lotCount(5, 5)).toBe(1)
    expect(lotCount(12, 12)).toBe(1)
    expect(lotCount(13, 12)).toBe(2)
    expect(lotCount(30, 12)).toBe(4)
    expect(lotCount(30, 6)).toBe(5)
  })
})

describe('reposAhead', () => {
  it('counts the repos past the buildings walked so far', () => {
    expect(reposAhead(30, [12])).toBe(18)
    expect(reposAhead(30, [12, 6])).toBe(12)
  })

  it('never goes below zero when the owner lost repos since the first building loaded', () => {
    expect(reposAhead(12, [12, 6])).toBe(0)
  })
})
