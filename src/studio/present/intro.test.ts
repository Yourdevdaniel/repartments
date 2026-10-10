import { describe, expect, it } from 'vitest'
import { buildModel } from '../../architecture'
import { crmFixture } from '../../architecture/fixtures'
import { buildTour } from '../../scene/tour'
import { introFlow, scriptFlows } from './intro'

const model = buildModel({ ...crmFixture, generatedAt: '2026-10-07T00:00:00Z' })

describe('introFlow', () => {
  it('walks from the screens down to the data, each part saying what it does', () => {
    const flow = introFlow(model)!
    expect(flow.id).toBe('intro')
    expect(flow.title.pt).toBe('Conheça o sistema')
    const parts = flow.actors.slice(1)
    expect(parts.length).toBeLessThanOrEqual(6)
    expect(parts[0].kind).toBe('screen')
    expect(parts.at(-1)!.kind).toBe('database')
    // Every part introduces itself with its own summary.
    for (const [i, a] of parts.entries()) expect(flow.steps[i + 1].text.pt).toBe(`${a.name.pt}: ${model.components.find((c) => c.id === a.component)!.summary.pt}`)
    expect(flow.steps[0].text.pt).toBe(`Bem-vindo ao crm: vamos conhecer as ${parts.length} partes principais que fazem ele funcionar`)
  })

  it('plays like any other scene', () => {
    const flat = buildTour(introFlow(model)!, 'pt')
    expect(flat.stories.main.captions).toHaveLength(introFlow(model)!.steps.length)
  })

  it('comes first, before the scenes the analysis wrote', () => {
    expect(scriptFlows(model).map((f) => f.id)).toEqual(['intro', ...model.flows.map((f) => f.id)])
    expect(introFlow({ ...model, components: [] })).toBeNull()
  })
})
