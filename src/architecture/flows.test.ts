import { describe, expect, it } from 'vitest'
import type { Agent, Component, Dependency, Endpoint, External, Flow, Layer } from '../shared/studio'
import { buildFlows, MAX_ACTORS, MAX_FLOWS, MAX_STEPS } from './flows'
import type { FlowDetails } from './details'
import type { Feature } from './features'

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
    expect(flow.steps[5].text.pt).toBe('As regras do negócio guardam as mudanças no banco de dados')
    expect(flow.steps[6].text.pt).toBe('O banco de dados confirma para as regras do negócio que guardou')
    expect(flow.steps[0].text.pt).toBe('O usuário usa as páginas')
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
    expect(flow.title).toEqual({ pt: 'Como o assistente de IA decide', en: 'How the AI assistant decides' })
    const decide = flow.steps.find((s) => s.action === 'decide')
    expect(decide?.text.pt).toBe('O assistente de IA escolhe o caminho: se tools, vai para Ferramentas; se end, vai para Fim')
    expect(flow.steps.find((s) => s.action === 'think')?.text.pt).toBe('O assistente de IA lê as instruções: “Você responde dúvidas.”')
    const llm = flow.actors.find((a) => a.kind === 'llm')
    expect(llm?.name.pt).toBe('Modelo de IA')
    expect(llm?.technical?.pt).toBe('gpt-4o')
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
    expect(job.steps[0].text.pt).toBe('As regras do negócio deixam uma tarefa na fila de tarefas')
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
    expect(flows[0].steps.map((s) => s.text.en)).toEqual(['The app hands the work to the helpers', 'The app hands the work to the helpers 2'])
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

