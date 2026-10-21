import { LAYERS, type ArchitectureModel } from '../../shared/studio'
import type { BandKey } from './labels'

/** Size of a component card, in SVG units (the map scales as a whole). */
export const CARD_W = 184
export const CARD_H = 66
/** Outside services are slimmer pills. */
export const EXTERNAL_H = 44
/** Most cards in one row of a band; longer bands wrap. */
export const ROW_MAX = 5

const ITEM_GAP = 24
const ROW_GAP = 22
const BAND_GAP = 14
const BAND_PAD_Y = 22
const PAD_X = 24
/** Width of the column that holds each band's name. */
export const LABEL_W = 176

export const EXTERNAL_PREFIX = 'ext:'

/** The key an outside service has in the layout, so it never clashes with a component id. */
export function externalKey(id: string): string {
  return `${EXTERNAL_PREFIX}${id}`
}

/** A rectangle with its top-left corner at (x, y). */
export type Box = { x: number; y: number; w: number; h: number }

/** A horizontal band of the map, from `top` down `height`. Every band is as wide as the map. */
export type BandBox = { key: BandKey; top: number; height: number }

/** An arrow between two boxes. `from`/`to` are component ids or `ext:<id>` keys. */
export type MapEdge = {
  from: string
  to: string
  kind: 'dependency' | 'usage'
  weight: number
  /** Stroke width in SVG units, 1 to 4, scaled by the heaviest edge. */
  width: number
  /** SVG path data for the curve, ending at the target's edge (where the arrowhead goes). */
  d: string
}

export type MapLayout = {
  width: number
  height: number
  bands: BandBox[]
  boxes: Record<string, Box>
  edges: MapEdge[]
}

