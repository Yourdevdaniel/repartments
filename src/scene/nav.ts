/**
 * Walking around furniture. The stories say where people go ("walk to the shelf"); this works out a
 * way there that doesn't go through a desk, a sofa or a wall.
 *
 * Every piece of furniture standing on the floor becomes a rectangle (from `footprints.ts`, turned
 * and moved like the model), walls become thin rectangles with their door gaps left open, and all of
 * them are grown by a resident's half-width. A walk that runs clear of all of them stays a straight
 * line; one that doesn't is found on a fine grid (A*) and then straightened, so it still looks like
 * walking rather than following squares. Pure and deterministic, so the stories stay testable.
 */
import { FOOTPRINTS } from './footprints'
import type { Vec2 } from './story'
import type { FlatLayout, Placement, Rect } from './types'

/** Half a resident's width, plus a little air. */
export const RADIUS = 0.13
/** Grid step for the search, in scene units. */
const CELL = 0.05
/** Things lower than this (rugs, doormats) are walked over. */
const FLAT = 0.05
/** Things resting higher than this (books on a table) sit on something else that's already in the way. */
const ON_TOP = 0.25
const WALL = 0.06

/** The floor rectangle a placed model covers, or null if it isn't in anyone's way. */
export function footprintOf(p: Placement): Rect | null {
  const f = FOOTPRINTS[p.model]
  if (!f || f.h * (p.scale ?? 1) < FLAT || p.at[1] > ON_TOP) return null
  const s = p.scale ?? 1
  const angle = p.rotY ?? 0
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // Turn the four corners like three.js does (rotation about y), then take their bounds.
  const xs: number[] = []
  const zs: number[] = []
  for (const [x, z] of [
    [f.x0, f.z0],
    [f.x1, f.z0],
    [f.x0, f.z1],
    [f.x1, f.z1],
  ]) {
    xs.push(p.at[0] + s * (x * cos + z * sin))
    zs.push(p.at[2] + s * (-x * sin + z * cos))
  }
  return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) }
}

/** Everything in the way in a flat: furniture, and the walls between rooms with their door gaps. */
export function obstaclesOf(layout: FlatLayout): Rect[] {
  const out: Rect[] = []
  for (const room of layout.rooms) for (const f of room.furniture) {
    const r = footprintOf(f)
    if (r) out.push(r)
  }
  if (layout.walls) out.push(...layout.walls)
  else {
    // A strip of rooms: each inner wall runs the full depth except for the door gap.
    const back = -layout.depth / 2
    const front = layout.depth / 2
    layout.rooms.forEach((room, i) => {
      if (i === 0) return
      const x = room.x0
      out.push({ x0: x - WALL / 2, z0: back, x1: x + WALL / 2, z1: layout.door[0] })
      out.push({ x0: x - WALL / 2, z0: layout.door[1], x1: x + WALL / 2, z1: front })
    })
  }
  return out
}

export type Navigator = {
  /** Waypoints from `from` to `to` (not including `from`, ending at `to`). */
  route(from: Vec2, to: Vec2): Vec2[]
  /** Whether a point is somewhere a resident can't stand. */
  blocked(p: Vec2): boolean
  /** The closest point to `p` where a resident can stand (`p` itself when it's clear). */
  nearestFree(p: Vec2): Vec2
}

const inside = (r: Rect, x: number, z: number, grow: number) => x > r.x0 - grow && x < r.x1 + grow && z > r.z0 - grow && z < r.z1 + grow

