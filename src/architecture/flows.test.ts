import { describe, expect, it } from 'vitest'
import type { Agent, Component, Dependency, Endpoint, External, Flow, Layer } from '../shared/studio'
import { buildFlows, MAX_ACTORS, MAX_FLOWS, MAX_STEPS } from './flows'

const component = (id: string, layer: Layer, extra: Partial<Component> = {}): Component => ({
  id,
  name: id.split('/').pop() ?? id,
  path: id,
  direct: false,
  layer,
  files: 1,
  lines: 10,
  tech: [],
  entry: false,
  summary: { en: `${id} does things.`, pt: `${id} faz coisas.` },
  ...extra,
})

const endpoint = (method: string, path: string, component: string, file = `${component}/routes.ts`): Endpoint => ({ method, path, file, line: 3, component })

const dep = (from: string, to: string, weight = 1): Dependency => ({ from, to, weight })

const ext = (id: string, name: string, kind: External['kind'], usedBy: string[]): External => ({ id, name, kind, usedBy })

/** Every step must point at actors of its own flow, and each text must be filled in both languages. */
function expectWellFormed(flow: Flow) {
  const ids = new Set(flow.actors.map((a) => a.id))
  expect(flow.actors.length).toBeLessThanOrEqual(MAX_ACTORS)
  expect(flow.steps.length).toBeLessThanOrEqual(MAX_STEPS)
  for (const s of flow.steps) {
    expect(ids.has(s.from)).toBe(true)
    expect(ids.has(s.to)).toBe(true)
    expect(s.text.en.length).toBeGreaterThan(0)
    expect(s.text.pt.length).toBeGreaterThan(0)
    expect(s.text.pt.length).toBeLessThanOrEqual(300)
    if (s.say) expect(s.say.pt.split(' ').length).toBeLessThanOrEqual(3)
  }
  expect(flow.title.pt.length).toBeGreaterThan(0)
  expect(flow.summary.en.length).toBeGreaterThan(0)
}

describe('buildFlows: request scenes', () => {
  const components = [
    component('frontend/pages', 'interface', { name: 'Frontend Pages' }),
    component('backend/routes', 'api', { name: 'Backend Routes' }),
    component('backend/middleware', 'security', { name: 'Backend Middleware' }),
    component('backend/services', 'logic', { name: 'Backend Services' }),
    component('backend/db', 'data', { name: 'Backend Db' }),
  ]
  const dependencies = [
    dep('frontend/pages', 'backend/routes', 2),
    dep('backend/routes', 'backend/middleware'),
    dep('backend/routes', 'backend/services'),
    dep('backend/services', 'backend/db'),
  ]
  const externals = [ext('ext:postgresql', 'PostgreSQL', 'database', ['backend/db']), ext('ext:resend', 'Resend', 'email', ['backend/services'])]
  const fileDeps = new Map([['backend/routes/leads.ts', ['backend/middleware', 'backend/services']]])

  it('tells a POST as a creation, with the screen, the check, the service, the database and the e-mail', () => {
    const [flow] = buildFlows({ components, dependencies, externals, endpoints: [endpoint('POST', '/api/leads', 'backend/routes')], agents: [], fileDeps })
    expect(flow.id).toBe('request:POST /api/leads')
    expect(flow.kind).toBe('request')
    expect(flow.title).toEqual({ pt: 'Criar leads', en: 'Create leads' })
    expect(flow.actors.map((a) => a.id)).toEqual(['person', 'c:frontend/pages', 'c:backend/routes', 'c:backend/middleware', 'c:backend/services', 'e:ext:postgresql', 'e:ext:resend'])
    // The e-mail goes out before the answer goes back.
    expect(flow.steps.map((s) => s.action)).toEqual(['ask', 'ask', 'check', 'reply', 'call', 'save', 'reply', 'send', 'reply', 'reply', 'show'])
    expect(flow.steps[5].text.pt).toBe('Backend Services guarda as mudanças em PostgreSQL')
    expect(flow.steps[6].text.pt).toBe('PostgreSQL confirma que guardou')
    expect(flow.steps[0].text.pt).toBe('O usuário usa a tela Frontend Pages')
    expect(flow.steps[1].ref).toEqual({ file: 'backend/routes/routes.ts', line: 3 })
    expectWellFormed(flow)
  })

  it('reads a GET with an id as "ver" and fetches the data', () => {
    const [flow] = buildFlows({ components, dependencies, externals, endpoints: [endpoint('GET', '/api/leads/:id', 'backend/routes')], agents: [], fileDeps })
    expect(flow.title.pt).toBe('Ver leads')
    expect(flow.steps.map((s) => s.action)).toContain('fetch')
    expectWellFormed(flow)
  })

  it('shows a request without a screen as the person talking straight to the API', () => {
    const noScreen = components.filter((c) => c.layer !== 'interface')
    const [flow] = buildFlows({
      components: noScreen,
      dependencies: dependencies.filter((d) => d.from !== 'frontend/pages'),
      externals,
      endpoints: [endpoint('GET', '/api/leads', 'backend/routes')],
      agents: [],
    })
    expect(flow.steps[0].from).toBe('person')
    expect(flow.steps[0].to).toBe('c:backend/routes')
    expect(flow.steps[flow.steps.length - 1].to).toBe('person')
    expectWellFormed(flow)
  })

  it('picks POST before GET, and at most one scene per API part, three in all', () => {
    const many = ['a', 'b', 'c', 'd'].map((x) => component(`api/${x}`, 'api'))
    const endpoints = [
      endpoint('GET', '/a', 'api/a'),
      endpoint('POST', '/a', 'api/a'),
      endpoint('POST', '/b', 'api/b'),
      endpoint('POST', '/c', 'api/c'),
      endpoint('POST', '/d', 'api/d'),
    ]
    const flows = buildFlows({ components: many, dependencies: [], externals: [], endpoints, agents: [] })
    expect(flows.map((f) => f.id)).toEqual(['request:POST /a', 'request:POST /b', 'request:POST /c'])
  })

  it('leaves out the queue and e-mail when the step count would otherwise be too high', () => {
    const [flow] = buildFlows({ components, dependencies, externals, endpoints: [endpoint('POST', '/api/leads', 'backend/routes')], agents: [], fileDeps })
    expect(flow.steps.length).toBeLessThanOrEqual(MAX_STEPS)
  })
})

