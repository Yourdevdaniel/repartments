/**
 * Pieces of interface shared by the public building and the studio, so both read as one product:
 * the frosted card, the logo, and the strip that shows a story's steps.
 */
import type { Caption } from '../scene/story'

// No backdrop blur: blurring a WebGL canvas that redraws every frame was one of the costliest parts of
// the page. A more opaque white reads just as well.
export const glass = 'rounded-[22px] border border-white/80 bg-white/[0.86] shadow-[0_18px_50px_-22px_rgba(40,52,110,0.45)]'

/**
 * The loop at a glance: one little icon per step, the current one lifted and coloured, and an arrow
 * back to the start, because the story repeats. With `onPick`, each step is a button that jumps the
 * scene to it.
 */
export function LoopStrip({ steps, current, text, loopLabel, onPick }: { steps: Caption[]; current: number; text: string; loopLabel: string; onPick?: (step: number) => void }) {
  return (
    <div className={`${glass} pointer-events-auto flex max-w-[min(56rem,100%)] flex-col items-center gap-2.5 px-4 pt-3 pb-3.5`}>
      <ol className="flex flex-wrap items-center justify-center gap-1" aria-label={loopLabel}>
        {steps.map((step, i) => {
          const on = i === current
          const look = `grid place-items-center rounded-full transition-all duration-300 ${
            on ? 'size-10 -translate-y-0.5 bg-accent text-xl shadow-[0_8px_18px_-8px_rgba(47,143,230,0.8)]' : 'size-8 bg-white text-base'
          } ${!on && i < current ? 'opacity-100' : !on ? 'opacity-60' : ''}`
          return (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true" className={`h-0.5 w-2 rounded-full ${i <= current ? 'bg-accent/60' : 'bg-ink/10'}`} />}
              {onPick ? (
                <button type="button" onClick={() => onPick(i)} aria-current={on ? 'step' : undefined} aria-label={String(i + 1)} title={String(i + 1)} className={`${look} hover:opacity-100 hover:ring-2 hover:ring-accent/40`}>
                  {step.icon ?? '•'}
                </button>
              ) : (
                <span aria-current={on ? 'step' : undefined} className={look}>
                  {step.icon ?? '•'}
                </span>
              )}
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

export function Logo() {
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

const MODES = {
  town: { icon: '🏢', en: 'Building', pt: 'Prédio', hint: { en: 'Anyone’s public repos as a building', pt: 'Os repositórios públicos de alguém num prédio' } },
  studio: {
    icon: '🎬',
    en: 'Studio',
    pt: 'Estúdio',
    hint: { en: 'Present how a system works and its commits, private repos too', pt: 'Apresente como um sistema funciona e seus commits, repositórios privados também' },
  },
} as const

/**
 * The switch between the two sides of the site: the public building (anyone's repos, no sign-in)
 * and the studio (sign in, open any repo, present it). Shown in both headers, so either is always
 * one click away.
 */
export function ModeSwitch({ mode, lang, onTown, onStudio }: { mode: 'town' | 'studio'; lang: 'en' | 'pt'; onTown: () => void; onStudio: () => void }) {
  return (
    <div className={`${glass} flex shrink-0 p-1`} role="group" aria-label={lang === 'pt' ? 'Modo' : 'Mode'}>
      {(['town', 'studio'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          title={MODES[m].hint[lang]}
          onClick={mode === m ? undefined : m === 'town' ? onTown : onStudio}
          className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-extrabold transition-colors ${
            mode === m ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'
          }`}
        >
          <span aria-hidden="true">{MODES[m].icon}</span>
          {MODES[m][lang]}
        </button>
      ))}
    </div>
  )
}
