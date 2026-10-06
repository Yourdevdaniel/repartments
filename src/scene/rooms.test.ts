import { describe, expect, it } from 'vitest'
import { buildFlat, planRooms, type FlatSpec } from './rooms'
import { sample } from './story'

const spec = (residents: FlatSpec['residents']): FlatSpec => ({
  id: 'x',
  repo: 'x',
  language: { name: 'Python', color: '#3572a5' },
  intro: { en: '', pt: '' },
  residents,
})

const webApp = spec([
  { tech: 'React', role: 'frontend', color: '#61dafb' },
  { tech: 'SimpleJWT', role: 'security', color: '#7c5cff' },
  { tech: 'Django', role: 'backend', color: '#0c4b33' },
  { tech: 'pytest', role: 'tests', color: '#0a9edc' },
  { tech: 'PostgreSQL', role: 'database', color: '#4169e1' },
  { tech: 'Redis', role: 'cache', color: '#dc382d' },
  { tech: 'Celery', role: 'worker', color: '#37814a' },
  { tech: 'Docker', role: 'devops', color: '#2f8fe6' },
])

describe('planRooms', () => {
  it('lines rooms up from the front end to the workshop', () => {
    expect(planRooms(['devops', 'backend', 'frontend']).map((t) => t.kind)).toEqual(['living', 'office', 'workshop'])
  })

  it('gives a one-language project a studio, a kitchen and a bedroom', () => {
    expect(planRooms(['coder']).map((t) => t.kind)).toEqual(['studio', 'kitchen', 'bedroom'])
  })
})

describe('buildFlat', () => {
  it('casts one resident per role, each driven by a story that exists', () => {
    const flat = buildFlat(webApp)
    expect(flat.cast).toHaveLength(8)
    for (const c of flat.cast) expect(flat.stories[c.story]?.tracks[c.id]).toBeDefined()
  })

  it('puts the request loop in the main story and narrates it', () => {
    const flat = buildFlat(webApp)
    expect(flat.narrator).toBe('main')
    const captions = flat.stories.main.captions.map((c) => c.caption.en)
    expect(captions[0]).toBe('React asks the API for some data')
    expect(captions).toContain('SimpleJWT checks the login token')
    expect(captions).toContain('Django checks the Redis cache first')
    expect(captions).toContain('pytest checks the answer before it leaves')
    expect(captions.at(-1)).toBe('…and the page shows up on screen')
  })

  it('keeps every resident inside the flat for the whole loop', () => {
    const flat = buildFlat(webApp)
    for (const c of flat.cast) {
      const story = flat.stories[c.story]
      for (let t = 0; t < story.duration; t += 0.25) {
        const p = sample(story, c.id, t)
        expect(p.x).toBeGreaterThan(0)
        expect(p.x).toBeLessThan(flat.layout.width)
        expect(Math.abs(p.z)).toBeLessThan(flat.layout.depth / 2)
      }
    }
  })

  it('serves an API with no front end by sending the answer out', () => {
    const flat = buildFlat(spec([{ tech: 'FastAPI', role: 'backend', color: '#009688' }]))
    expect(flat.stories.main.captions.map((c) => c.caption.en)).toContain('FastAPI sends the answer out')
  })

  it('furnishes an empty flat that nobody lives in', () => {
    const flat = buildFlat(spec([]))
    expect(flat.cast).toEqual([])
    expect(flat.layout.rooms.map((r) => r.id)).toEqual(['studio', 'kitchen', 'bedroom'])
    // The scene always reads the narrator's story, even when nothing happens in it.
    expect(flat.stories[flat.narrator]).toBeDefined()
  })

  it('gives a game its own routine in the studio, on top of a web front end', () => {
    const flat = buildFlat(
      spec([
        { tech: 'React', role: 'frontend', color: '#61dafb' },
        { tech: 'Phaser', role: 'game', color: '#8a3ffc' },
      ]),
    )
    expect(flat.layout.rooms.map((r) => r.id)).toContain('studio')
    expect(flat.stories.game.captions[0].caption.en).toBe('Phaser runs the game')
    for (const c of flat.cast) expect(flat.stories[c.story]?.tracks[c.id]).toBeDefined()
  })

  it('lets a lone coder live a routine of their own', () => {
    const flat = buildFlat(spec([{ tech: 'Python', role: 'coder', color: '#3572a5' }]))
    expect(flat.narrator).toBe('coder')
    expect(flat.stories.coder.captions[0].caption.en).toBe('Python writes the code')
  })

  it('turns red checks into an argument and a fix', () => {
    const flat = buildFlat({ ...webApp, status: { ci: 'failing' } })
    const captions = flat.stories.main.captions.map((c) => c.caption.en)
    expect(captions).toContain('The tests fail')
    expect(captions).toContain('Django fixes it')
  })

  it('brings in a visitor with a pull request, and argues over a conflict', () => {
    const clean = buildFlat({ ...webApp, status: { prs: { open: 1 } } })
    expect(clean.visitors).toHaveLength(1)
    expect(clean.stories.main.captions.map((c) => c.caption.en)).toContain('Approved and merged')
    const messy = buildFlat({ ...webApp, status: { prs: { open: 2, conflict: true } } })
    expect(messy.stories.main.captions.map((c) => c.caption.en)).toContain('Merge conflict! They disagree')
  })

  it('has idle residents take a break with their hobby', () => {
    const flat = buildFlat(webApp)
    expect(flat.stories.main.tracks.database.some((s) => s.anim === 'sit')).toBe(true)
  })

  it('lets a lone coder review a pull request too', () => {
    const flat = buildFlat({ ...spec([{ tech: 'Python', role: 'coder', color: '#3572a5' }]), status: { prs: { open: 1 } } })
    expect(flat.visitors).toHaveLength(1)
    expect(flat.stories.coder.captions.map((c) => c.caption.en)).toContain('A pull request arrives for Python')
  })

  it('flags Docker when the devops resident lives there', () => {
    expect(buildFlat(webApp).docker).toBe(true)
  })
})
