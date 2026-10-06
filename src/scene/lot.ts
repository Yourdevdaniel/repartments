import { TOWER } from './Tower'

/**
 * Owners with more repos than one building holds get a street of them: the first building has up to
 * 12 floors, each next one 6. Every building sits in its own little neighbourhood, picked from the
 * owner's name and the building's number, so walking down the street feels like moving somewhere new
 * and coming back finds everything where it was.
 */

/** Floors in every building after the first. */
export const NEXT_FLOORS = 6

/** A building next door: scenery only, nobody to visit. */
export type Neighbor = {
  /** Centre along the street. */
  x: number
  width: number
  depth: number
  floors: number
  color: string
  trim: string
  /** Awning colour when the ground floor is a shop. */
  shop: string | null
}

export type Neighborhood = {
  /** Where this building starts in the façade palette, so each one on the street has its own colours. */
  palette: number
  /** The letter after the owner's name on the lobby sign; none for the first building. */
  block: string | null
  awning: string
  /** Which arrangement of trees, benches and the like lines the pavement. */
  street: 0 | 1 | 2
  neighbors: Neighbor[]
  /** Flips the painted city behind, so the skyline changes too. */
  mirror: boolean
}

/** Floor height of the buildings next door, and the gap kept clear around the tower for its trees. */
export const NEIGHBOR_FLOOR = 0.9
const CLEAR = TOWER.width / 2 + 3.2

const BODIES = ['#d9d2e9', '#cfdde3', '#e8d8c4', '#d6e2cf', '#ead1d1', '#d3d7ea', '#e4dfcc']
const TRIMS = ['#f4f1ea', '#e9e4da', '#fbf7ef']
const AWNINGS = ['#e2554f', '#3f9c8f', '#f2a65a', '#5b8def', '#9b6fd0']

/** Small, fast and good enough to scatter scenery: the same seed always gives the same street. */
function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(text: string) {
  let h = 2166136261
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

export function neighborhood(owner: string, lot: number): Neighborhood {
  const r = random(hash(`${owner.toLowerCase()}#${lot}`))
  const pick = <T>(list: T[]) => list[Math.floor(r() * list.length)]
  const neighbors: Neighbor[] = []
  for (const side of [-1, 1]) {
    let edge = CLEAR
    const count = 1 + Math.floor(r() * 2)
    for (let i = 0; i < count; i++) {
      const width = 2 + r() * 1.6
      neighbors.push({
        x: side * (edge + width / 2),
        width,
        depth: 1.8 + r() * 0.5,
        floors: 2 + Math.floor(r() * 4),
        color: pick(BODIES),
        trim: pick(TRIMS),
        shop: r() < 0.5 ? pick(AWNINGS) : null,
      })
      edge += width + 0.3 + r() * 0.5
    }
  }
  return {
    palette: lot === 0 ? 0 : 2 + Math.floor(r() * 5),
    block: lot === 0 ? null : String.fromCharCode(65 + (lot % 26)),
    awning: lot === 0 ? '#3f9c8f' : pick(AWNINGS),
    street: lot === 0 ? 0 : ((lot % 3) as 0 | 1 | 2),
    neighbors,
    mirror: lot % 2 === 1,
  }
}

/** How many buildings the owner's street has, given how many repos the first one took. */
export function lotCount(total: number, first: number) {
  return 1 + Math.ceil(Math.max(0, total - first) / NEXT_FLOORS)
}
