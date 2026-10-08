/**
 * The author's script: a `repartments.json` at the repo's root (or imported in the studio) where whoever
 * knows the system says what it is, what its parts are called and which scenes to show. People
 * usually have their own AI write it from the prompt the studio offers (`src/studio/authorPrompt.ts`);
 * the studio itself never calls one (ADR 0003). The format is described in `docs/roteiro.md` and in
 * the JSON Schema at `public/schema/repartments-1.json`.
 *
 * The file is untrusted text. It is only ever `JSON.parse`d, every field is checked and copied one by
 * one, texts are cut to the presentation's limits, files it cites are looked up in the repo, and what
 * doesn't check out is left out with a note (`problems`) instead of failing the whole file. Only a
 * file that isn't JSON at all, or is made for a newer version of the format, is refused.
 */
import type { Actor, ActorKind, ArchitectureModel, AuthoredInfo, AuthoredProblem, Component, Flow, FlowStep, StepAction, Text } from '../shared/studio'
import { componentOf } from '../shared/components'
import type { Feature } from './features'
import { COMPONENT_KIND, featuresScene, MAX_ACTORS, MAX_FLOWS, MAX_STEPS } from './flows'
import { clip } from './text'

/** The file's name, at the repo's root. */
export const AUTHORED_FILE = 'repartments.json'
/** The version of the format this studio reads; a file with a higher one is refused. */
export const AUTHORED_VERSION = 1
/** Where the JSON Schema is published, for editors to check the file as it is written. */
export const SCHEMA_URL = 'https://raw.githubusercontent.com/Yourdevdaniel/repartments/main/public/schema/repartments-1.json'

/** A bigger file is not a script. */
const MAX_BYTES = 200 * 1024
const MAX_PARTS = 16
const MAX_FEATURES = 6
/** How long each kind of text may be, as the presentation shows them. */
const LIMIT = { about: 300, name: 28, feature: 48, does: 120, title: 60, summary: 160, step: 120, say: 24 }

const ROLES: ActorKind[] = ['person', 'screen', 'api', 'security', 'service', 'agent', 'llm', 'tool', 'worker', 'queue', 'database', 'cache', 'external']
const ACTIONS: StepAction[] = ['ask', 'check', 'call', 'fetch', 'save', 'think', 'decide', 'use-tool', 'reply', 'show', 'queue', 'send']
const HOW: Feature['via'][] = ['button', 'command', 'readme']

/** The script, checked and cut to size, ready to lay over a model. */
export type AuthoredScript = {
  version: number
  commit: string | null
  writtenAt: string | null
  about: Text | null
  parts: { id: string; name: Text; does: Text | null; role: ActorKind | null; paths: string[] }[]
  features: Feature[]
  scenes: Flow[]
  /** Which part of `parts` each cast member stands for, by `<scene id>:<cast id>`. */
  castParts: Map<string, string>
}

