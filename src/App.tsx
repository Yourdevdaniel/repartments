import { useCallback, useState } from 'react'
import { cast, stories } from './scene/probe'
import { Stage } from './scene/Stage'
import type { Caption } from './scene/story'
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
  'rounded-[22px] border border-white/70 bg-white/65 shadow-[0_18px_50px_-22px_rgba(40,52,110,0.45)] backdrop-blur-xl'

export default function App() {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const [caption, setCaption] = useState<{ text: Caption | null; step: number }>({ text: null, step: -1 })
  const total = stories.main.captions.length

  const setLang = (next: Lang) => {
    setLangState(next)
    document.documentElement.lang = next === 'pt' ? 'pt-BR' : 'en'
    try {
      localStorage.setItem('lang', next)
    } catch {
      // Fine for this visit.
    }
  }

  const onCaption = useCallback((text: Caption | null, step: number) => setCaption({ text, step }), [])

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,#f4f6ff_0%,#e4e9ff_55%,#d9e0fb_100%)] text-ink">
      <div className="absolute inset-0">
        <Stage onCaption={onCaption} />
      </div>

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

      <aside className={`${glass} absolute top-24 right-4 hidden w-[19rem] p-4 md:right-6 lg:block`}>
        <p className="text-xs font-bold tracking-wide text-ink-soft uppercase">{copy.flat[lang]}</p>
        <h2 className="mt-1 text-base font-extrabold">{copy.cast[lang]}</h2>
        <ul className="mt-3 grid gap-2.5">
          {cast.map((c) => (
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
      </aside>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4 md:p-6">
        <div
          className={`${glass} flex min-h-14 max-w-[min(36rem,100%)] items-center gap-3 px-4 py-3 transition-opacity duration-300 ${
            caption.text ? 'opacity-100' : 'opacity-0'
          }`}
          aria-live="polite"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-xs font-extrabold text-white">
            {Math.max(1, caption.step + 1)}/{total}
          </span>
          <p className="text-[15px] leading-snug font-bold md:text-base">{caption.text?.[lang] ?? ''}</p>
        </div>
        <p className="text-[11px] font-semibold text-ink-soft/80">{copy.credits[lang]}</p>
      </div>
    </div>
  )
}

function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <rect x="5" y="4" width="24" height="27" rx="5" fill="#2f8fe6" />
      <rect x="9" y="8" width="7" height="6" rx="1.6" fill="#fff" />
      <rect x="18" y="8" width="7" height="6" rx="1.6" fill="#ffe08a" />
      <rect x="9" y="16" width="7" height="6" rx="1.6" fill="#ffe08a" />
      <rect x="18" y="16" width="7" height="6" rx="1.6" fill="#fff" />
      <rect x="14" y="24" width="6" height="7" rx="1.4" fill="#1d64ad" />
    </svg>
  )
}
