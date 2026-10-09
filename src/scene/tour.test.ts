import { describe, expect, it } from 'vitest'
import type { Actor, Flow, FlowStep } from '../shared/studio'
import { flagAt, propAt, sample } from './story'
import { actorKey, applyEdits, buildTour, NO_EDITS } from './tour'

const t = (en: string, pt = en) => ({ en, pt })
const actor = (id: string, kind: Actor['kind'], name: string, component: string | null = null): Actor => ({
  id,
  kind,
  name: t(name),
  component,
  external: null,
  note: t(''),
})
const step = (from: string, to: string, action: FlowStep['action'], text: string): FlowStep => ({ from, to, action, text: t(text, `${text} (pt)`), say: t('hi') })

/** A request through a CRM: the screen asks the API, the API asks the service, the service asks the database, and back. */
const request: Flow = {
  id: 'request:POST /api/leads',
  kind: 'request',
  title: t('Create leads', 'Criar leads'),
  summary: t('How a new lead is saved.'),
  actors: [
    actor('person', 'person', 'User'),
    actor('screen', 'screen', 'Leads Screen', 'web/leads'),
    actor('api', 'api', 'Leads API', 'api/leads'),
    actor('service', 'service', 'Lead Service', 'services'),
    actor('db', 'database', 'PostgreSQL'),
  ],
  steps: [
    step('person', 'screen', 'ask', 'The user fills in the form'),
    step('screen', 'api', 'ask', 'The screen sends the lead'),
    step('api', 'service', 'call', 'The API hands it to the service'),
    step('service', 'db', 'save', 'The service saves it'),
    step('db', 'service', 'reply', 'Saved'),
    step('service', 'api', 'reply', 'Done'),
    step('api', 'screen', 'reply', 'The answer comes back'),
    step('screen', 'screen', 'show', 'It shows on screen'),
  ],
}

/** An agent deciding: thinks, asks the model, picks a tool, uses it, answers. */
const agent: Flow = {
  id: 'agent:sales',
  kind: 'agent',
  title: t('How the sales agent decides'),
  summary: t('The agent picks a tool.'),
  actors: [
    actor('person', 'person', 'User'),
    actor('agent', 'agent', 'Sales Agent', 'ai'),
    actor('llm', 'llm', 'AI model'),
    actor('tool1', 'tool', 'find_customer'),
    actor('tool2', 'tool', 'send_email'),
  ],
  steps: [
    step('person', 'agent', 'ask', 'A message arrives'),
    step('agent', 'agent', 'think', 'The agent reads its instructions'),
    step('agent', 'llm', 'ask', 'It asks the model what to do'),
    step('llm', 'agent', 'reply', 'The model suggests a tool'),
    step('agent', 'agent', 'decide', 'It picks find_customer'),
    step('agent', 'tool1', 'use-tool', 'It uses find_customer'),
    step('tool1', 'agent', 'reply', 'The tool answers'),
    step('agent', 'person', 'reply', 'The agent answers the user'),
  ],
}

