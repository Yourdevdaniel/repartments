import { describe, expect, it } from 'vitest'
import { demoFlats } from './demo'
import { footprintOf, navigator, obstaclesOf } from './nav'
import { sample } from './story'
import type { FlatData } from './types'

/** Every resident, every fifth of a second: never standing inside a piece of furniture or a wall. */
function expectNoCollisions(flat: FlatData) {
  const obstacles = obstaclesOf(flat.layout)
  const people = [...flat.cast, ...flat.visitors]
  for (const person of people) {
    const story = flat.stories[person.story]
    if (!story?.tracks[person.id]) continue
    for (let t = 0; t < story.duration; t += 0.2) {
      const p = sample(story, person.id, t)
      for (const r of obstacles) {
        // A hair of tolerance: brushing past an edge is fine, being inside isn't.
        const hit = p.x > r.x0 + 0.03 && p.x < r.x1 - 0.03 && p.z > r.z0 + 0.03 && p.z < r.z1 - 0.03
        if (hit) throw new Error(`${flat.id}: ${person.id} inside ${JSON.stringify(r)} at t=${t.toFixed(1)} (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`)
      }
    }
  }
}

describe('footprintOf', () => {
  it('turns a model the way three.js does and skips rugs and things on tables', () => {
    // A desk turned sideways in the office: about 0.39 wide and 0.73 deep.
    const desk = footprintOf({ model: 'desk', at: [1.5, 0, -0.95], rotY: -Math.PI / 2 })!
    expect(desk.x1 - desk.x0).toBeCloseTo(0.392, 2)
    expect(desk.z1 - desk.z0).toBeCloseTo(0.734, 2)
    expect(footprintOf({ model: 'rugRound', at: [0, 0.004, 0] })).toBeNull()
    expect(footprintOf({ model: 'books', at: [1, 0.38, 0] })).toBeNull()
  })
})

describe('navigator', () => {
  it('goes round a table in the way and keeps straight lines when nothing is', () => {
    const flat = demoFlats[0]
    const nav = navigator(flat.layout)
    const living = flat.layout.rooms.find((r) => r.id === 'living')!
    // Across the living room along the lane, where the coffee table stands.
    const from: [number, number] = [living.x0 + 1.2, 0.55]
    const to: [number, number] = [living.x0 + 2.6, 0.55]
    const path = nav.route(from, to)
    expect(path.at(-1)).toEqual(to)
    expect(path.length).toBeGreaterThan(1)
    expect(nav.route([living.x0 + 1.2, 1.1], [living.x0 + 1.4, 1.1])).toEqual([[living.x0 + 1.4, 1.1]])
  })
})

describe('residents walk around furniture', () => {
  it('in every flat of the demo building', () => {
    for (const flat of demoFlats) expectNoCollisions(flat)
  })
})