describe('buildFlows: with the details of the code', () => {
  const components = [
    component('frontend/pages', 'interface', { name: 'Frontend Pages' }),
    component('backend/routes', 'api', { name: 'Backend Routes' }),
    component('backend/services', 'logic', { name: 'Backend Services' }),
    component('backend/db', 'data', { name: 'Backend Db' }),
  ]
  const dependencies = [dep('frontend/pages', 'backend/routes', 2), dep('backend/routes', 'backend/services'), dep('backend/services', 'backend/db')]
  const externals = [ext('ext:postgresql', 'PostgreSQL', 'database', ['backend/db']), ext('ext:resend', 'Resend', 'email', ['backend/services'])]
  const details: FlowDetails = {
    models: [{ name: 'Lead', fields: ['name', 'company', 'email', 'phone', 'status'], line: 1 }],
    calls: new Map([
      ['POST /api/leads', { file: 'frontend/pages/LeadsPage.tsx', sent: ['name', 'company', 'email', 'phone'] }],
      ['GET /api/leads', { file: 'frontend/pages/LeadsPage.tsx', sent: [] }],
      ['DELETE /api/leads/:id', { file: 'frontend/pages/LeadsPage.tsx', sent: [] }],
    ]),
    screens: new Map([['frontend/pages/LeadsPage.tsx', { title: 'Leads', buttons: ['Cancelar', 'Salvar lead'], fields: ['Nome', 'Empresa', 'E-mail', 'Telefone'] }]]),
    subjects: new Map([['backend/services', ['Olá!']]]),
    tasks: ['followups'],
  }
  const run = (endpoints: Endpoint[]) => buildFlows({ components, dependencies, externals, endpoints, agents: [], details })

  it('says what the person fills in, the button to press, what is sent and saved, and the e-mail subject', () => {
    const [flow] = run([endpoint('POST', '/api/leads', 'backend/routes')])
    expect(flow.steps[0].text.pt).toBe('O usuário abre “Leads” nas páginas, preenche nome, empresa, e-mail e telefone e clica em “Salvar lead”')
    expect(flow.steps[1].text.pt).toBe('As páginas enviam o novo lead (nome, empresa, e-mail e telefone) para a recepção')
    expect(flow.steps[0].text.en).toBe('The user opens “Leads” in the pages, fills in nome, empresa, e-mail and telefone and clicks “Salvar lead”')
    expect(flow.steps[1].text.en).toBe('The pages send the new lead (name, company, email and phone) to the front desk')
    expect(flow.steps.map((s) => s.text.pt)).toContain('As regras do negócio guardam o novo lead no banco de dados: nome, empresa, e-mail e telefone')
    expect(flow.steps.map((s) => s.text.pt)).toContain('O banco de dados confirma para as regras do negócio: o lead foi guardado')
    expect(flow.steps.map((s) => s.text.pt)).toContain('As regras do negócio enviam o e-mail “Olá!” usando o serviço de e-mail')
    expect(flow.steps[flow.steps.length - 1].text.pt).toBe('As páginas mostram que o lead foi salvo')
    expectWellFormed(flow)
  })

  it('tells a list as the screen asking for it, the data fetched, and the list shown', () => {
    const [flow] = run([endpoint('GET', '/api/leads', 'backend/routes')])
    expect(flow.steps[0].text.pt).toBe('O usuário abre “Leads” nas páginas para ver os leads')
    expect(flow.steps[1].text.pt).toBe('As páginas pedem a lista de leads para a recepção')
    expect(flow.steps.map((s) => s.text.pt)).toContain('As regras do negócio procuram os leads no banco de dados')
    expect(flow.steps.map((s) => s.text.pt)).toContain('O banco de dados devolve a lista de leads para as regras do negócio')
    expect(flow.steps[flow.steps.length - 1].text.pt).toBe('As páginas mostram a lista de leads')
    expect(flow.actors.some((a) => a.name.pt === 'Serviço de e-mail')).toBe(false)
    expectWellFormed(flow)
  })

  it('tells a delete as the person asking to remove one lead, and the service removing it', () => {
    const [flow] = run([endpoint('DELETE', '/api/leads/:id', 'backend/routes')])
    expect(flow.steps[0].text.pt).toBe('O usuário abre “Leads” nas páginas e pede para apagar um lead')
    expect(flow.steps.map((s) => s.text.pt)).toContain('As regras do negócio apagam o lead no banco de dados')
    expect(flow.steps.map((s) => s.text.pt)).toContain('O banco de dados confirma para as regras do negócio: o lead foi apagado')
    expectWellFormed(flow)
  })

  it('keeps every caption within 120 characters, cutting the lists rather than the words', () => {
    const long = ['Nome completo do cliente', 'Empresa onde ele trabalha', 'E-mail de contato principal', 'Telefone com DDD', 'Cidade', 'Estado', 'Observações']
    const big: FlowDetails = {
      ...details,
      screens: new Map([['frontend/pages/LeadsPage.tsx', { title: 'Leads', buttons: ['Salvar lead'], fields: long }]]),
      calls: new Map([['POST /api/leads', { file: 'frontend/pages/LeadsPage.tsx', sent: ['name', 'company', 'email', 'phone', 'city', 'state', 'notes'] }]]),
    }
    const [flow] = buildFlows({ components, dependencies, externals, endpoints: [endpoint('POST', '/api/leads', 'backend/routes')], agents: [], details: big })
    for (const s of flow.steps) expect(s.text.pt.length).toBeLessThanOrEqual(120)
    expect(flow.steps[0].text.pt).toMatch(/ e mais \d+ e clica em “Salvar lead”$/)
  })

  it('names the queue task in a job when the worker is known, and keeps the old wording otherwise', () => {
    const jobComponents = [component('backend/services', 'logic', { name: 'Services' }), component('backend/jobs', 'jobs', { name: 'Jobs' })]
    const jobDeps = [dep('backend/services', 'backend/jobs')]
    const jobExternals = [ext('ext:bullmq', 'BullMQ', 'queue', ['backend/jobs'])]
    const withTask = buildFlows({
      components: jobComponents,
      dependencies: jobDeps,
      externals: jobExternals,
      endpoints: [],
      agents: [],
      details: { models: [], calls: new Map(), screens: new Map(), subjects: new Map(), tasks: ['followups'] },
    })
    const job = withTask.find((f) => f.kind === 'job') as Flow
    expect(job.steps[0].text.pt).toBe('As regras do negócio deixam uma tarefa de retorno na fila de tarefas')
    expect(job.steps[1].text.pt).toBe('A tarefa de retorno é pega pelos bastidores na fila de tarefas')
    expectWellFormed(job)

    const without = buildFlows({ components: jobComponents, dependencies: jobDeps, externals: jobExternals, endpoints: [], agents: [] })
    expect((without.find((f) => f.kind === 'job') as Flow).steps[0].text.pt).toBe('As regras do negócio deixam uma tarefa na fila de tarefas')
  })
})

