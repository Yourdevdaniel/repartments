/**
 * The presentation's opening scene: before watching any request or agent at work, a guide walks
 * the audience through the building and each main part says, in one sentence, what it does. It is
 * built from the model (not by the analysis), so it is always there, and it is edited like any
 * other scene.
 */
import { COMPONENT_KIND } from '../../architecture/flows'
import type { Actor, ArchitectureModel, Component, Flow, FlowStep, Layer, Text } from '../../shared/studio'

/** The order a visitor meets the parts: from what people see down to where the data sleeps. */
const ORDER: Layer[] = ['interface', 'api', 'security', 'logic', 'ai', 'jobs', 'data']
/** Which layers make the cut first when there are more than fit. */
const PRIORITY: Layer[] = ['interface', 'api', 'logic', 'ai', 'data', 'security', 'jobs']

/** The guide plus at most this many parts. */
const MAX_PARTS = 6

const WORD: Record<Layer, Text> = {
  interface: { en: 'the screens', pt: 'as telas' },
  api: { en: 'the API', pt: 'a API' },
  security: { en: 'security', pt: 'a segurança' },
  logic: { en: 'the rules', pt: 'as regras' },
  ai: { en: 'the AI', pt: 'a IA' },
  jobs: { en: 'the jobs', pt: 'as tarefas' },
  data: { en: 'the data', pt: 'os dados' },
  shared: { en: 'shared', pt: 'compartilhado' },
  infra: { en: 'setup', pt: 'configuração' },
  tests: { en: 'tests', pt: 'testes' },
}

/** The main parts, one or two per layer (the biggest first), in visiting order. */
function mainParts(components: Component[]): Component[] {
  const picked: Component[] = []
  for (const pass of [1, 2]) {
    for (const layer of PRIORITY) {
      const inLayer = components.filter((c) => c.layer === layer).sort((a, b) => b.files - a.files || a.id.localeCompare(b.id))
      const c = inLayer[pass - 1]
      if (c && picked.length < MAX_PARTS) picked.push(c)
    }
  }
  return picked.sort((a, b) => ORDER.indexOf(a.layer) - ORDER.indexOf(b.layer))
}

export function introFlow(model: ArchitectureModel): Flow | null {
  const parts = mainParts(model.components)
  if (!parts.length) return null
  const guide: Actor = {
    id: 'guide',
    name: { en: 'Guide', pt: 'Guia' },
    kind: 'person',
    component: null,
    external: null,
    note: { en: 'Shows the visitors around.', pt: 'Mostra o prédio para quem visita.' },
  }
  const actors: Actor[] = [
    guide,
    ...parts.map((c, i): Actor => ({ id: `part${i}`, name: { en: c.name, pt: c.name }, kind: COMPONENT_KIND[c.layer], component: c.id, external: null, note: c.summary })),
  ]
  const n = parts.length
  const steps: FlowStep[] = [
    {
      from: 'guide',
      to: 'guide',
      action: 'think',
      text: {
        en: `Welcome to ${model.repo.name}: let's meet the ${n} main parts that run it`,
        pt: `Bem-vindo ao ${model.repo.name}: vamos conhecer as ${n} partes principais que fazem ele funcionar`,
      },
      say: { en: 'welcome!', pt: 'bem-vindo!' },
    },
    ...parts.map((c, i): FlowStep => ({
      from: 'guide',
      to: `part${i}`,
      action: 'ask',
      text: { en: `${c.name}: ${c.summary.en}`, pt: `${c.name}: ${c.summary.pt}` },
      say: WORD[c.layer],
    })),
    {
      from: 'guide',
      to: 'guide',
      action: 'reply',
      text: { en: 'Now watch each of them at work, floor by floor', pt: 'Agora veja cada uma trabalhando, andar por andar' },
      say: { en: "let's go!", pt: 'vamos lá!' },
    },
  ]
  return {
    id: 'intro',
    kind: 'overview',
    title: { en: 'Meet the system', pt: 'Conheça o sistema' },
    summary: model.summary,
    actors,
    steps,
  }
}

/** Every scene of the presentation, in order: the opening tour, then what the analysis wrote. */
export function scriptFlows(model: ArchitectureModel): Flow[] {
  const intro = introFlow(model)
  return intro ? [intro, ...model.flows] : model.flows
}
