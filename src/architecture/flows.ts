/**
 * Turns the model into the presentation's scenes: at most six flows, each a short story with up to
 * seven actors and fourteen steps. The order is what the audience should see first: agents (at most
 * two), requests to the API (at most three), a background job, and an overview only when nothing else
 * was found.
 *
 * Every step is a plain sentence in both languages, built from a template per kind of step. Nothing
 * here guesses at behaviour the code doesn't show: a step exists only because an import, a route or an
 * agent's tool says so.
 */
import type { Actor, ActorKind, Agent, Component, Dependency, Endpoint, External, ExternalKind, Flow, FlowStep, StepAction, Text } from '../shared/studio'
import { clip, cap, firstSentence, joinList } from './text'

export type FlowInput = {
  components: Component[]
  dependencies: Dependency[]
  externals: External[]
  endpoints: Endpoint[]
  agents: Agent[]
  /** File path → ids of the components that file imports. Lets a route's scene follow its own file. */
  fileDeps?: Map<string, string[]>
}

/** Scenes are kept small enough to follow on a screen. */
export const MAX_ACTORS = 7
export const MAX_STEPS = 14
export const MAX_FLOWS = 6

const PERSON: Actor = {
  id: 'person',
  name: { en: 'User', pt: 'Usuário' },
  kind: 'person',
  component: null,
  external: null,
  note: { en: 'Whoever uses the system.', pt: 'Quem usa o sistema.' },
}

/** Which character plays a part, by its layer. */
export const COMPONENT_KIND: Record<Component['layer'], ActorKind> = {
  interface: 'screen',
  api: 'api',
  security: 'security',
  logic: 'service',
  shared: 'service',
  infra: 'service',
  ai: 'agent',
  jobs: 'worker',
  data: 'database',
  tests: 'service',
}

const EXTERNAL_KIND: Record<ExternalKind, ActorKind> = {
  database: 'database',
  cache: 'cache',
  queue: 'queue',
  llm: 'llm',
  email: 'external',
  payment: 'external',
  messaging: 'external',
  storage: 'external',
  auth: 'external',
  http: 'external',
}

const EXTERNAL_NOTE: Partial<Record<ExternalKind, Text>> = {
  database: { en: 'Where the data is kept.', pt: 'Onde os dados ficam guardados.' },
  cache: { en: 'Keeps ready answers so things run faster.', pt: 'Guarda respostas prontas para ir mais rápido.' },
  queue: { en: 'Holds tasks to be done later.', pt: 'Guarda tarefas para serem feitas depois.' },
  llm: { en: 'Language model that answers and decides.', pt: 'Modelo de linguagem que responde e decide.' },
}

/** What the outside service does when a step sends something to it. */
const SENT: Partial<Record<ExternalKind, { pt: string; en: string }>> = {
  email: { pt: 'o e-mail', en: 'the e-mail' },
  payment: { pt: 'o pagamento', en: 'the payment' },
  messaging: { pt: 'a mensagem', en: 'the message' },
  storage: { pt: 'o arquivo', en: 'the file' },
}

const SEND_KINDS: ExternalKind[] = ['email', 'payment', 'messaging', 'storage']

type Ctx = {
  components: Component[]
  byId: Map<string, Component>
  deps: Dependency[]
  externals: External[]
  /** File path → the components its imports reach, so a route only shows the parts its own file uses. */
  fileDeps: Map<string, string[]>
}

/** The actor for a component, with the layer's kind. */
function componentActor(c: Component): Actor {
  return {
    id: `c:${c.id}`,
    name: { en: c.name, pt: c.name },
    kind: COMPONENT_KIND[c.layer],
    component: c.id,
    external: null,
    note: c.summary,
  }
}

/** The actor for an outside service. */
function externalActor(e: External): Actor {
  return {
    id: `e:${e.id}`,
    name: { en: e.name, pt: e.name },
    kind: EXTERNAL_KIND[e.kind],
    component: null,
    external: e.id,
    note: EXTERNAL_NOTE[e.kind] ?? { en: 'Outside service the system uses.', pt: 'Serviço externo usado pelo sistema.' },
  }
}

/** The component `from` depends on most among those matching `pred`. */
function heaviest(ctx: Ctx, from: string, pred: (c: Component) => boolean): Component | null {
  const targets = ctx.deps
    .filter((d) => d.from === from)
    .sort((a, b) => b.weight - a.weight)
  for (const d of targets) {
    const c = ctx.byId.get(d.to)
    if (c && c.id !== from && pred(c)) return c
  }
  return null
}

