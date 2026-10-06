import { useCallback, useEffect, useRef, useState } from 'react'
import { demoFlats, demoOwner } from './scene/demo'
import { Stage, type View } from './scene/Stage'
import type { Caption } from './scene/story'
import type { FlatData } from './scene/types'
import { WEATHERS, type Weather } from './scene/weather'
import { Backdrop } from './ui/Backdrop'
import { copy, roles, type Lang } from './ui/roles'

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

const glass =
  'rounded-[22px] border border-white/70 bg-white/70 shadow-[0_18px_50px_-22px_rgba(40,52,110,0.45)] backdrop-blur-xl'

type CaptionState = { text: Caption | null; step: number; total: number }

export default function App() {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const [view, setView] = useState<View>({ mode: 'building', entering: null })
  const [weather, setWeather] = useState<Weather>('sun')
  const [autoWeather, setAutoWeather] = useState(true)
  const [veil, setVeil] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [caption, setCaption] = useState<CaptionState>({ text: null, step: -1, total: 0 })
  const timers = useRef<number[]>([])
  const flats = demoFlats
  const flat = view.mode === 'inside' ? (flats.find((f) => f.id === view.id) ?? null) : null

  const setLang = (next: Lang) => {
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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && back()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [back])

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
      <Backdrop near={flat !== null} weather={weather} />
      <div className="absolute inset-0">
        <Stage
          lang={lang}
          weather={weather}
          flats={flats}
          owner={demoOwner.login}
          view={view}
          hovered={hovered}
          onHover={setHovered}
          onSelect={select}
          onBack={back}
          onCaption={onCaption}
        />
      </div>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 bg-white/70 backdrop-blur-md transition-opacity duration-200 ${veil ? 'opacity-100' : 'opacity-0'}`}
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 md:p-6">
        <div className={`${glass} pointer-events-auto flex items-center gap-3 px-4 py-3`}>
          <Logo />
          <div>
            <h1 className="text-lg leading-tight font-extrabold tracking-[-0.01em]">Repartments</h1>
            <p className="text-sm leading-tight text-ink-soft">{copy.tagline[lang]}</p>
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <span className={`${glass} hidden px-3 py-2 text-xs font-bold tracking-wide text-accent uppercase sm:block`}>
            {copy.probe[lang]}
          </span>
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
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                className={`h-8 rounded-full px-3 text-xs font-extrabold transition-colors ${
                  lang === l ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

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
            <h2 className="mt-4 text-base font-extrabold">{copy.cast[lang]}</h2>
            <ul className="mt-3 grid gap-2.5">
              {flat.cast.map((c) => (
                <li key={c.id} className="flex gap-3">
                  <span className="mt-1 size-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: c.color }} />
                  <div className="min-w-0">
                    <p className="text-sm leading-tight font-bold">
                      {c.tech} <span className="font-semibold text-ink-soft">· {roles[c.role].name[lang]}</span>
                    </p>
                    <p className="text-[13px] leading-snug text-ink-soft">{roles[c.role].does[lang]}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-ink/10 pt-3 text-xs leading-snug text-ink-soft">{copy.note[lang]}</p>
          </>
        ) : (
          <>
            <p className="text-xs font-bold tracking-wide text-ink-soft uppercase">@{demoOwner.login}</p>
            <h2 className="mt-1 text-base font-extrabold">{copy.residents(flats.length)[lang]}</h2>
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
                        {f.language.name} · {copy.people(f.cast.length)[lang]}
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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4 md:p-6">
        {flat ? (
          <LoopStrip
            steps={flat.stories[flat.narrator]?.captions.map((c) => c.caption) ?? []}
            current={caption.step}
            text={caption.text?.[lang] ?? ''}
            loopLabel={copy.loop[lang]}
          />
        ) : (
          <div className={`${glass} px-4 py-2.5 text-sm font-bold text-ink-soft`}>{copy.hint[lang]}</div>
        )}
        <p className="text-[11px] font-semibold text-ink-soft/80">{copy.credits[lang]}</p>
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

/**
 * The loop at a glance: one little icon per step, the current one lifted and coloured, and an arrow
 * back to the start, because the story repeats.
 */
function LoopStrip({ steps, current, text, loopLabel }: { steps: Caption[]; current: number; text: string; loopLabel: string }) {
  return (
    <div className={`${glass} pointer-events-auto flex max-w-[min(56rem,100%)] flex-col items-center gap-2.5 px-4 pt-3 pb-3.5`}>
      <ol className="flex flex-wrap items-center justify-center gap-1" aria-label={loopLabel}>
        {steps.map((step, i) => {
          const on = i === current
          return (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true" className={`h-0.5 w-2 rounded-full ${i <= current ? 'bg-accent/60' : 'bg-ink/10'}`} />}
              <span
                aria-current={on ? 'step' : undefined}
                className={`grid place-items-center rounded-full transition-all duration-300 ${
                  on ? 'size-10 -translate-y-0.5 bg-accent text-xl shadow-[0_8px_18px_-8px_rgba(47,143,230,0.8)]' : 'size-8 bg-white text-base'
                } ${!on && i < current ? 'opacity-100' : !on ? 'opacity-60' : ''}`}
              >
                {step.icon ?? '•'}
              </span>
            </li>
          )
        })}
        <li aria-hidden="true" className="ml-1 text-base font-extrabold text-ink-soft" title={loopLabel}>
          ↺
        </li>
      </ol>
      <p className="min-h-6 text-center text-[15px] leading-snug font-bold md:text-base" aria-live="polite">
        {text}
      </p>
    </div>
  )
}

function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <rect x="5" y="4" width="24" height="27" rx="5" fill="#ee9f7f" />
      <rect x="9" y="8" width="7" height="6" rx="1.6" fill="#fff" />
      <rect x="18" y="8" width="7" height="6" rx="1.6" fill="#ffe08a" />
      <rect x="9" y="16" width="7" height="6" rx="1.6" fill="#ffe08a" />
      <rect x="18" y="16" width="7" height="6" rx="1.6" fill="#fff" />
      <rect x="14" y="24" width="6" height="7" rx="1.4" fill="#3f9c8f" />
    </svg>
  )
}