describe('buildFlows: agent scenes', () => {
  const graph = {
    nodes: [
      { id: '__start__', label: 'Início', kind: 'start' as const },
      { id: 'agent', label: 'agent', kind: 'llm' as const, file: 'backend/ai/bot.py', line: 9 },
      { id: 'tools', label: 'tools', kind: 'tool' as const },
      { id: '__end__', label: 'Fim', kind: 'end' as const },
    ],
    links: [
      { from: '__start__', to: 'agent', condition: null },
      { from: 'agent', to: 'tools', condition: 'tools' },
      { from: 'agent', to: '__end__', condition: 'end' },
      { from: 'tools', to: 'agent', condition: null },
    ],
    explicit: true,
  }
  const agent: Agent = {
    id: 'backend/ai/bot.py',
    name: 'Bot',
    file: 'backend/ai/bot.py',
    component: 'backend/ai',
    provider: 'OpenAI',
    model: 'gpt-4o',
    framework: 'LangGraph',
    instructions: 'Você responde dúvidas. Seja breve e nunca invente preços.',
    tools: [{ name: 'lookup', description: 'Look up a price.', file: 'backend/ai/tools.py', line: 4 }],
    graph,
    loop: true,
  }
  const components = [component('backend/ai', 'ai', { name: 'Backend Ai' }), component('frontend/chat', 'interface', { name: 'Chat' })]
  const dependencies = [dep('frontend/chat', 'backend/ai')]

  it('draws the agent first, with its instructions, model, the branches of its graph and its tools', () => {
    const [flow] = buildFlows({ components, dependencies, externals: [ext('ext:openai', 'OpenAI', 'llm', ['backend/ai'])], endpoints: [], agents: [agent] })
    expect(flow.id).toBe('agent:backend/ai/bot.py')
    expect(flow.kind).toBe('agent')
    expect(flow.title).toEqual({ pt: 'Como o Bot decide', en: 'How Bot decides' })
    const decide = flow.steps.find((s) => s.action === 'decide')
    expect(decide?.text.pt).toBe('Bot escolhe o caminho: se tools, vai para tools; se end, vai para Fim')
    expect(flow.steps.find((s) => s.action === 'think')?.text.pt).toBe('Bot lê as instruções: “Você responde dúvidas.”')
    const llm = flow.actors.find((a) => a.kind === 'llm')
    expect(llm?.name.pt).toBe('Modelo de IA (gpt-4o)')
    expect(llm?.external).toBe('ext:openai')
    expect(flow.steps.some((s) => s.action === 'use-tool' && s.ref?.line === 4)).toBe(true)
    expectWellFormed(flow)
  })

  it('reads the caller as a screen and shows the answer there', () => {
    const [flow] = buildFlows({ components, dependencies, externals: [], endpoints: [], agents: [agent] })
    expect(flow.actors.map((a) => a.id)).toContain('c:frontend/chat')
    expect(flow.steps[flow.steps.length - 1].action).toBe('show')
    expectWellFormed(flow)
  })

  it('tells a plain tool choice when the agent has no explicit graph', () => {
    const plain: Agent = { ...agent, graph: { nodes: [], links: [], explicit: false }, loop: false, tools: [] }
    const [flow] = buildFlows({ components, dependencies, externals: [], endpoints: [], agents: [plain] })
    expect(flow.steps.some((s) => s.action === 'decide')).toBe(false)
    expect(flow.steps.some((s) => s.action === 'think')).toBe(true)
    expectWellFormed(flow)
  })

  it('keeps at most two agent scenes', () => {
    const more = [agent, { ...agent, id: 'b.py', file: 'b.py' }, { ...agent, id: 'c.py', file: 'c.py' }]
    const flows = buildFlows({ components, dependencies, externals: [], endpoints: [], agents: more })
    expect(flows.filter((f) => f.kind === 'agent')).toHaveLength(2)
  })
})

