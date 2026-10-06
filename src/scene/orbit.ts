/**
 * What the visitor has done to the building shot, on top of the framing the camera picks by itself:
 * turned round the tower (`az`, radians), zoomed in (`zoom`, 1 = whole tower) and slid the view
 * sideways (`s`) or up and down (`y`), in world units.
 */
export type Orbit = { az: number; zoom: number; s: number; y: number }

export const HOME: Orbit = { az: 0, zoom: 1, s: 0, y: 0 }

/**
 * Far enough to see down either side wall, never round to the blank back. Any further and the end
 * of the lawn behind the tower tilts into a slope against the painted city.
 */
export const MAX_TURN = 0.9
export const MIN_ZOOM = 0.8
export const MAX_ZOOM = 5

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Keeps the shot on the tower. `baseAz` is the angle the camera already sits at; `fitW`/`fitH` is
 * the area the unzoomed shot frames. Sliding is allowed about as far as zooming in pushed the edges
 * out, so at zoom 1 or below the tower stays centred. A quarter more than that lets the lobby and
 * the street come up from under the buttons at the bottom of the screen.
 */
export function clampOrbit(o: Orbit, baseAz: number, fitW: number, fitH: number): Orbit {
  const zoom = clamp(o.zoom, MIN_ZOOM, MAX_ZOOM)
  const room = Math.max(0, 1 - 1 / zoom) * 1.25
  return {
    az: clamp(o.az, -MAX_TURN - baseAz, MAX_TURN - baseAz),
    zoom,
    s: clamp(o.s, (-fitW / 2) * room, (fitW / 2) * room),
    y: clamp(o.y, (-fitH / 2) * room, (fitH / 2) * room),
  }
}

/**
 * Zooms by `factor`, keeping whatever is under the pointer where it is. `sx`/`sy` are the pointer's
 * pixels from the centre of the shot (y up); `scale` is pixels per world unit at zoom 1.
 */
export function zoomAt(o: Orbit, factor: number, sx: number, sy: number, scale: number): Orbit {
  const zoom = clamp(o.zoom * factor, MIN_ZOOM, MAX_ZOOM)
  const shift = 1 / (scale * o.zoom) - 1 / (scale * zoom)
  return { ...o, zoom, s: o.s + sx * shift, y: o.y + sy * shift }
}

export function isHome(o: Orbit): boolean {
  return Math.abs(o.az) < 0.01 && Math.abs(o.zoom - 1) < 0.01 && Math.abs(o.s) < 0.01 && Math.abs(o.y) < 0.01
}
