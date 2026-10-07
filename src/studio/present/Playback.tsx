/**
 * The presenter's remote: play and pause, step by step, the start and the end of a scene, stop, the
 * speed, and the keyboard shortcuts for all of it, like a video player's. `Theater` holds the state
 * and the clock; these are only the buttons and the card that lists the keys.
 */
import type { ReactNode } from 'react'
import { glass } from '../../ui/kit'
import type { L, Lang } from '../../ui/roles'

/** The speeds on offer, slowest first; 1 is the scene as written. */
export const RATES = [0.5, 1, 1.5, 2] as const
export type Rate = (typeof RATES)[number]

export const rateLabel = (r: number) => `${String(r).replace('.', ',')}x`

export const pw = {
  play: { en: 'Play', pt: 'Continuar' },
  pause: { en: 'Pause', pt: 'Pausar' },
  paused: { en: 'Paused', pt: 'Pausado' },
  playing: { en: 'Playing', pt: 'Continuando' },
  start: { en: 'Back to the start', pt: 'Voltar ao começo' },
  end: { en: 'Go to the end', pt: 'Ir para o final' },
  atEnd: { en: 'Last step', pt: 'Último passo' },
  prevStep: { en: 'Previous step', pt: 'Passo anterior' },
  nextStep: { en: 'Next step', pt: 'Próximo passo' },
  stop: { en: 'Stop', pt: 'Parar' },
  stopped: { en: 'Stopped at the start', pt: 'Parado no começo' },
  speed: { en: 'Speed', pt: 'Velocidade' },
  hud: { en: 'Hide the controls', pt: 'Esconder os controles' },
  hudHidden: { en: 'Controls hidden · H shows them', pt: 'Controles escondidos · H mostra de novo' },
  keys: { en: 'Keyboard shortcuts', pt: 'Atalhos do teclado' },
  controls: { en: 'Scene controls', pt: 'Controles da cena' },
  lastScene: { en: 'This is the last scene', pt: 'Esta é a última cena' },
} satisfies Record<string, L>