export type AuthoredResult = {
  /** Null when the file can't be used at all (the reason is the first problem). */
  script: AuthoredScript | null
  problems: AuthoredProblem[]
  /** Files cited that exist in the repo, and those that don't or couldn't be checked. */
  verified: number
  unverified: number
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const say = (pt: string, en: string): Text => ({ pt, en })

/** The JSON in what was pasted or saved: the whole text, or the first ```json block in it. */
export function jsonOf(text: string): string {
  const t = text.replace(/^﻿/, '').trim()
  if (t.startsWith('{')) return t
  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n\s*```/i.exec(t)
  if (fenced) return fenced[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  return start >= 0 && end > start ? t.slice(start, end + 1) : t
}

/** A text from the file, in both languages: a plain string goes to both, `{pt, en}` fills the one missing from the other. */
function textOf(v: unknown, max: number): Text | null {
  const clean = (s: unknown) => (typeof s === 'string' ? clip(s.replace(/[\u0000-\u001f\u007f]/g, ' '), max) : '')
  if (typeof v === 'string') {
    const s = clean(v)
    return s ? { pt: s, en: s } : null
  }
  if (!isObj(v)) return null
  const pt = clean(v.pt)
  const en = clean(v.en)
  if (!pt && !en) return null
  return { pt: pt || en, en: en || pt }
}

/** An id the file uses to point at a part or a cast member. */
function idOf(v: unknown): string | null {
  return typeof v === 'string' && /^[\w.-]{1,40}$/.test(v.trim()) ? v.trim() : null
}

export function parseAuthored(text: string, paths: ReadonlySet<string> | null): AuthoredResult {
  const problems: AuthoredProblem[] = []
  const warn = (where: string, message: Text) => problems.push({ where, level: 'warning', message })
  const refuse = (message: Text): AuthoredResult => ({ script: null, problems: [{ where: '', level: 'error', message }], verified: 0, unverified: 0 })
  if (text.length > MAX_BYTES) return refuse(say('O arquivo passa de 200 KB: não parece um roteiro.', 'The file is over 200 KB: it does not look like a script.'))

  let root: unknown
  try {
    root = JSON.parse(jsonOf(text))
  } catch (err) {
    return refuse(say(`Não é um JSON válido (${(err as Error).message}).`, `It is not valid JSON (${(err as Error).message}).`))
  }
  if (!isObj(root)) return refuse(say('O arquivo precisa ser um objeto JSON, entre { }.', 'The file must be a JSON object, between { }.'))
  const version = typeof root.version === 'number' ? root.version : 1
  if (typeof root.version !== 'number') warn('version', say('Sem "version": lido como versão 1.', 'No "version": read as version 1.'))
  if (version > AUTHORED_VERSION || version < 1 || !Number.isInteger(version))
    return refuse(say(`Feito para a versão ${version} do formato; este estúdio lê a versão ${AUTHORED_VERSION}.`, `Made for version ${version} of the format; this studio reads version ${AUTHORED_VERSION}.`))

  let verified = 0
  let unverified = 0
  /** A path the file cites, made relative and looked up in the repo; null if it can't be a repo path. */
  const pathOf = (v: unknown, where: string, folder = false): string | null => {
    if (typeof v !== 'string' || !v.trim()) return null
    const p = v.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
    if (!p || p.startsWith('/') || /^[a-z]:/i.test(p) || p.split('/').includes('..')) {
      warn(where, say(`Caminho fora do repositório ignorado: "${clip(p, 60)}".`, `Path outside the repo ignored: "${clip(p, 60)}".`))
      return null
    }
    if (!paths) {
      unverified++
      return p
    }
    const found = paths.has(p) || (folder && [...paths].some((x) => x.startsWith(p + '/')))
    if (found) verified++
    else {
      unverified++
      warn(where, say(`O arquivo "${clip(p, 60)}" não existe no repositório.`, `The file "${clip(p, 60)}" is not in the repo.`))
    }
    return found ? p : null
  }
  const refOf = (o: Obj, where: string): { file: string; line: number } | null => {
    const file = pathOf(o.file, where)
    if (!file) return null
    const line = typeof o.line === 'number' && Number.isInteger(o.line) && o.line > 0 ? o.line : 1
    return { file, line }
  }
  const list = (v: unknown, where: string, max: number): unknown[] => {
    if (v === undefined) return []
    if (!Array.isArray(v)) {
      warn(where, say(`"${where}" precisa ser uma lista.`, `"${where}" must be a list.`))
      return []
    }
    if (v.length > max) warn(where, say(`Só os primeiros ${max} itens de "${where}" entram.`, `Only the first ${max} items of "${where}" are used.`))
    return v.slice(0, max)
  }

  const parts: AuthoredScript['parts'] = []
  list(root.parts, 'parts', MAX_PARTS).forEach((raw, i) => {
    const where = `parts[${i}]`
    if (!isObj(raw)) return warn(where, say('Parte ignorada: não é um objeto.', 'Part left out: not an object.'))
    const id = idOf(raw.id)
    const name = textOf(raw.name, LIMIT.name)
    if (!id || !name) return warn(where, say('Parte ignorada: precisa de "id" e "name".', 'Part left out: it needs an "id" and a "name".'))
    if (parts.some((p) => p.id === id)) return warn(where, say(`Parte ignorada: o id "${id}" se repete.`, `Part left out: the id "${id}" is repeated.`))
    const role = typeof raw.role === 'string' && ROLES.includes(raw.role as ActorKind) ? (raw.role as ActorKind) : null
    if (raw.role !== undefined && !role) warn(`${where}.role`, say(`Papel desconhecido "${String(raw.role)}".`, `Unknown role "${String(raw.role)}".`))
    const found = list(raw.paths, `${where}.paths`, 20)
      .map((p, k) => pathOf(p, `${where}.paths[${k}]`, true))
      .filter((p): p is string => p !== null)
    parts.push({ id, name, does: textOf(raw.does, LIMIT.does), role, paths: found })
  })

  const features: Feature[] = []
  list(root.features, 'features', MAX_FEATURES).forEach((raw, i) => {
    const where = `features[${i}]`
    if (!isObj(raw)) return warn(where, say('Funcionalidade ignorada: não é um objeto.', 'Feature left out: not an object.'))
    const label = textOf(raw.name, LIMIT.feature)
    const detail = textOf(raw.does, LIMIT.does)
    if (!label && !detail) return warn(where, say('Funcionalidade ignorada: precisa de "name" ou "does".', 'Feature left out: it needs a "name" or "does".'))
    const via = HOW.includes(raw.how as Feature['via']) ? (raw.how as Feature['via']) : 'readme'
    features.push({ label: label?.pt ?? null, detail: detail?.pt ?? null, via, ref: refOf(raw, where), text: { label, detail } })
  })

  const scenes: Flow[] = []
  const castParts = new Map<string, string>()
  list(root.scenes, 'scenes', MAX_FLOWS).forEach((raw, i) => {
    const where = `scenes[${i}]`
    if (!isObj(raw)) return warn(where, say('Cena ignorada: não é um objeto.', 'Scene left out: not an object.'))
    const title = textOf(raw.title, LIMIT.title)
    if (!title) return warn(where, say('Cena ignorada: precisa de "title".', 'Scene left out: it needs a "title".'))
    const actors: Actor[] = []
    list(raw.cast, `${where}.cast`, MAX_ACTORS).forEach((c, k) => {
      const at = `${where}.cast[${k}]`
      if (!isObj(c)) return warn(at, say('Personagem ignorado: não é um objeto.', 'Character left out: not an object.'))
      const id = idOf(c.id)
      const part = idOf(c.part) ? parts.find((p) => p.id === c.part) : undefined
      if (c.part !== undefined && !part) warn(`${at}.part`, say(`A parte "${String(c.part)}" não está em "parts".`, `The part "${String(c.part)}" is not in "parts".`))
      const name = textOf(c.name, LIMIT.name) ?? part?.name ?? null
      if (!id || !name) return warn(at, say('Personagem ignorado: precisa de "id" e "name" (ou "part").', 'Character left out: it needs an "id" and a "name" (or a "part").'))
      if (actors.some((a) => a.id === id)) return warn(at, say(`Personagem ignorado: o id "${id}" se repete.`, `Character left out: the id "${id}" is repeated.`))
      const role = typeof c.role === 'string' && ROLES.includes(c.role as ActorKind) ? (c.role as ActorKind) : (part?.role ?? 'service')
      if (c.role !== undefined && !ROLES.includes(c.role as ActorKind)) warn(`${at}.role`, say(`Papel desconhecido "${String(c.role)}": vira "service".`, `Unknown role "${String(c.role)}": it becomes "service".`))
      actors.push({ id, name, kind: role, component: null, external: null, note: textOf(c.does, LIMIT.does) ?? part?.does ?? { pt: '', en: '' }, ...(part ? { technical: { pt: part.id, en: part.id } } : {}) })
      if (part) castParts.set(`author-${i + 1}:${id}`, part.id)
    })
    const steps: FlowStep[] = []
    list(raw.steps, `${where}.steps`, MAX_STEPS).forEach((s, k) => {
      const at = `${where}.steps[${k}]`
      if (!isObj(s)) return warn(at, say('Passo ignorado: não é um objeto.', 'Step left out: not an object.'))
      const from = actors.find((a) => a.id === s.from)
      const to = actors.find((a) => a.id === (s.to ?? s.from))
      const text = textOf(s.text, LIMIT.step)
      if (!from || !to || !text) return warn(at, say('Passo ignorado: "from" e "to" precisam ser ids do elenco, e "text" é obrigatório.', 'Step left out: "from" and "to" must be cast ids, and "text" is required.'))
      const action = ACTIONS.includes(s.action as StepAction) ? (s.action as StepAction) : 'call'
      if (!ACTIONS.includes(s.action as StepAction)) warn(`${at}.action`, say(`Ação desconhecida "${String(s.action)}": vira "call".`, `Unknown action "${String(s.action)}": it becomes "call".`))
      const ref = refOf(s, at)
      const bubble = textOf(s.say, LIMIT.say)
      steps.push({ from: from.id, to: to.id, action, text, ...(bubble ? { say: bubble } : {}), ...(ref ? { ref } : {}) })
    })
    if (!steps.length) return warn(where, say('Cena ignorada: nenhum passo válido.', 'Scene left out: no valid step.'))
    scenes.push({ id: `author-${i + 1}`, kind: 'authored', title, summary: textOf(raw.summary, LIMIT.summary) ?? title, actors, steps })
  })

  const commit = typeof root.commit === 'string' && /^[0-9a-f]{4,40}$/i.test(root.commit.trim()) ? root.commit.trim().toLowerCase() : null
  const writtenAt = typeof root.writtenAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(root.writtenAt) ? root.writtenAt.slice(0, 10) : null
  return {
    script: { version, commit, writtenAt, about: textOf(root.about, LIMIT.about), parts, features, scenes, castParts },
    problems,
    verified,
    unverified,
  }
}

/** The component a part of the script covers: the one owning its first path that belongs to one. */
function componentFor(paths: string[], components: Component[]): Component | null {
  for (const p of paths) {
    const exact = components.find((c) => c.path === p && !c.direct)
    if (exact) return exact
    const owner = componentOf(p.includes('.') ? p : `${p}/x`, components)
    if (owner) return owner
  }
  return null
}

/**
 * The model with the author's script laid over it: their sentence about the system, their names for
 * the parts, their scenes (with "What you can do" first when they listed features). The scenes read
 * from the code are kept in `automatic`. A script without scenes or features keeps those scenes.
 */
export function applyAuthored(model: ArchitectureModel, result: AuthoredResult, source: AuthoredInfo['source']): ArchitectureModel {
  const base = model.automatic ?? model.flows
  const info: AuthoredInfo = {
    source,
    commit: result.script?.commit ?? null,
    writtenAt: result.script?.writtenAt ?? null,
    stale: false,
    verified: result.verified,
    unverified: result.unverified,
    problems: result.problems,
  }
  const script = result.script
  if (!script) return { ...model, flows: base, automatic: undefined, authored: info }
  const sha = model.repo.sha.toLowerCase()
  info.stale = !!script.commit && !!sha && !sha.startsWith(script.commit) && !script.commit.startsWith(sha)

  const covered = new Map<string, Component>()
  for (const part of script.parts) {
    const c = componentFor(part.paths, model.components)
    if (c) covered.set(part.id, c)
  }
  const components = model.components.map((c) => {
    const part = script.parts.find((p) => covered.get(p.id)?.id === c.id)
    return part ? { ...c, label: part.name, ...(part.does ? { summary: part.does } : {}) } : c
  })

  const scenes = script.scenes.map((flow) => {
    // A component stands behind one character per scene: two parts of the script can fall in the same folder.
    const taken = new Set<string>()
    return {
      ...flow,
      actors: flow.actors.map((a) => {
        const partId = script.castParts.get(`${flow.id}:${a.id}`)
        const comp = partId ? covered.get(partId) : undefined
        if (!comp || taken.has(comp.id)) return a
        taken.add(comp.id)
        return { ...a, component: comp.id, technical: { pt: comp.name, en: comp.name } }
      }),
    }
  })
  const told = script.features.length ? featuresScene(components, script.features) : null
  const flows = [...(told ? [told] : []), ...scenes].slice(0, MAX_FLOWS)
  const replaced = flows.length > 0
  return {
    ...model,
    summary: script.about ?? model.summary,
    components,
    flows: replaced ? flows : base,
    automatic: replaced ? base : undefined,
    authored: info,
  }
}

/** The kind of character a component plays, as the script names it. */
function roleOf(c: Component): ActorKind {
  return COMPONENT_KIND[c.layer]
}

/**
 * A `repartments.json` from what the studio shows now: the model's parts and the given scenes (with
 * the presenter's edits). It is a starting point for the author, or their AI, to correct and complete,
 * and saving the edited script back into the repo makes the edits travel with the code.
 */
export function exportAuthored(model: ArchitectureModel, flows: Flow[], today = new Date().toISOString().slice(0, 10)): string {
  const ids = new Map<string, string>()
  const partId = (c: Component) => {
    if (!ids.has(c.id)) {
      const base = (c.path || 'root').replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'root'
      let id = base.slice(0, 36)
      for (let n = 2; [...ids.values()].includes(id); n++) id = `${base.slice(0, 33)}-${n}`
      ids.set(c.id, id)
    }
    return ids.get(c.id)!
  }
  const visible = model.components.filter((c) => c.layer !== 'tests')
  const doc = {
    $schema: SCHEMA_URL,
    version: AUTHORED_VERSION,
    commit: model.repo.sha ? model.repo.sha.slice(0, 7) : undefined,
    writtenAt: today,
    about: model.summary,
    parts: visible.map((c) => ({ id: partId(c), name: c.label ?? { pt: c.name, en: c.name }, does: c.summary, role: roleOf(c), paths: [c.path || '.'].filter((p) => p !== '.') })),
    scenes: flows
      .filter((f) => f.kind !== 'commit' && f.kind !== 'activity')
      .slice(0, MAX_FLOWS)
      .map((f) => ({
        title: f.title,
        summary: f.summary,
        cast: f.actors.map((a) => {
          const comp = a.component ? model.components.find((c) => c.id === a.component) : undefined
          return { id: a.id.replace(/[^\w.-]+/g, '-'), name: a.name, role: a.kind, ...(comp ? { part: partId(comp) } : {}), does: a.note }
        }),
        steps: f.steps.map((s) => ({
          from: s.from.replace(/[^\w.-]+/g, '-'),
          to: s.to.replace(/[^\w.-]+/g, '-'),
          action: s.action,
          text: s.text,
          ...(s.say ? { say: s.say } : {}),
          ...(s.ref ? { file: s.ref.file, line: s.ref.line } : {}),
        })),
      })),
  }
  return JSON.stringify(doc, null, 2) + '\n'
}
