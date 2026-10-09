import { describe, expect, it } from 'vitest'
import type { Actor, Flow, FlowStep } from '../shared/studio'
import { flagAt, propAt, sample } from './story'
import { actorKey, applyEdits, buildTour, CODE, keepsCase, NO_EDITS, readingTime, renameParts } from './tour'

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
  it('lays a bigger scene out as an office: two rows across a corridor, the person at the door', () => {
    const flat = buildTour(request, 'pt')
    expect(flat.layout.plan).toBe('office')
    const back = flat.layout.rooms.filter((r) => r.row === 'back').map((r) => r.id)
    const front = flat.layout.rooms.filter((r) => r.row === 'front').map((r) => r.id)
    // Rooms that need a tall wall (the door, the TV, the shelves) take the back row.
    expect(back).toEqual(['person', 'screen', 'db'])
    expect(front).toEqual(['api', 'service'])
    expect(flat.layout.rooms[0]).toMatchObject({ x0: 0, label: { pt: 'Entrada' } })
    expect(flat.layout.rooms.find((r) => r.id === 'api')?.label?.pt).toBe('Leads API')
    // Front-row rooms keep only low furniture, so the camera sees over them.
    for (const r of flat.layout.rooms.filter((r) => r.row === 'front')) expect(r.furniture.every((f) => !/bookcase|lamp.*Floor|doorway|coatRack|fridge/i.test(f.model))).toBe(true)
    expect(flat.repo).toBe('Criar leads')
    expect(flat.cast.map((c) => c.tech)).toEqual(['User', 'Leads Screen', 'Leads API', 'Lead Service', 'PostgreSQL'])
    expect(new Set(flat.cast.map((c) => c.model)).size).toBe(flat.cast.length)
  })

  it('keeps each caption up long enough to read it, longer for a long sentence', () => {
    const long = 'O usuário preenche o formulário com o nome, o e-mail, o telefone e a empresa do novo lead e clica em salvar'
    const slow: Flow = { ...request, steps: request.steps.map((s, i) => (i === 0 ? { ...s, text: t(long) } : s)) }
    const captions = buildTour(slow, 'en').stories.main.captions
    // A caption stays up until the next one starts.
    const shown = captions.slice(0, -1).map((c, i) => captions[i + 1].t0 - c.t0)
    shown.forEach((span, i) => expect(span).toBeGreaterThanOrEqual(readingTime(captions[i].caption) - 0.01))
    expect(shown[0]).toBeGreaterThan(shown[1])
  })

  it('reads at about three words a second, between 2.6 and 9 seconds', () => {
    expect(readingTime(t('Salvo'))).toBe(2.6)
    expect(readingTime(t('um dois três quatro cinco seis sete oito nove dez onze doze'))).toBe(5)
    expect(readingTime(t('palavra '.repeat(60)))).toBe(9)
    expect(readingTime({ en: 'short', pt: 'uma frase bem mais longa em português do que em inglês aqui' })).toBe(5)
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

describe('buildTour, small scenes', () => {
  it('keeps a strip of rooms when only a few take part', () => {
    const small: Flow = { ...request, actors: request.actors.slice(0, 3), steps: request.steps.slice(0, 2) }
    const flat = buildTour(small, 'en')
    expect(flat.layout.plan).toBe('strip')
    expect(flat.layout.rooms.map((r) => r.id)).toEqual(['person', 'screen', 'api'])
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

  it('makes the Portuguese article in front agree with the new name', () => {
    const worker: Actor = { ...actor('jobs', 'worker', 'Bastidores', 'backend/jobs'), name: t('Back office', 'Bastidores') }
    const flow: Flow = {
      ...request,
      actors: [...request.actors, worker],
      steps: [
        { ...step('jobs', 'jobs', 'think', 'x'), text: t('x', 'A tarefa é pega pelos bastidores na fila') },
        { ...step('jobs', 'jobs', 'think', 'x'), text: t('x', 'Os bastidores guardam o resultado; nada fica com os bastidores') },
      ],
    }
    const [edited] = applyEdits([flow], { ...NO_EDITS, actors: { [actorKey(worker)]: { pt: 'Carteiro' } } })
    expect(edited.steps[0].text.pt).toBe('A tarefa é pega pelo carteiro na fila')
    expect(edited.steps[1].text.pt).toBe('O carteiro guarda o resultado; nada fica com o carteiro')
  })

  it('keeps a plain renamed part capital only where it opens a sentence', () => {
    const bot: Actor = { ...actor('bot', 'worker', 'Assistant', 'backend/bot'), name: t('Assistant', 'Assistente de atendimento') }
    const flow: Flow = {
      ...request,
      actors: [...request.actors, bot],
      steps: [
        { ...step('bot', 'bot', 'think', 'x'), text: t('x', 'Assistente de atendimento responde ao cliente') },
        { ...step('bot', 'bot', 'think', 'x'), text: t('x', 'O assistente de atendimento responde. Ao cliente, o Assistente de atendimento responde') },
      ],
    }
    const [edited] = applyEdits([flow], { ...NO_EDITS, actors: { [actorKey(bot)]: { pt: 'Assistente de vendas' } } })
    expect(edited.steps[0].text.pt).toBe('Assistente de vendas responde ao cliente')
    expect(edited.steps[1].text.pt).toBe('O assistente de vendas responde. Ao cliente, o assistente de vendas responde')
  })

  it('keeps the capitals of a sigla or brand typed by hand', () => {
    const api = request.actors.find((a) => a.id === 'api')!
    const flow: Flow = {
      ...request,
      steps: [step('screen', 'api', 'ask', 'The screen asks Leads API'), step('api', 'service', 'call', 'Leads API replies to the service')],
    }
    const [edited] = applyEdits([flow], { ...NO_EDITS, actors: { [actorKey(api)]: { en: 'CRM' } } })
    expect(edited.steps[0].text.en).toBe('The screen asks CRM')
    expect(edited.steps[1].text.en).toBe('CRM replies to the service')
  })

  it('turns the verb after a renamed subject to the new number, and leaves other words alone', () => {
    const screen: Actor = { ...actor('pages', 'screen', 'Páginas', 'frontend/pages'), name: t('Pages', 'Páginas') }
    const flow: Flow = {
      ...request,
      actors: [...request.actors, screen],
      steps: [
        { ...step('pages', 'pages', 'show', 'x'), text: t('x', 'As páginas mostram a lista. As páginas leem a resposta') },
        { ...step('pages', 'pages', 'show', 'x'), text: t('x', 'As páginas de leads somem') },
      ],
    }
    const [edited] = applyEdits([flow], { ...NO_EDITS, actors: { [actorKey(screen)]: { pt: 'Tela de leads' } } })
    expect(edited.steps[0].text.pt).toBe('A tela de leads mostra a lista. A tela de leads lê a resposta')
    expect(edited.steps[1].text.pt).toBe('A tela de leads de leads somem')
  })

  it('carries a rename into the captions, whole words only, unless the caption was rewritten', () => {
    const api = request.actors.find((a) => a.id === 'api')!
    const flow: Flow = {
      ...request,
      steps: [step('screen', 'api', 'ask', 'The screen asks Leads API'), step('api', 'service', 'call', 'Leads APIs are many')],
    }
    const [edited] = applyEdits([flow], { ...NO_EDITS, actors: { [actorKey(api)]: { en: 'Front desk' } } })
    expect(edited.steps[0].text.en).toBe('The screen asks front desk')
    expect(edited.steps[1].text.en).toBe('Leads APIs are many')
    const [kept] = applyEdits([flow], { ...NO_EDITS, actors: { [actorKey(api)]: { en: 'Front desk' } }, steps: { [`${flow.id}#0`]: { en: 'My own words' } } })
    expect(kept.steps[0].text.en).toBe('My own words')
  })

  it('switches to the names from the code for a technical audience, part by part', () => {
    const flow: Flow = {
      ...request,
      actors: request.actors.map((a) =>
        a.id === 'api' ? { ...a, name: t('Front desk', 'Recepção'), technical: t('Backend Routes') } : a.id === 'db' ? { ...a, name: t('Database', 'Banco de dados'), external: 'ext:postgresql', component: null, technical: t('PostgreSQL') } : a,
      ),
      steps: [step('screen', 'api', 'ask', 'The screen asks the Front desk'), { ...step('service', 'db', 'save', 'x'), text: { en: 'Saved in the database', pt: 'Guarda no banco de dados' } }],
    }
    const [code] = applyEdits([flow], { ...NO_EDITS, naming: CODE })
    expect(code.actors.find((a) => a.id === 'api')!.name.pt).toBe('Backend Routes')
    expect(code.steps[0].text.en).toBe('The screen asks the Backend Routes')
    // Mid-sentence, the plain name was lower case; the brand keeps its own capitals.
    expect(code.steps[1].text.pt).toBe('Guarda no PostgreSQL')
    const [mixed] = applyEdits([flow], { ...NO_EDITS, naming: { parts: 'plain', tools: 'plain', services: 'code' } })
    expect(mixed.actors.find((a) => a.id === 'api')!.name.pt).toBe('Recepção')
    expect(mixed.steps[1].text.pt).toBe('Guarda no PostgreSQL')
    const [plain] = applyEdits([flow], NO_EDITS)
    expect(plain.steps[1].text.pt).toBe('Guarda no banco de dados')
    // The code's names win over a rename by hand when they are chosen.
    const api = flow.actors.find((a) => a.id === 'api')!
    const [renamed] = applyEdits([flow], { ...NO_EDITS, actors: { [actorKey(api)]: { pt: 'Balcão' } }, naming: CODE })
    expect(renamed.actors.find((a) => a.id === 'api')!.name.pt).toBe('Backend Routes')
  })

  it('swaps the code names in the notes for the plain ones, and leaves out the AI provider', () => {
    const model: Actor = { ...actor('m', 'llm', 'AI model'), name: t('AI model', 'Modelo de IA'), technical: t('gpt-4o-mini'), external: 'ext:openai', note: { pt: 'gpt-4o-mini, de OpenAI, responde e decide.', en: 'gpt-4o-mini, from OpenAI, answers and decides.' } }
    const flow: Flow = { ...request, actors: [...request.actors, model], steps: [] }
    const [plain] = applyEdits([flow], NO_EDITS)
    const note = plain.actors.find((a) => a.id === 'm')!.note
    expect(note.pt).toBe('Modelo de IA, responde e decide.')
    expect(note.en).toBe('AI model, answers and decides.')
    expect(JSON.stringify(plain.actors.map((x) => x.note))).not.toMatch(/gpt-4o-mini|OpenAI/)
  })

  it('keeps the note of an actor that shows the code name', () => {
    const model: Actor = { ...actor('m', 'llm', 'AI model'), name: t('AI model', 'Modelo de IA'), technical: t('gpt-4o-mini'), external: 'ext:openai', note: { pt: 'gpt-4o-mini, de OpenAI, responde e decide.', en: 'gpt-4o-mini, from OpenAI, answers and decides.' } }
    const flow: Flow = { ...request, actors: [...request.actors, model], steps: [] }
    const [code] = applyEdits([flow], { ...NO_EDITS, naming: CODE })
    const note = code.actors.find((a) => a.id === 'm')!.note
    expect(note.pt).toBe('gpt-4o-mini, de OpenAI, responde e decide.')
    expect(note.en).toBe('gpt-4o-mini, from OpenAI, answers and decides.')
  })

  it('swaps the code names in the notes of tools, databases and queues when they are plain', () => {
    const tool: Actor = { ...actor('tool', 'tool', 'Find leads'), name: t('Find leads'), technical: t('search_leads'), note: { en: 'search_leads looks up the leads.', pt: 'search_leads busca os leads.' } }
    const db: Actor = { ...actor('db', 'database', 'Database', null), name: t('Database', 'Banco de dados'), technical: t('PostgreSQL'), note: { en: 'PostgreSQL keeps the system data.', pt: 'PostgreSQL guarda os dados do sistema.' } }
    const queue: Actor = { ...actor('queue', 'queue', 'Job queue', null), name: t('Job queue', 'Fila de tarefas'), technical: t('BullMQ'), note: { en: 'BullMQ keeps tasks to do later.', pt: 'BullMQ guarda tarefas para serem feitas depois.' } }
    const flow: Flow = { ...request, actors: [...request.actors, tool, queue], steps: [] }
    const flowDb: Flow = { ...flow, actors: flow.actors.map((a) => (a.id === 'db' ? db : a)) }
    const [edited] = applyEdits([flowDb], NO_EDITS)
    const notes = Object.fromEntries(edited.actors.map((a) => [a.id, a.note]))
    expect(notes.db).toEqual({ en: 'Database keeps the system data.', pt: 'Banco de dados guarda os dados do sistema.' })
    expect(notes.tool).toEqual({ en: 'Find leads looks up the leads.', pt: 'Find leads busca os leads.' })
    expect(notes.queue).toEqual({ en: 'Job queue keeps tasks to do later.', pt: 'Fila de tarefas guarda tarefas para serem feitas depois.' })
    expect(JSON.stringify(edited.actors.map((x) => x.note))).not.toMatch(/PostgreSQL|BullMQ|search_leads/)
  })

  it('ignores blank edits', () => {
    const [edited] = applyEdits([request], { ...NO_EDITS, titles: { [request.id]: { pt: '   ' } } })
    expect(edited.title.pt).toBe('Criar leads')
  })
})

describe('renameParts', () => {
  const parts = [
    { id: 'agent', label: { en: 'Support assistant', pt: 'Assistente de atendimento' } },
    { id: 'routes', label: { en: 'Front desk', pt: 'Recepção' } },
  ]
  const summary = { en: 'The support assistant chooses between 3 tools.', pt: 'O assistente de atendimento escolhe entre 3 ferramentas.' }

  it('calls the parts what the presenter renamed them to', () => {
    const edits = { ...NO_EDITS, actors: { agent: { pt: 'Assistente de vendas', en: 'Sales assistant' } } }
    expect(renameParts(summary, parts, edits)).toEqual({ en: 'The sales assistant chooses between 3 tools.', pt: 'O assistente de vendas escolhe entre 3 ferramentas.' })
  })

  it('leaves the text alone without renames', () => {
    expect(renameParts(summary, parts, NO_EDITS)).toEqual(summary)
  })

  it('keeps the capitals of a sigla typed as the new name', () => {
    const edits = { ...NO_EDITS, actors: { agent: { pt: 'CRM', en: 'CRM' } } }
    expect(renameParts(summary, parts, edits)).toEqual({ en: 'The CRM chooses between 3 tools.', pt: 'O CRM escolhe entre 3 ferramentas.' })
  })
})

describe('keepsCase', () => {
  it('is true only when a capital letter follows the first character', () => {
    expect(keepsCase('CRM')).toBe(true)
    expect(keepsCase('WhatsApp')).toBe(true)
    expect(keepsCase('Leads API')).toBe(true)
    expect(keepsCase('Recepção')).toBe(false)
    expect(keepsCase('Front desk')).toBe(false)
    expect(keepsCase('a')).toBe(false)
  })
})
