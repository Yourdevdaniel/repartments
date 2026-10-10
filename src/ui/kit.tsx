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
 * back to the start, because the story repeats.
 */
export function LoopStrip({ steps, current, text, loopLabel }: { steps: Caption[]; current: number; text: string; loopLabel: string }) {
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
