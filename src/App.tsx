import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { loginFrom, parseRoute, useBuilding, type BuildingState, type Route } from './data/building'
import { lotCount } from './scene/lot'
import { demoFlats, demoOwner } from './scene/demo'
import { Stage, type View } from './scene/Stage'
import type { Caption } from './scene/story'
import type { FlatData } from './scene/types'
import { WEATHERS, type Weather } from './scene/weather'
import { Backdrop } from './ui/Backdrop'
import { glass, LoopStrip, Logo } from './ui/kit'
import { copy, doesFor, roles, type Lang } from './ui/roles'

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('lang')
    if (saved === 'en' || saved === 'pt') return saved
  } catch {
    // Storage blocked: fall back to the browser language.
  }
  return navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en'
}

/** Sky behind everything, per weather. */
const SKY: Record<Weather, string> = {
  sun: 'linear-gradient(180deg,#cfe0ff 0%,#e6ecff 45%,#f1f0ff 100%)',
  clouds: 'linear-gradient(180deg,#d5dbe8 0%,#e4e8f1 50%,#eceef4 100%)',
  rain: 'linear-gradient(180deg,#a9b3c9 0%,#c4cad9 50%,#d3d8e3 100%)',
  night: 'linear-gradient(180deg,#141a3d 0%,#27306a 55%,#3a3f78 100%)',
}
const WEATHER_ICON: Record<Weather, string> = { sun: '☀️', clouds: '☁️', rain: '🌧️', night: '🌙' }
/** Seconds each weather lasts when it changes on its own. */
const WEATHER_SECONDS = 22

/** Phones and tablets get "tap" and "pinch" in the hint instead of "click" and "scroll". */
const TOUCH = window.matchMedia('(pointer: coarse)').matches

type CaptionState = { text: Caption | null; step: number; total: number }

const EXAMPLES = ['Yourdevdaniel', 'tiangolo', 'gaearon']

const DEMO: BuildingState = {
  kind: 'ready',
  owner: { login: demoOwner.login, name: demoOwner.name, avatarUrl: '' },
  total: demoFlats.length,
  lots: [{ flats: demoFlats, next: null, fetched: demoFlats.length }],
  at: 0,
  trip: 'idle',
}

/** The studio (sign-in, analysis, commits) only downloads for people who open it. */
const Studio = lazy(() => import('./studio/Studio').then((m) => ({ default: m.Studio })))