describe('buildFlows: plain and technical names', () => {
  const components = [
    component('frontend/pages', 'interface', { name: 'Frontend Pages' }),
    component('backend/routes', 'api', { name: 'Backend Routes' }),
    component('backend/middleware', 'security', { name: 'Backend Middleware' }),
    component('backend/services', 'logic', { name: 'Backend Services' }),
    component('backend/db', 'data', { name: 'Backend Db' }),
    component('backend/jobs', 'jobs', { name: 'Backend Jobs' }),
    component('backend/ai', 'ai', { name: 'Backend Ai' }),
  ]
  const dependencies = [
    dep('frontend/pages', 'backend/routes', 2),
    dep('backend/routes', 'backend/middleware'),
    dep('backend/routes', 'backend/services'),
    dep('backend/services', 'backend/db'),
    dep('backend/services', 'backend/jobs'),
  ]
  const externals = [
    ext('ext:postgresql', 'PostgreSQL', 'database', ['backend/db']),
    ext('ext:resend', 'Resend', 'email', ['backend/services']),
    ext('ext:bullmq', 'BullMQ', 'queue', ['backend/jobs']),
    ext('ext:openai', 'OpenAI', 'llm', ['backend/ai']),
  ]
  const agent: Agent = {
    id: 'backend/ai/bot.py',
    name: 'Support',
    file: 'backend/ai/bot.py',
    component: 'backend/ai',
    provider: 'OpenAI',
    model: 'gpt-4o-mini',
    framework: null,
    instructions: 'Você ajuda a equipe.',
    tools: [
      { name: 'search_leads', description: 'Find leads by company.', file: 'backend/ai/tools.py', line: 2 },
      { name: 'add_note', description: null, file: 'backend/ai/tools.py', line: 9 },
    ],
    graph: { nodes: [], links: [], explicit: false },
    loop: true,
  }
  const details: FlowDetails = {
    models: [{ name: 'Lead', fields: ['name', 'company'], line: 1 }],
    calls: new Map([['POST /api/leads', { file: 'frontend/pages/LeadsPage.tsx', sent: ['name', 'company'] }]]),
    screens: new Map([['frontend/pages/LeadsPage.tsx', { title: 'Leads', buttons: ['Salvar lead'], fields: ['Nome', 'Empresa'] }]]),
    subjects: new Map([['backend/services', ['Olá!']]]),
    tasks: ['followups'],
  }
  const flows = buildFlows({
    components,
    dependencies,
    externals,
    endpoints: [endpoint('POST', '/api/leads', 'backend/routes'), endpoint('GET', '/api/leads', 'backend/routes')],
    agents: [agent],
    details,
  })

  const lowerFirst = (s: string) => (s.charAt(1) === s.charAt(1).toUpperCase() && s.charAt(1) !== s.charAt(1).toLowerCase() ? s : s.charAt(0).toLowerCase() + s.slice(1))
  const mentions = (text: string, name: string) => text.includes(name) || text.includes(lowerFirst(name))

  it('gives every actor except the person its technical name', () => {
    expect(flows.length).toBeGreaterThan(2)
    for (const flow of flows) {
      for (const actor of flow.actors) {
        if (actor.id === 'person') continue
        expect(actor.technical, `${flow.id} / ${actor.id}`).toBeDefined()
        expect(actor.technical?.pt.length).toBeGreaterThan(0)
      }
    }
    const byId = (id: string) => flows.flatMap((f) => f.actors).find((a) => a.id === id)
    expect(byId('c:backend/services')?.technical).toEqual({ pt: 'Backend Services', en: 'Backend Services' })
    expect(byId('e:ext:postgresql')?.technical).toEqual({ pt: 'PostgreSQL', en: 'PostgreSQL' })
    expect(byId('t:search_leads')?.technical).toEqual({ pt: 'search_leads', en: 'search_leads' })
    expect(byId('m')?.technical).toEqual({ pt: 'gpt-4o-mini', en: 'gpt-4o-mini' })
  })

  it('names every participant of a caption with its plain name, or the same name with a lower-case first letter', () => {
    for (const flow of flows) {
      const byId = new Map(flow.actors.map((a) => [a.id, a]))
      for (const step of flow.steps) {
        for (const id of [step.from, step.to]) {
          const actor = byId.get(id)
          if (!actor || actor.id === 'person') continue
          expect(mentions(step.text.pt, actor.name.pt), `pt "${step.text.pt}" should name ${actor.name.pt}`).toBe(true)
          expect(mentions(step.text.en, actor.name.en), `en "${step.text.en}" should name ${actor.name.en}`).toBe(true)
        }
      }
    }
  })

  it('keeps the brands in the notes, not in the names people read', () => {
    const names = flows.flatMap((f) => f.actors).map((a) => a.name.pt)
    expect(names.some((n) => /PostgreSQL|Resend|BullMQ|OpenAI|gpt-4o/.test(n))).toBe(false)
    const note = flows.flatMap((f) => f.actors).find((a) => a.id === 'e:ext:postgresql')?.note.pt
    expect(note).toBe('PostgreSQL guarda os dados do sistema.')
  })
})