const Icon = ({ d, fill = false }: { d: string; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={fill ? 0 : 2.4} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const ICONS = {
  start: <Icon fill d="M5 5h2.6v14H5zM19 5.8v12.4a.8.8 0 0 1-1.2.7L9.2 12.7a.8.8 0 0 1 0-1.4l8.6-6.2a.8.8 0 0 1 1.2.7z" />,
  prev: <Icon d="M14.5 6.5 9 12l5.5 5.5" />,
  play: <Icon fill d="M8 5.6v12.8a.9.9 0 0 0 1.4.8l10-6.4a.9.9 0 0 0 0-1.6l-10-6.4a.9.9 0 0 0-1.4.8z" />,
  pause: <Icon fill d="M6.5 5h3.6v14H6.5zM13.9 5h3.6v14h-3.6z" />,
  next: <Icon d="M9.5 6.5 15 12l-5.5 5.5" />,
  end: <Icon fill d="M16.4 5H19v14h-2.6zM5 5.8v12.4a.8.8 0 0 0 1.2.7l8.6-6.2a.8.8 0 0 0 0-1.4L6.2 5.1A.8.8 0 0 0 5 5.8z" />,
  stop: <Icon fill d="M6.5 6.5h11v11h-11z" />,
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="inline-grid h-6 min-w-6 place-items-center rounded-md border border-ink/15 bg-white px-1.5 font-sans text-[11px] font-extrabold text-ink shadow-[0_1px_0_rgba(40,52,110,0.18)]">{children}</kbd>
}

/** A button with its name and shortcut as the tooltip ("Pausar (Espaço)"). */
function Btn({ label, keys, onClick, children, disabled }: { label: string; keys: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={`${label} (${keys})`}
      className="grid size-9 place-items-center rounded-full text-ink transition-colors hover:bg-ink/[0.07] active:scale-95 disabled:opacity-35"
    >
      {children}
    </button>
  )
}

export type PlaybackProps = {
  lang: Lang
  paused: boolean
  rate: number
  onToggle: () => void
  onStart: () => void
  onPrev: () => void
  onNext: () => void
  onEnd: () => void
  onStop: () => void
  onRate: () => void
  onKeys: () => void
}

/** The bar of controls: start, previous step, play/pause, next step, end, stop, speed and shortcuts. */
export function PlaybackBar({ lang, paused, rate, onToggle, onStart, onPrev, onNext, onEnd, onStop, onRate, onKeys }: PlaybackProps) {
  const space = lang === 'pt' ? 'Espaço' : 'Space'
  return (
    <div className={`${glass} pointer-events-auto flex items-center gap-0.5 p-1`} role="toolbar" aria-label={pw.controls[lang]}>
      <Btn label={pw.start[lang]} keys="Home" onClick={onStart}>
        {ICONS.start}
      </Btn>
      <Btn label={pw.prevStep[lang]} keys="←" onClick={onPrev}>
        {ICONS.prev}
      </Btn>
      <button
        type="button"
        onClick={onToggle}
        aria-label={paused ? pw.play[lang] : pw.pause[lang]}
        title={`${paused ? pw.play[lang] : pw.pause[lang]} (${space})`}
        className="grid size-10 place-items-center rounded-full bg-ink text-white transition-transform active:scale-95"
      >
        {paused ? ICONS.play : ICONS.pause}
      </button>
      <Btn label={pw.nextStep[lang]} keys="→" onClick={onNext}>
        {ICONS.next}
      </Btn>
      <Btn label={pw.end[lang]} keys="End" onClick={onEnd}>
        {ICONS.end}
      </Btn>
      <Btn label={pw.stop[lang]} keys="S" onClick={onStop}>
        {ICONS.stop}
      </Btn>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-ink/15" />
      <button
        type="button"
        onClick={onRate}
        aria-label={`${pw.speed[lang]}: ${rateLabel(rate)}`}
        title={`${pw.speed[lang]} (− / +)`}
        className={`h-9 min-w-12 rounded-full px-2.5 text-xs font-extrabold tabular-nums transition-colors hover:bg-ink/[0.07] ${rate === 1 ? 'text-ink-soft' : 'bg-accent/10 text-accent'}`}
      >
        {rateLabel(rate)}
      </button>
      <button
        type="button"
        onClick={onKeys}
        aria-label={pw.keys[lang]}
        title={`${pw.keys[lang]} (?)`}
        className="grid h-9 min-w-9 place-items-center rounded-full px-2 text-xs font-extrabold text-ink-soft transition-colors hover:bg-ink/[0.07] hover:text-ink"
      >
        ⌨
      </button>
    </div>
  )
}

type Row = { keys: string[]; what: L }

const ROWS = (presenting: boolean): Row[] => [
  { keys: ['Espaço|Space', 'K'], what: { en: 'Pause or play', pt: 'Pausar ou continuar' } },
  { keys: ['→', 'L'], what: { en: 'Next step (after the last one, the next scene)', pt: 'Próximo passo (depois do último, a próxima cena)' } },
  { keys: ['←', 'J'], what: { en: 'Previous step', pt: 'Passo anterior' } },
  { keys: ['PgDn', 'Shift →'], what: { en: 'Next scene', pt: 'Próxima cena' } },
  { keys: ['PgUp', 'Shift ←'], what: { en: 'Previous scene', pt: 'Cena anterior' } },
  { keys: ['Home', '0'], what: { en: 'Back to the start of the scene', pt: 'Voltar ao começo da cena' } },
  { keys: ['End'], what: { en: 'Go to the end of the scene', pt: 'Ir para o final da cena' } },
  { keys: ['S'], what: { en: 'Stop (back to the start, paused)', pt: 'Parar (volta ao começo, pausado)' } },
  { keys: ['−', '+'], what: { en: 'Slower or faster: 0.5x, 1x, 1.5x, 2x', pt: 'Mais devagar ou mais rápido: 0,5x, 1x, 1,5x, 2x' } },
  { keys: ['H'], what: { en: 'Hide or show the controls', pt: 'Esconder ou mostrar os controles' } },
  { keys: ['?'], what: { en: 'Show these shortcuts', pt: 'Mostrar estes atalhos' } },
  { keys: ['Esc'], what: presenting ? { en: 'Leave the presentation', pt: 'Sair da apresentação' } : { en: 'Back to the building', pt: 'Voltar para o prédio' } },
]

/** The card listing every shortcut; closes with Esc, ? or a click outside. */
export function ShortcutsHelp({ lang, presenting, onClose }: { lang: Lang; presenting: boolean; onClose: () => void }) {
  const keyName = (k: string) => (k.includes('|') ? k.split('|')[lang === 'pt' ? 0 : 1] : k)
  return (
    <div className="pointer-events-auto fixed inset-0 z-[60] grid grid-cols-[minmax(0,1fr)] place-items-center bg-ink/25 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="keys-title"
        onClick={(e) => e.stopPropagation()}
        className={`${glass} max-h-[calc(100dvh-2rem)] w-[min(30rem,100%)] overflow-y-auto bg-[#f7f8fd] p-5`}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="keys-title" className="text-lg font-extrabold">
            ⌨ {pw.keys[lang]}
          </h2>
          <button type="button" onClick={onClose} aria-label="Esc" className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink">
            ✕
          </button>
        </div>
        <dl className="mt-3 grid gap-2">
          {ROWS(presenting).map((r) => (
            <div key={r.what.en} className="flex items-center justify-between gap-4 rounded-xl bg-white px-3 py-2">
              <dt className="text-[13px] leading-snug font-bold">{r.what[lang]}</dt>
              <dd className="flex shrink-0 items-center gap-1">
                {r.keys.map((k, i) => (
                  <span key={k} className="flex items-center gap-1">
                    {i > 0 && <span className="text-[11px] text-ink-soft">{lang === 'pt' ? 'ou' : 'or'}</span>}
                    <Key>{keyName(k)}</Key>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
