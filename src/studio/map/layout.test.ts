import { describe, expect, it } from 'vitest'
import type { ArchitectureModel, Component, Dependency, External } from '../../shared/studio'
import { CARD_H, CARD_W, EXTERNAL_H, edgePath, externalKey, layoutMap, neighboursOf, orderGroups, ROW_MAX, strokeWidth } from './layout'
import { sampleModel } from './sample'

function comp(id: string, layer: Component['layer'], name = id): Component {
  return {
    id,
    name,
    path: id,
    direct: false,
    layer,
    files: 1,
    lines: 10,
    tech: [],
    entry: false,
    summary: { en: name, pt: name },
  }
}

function modelWith(components: Component[], dependencies: Dependency[] = [], externals: External[] = []): ArchitectureModel {
  return { ...sampleModel, components, dependencies, externals, endpoints: [], agents: [], flows: [] }
}

describe('layoutMap', () => {
  it('stacks one band per layer in layer order and hides the tests by default', () => {
    const m = modelWith([comp('t', 'tests'), comp('d', 'data'), comp('i', 'interface'), comp('a', 'api')])
    const hidden = layoutMap(m, { showTests: false })
    expect(hidden.bands.map((b) => b.key)).toEqual(['interface', 'api', 'data'])
    const shown = layoutMap(m, { showTests: true })
    expect(shown.bands.map((b) => b.key)).toEqual(['interface', 'api', 'data', 'tests'])
    expect(shown.boxes.t).toBeDefined()
    expect(hidden.boxes.t).toBeUndefined()
  })

  it('puts the outside services in a last band', () => {
    const m = modelWith([comp('a', 'api')], [], [{ id: 'pg', name: 'PostgreSQL', kind: 'database', usedBy: ['a'] }])
    const l = layoutMap(m, { showTests: false })
    expect(l.bands.map((b) => b.key)).toEqual(['api', 'external'])
    expect(l.boxes[externalKey('pg')].h).toBe(EXTERNAL_H)
    expect(l.edges.find((e) => e.kind === 'usage')?.to).toBe(externalKey('pg'))
  })

  it('wraps a band into rows past five cards and keeps every card inside the map', () => {
    const many = Array.from({ length: 7 }, (_, i) => comp(`c${i}`, 'logic', `Parte ${i}`))
    const l = layoutMap(modelWith(many), { showTests: false })
    const ys = new Set(many.map((c) => l.boxes[c.id].y))
    expect(ys.size).toBe(2)
    expect(ROW_MAX).toBe(5)
    for (const c of many) {
      const b = l.boxes[c.id]
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.x + b.w).toBeLessThanOrEqual(l.width)
      expect(b.y + b.h).toBeLessThanOrEqual(l.height)
    }
  })

  it('never overlaps two cards', () => {
    const l = layoutMap(sampleModel, { showTests: true })
    const boxes = Object.values(l.boxes)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
        expect(apart).toBe(true)
      }
    }
  })

  it('orders the cards of a band to avoid a crossing', () => {
    // a1 -> y and a2 -> x would cross if x stayed before y; the barycentre swaps them.
    const m = modelWith(
      [comp('a1', 'interface'), comp('a2', 'interface'), comp('x', 'api'), comp('y', 'api')],
      [
        { from: 'a1', to: 'y', weight: 1 },
        { from: 'a2', to: 'x', weight: 1 },
      ],
    )
    const l = layoutMap(m, { showTests: false })
    expect(l.boxes.a1.x).toBeLessThan(l.boxes.a2.x)
    expect(l.boxes.y.x).toBeLessThan(l.boxes.x.x)
  })

  it('draws dependencies with stroke widths between 1 and 4', () => {
    const m = modelWith([comp('a', 'api'), comp('b', 'logic')], [
      { from: 'a', to: 'b', weight: 1 },
      { from: 'b', to: 'a', weight: 9 },
    ])
    const l = layoutMap(m, { showTests: false })
    const widths = l.edges.map((e) => e.width)
    expect(Math.max(...widths)).toBeCloseTo(4)
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(1)
  })

  it('skips edges that touch a hidden component', () => {
    const m = modelWith(
      [comp('a', 'api'), comp('t', 'tests')],
      [{ from: 't', to: 'a', weight: 3 }],
    )
    expect(layoutMap(m, { showTests: false }).edges).toEqual([])
    expect(layoutMap(m, { showTests: true }).edges).toHaveLength(1)
  })

  it('is empty but valid for a model without components', () => {
    const l = layoutMap(modelWith([]), { showTests: false })
    expect(l.bands).toEqual([])
    expect(l.height).toBe(0)
    expect(l.width).toBeGreaterThan(CARD_W)
  })

  it('gives the sample model one band per visible layer and a card of the standard size', () => {
    const l = layoutMap(sampleModel, { showTests: false })
    expect(l.bands.map((b) => b.key)).toEqual(['interface', 'api', 'security', 'logic', 'ai', 'jobs', 'data', 'shared', 'infra', 'external'])
    expect(l.boxes['backend/api/routes'].w).toBe(CARD_W)
    expect(l.boxes['backend/api/routes'].h).toBe(CARD_H)
  })
})

describe('orderGroups', () => {
  it('keeps the input order when there is nothing to reorder', () => {
    expect(orderGroups([['a', 'b'], ['c', 'd']], new Map())).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('is deterministic', () => {
    const groups = [['a', 'b', 'c'], ['x', 'y', 'z']]
    const nb = new Map([['a', ['z']], ['c', ['x']], ['y', ['b']]])
    expect(orderGroups(groups, nb)).toEqual(orderGroups(groups, nb))
  })
})

describe('edgePath', () => {
  it('starts at the bottom of the upper box and ends at the top of the lower one', () => {
    const d = edgePath({ x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 200, w: 100, h: 50 })
    expect(d.startsWith('M50 50 C')).toBe(true)
    expect(d.endsWith(' 50 200')).toBe(true)
  })

  it('leaves from the top when the target is above', () => {
    const d = edgePath({ x: 0, y: 200, w: 100, h: 50 }, { x: 0, y: 0, w: 100, h: 50 })
    expect(d.startsWith('M50 200 C')).toBe(true)
    expect(d.endsWith(' 50 50')).toBe(true)
  })
})

describe('strokeWidth and neighboursOf', () => {
  it('scales the stroke by the square root of the weight, from 1 to 4', () => {
    expect(strokeWidth(0, 10)).toBe(1)
    expect(strokeWidth(10, 10)).toBeCloseTo(4)
    expect(strokeWidth(2.5, 10)).toBeGreaterThan(strokeWidth(1, 10))
    expect(strokeWidth(3, 0)).toBe(1)
  })

  it('finds a node and everything it is joined to, and nothing else', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'c', to: 'a' },
      { from: 'd', to: 'e' },
    ]
    expect([...neighboursOf('a', edges)].sort()).toEqual(['a', 'b', 'c'])
  })
})
