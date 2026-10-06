import { useCallback, useEffect, useRef, useState } from 'react'
import { demoFlats, demoOwner } from './scene/demo'
import { Stage, type View } from './scene/Stage'
import type { Caption } from './scene/story'
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

const glass =
  'rounded-[22px] border border-white/70 bg-white/70 shadow-[0_18px_50px_-22px_rgba(40,52,110,0.45)] backdrop-blur-xl'

type CaptionState = { text: Caption | null; step: number; total: number }

export default function App() {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const [view, setView] = useState<View>({ mode: 'building', entering: null })
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && back()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [back])

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[linear-gradient(180deg,#cfe0ff_0%,#e6ecff_45%,#f1f0ff_100%)] text-ink">
      <Backdrop near={flat !== null} />
      <div className="absolute inset-0">
        <Stage
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
          <div
            className={`${glass} flex min-h-14 max-w-[min(36rem,100%)] items-center gap-3 px-4 py-3 transition-opacity duration-300 ${
              caption.text ? 'opacity-100' : 'opacity-0'
            }`}
            aria-live="polite"
          >
            <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-full bg-ink px-2 text-xs font-extrabold text-white">
              {Math.max(1, caption.step + 1)}/{caption.total}
            </span>
            <p className="text-[15px] leading-snug font-bold md:text-base">{caption.text?.[lang] ?? ''}</p>
          </div>
        ) : (
          <div className={`${glass} px-4 py-2.5 text-sm font-bold text-ink-soft`}>{copy.hint[lang]}</div>
        )}
        <p className="text-[11px] font-semibold text-ink-soft/80">{copy.credits[lang]}</p>
      </div>
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