describe('buildFlows: what you can do', () => {
  const components = [
    component('frontend/pages', 'interface', { name: 'Frontend Pages' }),
    component('backend/routes', 'api', { name: 'Backend Routes' }),
    component('backend/services', 'logic', { name: 'Backend Services' }),
  ]
  const dependencies = [dep('frontend/pages', 'backend/routes')]
  const features: Feature[] = [
    { label: 'Passo a passo', detail: 'Mostra cada passo da receita.', via: 'button', ref: { file: 'frontend/pages/Home.tsx', line: 12 } },
    { label: '/start', detail: 'Mostra as instruções iniciais.', via: 'command', ref: { file: 'backend/services/bot.ts', line: 4 } },
    { label: null, detail: 'Importa planilhas de contatos.', via: 'readme', ref: null },
  ]
  const run = (list: Feature[]) => buildFlows({ components, dependencies, externals: [], endpoints: [], agents: [], features: list })

  it('puts the features scene first, with the plain names of the parts', () => {
    const flows = buildFlows({
      components,
      dependencies,
      externals: [],
      endpoints: [endpoint('POST', '/api/leads', 'backend/routes')],
      agents: [],
      features,
    })
    expect(flows[0].kind).toBe('features')
    expect(flows[0].id).toBe('features')
    expect(flows[0].title).toEqual({ pt: 'O que dá para fazer', en: 'What you can do' })
    expect(flows[0].actors.map((a) => a.name.pt)).toEqual(['Usuário', 'Páginas', 'Regras do negócio'])
    expect(flows.slice(1).map((f) => f.kind)).toContain('request')
    expectWellFormed(flows[0])
  })

  it('tells a feature with a label as the person asking for it, then the part showing the result', () => {
    const [flow] = run(features)
    expect(flow.steps[0]).toMatchObject({
      from: 'person',
      to: 'c:frontend/pages',
      action: 'ask',
      text: { pt: 'O usuário clica em «Passo a passo»' },
      say: { pt: 'Passo a passo' },
      ref: { file: 'frontend/pages/Home.tsx', line: 12 },
    })
    expect(flow.steps[1]).toMatchObject({ from: 'c:frontend/pages', to: 'person', action: 'show', text: { pt: 'Mostra cada passo da receita.' } })
    expect(flow.steps[2]).toMatchObject({ from: 'person', to: 'c:backend/services', action: 'ask' })
    expect(flow.steps[3]).toMatchObject({ from: 'c:backend/services', to: 'person', action: 'show' })
    expectWellFormed(flow)
  })

  it('tells a feature with only a sentence as one show step, with no question', () => {
    const [flow] = run(features)
    const last = flow.steps[flow.steps.length - 1]
    expect(last).toMatchObject({ from: 'c:frontend/pages', to: 'person', action: 'show', text: { pt: 'Importa planilhas de contatos.' } })
    expect(flow.steps.filter((s) => s.action === 'ask')).toHaveLength(2)
    expect(flow.steps).toHaveLength(5)
  })

  it('leaves the scene out when there are fewer than two features', () => {
    expect(run([features[0]]).some((f) => f.kind === 'features')).toBe(false)
    expect(run([]).some((f) => f.kind === 'features')).toBe(false)
  })

  it('respects the step and actor limits when there are many features', () => {
    const parts = Array.from({ length: 10 }, (_, i) => component(`part${i}/core`, 'logic'))
    const many: Feature[] = parts.map((c, i) => ({ label: `Função ${i}`, detail: `Faz a função ${i}.`, via: 'button', ref: { file: `${c.id}/a.ts`, line: 1 } }))
    const [flow] = buildFlows({ components: parts, dependencies: [], externals: [], endpoints: [], agents: [], features: many })
    expect(flow.kind).toBe('features')
    expect(flow.actors.length).toBeLessThanOrEqual(MAX_ACTORS)
    expect(flow.steps.length).toBeLessThanOrEqual(MAX_STEPS)
    expect(flow.steps.length).toBe(MAX_STEPS)
    expectWellFormed(flow)
  })
})
