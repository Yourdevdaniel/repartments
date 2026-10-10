/**
 * Commits as scenes the residents act out, so people who never open GitHub can follow the work:
 *
 * - **A commit** (`commitFlow`): its author walks in and visits each part of the system they
 *   changed, handing over the work; the more a part changed in that commit, the warmer its room's
 *   walls.
 * - **The activity summary** (`activityFlow`): over the commits on screen, which parts change the
 *   most, visited busiest first by whoever keeps the building's logbook.
 *
 * Written for people who don't code: sizes in words (a small, medium or big change) instead of
 * line counts, and the usual commit prefixes (`feat:`, `fix:`…) turned into what they mean.
 * Parts come from the architecture model (`componentOf`), so a commit is told with the same names
 * as the presentation. Pure functions: the screens only fetch commits and hand them over.
 */
import { COMPONENT_KIND } from '../../architecture/flows'
import { componentOf } from '../../shared/components'
import type { Actor, ArchitectureModel, CommitDetail, Component, Flow, FlowStep, Text } from '../../shared/studio'

/** One author plus at most this many parts, so the flat stays a size the camera can follow. */
const MAX_PARTS = 6

type Tally = { actor: Actor; files: number; lines: number; added: number; removed: number; commits: Set<string> }

const OTHER: Text = { en: 'Other files', pt: 'Outros arquivos' }

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`)
const files = (n: number): Text => ({ en: n === 1 ? '1 file' : `${n} files`, pt: n === 1 ? '1 arquivo' : `${n} arquivos` })

/** How big a change feels, from the lines it touched. */
export function sizeOf(lines: number): Text {
  if (lines <= 20) return { en: 'small change', pt: 'mudança pequena' }
  if (lines <= 150) return { en: 'medium change', pt: 'mudança média' }
  return { en: 'big change', pt: 'mudança grande' }
}

/** What the usual commit prefixes mean, said as what the author brings. */
const KINDS: Record<string, Text> = {
  feat: { en: 'something new', pt: 'uma novidade' },
  fix: { en: 'a fix', pt: 'uma correção' },
  docs: { en: 'documentation', pt: 'documentação' },
  refactor: { en: 'a tidy-up', pt: 'uma reorganização' },
  perf: { en: 'a speed-up', pt: 'uma melhoria de velocidade' },
  test: { en: 'more tests', pt: 'mais testes' },
  style: { en: 'a visual touch-up', pt: 'um ajuste visual' },
  security: { en: 'a security fix', pt: 'uma melhoria de segurança' },
  chore: { en: 'some upkeep', pt: 'uma manutenção' },
  build: { en: 'some upkeep', pt: 'uma manutenção' },
  ci: { en: 'some upkeep', pt: 'uma manutenção' },
  revert: { en: 'an undo', pt: 'um desfazer' },
}
const A_CHANGE: Text = { en: 'a change', pt: 'uma mudança' }

/**
 * A commit message read for people: `fix(api): handle empty carts` → kind "a fix", text "Handle
 * empty carts". Messages without a known prefix keep their words and count as "a change".
 */
export function readMessage(headline: string): { kind: Text; text: string } {
  const m = /^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/.exec(headline.trim())
  const kind = m ? KINDS[m[1].toLowerCase()] : undefined
  const text = (kind ? m![2] : headline.trim()) || '…'
  return { kind: kind ?? A_CHANGE, text: text.charAt(0).toUpperCase() + text.slice(1) }
}

/** Who wrote a commit, as their name tag shows it. */
export const authorName = (c: CommitDetail) => (c.author.login ? `@${c.author.login}` : c.author.name || '?')

function partActor(c: Component, i: number): Actor {
  return { id: `part${i}`, name: { en: c.name, pt: c.name }, kind: COMPONENT_KIND[c.layer], component: c.id, external: null, note: c.summary }
}

/** Groups changed files by the part of the system they belong to, busiest first. */
function tally(commits: CommitDetail[], model: ArchitectureModel): Tally[] {
  const byPart = new Map<string, Tally>()
  for (const commit of commits) {
    for (const f of commit.files) {
      const c = componentOf(f.path, model.components)
      const key = c?.id ?? '__other'
      let t = byPart.get(key)
      if (!t) {
        const actor: Actor = c
          ? partActor(c, byPart.size)
          : { id: 'other', name: OTHER, kind: 'external', component: null, external: null, note: { en: 'Files outside the parts the analysis found.', pt: 'Arquivos fora das partes encontradas pela análise.' } }
        t = { actor, files: 0, lines: 0, added: 0, removed: 0, commits: new Set() }
        byPart.set(key, t)
      }
      t.files++
      t.lines += f.additions + f.deletions
      if (f.status === 'added') t.added++
      if (f.status === 'removed') t.removed++
      t.commits.add(commit.sha)
    }
  }
  return [...byPart.values()].sort((a, b) => b.lines - a.lines || b.files - a.files)
}

/** Heat per actor: each part's lines changed against the busiest one. */
function heatOf(parts: Tally[]): Record<string, number> {
  const max = Math.max(1, ...parts.map((p) => p.lines))
  return Object.fromEntries(parts.map((p) => [p.actor.id, p.lines / max]))
}

/** What the author did in one part, in words: new files, files taken out, or a change of some size. */
function visit(t: Tally, who: string, part: Text): Text {
  const n = files(t.files)
  if (t.added === t.files) return { en: `${who} adds ${n.en} to ${part.en}`, pt: `${who} cria ${n.pt} em ${part.pt}` }
  if (t.removed === t.files) return { en: `${who} takes ${n.en} out of ${part.en}`, pt: `${who} tira ${n.pt} de ${part.pt}` }
  const size = sizeOf(t.lines)
  return { en: `${who} works on ${part.en}: a ${size.en} (${n.en})`, pt: `${who} mexe em ${part.pt}: ${size.pt} (${n.pt})` }
}

export function commitFlow(commit: CommitDetail, model: ArchitectureModel, lang: 'en' | 'pt' = 'pt'): { flow: Flow; heat: Record<string, number> } {
  const all = tally([commit], model)
  const parts = all.slice(0, MAX_PARTS)
  const who = authorName(commit)
  const when = new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : 'en', { dateStyle: 'medium' }).format(new Date(commit.date))
  const author: Actor = {
    id: 'author',
    name: { en: who, pt: who },
    kind: 'person',
    component: null,
    external: null,
    note: { en: `${commit.author.name || who}, on ${when}`, pt: `${commit.author.name || who}, em ${when}` },
  }
  const { kind, text } = readMessage(commit.headline)
  const message = clip(text, 90)
  const steps: FlowStep[] = [
    {
      from: 'author',
      to: 'author',
      action: 'think',
      text:
        commit.parents > 1
          ? { en: `${who} brings in work from another branch: “${message}”`, pt: `${who} junta o trabalho de outro ramo: “${message}”` }
          : { en: `${who} brings ${kind.en}: “${message}”`, pt: `${who} traz ${kind.pt}: “${message}”` },
      say: { en: "let's go!", pt: 'mãos à obra!' },
    },
  ]
  for (const t of parts) {
    const size = t.added === t.files ? { en: 'new!', pt: 'novo!' } : t.removed === t.files ? { en: 'out!', pt: 'fora!' } : sizeOf(t.lines)
    steps.push({ from: 'author', to: t.actor.id, action: 'save', text: visit(t, who, t.actor.name), say: size })
  }
  const total = files(commit.files.length)
  const where = all.length === 1 ? { en: 'in 1 part of the system', pt: 'em 1 parte do sistema' } : { en: `in ${all.length} parts of the system`, pt: `em ${all.length} partes do sistema` }
  steps.push({
    from: 'author',
    to: 'author',
    action: 'reply',
    text: { en: `Done! ${total.en} changed ${where.en}`, pt: `Pronto! ${commit.files.length === 1 ? '1 arquivo mudou' : `${commit.files.length} arquivos mudaram`} ${where.pt}` },
    say: { en: 'done!', pt: 'pronto!' },
  })
  const title = clip(text, 60)
  const size = sizeOf(commit.stats.additions + commit.stats.deletions)
  return {
    flow: {
      id: `commit:${commit.sha}`,
      kind: 'commit',
      title: { en: title, pt: title },
      summary: { en: `${who} · ${when} · ${total.en}, a ${size.en}`, pt: `${who} · ${when} · ${total.pt}, ${size.pt}` },
      actors: [author, ...parts.map((p) => p.actor)],
      steps,
    },
    heat: heatOf(parts),
  }
}

/** Which parts the commits on screen touched the most, as one scene. Null when they touched nothing. */
export function activityFlow(commits: CommitDetail[], model: ArchitectureModel): { flow: Flow; heat: Record<string, number> } | null {
  const parts = tally(commits, model).slice(0, MAX_PARTS)
  if (!parts.length) return null
  const keeper: Actor = {
    id: 'keeper',
    name: { en: 'Logbook', pt: 'Diário de obras' },
    kind: 'person',
    component: null,
    external: null,
    note: { en: 'Keeps track of every change made to the building.', pt: 'Anota cada mudança feita no prédio.' },
  }
  const n = commits.length
  const steps: FlowStep[] = [
    {
      from: 'keeper',
      to: 'keeper',
      action: 'think',
      text: {
        en: `Over the last ${n === 1 ? 'commit' : `${n} commits`}, these are the parts that changed the most`,
        pt: `${n === 1 ? 'No último commit' : `Nos últimos ${n} commits`}, estas foram as partes que mais mudaram`,
      },
      say: { en: 'the logbook', pt: 'o diário' },
    },
    ...parts.map((t, i): FlowStep => {
      const k = t.commits.size
      const times: Text = { en: k === 1 ? 'in 1 commit' : `in ${k} commits`, pt: k === 1 ? 'em 1 commit' : `em ${k} commits` }
      return {
        from: 'keeper',
        to: t.actor.id,
        action: 'check',
        text: {
          en: `${i === 0 ? 'The busiest: ' : ''}${t.actor.name.en}, changed ${times.en}`,
          pt: `${i === 0 ? 'A mais movimentada: ' : ''}${t.actor.name.pt}, mexida ${times.pt}`,
        },
        say: { en: `🔥 ${k}`, pt: `🔥 ${k}` },
      }
    }),
  ]
  return {
    flow: {
      id: 'activity',
      kind: 'activity',
      title: { en: 'Where the work happens', pt: 'Onde o trabalho acontece' },
      summary: {
        en: 'The parts of the system that changed the most in these commits: the warmer the room, the more it changed.',
        pt: 'As partes do sistema que mais mudaram nestes commits: quanto mais quente o cômodo, mais ele mudou.',
      },
      actors: [keeper, ...parts.map((p) => p.actor)],
      steps,
    },
    heat: heatOf(parts),
  }
}

/** A steady colour per author, for the floor signs. */
export function authorColor(name: string): string {
  const palette = ['#2f8fe6', '#3f9c8f', '#a855f7', '#f2a65a', '#e2554f', '#37814a', '#7c5cff', '#d46eb3']
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return palette[h % palette.length]
}
