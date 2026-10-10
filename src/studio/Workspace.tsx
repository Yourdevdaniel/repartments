/**
 * One repo in the studio: the presentation, the commits and the map, side by side as tabs.
 *
 * It owns what the tabs share: the architecture model (read once, then kept while the tab is open),
 * the presenter's script edits, the commit on screen in the Commits tab and what the loaded commits
 * add up to, so the map can highlight or colour the same things the commits show.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AnalysisEvent, ArchitectureModel, Churn, CommitDetail, RepoSummary, StudioErrorCode } from '../shared/studio'
import type { ScriptEdits } from '../scene/tour'
import { glass } from '../ui/kit'
import type { Lang } from '../ui/roles'
import { api, StudioApiError } from './api'
import { t } from './copy'
import { MapTab } from './map/MapTab'
import { PresentTab } from './present/PresentTab'
import { WorksTab } from './works/WorksTab'
import { download, presentationFile, store, type PresentationFile } from './store'

export type Source = { kind: 'repo'; owner: string; repo: string } | { kind: 'file'; file: PresentationFile }

type Tab = 'present' | 'commits' | 'map'
const TABS: Tab[] = ['present', 'commits', 'map']

type Analysis =
  | { state: 'idle' }
  | { state: 'running'; stage: Extract<AnalysisEvent, { type: 'progress' }> }
  | { state: 'failed'; error: StudioErrorCode }

function initialTab(): Tab {
  const tab = new URLSearchParams(window.location.search).get('tab')
  return TABS.includes(tab as Tab) ? (tab as Tab) : 'present'
}

export function Workspace({ source, lang }: { source: Source; lang: Lang }) {
  const owner = source.kind === 'repo' ? source.owner : source.file.model.repo.owner
  const repo = source.kind === 'repo' ? source.repo : source.file.model.repo.name
  const [tab, setTabState] = useState<Tab>(initialTab)
  const [info, setInfo] = useState<RepoSummary | null>(null)
  const [infoError, setInfoError] = useState<StudioErrorCode | null>(null)
  const [model, setModel] = useState<ArchitectureModel | null>(() => (source.kind === 'file' ? source.file.model : store.model(owner, repo)))
  const [edits, setEditsState] = useState<ScriptEdits>(() => (source.kind === 'file' ? source.file.edits : store.edits(owner, repo)))
  const [analysis, setAnalysis] = useState<Analysis>({ state: 'idle' })
  const [selected, setSelected] = useState<CommitDetail | null>(null)
  const [churn, setChurn] = useState<Churn | null>(null)
  const [churnLoading, setChurnLoading] = useState(false)
  /** The commits on screen in the Commits tab (or saved with an opened presentation). */
  const [loaded, setLoaded] = useState<CommitDetail[]>(() => (source.kind === 'file' ? source.file.commits : []))
  const abort = useRef<AbortController | null>(null)

  const setTab = (next: Tab) => {
    setTabState(next)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    url.searchParams.delete('login')
    window.history.replaceState(null, '', url)
  }

  // A refused token already signs the person out (see `api.ts`); here it's just the message.
  const failed = useCallback((err: unknown): StudioErrorCode => (err instanceof StudioApiError ? err.code : 'unavailable'), [])

  useEffect(() => {
    if (source.kind !== 'repo') return
    const ctrl = new AbortController()
    api
      .repo(owner, repo, ctrl.signal)
      .then(setInfo)
      .catch((err: Error) => err.name !== 'AbortError' && setInfoError(failed(err)))
    return () => ctrl.abort()
  }, [source.kind, owner, repo, failed])

  useEffect(() => () => abort.current?.abort(), [])

  const analyze = async () => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setAnalysis({ state: 'running', stage: { type: 'progress', stage: 'tree' } })
    try {
      const next = await api.architecture(owner, repo, undefined, (stage) => setAnalysis({ state: 'running', stage }), ctrl.signal)
      setModel(next)
      store.saveModel(next)
      setAnalysis({ state: 'idle' })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setAnalysis({ state: 'failed', error: failed(err) })
    }
  }

  const setEdits = (next: ScriptEdits) => {
    setEditsState(next)
    if (source.kind === 'repo') store.saveEdits(owner, repo, next)
  }

  const loadChurn = async () => {
    if (source.kind !== 'repo') return
    setChurnLoading(true)
    try {
      setChurn(await api.churn(owner, repo, {}, 30))
    } catch (err) {
      failed(err)
    } finally {
      setChurnLoading(false)
    }
  }

  // The presenter's names for the parts, so the map and the commits say what the presentation says.
  const named = useMemo<ArchitectureModel | null>(
    () => (model ? { ...model, components: model.components.map((c) => ({ ...c, name: edits.actors[c.id]?.[lang]?.trim() || c.name })) } : null),
    [model, edits, lang],
  )

  const fmt = new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : 'en', { dateStyle: 'medium', timeStyle: 'short' })

  if (infoError && source.kind === 'repo') {
    return (
      <div className="grid h-full place-items-center p-4">
        <div className={`${glass} w-[min(28rem,100%)] p-6 text-center`}>
          <p className="text-4xl" aria-hidden="true">🔎</p>
          <p className="mt-3 text-lg font-extrabold" role="alert">{t.errors[infoError][lang]}</p>
        </div>
      </div>
    )
  }

  // Every tab tells the story in the system's own parts, so they all need the architecture first.
  const needsModel = !model

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2 md:px-4">
        <div className={`${glass} flex p-1`} role="tablist" aria-label={t.studio[lang]}>
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`h-9 rounded-full px-4 text-sm font-extrabold transition-colors ${tab === id ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'}`}
            >
              {t.tabs[id][lang]}
            </button>
          ))}
        </div>
        {info?.private && <span className="rounded-full bg-ink/[0.07] px-2.5 py-1 text-xs font-extrabold text-ink-soft">🔒 {t.private[lang]}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {model && analysis.state !== 'running' && (
            <span className="hidden text-xs font-semibold text-ink-soft md:inline">{t.analyzedAt(fmt.format(new Date(model.generatedAt)))[lang]}</span>
          )}
          {model && source.kind === 'repo' && analysis.state !== 'running' && (
            <button type="button" onClick={analyze} className="h-9 rounded-full bg-white/80 px-3.5 text-xs font-extrabold text-ink transition-colors hover:bg-white">
              ↻ {t.reanalyze[lang]}
            </button>
          )}
          {model && (
            <button
              type="button"
              onClick={() => download(`${model.repo.name}-apresentacao.json`, presentationFile(model, edits, loaded))}
              title={t.saveHint[lang]}
              className="h-9 rounded-full bg-white/80 px-3.5 text-xs font-extrabold text-ink transition-colors hover:bg-white"
            >
              ⬇ {t.save[lang]}
            </button>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {analysis.state === 'running' ? (
          <Progress lang={lang} event={analysis.stage} />
        ) : needsModel || (analysis.state === 'failed' && !model) ? (
          <AnalyzeCard lang={lang} canRead={source.kind === 'repo'} error={analysis.state === 'failed' ? analysis.error : null} onAnalyze={analyze} />
        ) : tab === 'present' && model ? (
          <PresentTab model={model} edits={edits} onEdits={setEdits} lang={lang} />
        ) : tab === 'map' && named ? (
          <div className="h-full overflow-y-auto px-3 pb-3 md:px-4 md:pb-4">
            <MapTab
              model={named}
              lang={lang}
              churn={churn}
              onLoadChurn={source.kind === 'repo' ? loadChurn : () => setTab('commits')}
              churnLoading={churnLoading}
              commit={selected}
            />
          </div>
        ) : named && (source.kind === 'repo' || loaded.length > 0) ? (
          <WorksTab
            owner={owner}
            repo={repo}
            defaultBranch={info?.defaultBranch ?? named.repo.branch}
            model={named}
            lang={lang}
            preloaded={source.kind === 'file' ? loaded : null}
            onCommit={setSelected}
            onChurn={setChurn}
            onLoaded={setLoaded}
          />
        ) : (
          <div className="grid h-full place-items-center p-4">
            <p className={`${glass} max-w-md px-5 py-4 text-center text-sm font-bold text-ink-soft`}>{t.offline[lang]}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Before the first analysis (or after one failed): what will happen, and the button to start it. */
function AnalyzeCard({ lang, canRead, error, onAnalyze }: { lang: Lang; canRead: boolean; error: StudioErrorCode | null; onAnalyze: () => void }) {
  return (
    <div className="grid h-full place-items-center overflow-y-auto p-4">
      <div className={`${glass} w-[min(34rem,100%)] p-6 text-center md:p-8`}>
        <p className="text-4xl" aria-hidden="true">🏗️</p>
        <h2 className="mt-3 text-xl leading-tight font-extrabold tracking-[-0.01em] md:text-2xl">{t.analyzeTitle[lang]}</h2>
        <p className="mt-2 text-[15px] leading-snug text-ink-soft">{t.analyzeLead[lang]}</p>
        {error && (
          <p className="mt-3 rounded-2xl bg-[#ffe4e4] px-3 py-2 text-sm font-bold text-[#a12d2d]" role="alert">
            {t.errors[error][lang]}
          </p>
        )}
        {canRead && (
          <button type="button" onClick={onAnalyze} className="mt-5 h-12 rounded-full bg-ink px-6 text-[15px] font-extrabold text-white transition-transform active:scale-[0.97]">
            {error ? t.retry[lang] : t.analyze[lang]}
          </button>
        )}
      </div>
    </div>
  )
}

/** While the repo is read: which stage, and a bar while files come in. */
function Progress({ lang, event }: { lang: Lang; event: Extract<AnalysisEvent, { type: 'progress' }> }) {
  const share = event.stage === 'files' && event.total ? (event.done ?? 0) / event.total : null
  const order = ['tree', 'files', 'graph', 'flows'] as const
  const at = order.indexOf(event.stage)
  return (
    <div className="grid h-full place-items-center p-4">
      <div className={`${glass} w-[min(26rem,100%)] p-6 text-center`} aria-live="polite">
        <p className="animate-bounce text-4xl motion-reduce:animate-none" aria-hidden="true">🏗️</p>
        <p className="mt-3 text-lg font-extrabold">
          {t.stages[event.stage][lang]}
          {share !== null && ` ${event.done}/${event.total}`}
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(((at + (share ?? 0)) / order.length) * 100)}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${((at + (share ?? 0.5)) / order.length) * 100}%` }} />
        </div>
      </div>
    </div>
  )
}
