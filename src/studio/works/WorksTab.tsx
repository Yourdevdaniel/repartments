/**
 * The works: the repo's commits as a building where every floor is one commit, newest on top, and
 * the ground floor is the logbook of which parts change the most. Step inside a floor and the
 * author walks in and visits each part of the system they changed; the warmer a room, the more it
 * changed. "Present" plays them in order, oldest to newest, like a time-lapse of the work.
 *
 * Reading a commit's files is one GitHub call each, so a building holds 12 commits at a time, with
 * buttons to walk to older or newer ones.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildTour } from '../../scene/tour'
import type { ArchitectureModel, Branch, Churn, ChurnFile, CommitDetail, CommitFilters, CommitSummary, Flow, StudioErrorCode } from '../../shared/studio'
import { glass } from '../../ui/kit'
import type { L, Lang } from '../../ui/roles'
import { api, StudioApiError } from '../api'
import { Avatar } from '../lib/Avatar'
import { errorText } from '../lib/messages'
import { relativeTime } from '../lib/time'
import { Theater } from '../present/Theater'
import { activityFlow, authorColor, authorName, commitFlow } from './scenes'

/** Commits per building: one GitHub call each to read what they changed. */
const PER_BUILDING = 12
/** How many detail calls run at once. */
const AT_ONCE = 4

const w = {
  floors: { en: 'Commits', pt: 'Commits' },
  floorsLead: { en: 'Each floor is a commit, the newest on top. Step inside to watch the author at work.', pt: 'Cada andar é um commit, o mais novo no topo. Entre para ver o autor trabalhando.' },
  sceneOf: (n: number, of: number): L => ({ en: `Floor ${n} of ${of}`, pt: `Andar ${n} de ${of}` }),
  branch: { en: 'Branch', pt: 'Branch' },
  author: { en: 'Author', pt: 'Autor' },
  anyone: { en: 'Everyone', pt: 'Todos' },
  period: { en: 'Period', pt: 'Período' },
  periods: {
    all: { en: 'Any time', pt: 'Qualquer data' },
    7: { en: 'Last 7 days', pt: 'Últimos 7 dias' },
    30: { en: 'Last 30 days', pt: 'Últimos 30 dias' },
    90: { en: 'Last 90 days', pt: 'Últimos 90 dias' },
  } as Record<string, L>,
  older: { en: 'Older commits', pt: 'Commits mais antigos' },
  newer: { en: 'Newer commits', pt: 'Commits mais novos' },
  loading: (n: number, of: number): L => ({ en: `Reading the commits… ${n}/${of}`, pt: `Lendo os commits… ${n}/${of}` }),
  none: { en: 'No commits with these filters.', pt: 'Nenhum commit com estes filtros.' },
  onGitHub: { en: 'See the code on GitHub', pt: 'Ver o código no GitHub' },
  retry: { en: 'Try again', pt: 'Tentar de novo' },
  saved: { en: 'The commits saved with this presentation.', pt: 'Os commits salvos com esta apresentação.' },
  note: {
    en: 'Parts come from the architecture reading; files outside them show up as "Other files".',
    pt: 'As partes vêm da leitura da arquitetura; arquivos fora delas aparecem como "Outros arquivos".',
  },
}

type Period = 'all' | '7' | '30' | '90'

function sinceFor(period: Period): string | undefined {
  if (period === 'all') return undefined
  const d = new Date(Date.now() - Number(period) * 86_400_000)
  return d.toISOString().slice(0, 10)
}

/** Runs `fn` over `items`, at most `limit` at a time, reporting each one done. */
async function each<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>, done: () => void): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
      done()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** What the loaded commits add up to, per file: the map's heat overlay reuses it, no extra calls. */
export function churnOf(details: CommitDetail[], filters: CommitFilters): Churn {
  const byPath = new Map<string, ChurnFile>()
  for (const d of details)
    for (const f of d.files) {
      const e = byPath.get(f.path) ?? { path: f.path, commits: 0, additions: 0, deletions: 0 }
      e.commits++
      e.additions += f.additions
      e.deletions += f.deletions
      byPath.set(f.path, e)
    }
  return { files: [...byPath.values()].sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions)), commits: details.length, filters }
}

type Load = { state: 'loading'; done: number; total: number } | { state: 'ready' } | { state: 'failed'; error: StudioErrorCode }