export default function App() {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const [view, setView] = useState<View>({ mode: 'building', entering: null })
  const [weather, setWeather] = useState<Weather>('sun')
  const [autoWeather, setAutoWeather] = useState(true)
  const [veil, setVeil] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [caption, setCaption] = useState<CaptionState>({ text: null, step: -1, total: 0 })
  const [moved, setMoved] = useState(false)
  const [recenter, setRecenter] = useState(0)
  const timers = useRef<number[]>([])
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))
  const street = useBuilding(route.login)
  const landing = !route.login && !route.demo && !route.studio
  const data: BuildingState | null = route.login ? street.state : route.studio ? null : DEMO
  const ready = data?.kind === 'ready' ? data : null
  const flats = ready?.lots[ready.at].flats ?? []
  const lots = ready ? lotCount(ready.total, ready.lots[0].fetched) : 1
  const flat = view.mode === 'inside' ? (flats.find((f) => f.id === view.id) ?? null) : null

  const go = useCallback((path: string) => {
    window.history.pushState(null, '', path)
    setRoute(parseRoute(path))
    setView({ mode: 'building', entering: null })
  }, [])

  useEffect(() => {
    const onPop = () => {
      setRoute(parseRoute(window.location.pathname))
      setView({ mode: 'building', entering: null })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    // The studio names its own pages.
    if (!route.studio) document.title = route.login ? `@${route.login} · Repartments` : 'Repartments'
  }, [route.login, route.studio])

  // Someone who landed in a language they don't read gets pointed at the other one, once.
  const [langHint, setLangHint] = useState(() => {
    try {
      return !localStorage.getItem('langHintSeen')
    } catch {
      return true
    }
  })
  const hideLangHint = useCallback(() => {
    setLangHint(false)
    try {
      localStorage.setItem('langHintSeen', '1')
    } catch {
      // Fine for this visit.
    }
  }, [])
  useEffect(() => {
    if (!langHint) return
    const id = window.setTimeout(hideLangHint, 15000)
    return () => window.clearTimeout(id)
  }, [langHint, hideLangHint])

  const setLang = (next: Lang) => {
    hideLangHint()
    setLangState(next)
    document.documentElement.lang = next === 'pt' ? 'pt-BR' : 'en'
    try {
      localStorage.setItem('lang', next)
    } catch {
      // Fine for this visit.
    }
  }

  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  /** Dive at the floor, fade through a soft veil, come out inside the flat. */
  const select = useCallback((id: string) => {
    setHovered(null)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setView({ mode: 'inside', id })
      return
    }
    setView({ mode: 'building', entering: id })
    later(520, () => setVeil(true))
    later(760, () => {
      setView({ mode: 'inside', id })
      setVeil(false)
    })
  }, [])

  const back = useCallback(() => {
    setVeil(true)
    later(240, () => {
      setView({ mode: 'building', entering: null })
      setVeil(false)
    })
  }, [])
  const onCaption = useCallback((text: Caption | null, step: number, total: number) => setCaption({ text, step, total }), [])

  /** Walk down the street: wait for the next building's repos if needed, then swap behind the veil. */
  const visit = async (step: 1 | -1) => {
    if (!(await street.prepare(step))) return
    setHovered(null)
    setVeil(true)
    later(320, () => {
      street.go(step)
      setView({ mode: 'building', entering: null })
      setVeil(false)
    })
  }

  // The weather moves on by itself unless someone picks one.
  useEffect(() => {
    if (!autoWeather) return
    const id = window.setInterval(
      () => setWeather((w) => WEATHERS[(WEATHERS.indexOf(w) + 1) % WEATHERS.length]),
      WEATHER_SECONDS * 1000,
    )
    return () => window.clearInterval(id)
  }, [autoWeather])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && view.mode === 'inside' && back()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [back, view.mode])

  if (route.studio)
    return (
      <Suspense fallback={<div className="h-dvh w-full" style={{ background: SKY.sun }} />}>
        <Studio owner={route.studio.owner} repo={route.studio.repo} lang={lang} setLang={setLang} onGo={go} />
      </Suspense>
    )

  return (
    <div className="relative h-dvh w-full overflow-hidden text-ink">
      {WEATHERS.map((w) => (
        <div
          key={w}
          aria-hidden="true"
          className="absolute inset-0 transition-opacity duration-[2000ms]"
          style={{ background: SKY[w], opacity: weather === w ? 1 : 0 }}
        />
      ))}
      <Backdrop near={flat !== null} weather={weather} mirror={(ready?.at ?? 0) % 2 === 1} />
      {ready && (
        <div className={`absolute inset-0 transition-opacity duration-700 ${landing ? 'opacity-60' : ''}`}>
          <Stage
            lang={lang}
            weather={weather}
            flats={flats}
            owner={ready.owner.login}
            view={view}
            hovered={hovered}
            onHover={setHovered}
            onSelect={select}
            onBack={back}
            onCaption={onCaption}
            recenter={recenter}
            onMoved={setMoved}
            lot={ready.at}
          />
        </div>
      )}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 bg-white/80 transition-opacity duration-200 ${veil ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* On a phone the weather and language toggles drop to a second row instead of running off screen.
          Above the full-screen cards (landing, loading, errors), or they'd swallow its clicks. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-2 p-4 md:gap-3 md:p-6">
        <div className="pointer-events-auto flex items-center gap-2">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault()
              go('/')
            }}
            className={`${glass} flex items-center gap-3 px-4 py-3`}
          >
            <Logo />
            <span>
              <span className="block text-lg leading-tight font-extrabold tracking-[-0.01em]">Repartments</span>
              <span className="block text-sm leading-tight text-ink-soft">{copy.tagline[lang]}</span>
            </span>
          </a>
          {!landing && <SearchForm lang={lang} onGo={go} compact initial={route.login ?? ''} />}
        </div>
        <div className="pointer-events-auto ml-auto flex items-center gap-2">
          <div className={`${glass} flex p-1`} role="group" aria-label={copy.weather[lang]}>
            {WEATHERS.map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={weather === w}
                aria-label={copy.weatherName[w][lang]}
                title={copy.weatherName[w][lang]}
                onClick={() => {
                  setWeather(w)
                  setAutoWeather(false)
                }}
                className={`grid size-8 place-items-center rounded-full text-sm transition-colors ${
                  weather === w ? 'bg-ink/10' : 'opacity-60 hover:opacity-100'
                }`}
              >
                {WEATHER_ICON[w]}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={autoWeather}
              onClick={() => setAutoWeather((a) => !a)}
              className={`h-8 rounded-full px-2.5 text-[11px] font-extrabold transition-colors ${
                autoWeather ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {copy.auto[lang]}
            </button>
          </div>
          <div className={`${glass} flex p-1`} role="group" aria-label="Language">
            {(['en', 'pt'] as const).map((l) => (
              <span key={l} className="relative">
                <button
                  type="button"
                  aria-pressed={lang === l}
                  onClick={() => setLang(l)}
                  className={`h-8 rounded-full px-3 text-xs font-extrabold transition-colors ${
                    lang === l ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {l.toUpperCase()}
                </button>
                {langHint && l !== lang && <LangHint lang={lang} onSwitch={() => setLang(l)} onClose={hideLangHint} />}
              </span>
            ))}
          </div>
        </div>
      </header>

      {landing && <Landing lang={lang} onGo={go} />}
      {data && data.kind !== 'ready' && <Status state={data} login={route.login ?? ''} lang={lang} onGo={go} />}

      {ready && !landing && (
      <aside className={`${glass} absolute top-24 right-4 hidden max-h-[calc(100dvh-8rem)] w-[20rem] overflow-y-auto p-4 md:right-6 lg:block`}>
        {flat ? (
          <>
            <button
              type="button"
              onClick={back}
              className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-ink/5 px-3 text-xs font-extrabold text-ink-soft transition-colors hover:bg-ink/10 hover:text-ink"
            >
              <span aria-hidden="true">←</span> {copy.back[lang]}
            </button>
            <p className="text-xs font-bold tracking-wide text-ink-soft uppercase">{flat.repo}</p>
            <p className="mt-1 text-sm leading-snug text-ink-soft">{flat.intro[lang]}</p>
            <StatusChips flat={flat} lang={lang} />
            {flat.url && route.login && (
              <a
                href={`/studio/${ready.owner.login}/${flat.repo}`}
                onClick={(e) => {
                  e.preventDefault()
                  go(`/studio/${ready.owner.login}/${flat.repo}`)
                }}
                className="mt-3 mr-1.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-extrabold text-white transition-transform active:scale-[0.97]"
              >
                {copy.openStudio[lang]} <span aria-hidden="true">→</span>
              </a>
            )}
            {flat.url && (
              <a
                href={flat.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-xs font-extrabold text-white transition-transform active:scale-[0.97]"
              >
                {copy.onGitHub[lang]} <span aria-hidden="true">↗</span>
                {flat.stars ? <span className="ml-1 opacity-80">★ {flat.stars}</span> : null}
              </a>
            )}
            <h2 className="mt-4 text-base font-extrabold">{copy.cast[lang]}</h2>
            {!flat.cast.length && <p className="mt-2 text-[13px] text-ink-soft">{copy.people(0)[lang]}</p>}
            <ul className="mt-3 grid gap-2.5">
              {flat.cast.map((c) => (
                <li key={c.id} className="flex gap-3">
                  <span className="mt-1 size-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: c.color }} />
                  <div className="min-w-0">
                    <p className="text-sm leading-tight font-bold">
                      {c.tech} <span className="font-semibold text-ink-soft">· {roles[c.role].name[lang]}</span>
                    </p>
                    <p className="text-[13px] leading-snug text-ink-soft">{doesFor(c.role, c.tech)[lang]}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-ink/10 pt-3 text-xs leading-snug text-ink-soft">{copy.note[lang]}</p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              {ready.owner.avatarUrl && <img src={ready.owner.avatarUrl} alt="" className="size-9 rounded-full ring-2 ring-white" />}
              <div className="min-w-0">
                <p className="truncate text-xs font-bold tracking-wide text-ink-soft uppercase">@{ready.owner.login}</p>
                <h2 className="text-base font-extrabold">{copy.residents(flats.length)[lang]}</h2>
                {lots > 1 && <p className="text-xs font-semibold text-ink-soft">{copy.lotOf(ready.at + 1, lots)[lang]}</p>}
              </div>
            </div>
            {lots > 1 && (
              <div className="mt-3">
                <StreetNav state={ready} lots={lots} lang={lang} onVisit={visit} />
              </div>
            )}
            {route.demo && <p className="mt-2 text-xs font-semibold text-accent">{copy.demoNote[lang]}</p>}
            <ul className="mt-3 grid gap-2">
              {flats.map((f, i) => ({ f, i })).reverse().map(({ f, i }) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => select(f.id)}
                    onMouseEnter={() => setHovered(f.id)}
                    onMouseLeave={() => setHovered(null)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                      hovered === f.id ? 'bg-white' : 'bg-white/50 hover:bg-white'
                    }`}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-ink/5 text-xs font-extrabold text-ink-soft">
                      {i + 1}º
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold">{f.repo}</span>
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
                        <span className="size-2 rounded-full" style={{ background: f.language.color }} />
                        {f.language.name === '—' ? copy.noCode[lang] : f.language.name} · {copy.people(f.cast.length)[lang]}
                        {f.docker && <span className="rounded-full bg-accent px-1.5 text-[10px] font-extrabold text-white">Docker</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-ink/10 pt-3 text-xs leading-snug text-ink-soft">{copy.note[lang]}</p>
          </>
        )}
      </aside>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4 md:p-6">
        {flat && (
          <button
            type="button"
            onClick={back}
            className={`${glass} pointer-events-auto inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-extrabold text-ink lg:hidden`}
          >
            <span aria-hidden="true">←</span> {copy.back[lang]}
          </button>
        )}
        {/* Phones have no side panel: the way down the street sits above the hint instead. */}
        {ready && !landing && !flat && lots > 1 && (
          <div className="pointer-events-auto lg:hidden">
            <StreetNav state={ready} lots={lots} lang={lang} onVisit={visit} label />
          </div>
        )}
        {landing || !ready ? null : flat && !flat.cast.length ? (
          <div className={`${glass} px-4 py-2.5 text-center text-sm font-bold text-ink-soft`}>{copy.vacant[lang]}</div>
        ) : flat ? (
          <LoopStrip
            steps={flat.stories[flat.narrator]?.captions.map((c) => c.caption) ?? []}
            current={caption.step}
            text={caption.text?.[lang] ?? ''}
            loopLabel={copy.loop[lang]}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className={`${glass} px-4 py-2.5 text-center text-sm font-bold text-ink-soft`}>{(TOUCH ? copy.hintTouch : copy.hint)[lang]}</div>
            {moved && (
              <button
                type="button"
                onClick={() => setRecenter((n) => n + 1)}
                className={`${glass} pointer-events-auto px-4 py-2.5 text-sm font-extrabold text-ink transition-colors hover:bg-white`}
              >
                {copy.recenter[lang]}
              </button>
            )}
          </div>
        )}
        <Credits lang={lang} />
      </div>
    </div>
  )
}

/**
 * Points at the other language's button, written in that language: someone reading English is told
 * about Portuguese in Portuguese, and the other way round. Clicking it switches.
 */
const LANG_HINT: Record<Lang, { text: string; close: string; lang: string }> = {
  en: { text: 'Não sabe inglês? Troque para português', close: 'Fechar', lang: 'pt-BR' },
  pt: { text: "Don't speak Portuguese? Switch to English", close: 'Close', lang: 'en' },
}

function LangHint({ lang, onSwitch, onClose }: { lang: Lang; onSwitch: () => void; onClose: () => void }) {
  const hint = LANG_HINT[lang]
  return (
    <span
      lang={hint.lang}
      className="absolute top-full right-0 mt-3.5 flex w-max max-w-[min(15rem,calc(100vw-2rem))] items-center gap-1 rounded-2xl bg-ink py-1.5 pr-1.5 pl-3.5 text-white shadow-[0_18px_40px_-16px_rgba(35,38,58,0.7)] transition-opacity duration-500 starting:opacity-0 motion-safe:animate-bob"
    >
      {/* The tip, centred under the button it points at. */}
      <span aria-hidden="true" className="absolute -top-1.5 right-[14px] size-3 rotate-45 rounded-[2px] bg-ink" />
      <button type="button" onClick={onSwitch} className="relative py-1 text-left text-[13px] leading-snug font-bold">
        <span aria-hidden="true">↑ </span>
        {hint.text}
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={hint.close}
        className="relative grid size-7 shrink-0 place-items-center rounded-full text-base text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        ×
      </button>
    </span>
  )
}

/** Walking down the owner's street: back to the previous building, on to the next one. */
function StreetNav({
  state,
  lots,
  lang,
  onVisit,
  label = false,
}: {
  state: Extract<BuildingState, { kind: 'ready' }>
  lots: number
  lang: Lang
  onVisit: (step: 1 | -1) => void
  /** Say which building this is (the side panel already does, phones don't have it). */
  label?: boolean
}) {
  const ahead = state.at + 1 < state.lots.length || state.lots[state.at].next !== null
  return (
    <nav className="flex flex-wrap items-center justify-center gap-2" aria-label={copy.lotOf(state.at + 1, lots)[lang]}>
      {state.at > 0 && (
        <button
          type="button"
          onClick={() => onVisit(-1)}
          aria-label={copy.prevBuilding[lang]}
          title={copy.prevBuilding[lang]}
          className={`${glass} grid size-11 place-items-center text-base font-extrabold text-ink transition-colors hover:bg-white`}
        >
          <span aria-hidden="true">←</span>
        </button>
      )}
      {label && <span className={`${glass} px-3.5 py-2.5 text-xs font-extrabold text-ink-soft`}>{copy.lotOf(state.at + 1, lots)[lang]}</span>}
      {ahead && (
        <button
          type="button"
          onClick={() => onVisit(1)}
          disabled={state.trip === 'moving'}
          className="h-11 rounded-full bg-ink px-5 text-sm font-extrabold text-white shadow-[0_18px_50px_-22px_rgba(40,52,110,0.6)] transition-transform active:scale-[0.97] disabled:opacity-70"
        >
          {state.trip === 'moving' ? copy.walking[lang] : state.trip === 'failed' ? copy.lost[lang] : copy.nextBuilding[lang]}{' '}
          <span aria-hidden="true">→</span>
        </button>
      )}
    </nav>
  )
}

/** A GitHub username field: big on the landing page, compact in the header. */
function SearchForm({ lang, onGo, compact = false, initial = '' }: { lang: Lang; onGo: (path: string) => void; compact?: boolean; initial?: string }) {
  const [value, setValue] = useState(initial)
  useEffect(() => setValue(initial), [initial])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const login = loginFrom(value)
    if (login) onGo(`/${login}`)
  }
  return (
    <form onSubmit={submit} className={compact ? `${glass} hidden items-center gap-1 p-1 pl-3 md:flex` : 'flex w-full items-center gap-2'} role="search">
      <span className={`font-extrabold text-ink-soft ${compact ? 'text-sm' : 'text-lg'}`} aria-hidden="true">
        @
      </span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={copy.placeholder[lang]}
        aria-label={copy.placeholder[lang]}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`min-w-0 flex-1 bg-transparent font-bold outline-none placeholder:text-ink-soft/60 ${compact ? 'w-36 text-sm' : 'text-lg'}`}
      />
      <button
        type="submit"
        className={`shrink-0 rounded-full bg-ink font-extrabold text-white transition-transform active:scale-[0.97] ${compact ? 'h-8 px-3 text-xs' : 'h-11 px-5 text-sm'}`}
      >
        {compact ? '→' : copy.build[lang]}
      </button>
    </form>
  )
}

/** The front door: what this is, a field for a username, and a few buildings to peek at. */
function Landing({ lang, onGo }: { lang: Lang; onGo: (path: string) => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-4">
      <div className={`${glass} w-[min(30rem,100%)] p-6 text-center md:p-8`}>
        <p className="text-4xl" aria-hidden="true">
          🏢
        </p>
        <h1 className="mt-3 text-2xl leading-tight font-extrabold tracking-[-0.02em] md:text-3xl">{copy.landingTitle[lang]}</h1>
        <p className="mt-2 text-[15px] leading-snug text-ink-soft">{copy.landingLead[lang]}</p>
        <div className="mt-5 rounded-full bg-white px-4 py-2 shadow-[0_8px_24px_-14px_rgba(40,52,110,0.5)]">
          <SearchForm lang={lang} onGo={onGo} />
        </div>
        <p className="mt-4 text-xs font-bold text-ink-soft">{copy.examples[lang]}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {EXAMPLES.map((login) => (
            <button
              key={login}
              type="button"
              onClick={() => onGo(`/${login}`)}
              className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-extrabold transition-colors hover:bg-white"
            >
              @{login}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onGo('/demo')}
            className="rounded-full bg-accent/10 px-3 py-1.5 text-xs font-extrabold text-accent transition-colors hover:bg-accent/20"
          >
            {copy.demo[lang]}
          </button>
        </div>
        <a
          href="/studio"
          onClick={(e) => {
            e.preventDefault()
            onGo('/studio')
          }}
          className="mt-5 flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 text-left transition-colors hover:bg-white"
        >
          <span className="text-2xl" aria-hidden="true">🔑</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold">{copy.studioTitle[lang]}</span>
            <span className="block text-xs leading-snug text-ink-soft">{copy.studioLead[lang]}</span>
          </span>
          <span aria-hidden="true" className="font-extrabold text-accent">→</span>
        </a>
        <p className="mt-4 text-[11px] leading-snug text-ink-soft">{copy.note[lang]}</p>
      </div>
    </div>
  )
}

const AUTHOR = { name: 'Daniel Bernardes', github: 'https://github.com/Yourdevdaniel', site: 'https://bernardes.dev' }

/** Who made it (with links to the author's GitHub and site) and who drew the characters. */
function Credits({ lang }: { lang: Lang }) {
  const link = 'pointer-events-auto font-extrabold text-ink underline-offset-2 hover:underline'
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-[11px] font-semibold text-ink-soft/90">
      <span>{copy.madeBy[lang]}</span>
      <a href={AUTHOR.github} target="_blank" rel="noreferrer" className={link}>
        {AUTHOR.name}
      </a>
      <span aria-hidden="true">·</span>
      <a href={AUTHOR.github} target="_blank" rel="noreferrer" className={link}>
        GitHub
      </a>
      <span aria-hidden="true">·</span>
      <a href={AUTHOR.site} target="_blank" rel="noreferrer" className={link}>
        bernardes.dev
      </a>
      <span aria-hidden="true">·</span>
      <span>{copy.credits[lang]}</span>
    </p>
  )
}

/** While the building goes up, or when it can't. */
function Status({ state, login, lang, onGo }: { state: BuildingState; login: string; lang: Lang; onGo: (path: string) => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-4">
      <div className={`${glass} w-[min(26rem,100%)] p-6 text-center`}>
        {state.kind === 'loading' ? (
          <>
            <p className="animate-bounce text-4xl" aria-hidden="true">
              🏗️
            </p>
            <p className="mt-3 text-lg font-extrabold" aria-live="polite">
              {copy.loading(login)[lang]}
            </p>
            <p className="mt-1 text-sm text-ink-soft">{copy.loadingLead[lang]}</p>
          </>
        ) : state.kind === 'error' ? (
          <>
            <p className="text-4xl" aria-hidden="true">
              {state.error === 'not-found' ? '🔎' : state.error === 'no-repos' ? '🏚️' : '😵'}
            </p>
            <p className="mt-3 text-lg font-extrabold" role="alert">
              {copy.errors[state.error](login)[lang]}
            </p>
            <div className="mt-4 rounded-full bg-white px-4 py-2">
              <SearchForm lang={lang} onGo={onGo} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

/** What's going on in the repo right now, as small chips: open PRs, conflicts, red or green checks. */
function StatusChips({ flat, lang }: { flat: FlatData; lang: Lang }) {
  const { prs, ci } = flat.status
  const chips: { icon: string; text: string; tone: string }[] = []
  if (prs && prs.open > 0) chips.push({ icon: '📬', text: copy.prOpen(prs.open)[lang], tone: 'bg-[#fff1df] text-[#9a5a12]' })
  if (prs?.conflict) chips.push({ icon: '💥', text: copy.conflict[lang], tone: 'bg-[#ffe4e4] text-[#a12d2d]' })
  if (ci === 'failing') chips.push({ icon: '❌', text: copy.ciFailing[lang], tone: 'bg-[#ffe4e4] text-[#a12d2d]' })
  if (ci === 'passing') chips.push({ icon: '✅', text: copy.ciPassing[lang], tone: 'bg-[#e3f6e4] text-[#24733a]' })
  if (!chips.length) return null
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <li key={c.text} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold ${c.tone}`}>
          <span aria-hidden="true">{c.icon}</span>
          {c.text}
        </li>
      ))}
    </ul>
  )
}