/** The component that depends on `to` most among those matching `pred`. */
function heaviestCaller(ctx: Ctx, to: string, pred: (c: Component) => boolean): Component | null {
  const callers = ctx.deps.filter((d) => d.to === to).sort((a, b) => b.weight - a.weight)
  for (const d of callers) {
    const c = ctx.byId.get(d.from)
    if (c && c.id !== to && pred(c)) return c
  }
  return null
}

/** The first outside service of the kinds that a component uses. */
function serviceUsedBy(ctx: Ctx, ids: string[], kinds: ExternalKind[]): External | null {
  for (const id of ids) {
    const hit = ctx.externals.find((e) => kinds.includes(e.kind) && e.usedBy.includes(id))
    if (hit) return hit
  }
  return null
}

/** How a method reads in a sentence: "criar", "listar", "ver"… and the English. */
function verbOf(method: string, path: string): { pt: string; en: string } {
  const last = path.split('/').filter(Boolean).pop() ?? ''
  const hasId = /[:{<[$]/.test(last)
  switch (method) {
    case 'GET':
      return hasId ? { pt: 'ver', en: 'view' } : { pt: 'listar', en: 'list' }
    case 'POST':
      return { pt: 'criar', en: 'create' }
    case 'PUT':
    case 'PATCH':
      return { pt: 'atualizar', en: 'update' }
    case 'DELETE':
      return { pt: 'apagar', en: 'delete' }
    default:
      return { pt: 'usar', en: 'use' }
  }
}

/** The last fixed word of a route: "/api/leads/:id" → "leads". */
function resourceOf(path: string): string {
  const fixed = path
    .split('/')
    .filter((s) => s && !/[:{<[$]/.test(s) && s !== 'api')
    .pop()
  return (fixed ?? path).replace(/[^\p{L}\p{N}_-]/gu, '') || 'dados'
}

/** Everything a request scene is made of, found from the graph. */
type RequestPlan = {
  endpoint: Endpoint
  api: Component
  screen: Component | null
  sec: Component | null
  svc: Component | null
  data: Component | null
  db: External | null
  send: External | null
  queue: External | null
}

function planRequest(ctx: Ctx, ep: Endpoint): RequestPlan | null {
  const api = ctx.byId.get(ep.component)
  if (!api) return null
  const reach = new Set(ctx.fileDeps.get(ep.file) ?? [])
  const within = (c: Component) => reach.size === 0 || reach.has(c.id)
  const screen = heaviestCaller(ctx, api.id, (c) => c.layer === 'interface')
  const sec = heaviest(ctx, api.id, (c) => c.layer === 'security' && within(c))
  const svc = heaviest(ctx, api.id, (c) => c.layer === 'logic' && within(c))
  const data = heaviest(ctx, svc?.id ?? api.id, (c) => c.layer === 'data') ?? (svc ? heaviest(ctx, api.id, (c) => c.layer === 'data') : null)
  const owners = [data?.id, svc?.id, api.id].filter((x): x is string => !!x)
  const db = serviceUsedBy(ctx, owners, ['database'])
  const owner = svc?.id ?? api.id
  const send = serviceUsedBy(ctx, [owner, api.id], SEND_KINDS)
  const queue = serviceUsedBy(ctx, [owner, api.id], ['queue'])
  return { endpoint: ep, api, screen, sec, svc, data, db, send, queue }
}

/** One request scene, with the parts of the plan it may use. */
function requestFlow(plan: RequestPlan, use: { sec: boolean; send: boolean; queue: boolean }): Flow {
  const { endpoint: ep, api, screen } = plan
  const sec = use.sec ? plan.sec : null
  const send = use.send ? plan.send : null
  const queue = use.queue ? plan.queue : null
  const svc = plan.svc
  const dbSvc = plan.db
  const verb = verbOf(ep.method, ep.path)
  const res = resourceOf(ep.path)
  const sn = screen?.name ?? ''
  const an = api.name
  const secn = sec?.name ?? ''
  const svcn = svc?.name ?? ''
  const src = svc ?? api
  const dbn = dbSvc?.name ?? ''
  const sendName = send?.name ?? ''
  const queueName = queue?.name ?? ''
  const ref = { file: ep.file, line: ep.line }

  const actors: Actor[] = [PERSON]
  if (screen) actors.push(componentActor(screen))
  actors.push(componentActor(api))
  if (sec) actors.push(componentActor(sec))
  if (svc) actors.push(componentActor(svc))
  if (dbSvc) actors.push(externalActor(dbSvc))
  if (send) actors.push(externalActor(send))
  if (queue) actors.push(externalActor(queue))

  const steps: FlowStep[] = []
  const step = (from: string, to: string, action: StepAction, pt: string, en: string, say?: { pt: string; en: string }, at?: { file: string; line: number }) =>
    steps.push({ from, to, action, text: { pt, en }, ...(say ? { say } : {}), ...(at ? { ref: at } : {}) })

  if (screen) {
    step('person', `c:${screen.id}`, 'ask', `O usuário usa a tela ${sn}`, `The user opens the ${sn} screen`, { pt: 'clique!', en: 'click!' })
    step(`c:${screen.id}`, `c:${api.id}`, 'ask', `${sn} faz um pedido para ${an}: ${verb.pt} ${res}`, `${sn} sends a request to ${an}: ${verb.en} ${res}`, { pt: 'pedido!', en: 'request!' }, ref)
  } else {
    step('person', `c:${api.id}`, 'ask', `O usuário faz um pedido para ${an}: ${verb.pt} ${res}`, `The user sends a request to ${an}: ${verb.en} ${res}`, { pt: 'pedido!', en: 'request!' }, ref)
  }
  if (sec) {
    step(`c:${api.id}`, `c:${sec.id}`, 'check', `${secn} confere se o usuário pode entrar`, `${secn} checks if the user can get in`, { pt: 'pode entrar?', en: 'allowed in?' })
    step(`c:${sec.id}`, `c:${api.id}`, 'reply', `${secn} libera o pedido`, `${secn} lets the request through`, { pt: 'liberado', en: 'approved' })
  }
  if (svc) {
    step(`c:${api.id}`, `c:${svc.id}`, 'call', `${an} passa o trabalho para ${svcn}`, `${an} hands the work to ${svcn}`, { pt: 'sua vez', en: 'your turn' })
  }
  if (dbSvc) {
    const srcId = svc ? `c:${svc.id}` : `c:${api.id}`
    const srcName = svc ? svcn : an
    const dbId = `e:${dbSvc.id}`
    if (ep.method === 'GET') {
      step(srcId, dbId, 'fetch', `${srcName} busca os dados em ${dbn}`, `${srcName} fetches the data from ${dbn}`, { pt: 'os dados?', en: 'the data?' })
    } else {
      step(srcId, dbId, 'save', `${srcName} guarda as mudanças em ${dbn}`, `${srcName} saves the changes in ${dbn}`, { pt: 'guardar', en: 'save' })
    }
    if (ep.method === 'GET') step(dbId, srcId, 'reply', `${dbn} entrega os dados`, `${dbn} hands over the data`, { pt: 'aqui está', en: 'here you go' })
    else step(dbId, srcId, 'reply', `${dbn} confirma que guardou`, `${dbn} confirms it's saved`, { pt: 'guardado!', en: 'saved!' })
  }
  // E-mails, payments and queued jobs happen before the answer goes back.
  if (send) {
    const what = SENT[send.kind] ?? { pt: 'os dados', en: 'the data' }
    step(`c:${src.id}`, `e:${send.id}`, 'send', `${src.name} envia ${what.pt} por ${sendName}`, `${src.name} sends ${what.en} through ${sendName}`, { pt: 'enviado!', en: 'sent!' })
  }
  if (queue) {
    step(`c:${src.id}`, `e:${queue.id}`, 'queue', `${src.name} deixa uma tarefa na fila ${queueName}`, `${src.name} leaves a task in the ${queueName} queue`, { pt: 'pra depois', en: 'for later' })
  }
  if (svc) {
    step(`c:${svc.id}`, `c:${api.id}`, 'reply', `${svcn} devolve o resultado`, `${svcn} returns the result`, { pt: 'pronto', en: 'done' })
  }
  if (screen) {
    step(`c:${api.id}`, `c:${screen.id}`, 'reply', `${an} devolve a resposta`, `${an} sends back the answer`, { pt: 'resposta!', en: 'answer!' })
    step(`c:${screen.id}`, `c:${screen.id}`, 'show', `${sn} mostra o resultado na tela`, `${sn} shows the result on the screen`, { pt: 'na tela!', en: 'on screen!' })
  } else {
    step(`c:${api.id}`, 'person', 'reply', `${an} devolve a resposta`, `${an} sends back the answer`, { pt: 'resposta!', en: 'answer!' })
  }

  const title = { pt: `${cap(verb.pt)} ${res}`, en: `${cap(verb.en)} ${res}` }
  return {
    id: `request:${ep.method} ${ep.path}`,
    kind: 'request',
    title,
    summary: {
      pt: clip(`${screen ? `Quando alguém usa ${sn}, ` : 'Quando alguém faz um pedido, '}${an} recebe ${ep.method} ${ep.path} e devolve a resposta.`, 400),
      en: clip(`${screen ? `When someone uses ${sn}, ` : 'When someone sends a request, '}${an} receives ${ep.method} ${ep.path} and sends back the answer.`, 400),
    },
    actors,
    steps,
  }
}

/** Builds a request scene, dropping optional parts until it fits the actor and step limits. */
function fitRequest(plan: RequestPlan): Flow {
  const options = [
    { sec: true, send: true, queue: true },
    { sec: true, send: true, queue: false },
    { sec: true, send: false, queue: false },
    { sec: false, send: false, queue: false },
  ]
  let flow = requestFlow(plan, options[0])
  for (const o of options) {
    flow = requestFlow(plan, o)
    if (flow.actors.length <= MAX_ACTORS && flow.steps.length <= MAX_STEPS) break
  }
  return flow
}

/** The name of a node in an agent's graph, as a reader sees it. */
function nodeLabel(agent: Agent, id: string): string {
  return agent.graph.nodes.find((n) => n.id === id)?.label ?? id
}

/** Plain text for the decision an agent makes: its explicit graph's branches, or the tools it can pick from. */
function decisionText(agent: Agent, name: string): { pt: string; en: string } {
  if (agent.graph.explicit) {
    const from = agent.graph.nodes.find((n) => agent.graph.links.filter((l) => l.from === n.id && l.condition).length >= 2)
    if (from) {
      const branches = agent.graph.links.filter((l) => l.from === from.id && l.condition).slice(0, 3)
      return {
        pt: `${name} escolhe o caminho: ${branches.map((l) => `se ${l.condition}, vai para ${nodeLabel(agent, l.to)}`).join('; ')}`,
        en: `${name} picks a path: ${branches.map((l) => `if ${l.condition}, goes to ${nodeLabel(agent, l.to)}`).join('; ')}`,
      }
    }
  }
  const n = agent.tools.length
  const names = joinList(agent.tools.slice(0, 3).map((t) => t.name), 'pt')
  const namesEn = joinList(agent.tools.slice(0, 3).map((t) => t.name), 'en')
  return {
    pt: `${name} escolhe ${n === 1 ? 'a ferramenta' : `entre ${n} ferramentas`}: ${names}`,
    en: `${name} chooses ${n === 1 ? 'the tool' : `between ${n} tools`}: ${namesEn}`,
  }
}

/** One agent's scene: the message, the instructions, the model, its tool choices and the answer. */
function agentFlow(ctx: Ctx, agent: Agent, nTools: number): Flow {
  const comp = ctx.byId.get(agent.component)
  const caller = comp ? heaviestCaller(ctx, comp.id, (c) => c.layer === 'interface' || c.layer === 'api') : null
  const callerIsScreen = caller?.layer === 'interface'
  const llm =
    ctx.externals.find((e) => e.kind === 'llm' && e.name === agent.provider && (!comp || e.usedBy.includes(comp.id))) ??
    ctx.externals.find((e) => e.kind === 'llm' && !!comp && e.usedBy.includes(comp.id)) ??
    null
  const S = agent.name
  const M = agent.model ?? agent.provider
  const tools = agent.tools.slice(0, nTools)
  const agentActorId = `a:${agent.id}`
  const llmActorId = 'm'

  const actors: Actor[] = [PERSON]
  if (caller) actors.push(componentActor(caller))
  actors.push({
    id: agentActorId,
    name: { en: S, pt: S },
    kind: 'agent',
    component: comp?.id ?? null,
    external: null,
    note: agent.instructions
      ? { en: clip(agent.instructions, 140), pt: clip(agent.instructions, 140) }
      : { en: 'Decides what to do with the message.', pt: 'Decide o que fazer com a mensagem.' },
  })
  actors.push({
    id: llmActorId,
    name: { en: `AI model (${M})`, pt: `Modelo de IA (${M})` },
    kind: 'llm',
    component: null,
    external: llm?.id ?? null,
    note: { en: 'Language model that answers and decides.', pt: 'Modelo de linguagem que responde e decide.' },
  })
  for (const t of tools) {
    actors.push({
      id: `t:${t.name}`,
      name: { en: t.name, pt: t.name },
      kind: 'tool',
      component: null,
      external: null,
      note: { en: t.description ?? t.name, pt: t.description ?? t.name },
    })
  }

  const steps: FlowStep[] = []
  const step = (from: string, to: string, action: StepAction, pt: string, en: string, say?: { pt: string; en: string }, at?: { file: string; line: number }) =>
    steps.push({ from, to, action, text: { pt, en }, ...(say ? { say } : {}), ...(at ? { ref: at } : {}) })
  const agentRef = { file: agent.file, line: agent.graph.nodes.find((n) => n.kind === 'llm')?.line ?? 1 }

  if (caller) {
    step('person', `c:${caller.id}`, 'ask', 'O usuário manda uma mensagem', 'The user sends a message', { pt: 'oi!', en: 'hi!' })
    step(`c:${caller.id}`, agentActorId, 'call', `${caller.name} entrega a mensagem para ${S}`, `${caller.name} hands the message to ${S}`, { pt: 'a mensagem', en: 'the message' })
  } else {
    step('person', agentActorId, 'ask', `O usuário manda uma mensagem para ${S}`, `The user sends a message to ${S}`, { pt: 'oi!', en: 'hi!' })
  }
  const firstSaid = agent.instructions ? firstSentence(agent.instructions, 90) : ''
  if (firstSaid) {
    step(agentActorId, agentActorId, 'think', `${S} lê as instruções: “${firstSaid}”`, `${S} reads its instructions: “${firstSaid}”`, { pt: 'instruções', en: 'instructions' })
  } else {
    step(agentActorId, agentActorId, 'think', `${S} lê a conversa`, `${S} reads the conversation`, { pt: 'a conversa', en: 'the chat' })
  }
  step(agentActorId, llmActorId, 'ask', `${S} pergunta ao ${M} o que fazer`, `${S} asks ${M} what to do`, { pt: 'e agora?', en: 'now what?' })
  const firstTool = agent.tools[0]?.name
  step(llmActorId, agentActorId, 'reply', 'O modelo sugere usar uma ferramenta ou responder direto', 'The model suggests using a tool or answering directly', {
    pt: firstTool ? `use ${firstTool}` : 'responder',
    en: firstTool ? `use ${firstTool}` : 'answer',
  })
  if (agent.tools.length) {
    const d = decisionText(agent, S)
    step(agentActorId, agentActorId, 'decide', d.pt, d.en, { pt: 'qual delas?', en: 'which one?' })
    for (const t of tools) {
      const desc = t.description ? `: ${clip(t.description, 110)}` : ''
      step(agentActorId, `t:${t.name}`, 'use-tool', `Se precisar, usa ${t.name}${desc}`, `If needed, it uses ${t.name}${desc}`, { pt: t.name, en: t.name }, { file: t.file, line: t.line })
      step(`t:${t.name}`, agentActorId, 'reply', `${t.name} devolve o resultado`, `${t.name} returns the result`, { pt: 'pronto', en: 'done' }, { file: t.file, line: t.line })
    }
  }
  if (agent.loop) {
    step(agentActorId, llmActorId, 'ask', 'Com o resultado, pergunta de novo ao modelo; repete até não precisar mais de ferramentas', 'With the result, it asks the model again; it repeats until no tool is needed', { pt: 'de novo!', en: 'again!' })
    step(llmActorId, agentActorId, 'reply', 'O modelo escreve a resposta final', 'The model writes the final answer', { pt: 'resposta', en: 'answer' })
  }
  if (callerIsScreen && caller) {
    step(agentActorId, `c:${caller.id}`, 'reply', `${S} responde ao usuário`, `${S} answers the user`, { pt: 'resposta!', en: 'answer!' }, agentRef)
    step(`c:${caller.id}`, `c:${caller.id}`, 'show', `${caller.name} mostra a resposta na tela`, `${caller.name} shows the answer on the screen`, { pt: 'na tela!', en: 'on screen!' })
  } else if (caller) {
    step(agentActorId, `c:${caller.id}`, 'reply', `${S} devolve a resposta para ${caller.name}`, `${S} sends the answer back to ${caller.name}`, { pt: 'resposta!', en: 'answer!' }, agentRef)
    step(`c:${caller.id}`, 'person', 'reply', `${caller.name} responde ao usuário`, `${caller.name} answers the user`, { pt: 'resposta!', en: 'answer!' })
  } else {
    step(agentActorId, 'person', 'reply', `${S} responde ao usuário`, `${S} answers the user`, { pt: 'resposta!', en: 'answer!' }, agentRef)
  }

  return {
    id: `agent:${agent.id}`,
    kind: 'agent',
    title: { pt: `Como o ${S} decide`, en: `How ${S} decides` },
    summary: {
      pt: clip(`${S} lê o pedido, pergunta ao ${M} e decide se precisa usar uma ferramenta${agent.tools.length ? ` entre ${agent.tools.length}` : ''}.`, 400),
      en: clip(`${S} reads the request, asks ${M} and decides whether it needs a tool${agent.tools.length ? ` out of ${agent.tools.length}` : ''}.`, 400),
    },
    actors,
    steps,
  }
}

/** Builds an agent scene, using fewer tools when the scene would be too long. */
function fitAgent(ctx: Ctx, agent: Agent): Flow {
  let n = Math.min(2, agent.tools.length)
  let flow = agentFlow(ctx, agent, n)
  while (flow.steps.length > MAX_STEPS && n > 0) {
    n--
    flow = agentFlow(ctx, agent, n)
  }
  return flow
}

/** The background job scene: work goes onto a queue by one part and is done by a worker. */
function jobFlow(ctx: Ctx): Flow | null {
  const workers = ctx.components.filter((c) => c.layer === 'jobs')
  if (workers.length === 0) return null
  const incoming = (c: Component) => ctx.deps.filter((d) => d.to === c.id).reduce((s, d) => s + d.weight, 0)
  const worker = [...workers].sort((a, b) => incoming(b) - incoming(a))[0]
  const queue = ctx.externals.find((e) => e.kind === 'queue' && e.usedBy.some((id) => id !== worker.id)) ?? ctx.externals.find((e) => e.kind === 'queue') ?? null
  const producer =
    (queue ? ctx.components.find((c) => c.id !== worker.id && queue.usedBy.includes(c.id) && c.layer !== 'jobs') : undefined) ??
    heaviestCaller(ctx, worker.id, (c) => c.layer !== 'jobs' && c.layer !== 'tests')
  if (!producer) return null
  // The worker's own services, and the parts it hands work to, decide what it stores or sends.
  const owners = [worker.id, ...ctx.deps.filter((d) => d.from === worker.id).map((d) => d.to)]
  const db = serviceUsedBy(ctx, owners, ['database'])
  const send = serviceUsedBy(ctx, owners, SEND_KINDS)

  const actors: Actor[] = [componentActor(producer)]
  if (queue) actors.push(externalActor(queue))
  actors.push(componentActor(worker))
  if (db) actors.push(externalActor(db))
  if (send) actors.push(externalActor(send))

  const steps: FlowStep[] = []
  const p = producer.name
  const w = worker.name
  if (queue) {
    steps.push({
      from: `c:${producer.id}`,
      to: `e:${queue.id}`,
      action: 'queue',
      text: { pt: `${p} deixa uma tarefa na fila ${queue.name}`, en: `${p} leaves a task in the ${queue.name} queue` },
      say: { pt: 'pra depois', en: 'for later' },
    })
    steps.push({
      from: `e:${queue.id}`,
      to: `c:${worker.id}`,
      action: 'call',
      text: { pt: `${w} pega a tarefa da fila`, en: `${w} takes the task from the queue` },
      say: { pt: 'tarefa!', en: 'task!' },
    })
  } else {
    steps.push({
      from: `c:${producer.id}`,
      to: `c:${worker.id}`,
      action: 'call',
      text: { pt: `${p} pede uma tarefa para ${w}`, en: `${p} asks ${w} for a task` },
      say: { pt: 'tarefa!', en: 'task!' },
    })
  }
  if (db) {
    steps.push({
      from: `c:${worker.id}`,
      to: `e:${db.id}`,
      action: 'save',
      text: { pt: `${w} guarda o resultado em ${db.name}`, en: `${w} saves the result in ${db.name}` },
      say: { pt: 'guardar', en: 'save' },
    })
  }
  if (send) {
    const what = SENT[send.kind] ?? { pt: 'os dados', en: 'the data' }
    steps.push({
      from: `c:${worker.id}`,
      to: `e:${send.id}`,
      action: 'send',
      text: { pt: `${w} envia ${what.pt} por ${send.name}`, en: `${w} sends ${what.en} through ${send.name}` },
      say: { pt: 'enviado!', en: 'sent!' },
    })
  }
  steps.push({
    from: `c:${worker.id}`,
    to: `c:${worker.id}`,
    action: 'reply',
    text: { pt: 'Tarefa concluída', en: 'Task done' },
    say: { pt: 'pronto!', en: 'done!' },
  })

  return {
    id: 'job',
    kind: 'job',
    title: { pt: 'Tarefas em segundo plano', en: 'Background tasks' },
    summary: {
      pt: 'Tarefas demoradas vão para uma fila e são feitas depois, em segundo plano.',
      en: 'Slow work goes into a queue and is done later, in the background.',
    },
    actors,
    steps,
  }
}

/** A short scene of the entry part and what it hands work to, for systems where nothing else was found. */
function overviewFlow(ctx: Ctx): Flow | null {
  const out = (id: string) => ctx.deps.filter((d) => d.from === id).sort((a, b) => b.weight - a.weight)
  const entries = ctx.components.filter((c) => c.entry && c.layer !== 'tests')
  const pool = entries.length ? entries : ctx.components.filter((c) => c.layer !== 'tests')
  const start = [...pool].sort((a, b) => out(b.id).length - out(a.id).length)[0]
  if (!start) return null
  const targets = out(start.id)
    .map((d) => ctx.byId.get(d.to))
    .filter((c): c is Component => !!c && c.id !== start.id)
    .slice(0, 5)
  if (targets.length === 0) return null
  const steps: FlowStep[] = targets.map((t) => ({
    from: `c:${start.id}`,
    to: `c:${t.id}`,
    action: 'call',
    text: { pt: `${start.name} passa o trabalho para ${t.name}`, en: `${start.name} hands the work to ${t.name}` },
    say: { pt: 'sua vez', en: 'your turn' },
  }))
  const actors = [componentActor(start), ...targets.map(componentActor)]
  return {
    id: 'overview',
    kind: 'overview',
    title: { pt: 'Visão geral', en: 'Overview' },
    summary: {
      pt: `Mostra como ${start.name} conversa com as outras partes do sistema.`,
      en: `Shows how ${start.name} works with the other parts of the system.`,
    },
    actors,
    steps,
  }
}

/** The scenes of a repo, most telling first, within the limits. */
export function buildFlows(input: FlowInput): Flow[] {
  const ctx: Ctx = {
    components: input.components,
    byId: new Map(input.components.map((c) => [c.id, c])),
    deps: input.dependencies,
    externals: input.externals,
    fileDeps: input.fileDeps ?? new Map(),
  }
  const flows: Flow[] = []

  for (const agent of input.agents.slice(0, 2)) {
    const comp = ctx.byId.get(agent.component)
    if (agent.component && !comp) continue
    flows.push(fitAgent(ctx, agent))
  }

  // Request scenes: the endpoints whose chains reach the most, POST first, one per API part.
  const plans = input.endpoints
    .map((ep) => planRequest(ctx, ep))
    .filter((p): p is RequestPlan => p !== null)
    .map((p) => ({
      plan: p,
      score:
        (p.screen ? 1 : 0) + (p.sec ? 1 : 0) + (p.svc ? 1 : 0) + (p.data ? 1 : 0) + (p.db ? 1 : 0) + (p.send ? 1 : 0) + (p.queue ? 1 : 0),
      method: { POST: 3, PUT: 2, PATCH: 2, GET: 1 }[p.endpoint.method] ?? 0,
    }))
    .sort((a, b) => b.score - a.score || b.method - a.method)
  const usedApis = new Set<string>()
  let requests = 0
  for (const { plan } of plans) {
    if (requests >= 3) break
    if (usedApis.has(plan.api.id)) continue
    usedApis.add(plan.api.id)
    flows.push(fitRequest(plan))
    requests++
  }

  const job = jobFlow(ctx)
  if (job) flows.push(job)

  if (flows.length === 0) {
    const overview = overviewFlow(ctx)
    if (overview) flows.push(overview)
  }
  return flows.slice(0, MAX_FLOWS)
}
