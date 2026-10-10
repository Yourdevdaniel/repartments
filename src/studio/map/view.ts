/** Where the map's content sits in its window: a uniform scale and an offset, in window pixels. */
export type View = { scale: number; x: number; y: number }

export const MIN_SCALE = 0.4
export const MAX_SCALE = 2.5

/** Keeps a zoom level inside the range a person can comfortably read at. */
export function clampScale(s: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s))
}

/**
 * The view that shows the whole content centred in a window of `cw` by `ch` pixels, with a little
 * air around it. Falls back to 1 when the window hasn't been measured yet.
 */
export function fitView(cw: number, ch: number, w: number, h: number, pad = 16): View {
  const raw = Math.min((cw - pad * 2) / w, (ch - pad * 2) / h)
  const scale = clampScale(Number.isFinite(raw) && raw > 0 ? raw : 1)
  return { scale, x: (cw - w * scale) / 2, y: (ch - h * scale) / 2 }
}

/** Zooms by `factor` keeping the point (px, py) of the window still under the pointer. */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const scale = clampScale(v.scale * factor)
  const f = scale / v.scale
  return { scale, x: px - (px - v.x) * f, y: py - (py - v.y) * f }
}

/** Moves the content by (dx, dy) window pixels. */
export function panBy(v: View, dx: number, dy: number): View {
  return { ...v, x: v.x + dx, y: v.y + dy }
}
