import type { AgentLink, AgentNode } from '../../shared/studio'
import type { Box } from './layout'
import { orderGroups } from './layout'

/** Box sizes per kind: diamonds need more room for their text, pills are slimmer. */
export const NODE_SIZE: Record<AgentNode['kind'], { w: number; h: number }> = {
  start: { w: 150, h: 44 },
  end: { w: 150, h: 44 },
  decision: { w: 200, h: 92 },
  tool: { w: 210, h: 60 },
  llm: { w: 210, h: 60 },
  instructions: { w: 210, h: 60 },
  human: { w: 210, h: 60 },
  node: { w: 210, h: 60 },
}

export type PlacedNode = { node: AgentNode; box: Box }

/** One arrow of the graph. `loop` marks an arrow that goes back up, drawn around the right side. */
export type LinkRoute = {
  from: string
  to: string
  condition: string | null
  loop: boolean
  d: string
  /** Where the condition's label sits, when there is one. */
  label: { x: number; y: number } | null
}

export type AgentLayout = { width: number; height: number; nodes: PlacedNode[]; links: LinkRoute[] }

const GAP_X = 44
const GAP_Y = 60
const MARGIN = 32
const LOOP_OFFSET = 56

function fmt(n: number): string {
  return String(Math.round(n * 10) / 10)
}

/**
 * Lays out an agent's decision graph as a top-down flowchart. Each box goes one row below the
 * boxes that lead to it (the longest path from the start decides the row). Arrows that point back
 * up, the ones that close a loop, are found with a depth-first walk and drawn as curves on the
 * right side. Pure and deterministic: the same graph always gives the same picture.
 */
export function layoutAgent(graph: { nodes: AgentNode[]; links: AgentLink[] }): AgentLayout {
  const nodes = graph.nodes
  const ids = new Set(nodes.map((n) => n.id))
  const edges = graph.links.filter((l) => ids.has(l.from) && ids.has(l.to) && l.from !== l.to)
  const out = new Map<string, number[]>()
  edges.forEach((e, i) => out.set(e.from, [...(out.get(e.from) ?? []), i]))

  // Depth-first walk from the start boxes (then from anything left over). An arrow into a box that
  // is still being visited closes a loop, so it is marked as a back edge.
  const roots = [...nodes.filter((n) => n.kind === 'start'), ...nodes].map((n) => n.id)
  const state = new Map<string, 'open' | 'done'>()
  const back = new Set<number>()
  const visit = (id: string) => {
    state.set(id, 'open')
    for (const ei of out.get(id) ?? []) {
      const to = edges[ei].to
      const s = state.get(to)
      if (s === 'open') back.add(ei)
      else if (!s) visit(to)
    }
    state.set(id, 'done')
  }
  for (const r of roots) if (!state.has(r)) visit(r)

  const forward = edges.map((_, i) => i).filter((i) => !back.has(i))

  // Longest path from the sources, over the forward arrows only (Kahn's order, so it always ends).
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  for (const i of forward) indeg.set(edges[i].to, (indeg.get(edges[i].to) ?? 0) + 1)
  const layer = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  for (let q = 0; q < queue.length; q++) {
    const id = queue[q]
    for (const i of forward) {
      if (edges[i].from !== id) continue
      const to = edges[i].to
      layer.set(to, Math.max(layer.get(to) ?? 0, (layer.get(id) ?? 0) + 1))
      indeg.set(to, (indeg.get(to) ?? 0) - 1)
      if (indeg.get(to) === 0) queue.push(to)
    }
  }

  const depth = Math.max(0, ...layer.values())
  const rows: string[][] = Array.from({ length: depth + 1 }, () => [])
  for (const n of nodes) rows[layer.get(n.id) ?? 0].push(n.id)

  const neighbours = new Map<string, string[]>()
  for (const i of forward) {
    const { from, to } = edges[i]
    neighbours.set(from, [...(neighbours.get(from) ?? []), to])
    neighbours.set(to, [...(neighbours.get(to) ?? []), from])
  }
  const ordered = orderGroups(rows, neighbours)

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const rowW = (ids: string[]) => ids.reduce((sum, id) => sum + NODE_SIZE[byId.get(id)!.kind].w, 0) + GAP_X * Math.max(0, ids.length - 1)
  const maxW = Math.max(NODE_SIZE.tool.w, ...ordered.map(rowW))
  const hasLoop = back.size > 0
  const axis = MARGIN + maxW / 2
  const loopX = axis + maxW / 2 + LOOP_OFFSET

  const boxes = new Map<string, Box>()
  let top = MARGIN
  for (const row of ordered) {
    if (!row.length) continue
    const rowH = Math.max(...row.map((id) => NODE_SIZE[byId.get(id)!.kind].h))
    let x = axis - rowW(row) / 2
    for (const id of row) {
      const { w, h } = NODE_SIZE[byId.get(id)!.kind]
      boxes.set(id, { x, y: top + (rowH - h) / 2, w, h })
      x += w + GAP_X
    }
    top += rowH + GAP_Y
  }
  const height = Math.max(0, top - GAP_Y) + MARGIN
  const width = hasLoop ? loopX + MARGIN + 24 : axis + maxW / 2 + MARGIN

  const links: LinkRoute[] = edges.map((e, i) => {
    const a = boxes.get(e.from)!
    const b = boxes.get(e.to)!
    if (back.has(i)) {
      // Leave the right side of the lower box and come back into the right side of the upper one.
      const sx = a.x + a.w
      const sy = a.y + a.h / 2
      const tx = b.x + b.w
      const ty = b.y + b.h / 2
      return {
        from: e.from,
        to: e.to,
        condition: e.condition,
        loop: true,
        d: `M${fmt(sx)} ${fmt(sy)} C${fmt(loopX)} ${fmt(sy)} ${fmt(loopX)} ${fmt(ty)} ${fmt(tx)} ${fmt(ty)}`,
        label: e.condition ? { x: loopX - 6, y: (sy + ty) / 2 } : null,
      }
    }
    const sx = a.x + a.w / 2
    const sy = a.y + a.h
    const tx = b.x + b.w / 2
    const ty = b.y
    const k = (ty - sy) / 2
    return {
      from: e.from,
      to: e.to,
      condition: e.condition,
      loop: false,
      d: `M${fmt(sx)} ${fmt(sy)} C${fmt(sx)} ${fmt(sy + k)} ${fmt(tx)} ${fmt(ty - k)} ${fmt(tx)} ${fmt(ty)}`,
      label: e.condition ? { x: (sx + tx) / 2, y: (sy + ty) / 2 } : null,
    }
  })

  const placed: PlacedNode[] = nodes.map((node) => ({ node, box: boxes.get(node.id) ?? { x: 0, y: 0, w: 0, h: 0 } }))
  return { width, height, nodes: placed, links }
}