export function navigator(layout: FlatLayout, radius = RADIUS): Navigator {
  const obstacles = obstaclesOf(layout)
  const minX = 0
  const maxX = layout.width
  const minZ = -layout.depth / 2
  const maxZ = layout.depth / 2
  const blockedAt = (x: number, z: number) =>
    x < minX + radius * 0.6 || x > maxX - radius * 0.6 || z < minZ + radius * 0.6 || z > maxZ - radius * 0.6 || obstacles.some((r) => inside(r, x, z, radius))

  /** Clear all the way, except right next to the ends (spots by a desk are meant to be close to it). */
  const clear = (a: Vec2, b: Vec2) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const steps = Math.max(1, Math.ceil(length / (CELL / 2)))
    for (let i = 0; i <= steps; i++) {
      const k = i / steps
      const x = a[0] + (b[0] - a[0]) * k
      const z = a[1] + (b[1] - a[1]) * k
      if (Math.hypot(x - a[0], z - a[1]) < radius * 1.5 || Math.hypot(x - b[0], z - b[1]) < radius * 1.5) continue
      if (blockedAt(x, z)) return false
    }
    return true
  }

  const cols = Math.ceil((maxX - minX) / CELL)
  const rows = Math.ceil((maxZ - minZ) / CELL)
  const free = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) free[r * cols + c] = blockedAt(minX + (c + 0.5) * CELL, minZ + (r + 0.5) * CELL) ? 0 : 1
  const cellOf = (p: Vec2): [number, number] => [
    Math.min(cols - 1, Math.max(0, Math.floor((p[0] - minX) / CELL))),
    Math.min(rows - 1, Math.max(0, Math.floor((p[1] - minZ) / CELL))),
  ]
  const centre = (c: number, r: number): Vec2 => [minX + (c + 0.5) * CELL, minZ + (r + 0.5) * CELL]
  const cache = new Map<string, Vec2[]>()

  /** A* over the grid; the cells right around the two ends count as free. */
  function search(from: Vec2, to: Vec2): Vec2[] | null {
    const [sc, sr] = cellOf(from)
    const [tc, tr] = cellOf(to)
    const near = (c: number, r: number, [x, z]: Vec2) => Math.hypot(minX + (c + 0.5) * CELL - x, minZ + (r + 0.5) * CELL - z) < radius * 1.6
    const open = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows && (free[r * cols + c] === 1 || near(c, r, from) || near(c, r, to))
    const key = (c: number, r: number) => r * cols + c
    const g = new Float64Array(cols * rows).fill(Infinity)
    const came = new Int32Array(cols * rows).fill(-1)
    const h = (c: number, r: number) => Math.hypot(c - tc, r - tr)
    // A small binary heap of [f, cell].
    const heap: [number, number][] = []
    const push = (item: [number, number]) => {
      heap.push(item)
      let i = heap.length - 1
      while (i > 0) {
        const p = (i - 1) >> 1
        if (heap[p][0] <= heap[i][0]) break
        ;[heap[p], heap[i]] = [heap[i], heap[p]]
        i = p
      }
    }
    const pop = () => {
      const top = heap[0]
      const last = heap.pop()!
      if (heap.length) {
        heap[0] = last
        let i = 0
        for (;;) {
          const l = i * 2 + 1
          const r = l + 1
          let m = i
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r
          if (m === i) break
          ;[heap[m], heap[i]] = [heap[i], heap[m]]
          i = m
        }
      }
      return top
    }
    g[key(sc, sr)] = 0
    push([h(sc, sr), key(sc, sr)])
    const steps: [number, number, number][] = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    ]
    while (heap.length) {
      const [, k] = pop()
      const c = k % cols
      const r = (k - c) / cols
      if (c === tc && r === tr) {
        const cells: Vec2[] = []
        for (let at = k; at !== -1 && at !== key(sc, sr); at = came[at]) cells.push(centre(at % cols, Math.floor(at / cols)))
        cells.reverse()
        return cells
      }
      for (const [dc, dr, cost] of steps) {
        const nc = c + dc
        const nr = r + dr
        if (!open(nc, nr)) continue
        // No cutting corners past an obstacle.
        if (dc && dr && (!open(c + dc, r) || !open(c, r + dr))) continue
        const nk = key(nc, nr)
        const ng = g[k] + cost
        if (ng < g[nk]) {
          g[nk] = ng
          came[nk] = k
          push([ng + h(nc, nr), nk])
        }
      }
    }
    return null
  }

  /** Drops every waypoint the walk can skip with a straight, clear line. */
  function straighten(from: Vec2, points: Vec2[]): Vec2[] {
    const out: Vec2[] = []
    let at = from
    let i = 0
    while (i < points.length) {
      let j = points.length - 1
      while (j > i && !clear(at, points[j])) j--
      out.push(points[j])
      at = points[j]
      i = j + 1
    }
    return out
  }

  return {
    blocked: (p) => blockedAt(p[0], p[1]),
    nearestFree(p) {
      if (!blockedAt(p[0], p[1])) return p
      let best: Vec2 = p
      let bestD = Infinity
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          if (!free[r * cols + c]) continue
          const q = centre(c, r)
          const d = Math.hypot(q[0] - p[0], q[1] - p[1])
          if (d < bestD) {
            bestD = d
            best = q
          }
        }
      return best
    },
    route(from, to) {
      if (clear(from, to)) return [to]
      const id = `${from[0].toFixed(3)},${from[1].toFixed(3)}>${to[0].toFixed(3)},${to[1].toFixed(3)}`
      const hit = cache.get(id)
      if (hit) return hit
      const cells = search(from, to)
      // Nowhere to go round (a spot boxed in by furniture): walk straight rather than not at all.
      const path = cells ? straighten(from, [...cells.slice(0, -1), to]) : [to]
      cache.set(id, path)
      return path
    },
  }
}