export function WorksTab({
  owner,
  repo,
  defaultBranch,
  model,
  lang,
  preloaded,
  onCommit,
  onChurn,
  onLoaded,
}: {
  owner: string
  repo: string
  defaultBranch: string
  model: ArchitectureModel
  lang: Lang
  /** The commit whose floor is on screen (null on the building): the map highlights its parts. */
  onCommit: (commit: CommitDetail | null) => void
  /** What the commits on screen add up to, for the map's heat overlay. */
  onChurn: (churn: Churn | null) => void
  /** Commits saved with an opened presentation: shown as they are, nothing is fetched. */
  preloaded: CommitDetail[] | null
  /** The commits on screen, so "Save presentation" can take them along. */
  onLoaded: (commits: CommitDetail[]) => void
}) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [branch, setBranch] = useState('')
  const [author, setAuthor] = useState('')
  const [period, setPeriod] = useState<Period>('all')
  const [offset, setOffset] = useState(0)
  const [hasOlder, setHasOlder] = useState(false)
  const [details, setDetails] = useState<CommitDetail[]>(preloaded ?? [])
  const [authors, setAuthors] = useState<string[]>([])
  const [load, setLoad] = useState<Load>(preloaded ? { state: 'ready' } : { state: 'loading', done: 0, total: PER_BUILDING })
  const [retry, setRetry] = useState(0)

  const filters = useMemo<CommitFilters>(
    () => ({ ...(branch ? { branch } : {}), ...(author ? { author } : {}), ...(sinceFor(period) ? { since: sinceFor(period) } : {}) }),
    [branch, author, period],
  )

  useEffect(() => {
    if (preloaded) return
    const ctrl = new AbortController()
    api
      .branches(owner, repo, ctrl.signal)
      .then(setBranches)
      .catch(() => undefined)
    return () => ctrl.abort()
  }, [owner, repo, preloaded])

  // New filters start again from the newest commits.
  useEffect(() => setOffset(0), [filters])

  useEffect(() => {
    if (preloaded) return
    const ctrl = new AbortController()
    setLoad({ state: 'loading', done: 0, total: PER_BUILDING })
    ;(async () => {
      // GitHub pages hold 40 commits; a building of 12 may straddle two pages.
      const per = 40
      const first = Math.floor(offset / per) + 1
      const summaries: CommitSummary[] = []
      let more = false
      for (let page = first; summaries.length < (offset % per) + PER_BUILDING + 1; page++) {
        const { commits, next } = await api.commits(owner, repo, filters, page, ctrl.signal)
        summaries.push(...commits)
        more = next !== null
        if (!next) break
      }
      const window = summaries.slice(offset % per, (offset % per) + PER_BUILDING)
      setHasOlder(summaries.length > (offset % per) + PER_BUILDING || more)
      setAuthors((prev) => [...new Set([...prev, ...window.map((c) => c.author.login ?? c.author.name).filter(Boolean)])].sort())
      let done = 0
      setLoad({ state: 'loading', done, total: window.length })
      const read = await each(
        window,
        AT_ONCE,
        (c) => api.commit(owner, repo, c.sha, ctrl.signal),
        () => setLoad({ state: 'loading', done: ++done, total: window.length }),
      )
      setDetails(read)
      setLoad({ state: 'ready' })
    })().catch((err: Error) => {
      if (err.name === 'AbortError') return
      setLoad({ state: 'failed', error: err instanceof StudioApiError ? err.code : 'unavailable' })
    })
    return () => ctrl.abort()
  }, [owner, repo, filters, offset, retry, preloaded])

  useEffect(() => {
    onChurn(details.length ? churnOf(details, filters) : null)
    onLoaded(details)
  }, [details, filters, onChurn, onLoaded])

  // Ground floor: the logbook; then the commits, oldest at the bottom, newest at the top.
  const scenes = useMemo(() => {
    const out: { flow: Flow; heat: Record<string, number>; label?: { name: string; color: string }; commit?: CommitDetail }[] = []
    const summary = activityFlow(details, model)
    if (summary) out.push(summary)
    for (const d of [...details].reverse()) {
      const name = authorName(d)
      out.push({ ...commitFlow(d, model, lang), label: { name, color: authorColor(name) }, commit: d })
    }
    return out
  }, [details, model, lang])
  const flows = useMemo(() => scenes.map((s) => s.flow), [scenes])
  const flats = useMemo(() => scenes.map((s) => buildTour(s.flow, lang, { heat: s.heat, label: s.label })), [scenes, lang])

  const onScene = useCallback((id: string | null) => onCommit(scenes.find((s) => s.flow.id === id)?.commit ?? null), [scenes, onCommit])

  const field = 'h-9 min-w-0 rounded-full border border-ink/10 bg-white px-3 text-[13px] font-semibold text-ink outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30'

  return (
    <div className="flex h-full flex-col">
      {preloaded ? (
        <p className="px-3 pb-2 text-xs font-semibold text-ink-soft md:px-4">{w.saved[lang]}</p>
      ) : (
      <div className="flex flex-wrap items-end gap-2 px-3 pb-2 md:px-4">
        <label className="grid gap-1 text-[11px] font-bold text-ink-soft">
          {w.branch[lang]}
          <select className={field} value={branch || defaultBranch} onChange={(e) => setBranch(e.target.value === defaultBranch ? '' : e.target.value)}>
            {[defaultBranch, ...branches.map((b) => b.name).filter((n) => n !== defaultBranch)].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-bold text-ink-soft">
          {w.author[lang]}
          <select className={field} value={author} onChange={(e) => setAuthor(e.target.value)}>
            <option value="">{w.anyone[lang]}</option>
            {authors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-bold text-ink-soft">
          {w.period[lang]}
          <select className={field} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            {(['all', '7', '30', '90'] as const).map((p) => (
              <option key={p} value={p}>
                {w.periods[p][lang]}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={offset === 0 || load.state === 'loading'}
            onClick={() => setOffset((o) => Math.max(0, o - PER_BUILDING))}
            className="h-9 rounded-full bg-white/80 px-3.5 text-xs font-extrabold text-ink transition-colors hover:bg-white disabled:opacity-40"
          >
            ← {w.newer[lang]}
          </button>
          <button
            type="button"
            disabled={!hasOlder || load.state === 'loading'}
            onClick={() => setOffset((o) => o + PER_BUILDING)}
            className="h-9 rounded-full bg-white/80 px-3.5 text-xs font-extrabold text-ink transition-colors hover:bg-white disabled:opacity-40"
          >
            {w.older[lang]} →
          </button>
        </div>
      </div>
      )}
      <div className="relative min-h-0 flex-1">
        {load.state === 'ready' && (
          <Theater
            key={`${offset}|${JSON.stringify(filters)}`}
            flows={flows}
            flats={flats}
            owner={owner}
            lang={lang}
            sceneOf={w.sceneOf}
            intro={<p className="text-sm leading-snug text-ink-soft">{w.floorsLead[lang]}</p>}
            listTitle={w.floors}
            listLead={{ en: '', pt: '' }}
            sceneExtra={(flow) => {
              const c = scenes.find((s) => s.flow.id === flow.id)?.commit
              if (!c) return null
              return (
                <div className="mt-3 rounded-2xl bg-white/70 p-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={c.author.name} src={c.author.avatarUrl} size={28} />
                    <div className="min-w-0 text-[13px] leading-tight">
                      <p className="truncate font-extrabold">{c.author.name || authorName(c)}</p>
                      <p className="text-ink-soft">{relativeTime(c.date, new Date(), lang)}</p>
                    </div>
                    <span className="ml-auto font-mono text-[11px] text-ink-soft">{c.sha.slice(0, 7)}</span>
                  </div>
                  {c.body && <p className="mt-2 line-clamp-5 text-[13px] leading-snug whitespace-pre-line text-ink-soft">{c.body}</p>}
                  {c.url.startsWith('https://github.com/') && (<a href={c.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-extrabold text-accent hover:underline">
                    {w.onGitHub[lang]} ↗
                  </a>)}
                </div>
              )
            }}
            note={w.note}
            empty={w.none}
            onScene={onScene}
          />
        )}
        {load.state === 'loading' && (
          <div className="grid h-full place-items-center p-4">
            <div className={`${glass} w-[min(24rem,100%)] p-6 text-center`} aria-live="polite">
              <p className="animate-bounce text-4xl motion-reduce:animate-none" aria-hidden="true">🏗️</p>
              <p className="mt-3 font-extrabold">{w.loading(load.done, load.total)[lang]}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink/10">
                <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(load.done / Math.max(1, load.total)) * 100}%` }} />
              </div>
            </div>
          </div>
        )}
        {load.state === 'failed' && (
          <div className="grid h-full place-items-center p-4">
            <div className={`${glass} w-[min(26rem,100%)] p-6 text-center`}>
              <p className="font-extrabold" role="alert">{errorText(load.error, lang)}</p>
              <button type="button" onClick={() => setRetry((n) => n + 1)} className="mt-4 h-10 rounded-full bg-ink px-5 text-sm font-extrabold text-white">
                {w.retry[lang]}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