describe('buildTour', () => {
  it('gives every participant a room, in the order they appear, with the person at the door', () => {
    const flat = buildTour(request, 'pt')
    expect(flat.layout.rooms.map((r) => r.id)).toEqual(['person', 'screen', 'api', 'service', 'db'])
    expect(flat.layout.rooms[0].label?.pt).toBe('Entrada')
    expect(flat.layout.rooms[2].label?.pt).toBe('Leads API')
    expect(flat.repo).toBe('Criar leads')
    expect(flat.cast.map((c) => c.tech)).toEqual(['User', 'Leads Screen', 'Leads API', 'Lead Service', 'PostgreSQL'])
    expect(new Set(flat.cast.map((c) => c.model)).size).toBe(flat.cast.length)
  })

  it('narrates every step in order, in both languages', () => {
    const flat = buildTour(request, 'en')
    const captions = flat.stories.main.captions.map((c) => c.caption)
    expect(captions.map((c) => c.en)).toEqual(request.steps.map((s) => s.text.en))
    expect(captions[0].pt).toBe('The user fills in the form (pt)')
  })

  it('keeps everyone inside the flat and brings them all home by the end of the loop', () => {
    for (const flow of [request, agent]) {
      const flat = buildTour(flow, 'en')
      const story = flat.stories.main
      for (const c of flat.cast) {
        for (let time = 0; time < story.duration; time += 0.2) {
          const p = sample(story, c.id, time)
          expect(p.x).toBeGreaterThan(0)
          expect(p.x).toBeLessThan(flat.layout.width)
          expect(Math.abs(p.z)).toBeLessThan(flat.layout.depth / 2)
        }
        const first = sample(story, c.id, 0)
        const last = sample(story, c.id, story.duration - 1e-3)
        expect(last.x).toBeCloseTo(first.x, 5)
        expect(last.z).toBeCloseTo(first.z, 5)
      }
    }
  })

  it('hands the parcel along: the database ends up giving the answer back to the service', () => {
    const flat = buildTour(request, 'en')
    const story = flat.stories.main
    const reply = story.captions.find((c) => c.caption.en === 'Saved')!
    // A moment after the "Saved" caption the box is with the service.
    expect(propAt(story, 'box', reply.t1 + 0.5)).toBe('service')
  })

  it('turns the TV on when the answer shows on screen', () => {
    const flat = buildTour(request, 'en')
    const story = flat.stories.main
    const show = story.captions.find((c) => c.caption.en === 'It shows on screen')!
    expect(flagAt(story, 'tv', show.t0 + 0.1)).toBe(true)
    expect(flagAt(story, 'tv', 0.1)).toBe(false)
    expect(flat.layout.tv).toBeDefined()
  })

  it('skips steps that name someone missing from the scene', () => {
    const broken: Flow = { ...agent, steps: [...agent.steps, step('agent', 'ghost', 'call', 'Nobody')] }
    const flat = buildTour(broken, 'en')
    expect(flat.stories.main.captions.map((c) => c.caption.en)).not.toContain('Nobody')
  })
})

describe('applyEdits', () => {
  it('renames a participant everywhere it appears and rewrites captions and titles', () => {
    const api = request.actors.find((a) => a.id === 'api')!
    const [edited] = applyEdits([request], {
      ...NO_EDITS,
      actors: { [actorKey(api)]: { pt: 'Recepção' } },
      steps: { [`${request.id}#0`]: { pt: 'O cliente preenche a ficha' } },
      titles: { [request.id]: { pt: 'Cadastrar cliente' } },
    })
    expect(edited.actors.find((a) => a.id === 'api')!.name).toEqual({ en: 'Leads API', pt: 'Recepção' })
    expect(edited.steps[0].text.pt).toBe('O cliente preenche a ficha')
    expect(edited.steps[0].text.en).toBe('The user fills in the form')
    expect(edited.title.pt).toBe('Cadastrar cliente')
  })

  it('carries a rename into the captions, whole words only, unless the caption was rewritten', () => {
    const api = request.actors.find((a) => a.id === 'api')!
    const flow: Flow = {
      ...request,
      steps: [step('screen', 'api', 'ask', 'The screen asks Leads API'), step('api', 'service', 'call', 'Leads APIs are many')],
    }
    const [edited] = applyEdits([flow], { ...NO_EDITS, actors: { [actorKey(api)]: { en: 'Front desk' } } })
    expect(edited.steps[0].text.en).toBe('The screen asks Front desk')
    expect(edited.steps[1].text.en).toBe('Leads APIs are many')
    const [kept] = applyEdits([flow], { ...NO_EDITS, actors: { [actorKey(api)]: { en: 'Front desk' } }, steps: { [`${flow.id}#0`]: { en: 'My own words' } } })
    expect(kept.steps[0].text.en).toBe('My own words')
  })

  it('ignores blank edits', () => {
    const [edited] = applyEdits([request], { ...NO_EDITS, titles: { [request.id]: { pt: '   ' } } })
    expect(edited.title.pt).toBe('Criar leads')
  })
})
