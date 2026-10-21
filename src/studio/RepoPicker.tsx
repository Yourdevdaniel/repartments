import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { glass } from '../ui/kit'
import type { Lang } from '../ui/roles'
import type { RepoSummary } from '../shared/studio'
import { api } from './api'
import { errorCode, errorText } from './lib/messages'
import { relativeTime } from './lib/time'

const t = {
  en: {
    title: 'Repositories',
    subtitle: 'Pick a project to see its commits and how it is built.',
    search: 'Search by name or description',
    searchLabel: 'Search repositories',
    more: 'Load more',
    loadingMore: 'Loading…',
    loading: 'Loading repositories',
    empty: 'No repositories found',
    emptyHint: 'Try another word. If you signed in through a GitHub App, install it on the repositories you want to open.',
    private: 'Private',
    archived: 'Archived',
    updated: (rel: string) => `Updated ${rel}`,
    retry: 'Try again',
  },
  pt: {
    title: 'Repositórios',
    subtitle: 'Escolha um projeto para ver os commits e como ele é montado.',
    search: 'Buscar por nome ou descrição',
    searchLabel: 'Buscar repositórios',
    more: 'Carregar mais',
    loadingMore: 'Carregando…',
    loading: 'Carregando repositórios',
    empty: 'Nenhum repositório encontrado',
    emptyHint: 'Tente outra palavra. Se o login é por um GitHub App, instale o app nos repositórios que quer abrir.',
    private: 'Privado',
    archived: 'Arquivado',
    updated: (rel: string) => `Atualizado ${rel}`,
    retry: 'Tentar de novo',
  },
} as const

const chip = 'rounded-full bg-ink/[0.06] px-2 py-0.5 text-[11px] font-bold text-ink-soft'

/**
 * The person's repositories (their own, their collaborations and their organisations'), searchable,
 * most recently pushed first. Picking one calls `onOpen`.
 */
export function RepoPicker({ lang, onOpen }: { lang: Lang; onOpen: (owner: string, repo: string) => void }) {
  const x = t[lang]
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [repos, setRepos] = useState<RepoSummary[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorCodeNow, setErrorCodeNow] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  // Bumped with every new search, so a "load more" started for an older search is dropped.
  const epoch = useRef(0)

  // Typing searches after a short pause; Enter searches at once (see `submit`).
  useEffect(() => {
    const timer = setTimeout(() => setQ(draft.trim()), 300)
    return () => clearTimeout(timer)
  }, [draft])

  useEffect(() => {
    const ctrl = new AbortController()
    epoch.current++
    setStatus('loading')
    setErrorCodeNow(null)
    api
      .repos(1, q, ctrl.signal)
      .then((page) => {
        setRepos(page.repos)
        setNext(page.next)
        setStatus('ready')
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return
        setRepos([])
        setNext(null)
        setErrorCodeNow(errorCode(err))
        setStatus('error')
      })
    return () => ctrl.abort()
  }, [q, retryKey])

  async function loadMore() {
    if (next === null) return
    const mine = epoch.current
    setLoadingMore(true)
    try {
      const page = await api.repos(next, q)
      if (mine !== epoch.current) return
      setRepos((prev) => [...prev, ...page.repos])
      setNext(page.next)
    } catch (err) {
      if (mine === epoch.current) setErrorCodeNow(errorCode(err))
    } finally {
      if (mine === epoch.current) setLoadingMore(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setQ(draft.trim())
  }

  // The owner is only worth showing when the list mixes owners.
  const mixedOwners = useMemo(() => new Set(repos.map((r) => r.owner)).size > 1, [repos])
  const now = new Date()

  return (
    <section aria-labelledby="repo-picker-title" className={`${glass} mx-auto flex w-full max-w-[44rem] flex-col gap-4 p-4 md:p-5`}>
      <header className="flex flex-col gap-1 px-1">
        <h2 id="repo-picker-title" className="text-lg font-extrabold text-ink">
          {x.title}
        </h2>
        <p className="text-[13px] text-ink-soft">{x.subtitle}</p>
      </header>

      <form role="search" onSubmit={submit} className="px-1">
        <label className="block">
          <span className="sr-only">{x.searchLabel}</span>
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={x.search}
            autoComplete="off"
            className="h-10 w-full rounded-full border border-ink/10 bg-white px-4 text-[13px] font-medium text-ink outline-none transition placeholder:text-ink-soft/70 focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        </label>
      </form>

      {status === 'loading' && repos.length === 0 && (
        <div role="status" className="flex flex-col gap-1">
          <span className="sr-only">{x.loading}</span>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} aria-hidden="true" className="flex flex-col gap-2 rounded-2xl px-3.5 py-3">
              <span className="h-3.5 w-1/2 rounded bg-ink/10 motion-safe:animate-pulse" />
              <span className="h-3 w-3/4 rounded bg-ink/5 motion-safe:animate-pulse" />
            </span>
          ))}
        </div>
      )}

      {status === 'error' && repos.length === 0 && (
        <div className="flex flex-col items-start gap-3 px-1 py-4 text-sm text-ink-soft">
          <p>{errorText(errorCodeNow ?? 'unavailable', lang)}</p>
          <button type="button" onClick={() => setRetryKey((k) => k + 1)} className="rounded-full bg-ink px-4 py-2 text-xs font-bold text-white">
            {x.retry}
          </button>
        </div>
      )}

      {status === 'ready' && repos.length === 0 && (
        <div className="px-1 py-6 text-center">
          <p className="text-sm font-bold text-ink">{x.empty}</p>
          <p className="mt-1 text-xs text-ink-soft">{x.emptyHint}</p>
        </div>
      )}

      {repos.length > 0 && (
        <>
          <ul className="-mx-1 flex flex-col">
            {repos.map((r) => (
              <li key={r.fullName}>
                <button
                  type="button"
                  onClick={() => onOpen(r.owner, r.name)}
                  className="flex w-full flex-col gap-1 rounded-2xl px-3.5 py-3 text-left transition-colors hover:bg-accent/[0.06] focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 truncate text-[15px] font-bold text-ink">
                      {mixedOwners && <span className="font-semibold text-ink-soft">{r.owner}/</span>}
                      {r.name}
                    </span>
                    {r.private && (
                      <span className={chip}>
                        <span aria-hidden="true">🔒 </span>
                        {x.private}
                      </span>
                    )}
                    {r.archived && <span className={chip}>{x.archived}</span>}
                  </span>
                  {r.description && <span className="line-clamp-1 text-[13px] text-ink-soft">{r.description}</span>}
                  <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-soft">
                    {r.language && <span className="font-semibold">{r.language}</span>}
                    {r.language && r.pushedAt && <span aria-hidden="true">·</span>}
                    {r.pushedAt && <span>{x.updated(relativeTime(r.pushedAt, now, lang))}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {next !== null && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="mx-1 rounded-full border border-ink/10 bg-white px-4 py-2 text-xs font-bold text-ink transition hover:bg-ink/[0.03] disabled:opacity-60"
            >
              {loadingMore ? x.loadingMore : x.more}
            </button>
          )}
          {errorCodeNow && (
            <p role="alert" className="px-1 text-xs text-[#8a2b2b]">
              {errorText(errorCodeNow, lang)}
            </p>
          )}
        </>
      )}
    </section>
  )
}