function rowWidth(n: number): number {
  return n * CARD_W + (n - 1) * ITEM_GAP
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

/** Keeps a number to one decimal place, so the SVG output stays short and tidy. */
function fmt(n: number): string {
  return String(Math.round(n * 10) / 10)
}

/**
 * Reorders the items of each group to cut edge crossings: each item moves to the average position
 * of its neighbours in the group next to it. Four sweeps (down, up, down, up) are enough for maps of
 * this size. Items with no neighbour there keep their place. Stable, so the same input always gives
 * the same output.
 */
export function orderGroups(groups: string[][], neighbours: Map<string, string[]>): string[][] {
  const cur = groups.map((g) => [...g])
  const n = cur.length
  for (let sweep = 0; sweep < 4; sweep++) {
    const down = sweep % 2 === 0
    const order: number[] = []
    if (down) for (let i = 1; i < n; i++) order.push(i)
    else for (let i = n - 2; i >= 0; i--) order.push(i)
    for (const i of order) {
      const ref = cur[down ? i - 1 : i + 1]
      const pos = new Map(ref.map((id, k) => [id, k]))
      const key = new Map<string, number>()
      cur[i].forEach((id, k) => {
        const ps = (neighbours.get(id) ?? []).map((other) => pos.get(other)).filter((p): p is number => p !== undefined)
        key.set(id, ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : k)
      })
      cur[i] = [...cur[i]].sort((a, b) => (key.get(a) ?? 0) - (key.get(b) ?? 0))
    }
  }
  return cur
}

/**
 * The SVG path of an arrow from box `a` to box `b`: a smooth S-curve leaving `a` from its bottom or
 * top and entering `b` from the side facing it. Boxes on the same row are joined with a small arc
 * under them, so the line never runs across the cards in between.
 */
export function edgePath(a: Box, b: Box): string {
  const acx = a.x + a.w / 2
  const bcx = b.x + b.w / 2
  let s: [number, number]
  let t: [number, number]
  let c1: [number, number]
  let c2: [number, number]
  if (b.y >= a.y + a.h) {
    s = [acx, a.y + a.h]
    t = [bcx, b.y]
    const k = (t[1] - s[1]) / 2
    c1 = [s[0], s[1] + k]
    c2 = [t[0], t[1] - k]
  } else if (b.y + b.h <= a.y) {
    s = [acx, a.y]
    t = [bcx, b.y + b.h]
    const k = (s[1] - t[1]) / 2
    c1 = [s[0], s[1] - k]
    c2 = [t[0], t[1] + k]
  } else {
    s = [acx, a.y + a.h]
    t = [bcx, b.y + b.h]
    c1 = [s[0], s[1] + 28]
    c2 = [t[0], t[1] + 28]
  }
  return `M${fmt(s[0])} ${fmt(s[1])} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(t[0])} ${fmt(t[1])}`
}

/** Stroke width for an edge: 1 px for the lightest, up to 4 px for the heaviest. */
export function strokeWidth(weight: number, max: number): number {
  if (max <= 0) return 1
  return 1 + 3 * Math.sqrt(Math.min(weight, max) / max)
}

/** The keys of `key` and of everything joined to it by an edge: what lights up on hover. */
export function neighboursOf(key: string, edges: { from: string; to: string }[]): Set<string> {
  const near = new Set<string>([key])
  for (const e of edges) {
    if (e.from === key) near.add(e.to)
    if (e.to === key) near.add(e.from)
  }
  return near
}

/**
 * Places the architecture on a map: one band per layer (in `LAYERS` order, skipping empty ones and
 * the tests unless asked), the outside services at the bottom, cards ordered to reduce crossings,
 * and the edges as curves. Pure, so the map's geometry can be tested without a browser.
 */
export function layoutMap(model: ArchitectureModel, opts: { showTests: boolean }): MapLayout {
  const comps = model.components.filter((c) => opts.showTests || c.layer !== 'tests')
  const visible = new Set(comps.map((c) => c.id))
  const byName = (a: { name: string; id: string }, b: { name: string; id: string }) =>
    a.name.localeCompare(b.name, 'pt') || a.id.localeCompare(b.id)

  const groups: { key: BandKey; ids: string[] }[] = []
  for (const layer of LAYERS) {
    const members = comps.filter((c) => c.layer === layer).sort(byName)
    if (members.length) groups.push({ key: layer, ids: members.map((c) => c.id) })
  }
  if (model.externals.length) {
    const ext = [...model.externals].sort((a, b) => a.name.localeCompare(b.name, 'pt') || a.id.localeCompare(b.id))
    groups.push({ key: 'external', ids: ext.map((x) => externalKey(x.id)) })
  }

  const neighbours = new Map<string, string[]>()
  const join = (a: string, b: string) => {
    neighbours.set(a, [...(neighbours.get(a) ?? []), b])
    neighbours.set(b, [...(neighbours.get(b) ?? []), a])
  }
  for (const d of model.dependencies) {
    if (d.from !== d.to && visible.has(d.from) && visible.has(d.to)) join(d.from, d.to)
  }
  for (const x of model.externals) {
    for (const u of x.usedBy) if (visible.has(u)) join(u, externalKey(x.id))
  }

  const ordered = orderGroups(
    groups.map((g) => g.ids),
    neighbours,
  )

  const maxCount = Math.max(1, ...ordered.map((g) => g.length))
  const contentW = rowWidth(Math.min(maxCount, ROW_MAX))
  const width = LABEL_W + PAD_X * 2 + contentW

  const bands: BandBox[] = []
  const boxes: Record<string, Box> = {}
  let top = 0
  ordered.forEach((ids, gi) => {
    const isExternal = groups[gi].key === 'external'
    const h = isExternal ? EXTERNAL_H : CARD_H
    const rows = chunk(ids, ROW_MAX)
    const height = BAND_PAD_Y * 2 + rows.length * h + (rows.length - 1) * ROW_GAP
    bands.push({ key: groups[gi].key, top, height })
    rows.forEach((row, ri) => {
      let x = LABEL_W + PAD_X + (contentW - rowWidth(row.length)) / 2
      const y = top + BAND_PAD_Y + ri * (h + ROW_GAP)
      for (const id of row) {
        boxes[id] = { x, y, w: CARD_W, h }
        x += CARD_W + ITEM_GAP
      }
    })
    top += height + BAND_GAP
  })
  const height = bands.length ? top - BAND_GAP : 0

  const raw: { from: string; to: string; kind: MapEdge['kind']; weight: number }[] = []
  for (const d of model.dependencies) {
    if (d.from !== d.to && boxes[d.from] && boxes[d.to]) raw.push({ from: d.from, to: d.to, kind: 'dependency', weight: d.weight })
  }
  for (const x of model.externals) {
    for (const u of x.usedBy) {
      if (boxes[u]) raw.push({ from: u, to: externalKey(x.id), kind: 'usage', weight: 1 })
    }
  }
  const max = Math.max(0, ...raw.map((e) => e.weight))
  const edges: MapEdge[] = raw.map((e) => ({
    ...e,
    width: strokeWidth(e.weight, max),
    d: edgePath(boxes[e.from], boxes[e.to]),
  }))

  return { width, height, bands, boxes, edges }
}
