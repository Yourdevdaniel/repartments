import { describe, expect, it } from 'vitest'
import type { AgentLink, AgentNode } from '../../shared/studio'
import { layoutAgent } from './agentLayout'
import { sampleAgent } from './sample'

function node(id: string, kind: AgentNode['kind'] = 'node'): AgentNode {
  return { id, label: id, kind }
}

function link(from: string, to: string, condition: string | null = null): AgentLink {
  return { from, to, condition }
}

function rowOf(nodes: ReturnType<typeof layoutAgent>['nodes'], id: string): number {
  return nodes.find((p) => p.node.id === id)!.box.y
}

describe('layoutAgent', () => {
  it('puts each box one row below the boxes that lead to it', () => {
    const l = layoutAgent({
      nodes: [node('start', 'start'), node('a'), node('b'), node('end', 'end')],
      links: [link('start', 'a'), link('a', 'b'), link('b', 'end')],
    })
    const y = (id: string) => rowOf(l.nodes, id)
    expect(y('start')).toBeLessThan(y('a'))
    expect(y('a')).toBeLessThan(y('b'))
    expect(y('b')).toBeLessThan(y('end'))
    expect(l.links.every((r) => !r.loop)).toBe(true)
  })

  it('uses the longest path, so a box with two ways in sits below both', () => {
    const l = layoutAgent({
      nodes: [node('s', 'start'), node('a'), node('b'), node('join')],
      links: [link('s', 'join'), link('s', 'a'), link('a', 'b'), link('b', 'join')],
    })
    expect(rowOf(l.nodes, 'join')).toBeGreaterThan(rowOf(l.nodes, 'b'))
  })

  it('marks an arrow that closes a loop, and still places every box', () => {
    const l = layoutAgent({
      nodes: [node('s', 'start'), node('model', 'llm'), node('tool', 'tool'), node('end', 'end')],
      links: [link('s', 'model'), link('model', 'tool'), link('tool', 'model', 'de novo'), link('model', 'end')],
    })
    const back = l.links.find((r) => r.from === 'tool' && r.to === 'model')!
    expect(back.loop).toBe(true)
    expect(back.label).not.toBeNull()
    expect(l.nodes).toHaveLength(4)
    for (const p of l.nodes) {
      expect(Number.isFinite(p.box.x)).toBe(true)
      expect(Number.isFinite(p.box.y)).toBe(true)
    }
    // The loop goes around the right side, so it reaches past the boxes it joins.
    const loopX = Math.max(...back.d.match(/[\d.]+/g)!.map(Number))
    expect(loopX).toBeGreaterThan(Math.max(...l.nodes.map((p) => p.box.x + p.box.w)))
  })

  it('draws labels only for arrows with a condition', () => {
    const l = layoutAgent({
      nodes: [node('s', 'start'), node('a'), node('b')],
      links: [link('s', 'a', 'sim'), link('s', 'b')],
    })
    expect(l.links.find((r) => r.to === 'a')!.label).not.toBeNull()
    expect(l.links.find((r) => r.to === 'b')!.label).toBeNull()
  })

  it('keeps every box and arrow inside the drawing', () => {
    const l = layoutAgent(sampleAgent.graph)
    for (const p of l.nodes) {
      expect(p.box.x).toBeGreaterThanOrEqual(0)
      expect(p.box.y).toBeGreaterThanOrEqual(0)
      expect(p.box.x + p.box.w).toBeLessThanOrEqual(l.width)
      expect(p.box.y + p.box.h).toBeLessThanOrEqual(l.height)
    }
  })

  it('finds the loop of the sample agent: confirming a save goes back to the model', () => {
    const l = layoutAgent(sampleAgent.graph)
    const loops = l.links.filter((r) => r.loop).map((r) => `${r.from}->${r.to}`)
    expect(loops).toEqual(['buscar->modelo', 'listar->modelo', 'confirmar->modelo'])
  })

  it('is deterministic: the same graph gives the same picture', () => {
    const a = layoutAgent(sampleAgent.graph)
    const b = layoutAgent(sampleAgent.graph)
    expect(b).toEqual(a)
  })

  it('ignores arrows to boxes that do not exist', () => {
    const l = layoutAgent({ nodes: [node('a', 'start')], links: [link('a', 'ghost')] })
    expect(l.links).toEqual([])
  })

  it('handles an empty graph', () => {
    const l = layoutAgent({ nodes: [], links: [] })
    expect(l.nodes).toEqual([])
    expect(l.links).toEqual([])
  })
})