describe('buildFlows: background jobs', () => {
  it('draws a producer that leaves a task on a queue, and the worker that does it', () => {
    const components = [component('backend/services', 'logic', { name: 'Services' }), component('backend/jobs', 'jobs', { name: 'Jobs' }), component('backend/db', 'data', { name: 'Db' })]
    const dependencies = [dep('backend/services', 'backend/jobs'), dep('backend/jobs', 'backend/db')]
    const externals = [ext('ext:bullmq', 'BullMQ', 'queue', ['backend/jobs']), ext('ext:postgresql', 'PostgreSQL', 'database', ['backend/db'])]
    const flows = buildFlows({ components, dependencies, externals, endpoints: [], agents: [] })
    const job = flows.find((f) => f.kind === 'job') as Flow
    expect(job.title).toEqual({ pt: 'Tarefas em segundo plano', en: 'Background tasks' })
    expect(job.steps.map((s) => s.action)).toEqual(['queue', 'call', 'save', 'reply'])
    expect(job.steps[0].text.pt).toBe('Services deixa uma tarefa na fila BullMQ')
    expectWellFormed(job)
  })
})

describe('buildFlows: overview and limits', () => {
  it('falls back to an overview of the entry part when nothing else was found', () => {
    const components = [
      component('app', 'infra', { entry: true, name: 'App' }),
      component('lib/a', 'logic', { name: 'A' }),
      component('lib/b', 'logic', { name: 'B' }),
    ]
    const flows = buildFlows({ components, dependencies: [dep('app', 'lib/a', 3), dep('app', 'lib/b')], externals: [], endpoints: [], agents: [] })
    expect(flows.map((f) => f.kind)).toEqual(['overview'])
    expect(flows[0].steps.map((s) => s.text.en)).toEqual(['App hands the work to A', 'App hands the work to B'])
    expectWellFormed(flows[0])
  })

  it('draws nothing when there is no structure at all', () => {
    expect(buildFlows({ components: [], dependencies: [], externals: [], endpoints: [], agents: [] })).toEqual([])
  })

  it('never returns more than six scenes', () => {
    const apis = Array.from({ length: 8 }, (_, i) => component(`api/${i}`, 'api'))
    const agents: Agent[] = [0, 1].map((i) => ({
      id: `ag${i}`,
      name: `Ag${i}`,
      file: `ag${i}.py`,
      component: '',
      provider: 'OpenAI',
      model: null,
      framework: null,
      instructions: null,
      tools: [],
      graph: { nodes: [], links: [], explicit: false },
      loop: false,
    }))
    const endpoints = apis.map((c) => endpoint('POST', `/${c.id}`, c.id))
    const flows = buildFlows({ components: apis, dependencies: [], externals: [], endpoints, agents })
    expect(flows.length).toBeLessThanOrEqual(MAX_FLOWS)
    expect(flows.every((f) => f.steps.length <= MAX_STEPS)).toBe(true)
  })

  it('ignores endpoints whose part is unknown and never throws', () => {
    expect(() => buildFlows({ components: [], dependencies: [], externals: [], endpoints: [endpoint('GET', '/x', 'nowhere')], agents: [] })).not.toThrow()
  })
})
