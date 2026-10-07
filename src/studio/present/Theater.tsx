/**
 * The stage both studio shows play on: a building where every floor is a scene, and inside each
 * one the residents act it out step by step with a caption in plain words. The presentation (how
 * the system works) and the works (what each commit changed) are two different casts on it.
 *
 * Two ways to watch: browsing (side panel with the scenes, who takes part and the steps), and
 * presenting (full screen, just the scene and a big caption, arrows between scenes, optionally
 * moving on by itself once a scene has played through), for showing it to a client.
 *
 * Inside a scene, both have a remote (`Playback.tsx`): pause, step back and forth, the start and the
 * end, stop, half to double speed, hide the controls, each with a key (? lists them).
 */
import { useGLTF } from '@react-three/drei'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Flow } from '../../shared/studio'
import { Stage, type View } from '../../scene/Stage'
import type { Caption } from '../../scene/story'
import type { StoryTime } from '../../scene/time'
import { TOUR_MODELS } from '../../scene/tour'
import type { FlatData } from '../../scene/types'
import { Backdrop } from '../../ui/Backdrop'
import { glass, LoopStrip } from '../../ui/kit'
import type { L, Lang } from '../../ui/roles'
import { PlaybackBar, pw, RATES, rateLabel, ShortcutsHelp } from './Playback'
import { PresentSetup, type SetupOptions } from './PresentSetup'

for (const m of TOUR_MODELS.furniture) useGLTF.preload(`/models/furniture/${m}.glb`)
for (const m of TOUR_MODELS.characters) useGLTF.preload(`/models/characters/${m}.glb`)

const SKY = 'linear-gradient(180deg,#cfe0ff 0%,#e6ecff 45%,#f1f0ff 100%)'
/** Phones and tablets get "tap" and "pinch" in the hint instead of "click" and "scroll". */
const TOUCH = window.matchMedia('(pointer: coarse)').matches
/** People who asked for less motion start every scene paused, on its last frame; play is a key away. */
const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const w = {
  who: { en: 'Who takes part', pt: 'Quem participa' },
  stepsTitle: { en: 'Step by step', pt: 'Passo a passo' },
  present: { en: 'Present', pt: 'Apresentar' },
  hint: { en: 'Click a floor to watch it · drag to turn · scroll to zoom', pt: 'Clique num andar para assistir · arraste para girar · role para dar zoom' },
  hintTouch: { en: 'Tap a floor to watch it · drag to turn · pinch to zoom', pt: 'Toque num andar para assistir · arraste para girar · pince para dar zoom' },
  loop: { en: 'Steps of the scene, it repeats', pt: 'Passos da cena, que se repete' },
  prev: { en: 'Previous', pt: 'Anterior' },
  next: { en: 'Next', pt: 'Próxima' },
  exit: { en: 'Exit (Esc)', pt: 'Sair (Esc)' },
  auto: { en: 'Move on by itself', pt: 'Avançar sozinho' },
  steps: (n: number): L => ({ en: n === 1 ? '1 step' : `${n} steps`, pt: n === 1 ? '1 passo' : `${n} passos` }),
}

type CaptionState = { text: Caption | null; step: number; total: number }

export type TheaterProps = {
  /** The scenes, ground floor first, and the flats built from them (same order). */
  flows: Flow[]
  flats: FlatData[]
  /** Whose street it is (picks the neighbourhood around the building). */
  owner: string
  lang: Lang
  /** "Scene 2 of 4", "Commit 2 of 12"… */
  sceneOf: (n: number, of: number) => L
  /** Panel content above the list of floors, when looking at the building. */
  intro: ReactNode
  listTitle: L
  listLead: L
  /** Under the list of floors (say, "load older commits"). */
  listFooter?: ReactNode
  /** Panel content inside a scene, between its summary and who takes part. */
  sceneExtra?: (flow: Flow, index: number) => ReactNode
  /** Buttons next to "Present". */
  tools?: ReactNode
  note: L
  empty: L
  /** The scene on screen (null on the building), for whoever needs to follow along. */
  onScene?: (id: string | null) => void
  /** Pause the keyboard shortcuts (a dialog is open on top). */
  keysOff?: boolean
  /** "Before presenting" choices (plain or technical names, scenes), asked when "Present" is pressed. */
  setup?: SetupOptions
}

export function Theater({ flows, flats, owner, lang, sceneOf, intro, listTitle, listLead, listFooter, sceneExtra, tools, note, empty, onScene, keysOff: keysOffOuter = false, setup }: TheaterProps) {
  const [preparing, setPreparing] = useState(false)
  const keysOff = keysOffOuter || preparing
  const [view, setView] = useState<View>({ mode: 'building', entering: null })
  const [hovered, setHovered] = useState<string | null>(null)
  const [caption, setCaption] = useState<CaptionState>({ text: null, step: -1, total: 0 })
  const [veil, setVeil] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [auto, setAuto] = useState(true)
  const [recenter, setRecenter] = useState(0)
  const [moved, setMoved] = useState(false)
  const [paused, setPaused] = useState(REDUCE)
  const [rate, setRate] = useState<number>(1)
  const [hud, setHud] = useState(true)
  const [help, setHelp] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef(0)
  /** The scene's clock, handed over by the stage, to jump to a step. */
  const clock = useRef<StoryTime | null>(null)
  const timers = useRef<number[]>([])
  /** Seen the scene start, then its last step: one full play, so an automatic show can move on. */
  const seenStart = useRef(false)
  const reachedEnd = useRef(false)

  const insideId = view.mode === 'inside' ? view.id : null
  const index = insideId ? flows.findIndex((f) => f.id === insideId) : -1
  const flow = index >= 0 ? flows[index] : null

  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), [])

  useEffect(() => onScene?.(insideId), [insideId, onScene])

  // A scene that disappears (hidden in the script, other filters) can't stay open.
  useEffect(() => {
    if (insideId && !flows.some((f) => f.id === insideId)) setView({ mode: 'building', entering: null })
  }, [flows, insideId])

  /** Into a scene: dive at its floor and fade in, or cut straight in while presenting. */
  const enter = useCallback((id: string, cut = false) => {
    setHovered(null)
    seenStart.current = false
    reachedEnd.current = false
    // A new scene plays, even if the last one was paused or stopped.
    setPaused(REDUCE)
    if (cut || REDUCE) {
      setVeil(true)
      later(180, () => {
        setView({ mode: 'inside', id })
        setVeil(false)
      })
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

  const step = useCallback(
    (by: 1 | -1) => {
      const next = index < 0 ? 0 : index + by
      if (next < 0 || next >= flows.length) return
      enter(flows[next].id, true)
    },
    [flows, index, enter],
  )

  /** A short note in the middle of the screen, for what a key just did ("1,5x", "Pausado"). */
  const flash = useCallback((text: string) => {
    setToast(text)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 1300)
  }, [])
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const story = index >= 0 ? flats[index].stories[flats[index].narrator] : null
  /** Jumps to the start of one step; counts as having watched, so the show still moves on after it. */
  const seek = (i: number) => {
    const t = clock.current
    if (!story || !t || !story.captions.length) return
    const k = Math.max(0, Math.min(story.captions.length - 1, i))
    seenStart.current = true
    reachedEnd.current = false
    t.current = story.captions[k].t0 + 0.01
  }
  const last = (story?.captions.length ?? 1) - 1
  const togglePause = () => {
    flash(paused ? `▶ ${pw.playing[lang]}` : `⏸ ${pw.paused[lang]}`)
    setPaused(!paused)
  }
  const nextStep = () => {
    if (caption.step < last) seek(caption.step + 1)
    else if (index + 1 < flows.length) step(1)
    else flash(pw.lastScene[lang])
  }
  const prevStep = () => {
    if (caption.step > 0) seek(caption.step - 1)
    else if (index > 0) step(-1)
    else seek(0)
  }
  const toStart = () => seek(0)
  const toEnd = () => {
    seek(last)
    flash(pw.atEnd[lang])
  }
  const stop = () => {
    seek(0)
    setPaused(true)
    flash(`■ ${pw.stopped[lang]}`)
  }
  const changeRate = (by: number, cycle = false) => {
    const i = RATES.indexOf(rate as (typeof RATES)[number])
    const at = i < 0 ? 1 : i + by
    const next = RATES[cycle ? (at + RATES.length) % RATES.length : Math.max(0, Math.min(RATES.length - 1, at))]
    setRate(next)
    flash(`${pw.speed[lang]} ${rateLabel(next)}`)
  }
  const toggleHud = () => {
    if (hud) flash(pw.hudHidden[lang])
    setHud(!hud)
  }

  const startPresenting = () => {
    setPresenting(true)
    document.documentElement.requestFullscreen?.().catch(() => undefined)
    if (flows.length) enter(flows[index >= 0 ? index : 0].id, true)
  }
  const stopPresenting = useCallback(() => {
    setPresenting(false)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
  }, [])

  // Leaving full screen with the browser's own Esc also ends the presentation.
  useEffect(() => {
    const onChange = () => !document.fullscreenElement && setPresenting(false)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // The keys, like a video player's. Inside a scene the camera doesn't use the arrows, so they step
  // through it; on the building they still turn the camera (Stage).
  const onKey = (e: KeyboardEvent) => {
    if (keysOff || e.altKey || e.ctrlKey || e.metaKey) return
    const target = e.target as HTMLElement | null
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
    const k = e.key
    const done = (fn: () => void) => {
      e.preventDefault()
      fn()
    }
    if (help) {
      if (k === 'Escape' || k === '?') done(() => setHelp(false))
      return
    }
    if (k === 'Escape') {
      if (presenting) stopPresenting()
      else if (view.mode === 'inside') back()
      return
    }
    if (k === '?') return done(() => setHelp(true))
    if (k === 'h' || k === 'H') return done(toggleHud)
    if (!flow) return
    if (k === ' ' || k === 'k' || k === 'K') done(togglePause)
    else if ((k === 'ArrowRight' && e.shiftKey) || k === 'PageDown') done(() => step(1))
    else if ((k === 'ArrowLeft' && e.shiftKey) || k === 'PageUp') done(() => step(-1))
    else if (k === 'ArrowRight' || k === 'l' || k === 'L') done(nextStep)
    else if (k === 'ArrowLeft' || k === 'j' || k === 'J') done(prevStep)
    else if (k === 'Home' || k === '0') done(toStart)
    else if (k === 'End') done(toEnd)
    else if (k === 's' || k === 'S') done(stop)
    else if (k === '-' || k === '_' || k === ',' || k === '<') done(() => changeRate(-1))
    else if (k === '+' || k === '=' || k === '.' || k === '>') done(() => changeRate(1))
  }
  const keyHandler = useRef(onKey)
  keyHandler.current = onKey
  useEffect(() => {
    const listen = (e: KeyboardEvent) => keyHandler.current(e)
    window.addEventListener('keydown', listen)
    return () => window.removeEventListener('keydown', listen)
  }, [])

  const onCaption = useCallback(
    (text: Caption | null, at: number, total: number) => {
      setCaption({ text, step: at, total })
      // Played once through (from its start to its last step) and started over: in an automatic
      // presentation, on to the next scene. A caption left over from the previous scene, before
      // the clock restarts, doesn't count as having seen the end.
      if (at === 0 && reachedEnd.current && presenting && auto) {
        reachedEnd.current = false
        if (index + 1 < flows.length) step(1)
        return
      }
      if (at >= 0 && at <= 1) seenStart.current = true
      if (total && at === total - 1 && seenStart.current) reachedEnd.current = true
    },
    [presenting, auto, index, flows.length, step],
  )

  const stage = (
    <Stage
      lang={lang}
      weather="sun"
      flats={flats}
      owner={owner}
      view={view}
      hovered={hovered}
      onHover={setHovered}
      onSelect={(id) => enter(id)}
      onBack={presenting ? () => undefined : back}
      onCaption={onCaption}
      recenter={recenter}
      onMoved={setMoved}
      lot={0}
      restart={insideId}
      paused={paused}
      rate={rate}
      clock={clock}
      panel={!presenting && hud}
    />
  )

  const playback = flow && (
    <PlaybackBar
      lang={lang}
      paused={paused}
      rate={rate}
      onToggle={togglePause}
      onStart={toStart}
      onPrev={prevStep}
      onNext={nextStep}
      onEnd={toEnd}
      onStop={stop}
      onRate={() => changeRate(1, true)}
      onKeys={() => setHelp(true)}
    />
  )
  const overlays = (
    <>
      {toast && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 flex justify-center px-4" aria-live="polite">
          <p className="rounded-full bg-ink/80 px-5 py-2.5 text-sm font-extrabold text-white shadow-lg">{toast}</p>
        </div>
      )}
      {help && <ShortcutsHelp lang={lang} presenting={presenting} onClose={() => setHelp(false)} />}
    </>
  )

  if (presenting) {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden text-ink" style={{ background: SKY }}>
        <Backdrop near={flow !== null} weather="sun" />
        <div className="absolute inset-0">{stage}</div>
        <div aria-hidden="true" className={`pointer-events-none absolute inset-0 bg-white/80 transition-opacity duration-200 ${veil ? 'opacity-100' : 'opacity-0'}`} />
        {overlays}
        <div className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4 md:p-6 ${hud ? '' : 'hidden'}`}>
          <div className={`${glass} max-w-[min(40rem,70vw)] px-4 py-3`}>
            <p className="text-xs font-bold tracking-wide text-ink-soft uppercase">{flow ? sceneOf(index + 1, flows.length)[lang] : owner}</p>
            <h2 className="text-lg leading-tight font-extrabold md:text-2xl">{flow ? flow.title[lang] : ''}</h2>
            {flow && <p className="mt-0.5 hidden text-sm text-ink-soft md:block">{flow.summary[lang]}</p>}
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <label className={`${glass} flex h-10 cursor-pointer items-center gap-2 px-3.5 text-xs font-extrabold text-ink-soft`}>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-[#2f8fe6]" />
              {w.auto[lang]}
            </label>
            <button type="button" onClick={toggleHud} title={`${pw.hud[lang]} (H)`} className={`${glass} h-10 px-3.5 text-xs font-extrabold text-ink-soft hover:text-ink`}>
              {pw.hud[lang]}
            </button>
            <button type="button" onClick={stopPresenting} className={`${glass} h-10 px-4 text-xs font-extrabold text-ink`}>
              {w.exit[lang]}
            </button>
          </div>
        </div>
        <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 md:p-8 ${hud ? '' : 'hidden'}`}>
          {flow && caption.text && (
            <p className={`${glass} max-w-[min(60rem,100%)] px-6 py-4 text-center text-xl leading-snug font-extrabold md:text-3xl`} aria-live="polite">
              <span aria-hidden="true" className="mr-2">{caption.text.icon}</span>
              {caption.text[lang]}
            </p>
          )}
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
            {playback}
            <button type="button" onClick={() => step(-1)} disabled={index <= 0} aria-label={w.prev[lang]} title={`${w.prev[lang]} (PgUp)`} className={`${glass} grid size-12 place-items-center text-lg font-extrabold disabled:opacity-40`}>
              ←
            </button>
            <ol className="flex max-w-[60vw] flex-wrap items-center justify-center gap-1.5">
              {flows.map((f, i) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => enter(f.id, true)}
                    aria-current={i === index ? 'step' : undefined}
                    aria-label={f.title[lang]}
                    title={f.title[lang]}
                    className={`block h-2.5 rounded-full transition-all ${i === index ? 'w-8 bg-accent' : 'w-2.5 bg-ink/25 hover:bg-ink/40'}`}
                  />
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => step(1)} disabled={index >= flows.length - 1} aria-label={w.next[lang]} title={`${w.next[lang]} (PgDn)`} className={`${glass} grid size-12 place-items-center text-lg font-extrabold disabled:opacity-40`}>
              →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-hidden" style={{ background: SKY }}>
      <Backdrop near={flow !== null} weather="sun" />
      {flats.length > 0 && <div className="absolute inset-0">{stage}</div>}
      <div aria-hidden="true" className={`pointer-events-none absolute inset-0 bg-white/80 transition-opacity duration-200 ${veil ? 'opacity-100' : 'opacity-0'}`} />

      {!flats.length && (
        <div className="absolute inset-0 grid grid-cols-[minmax(0,1fr)] place-items-center p-4">
          <p className={`${glass} max-w-md px-5 py-4 text-center text-sm font-bold text-ink-soft`}>{empty[lang]}</p>
        </div>
      )}

      {overlays}
      <aside className={`${glass} absolute top-3 right-3 hidden max-h-[calc(100%-1.5rem)] w-[21rem] overflow-y-auto p-4 ${hud ? 'lg:block' : ''}`}>
        <div className="flex gap-2">
          <button type="button" onClick={() => (setup ? setPreparing(true) : startPresenting())} disabled={!flats.length} className="h-9 flex-1 rounded-full bg-accent px-3 text-sm font-extrabold text-white transition-transform active:scale-[0.97] disabled:opacity-50">
            ▶ {w.present[lang]}
          </button>
          {tools}
        </div>
        {flow ? (
          <>
            <button type="button" onClick={back} className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-full bg-ink/5 px-3 text-xs font-extrabold text-ink-soft transition-colors hover:bg-ink/10 hover:text-ink">
              <span aria-hidden="true">←</span> {listTitle[lang]}
            </button>
            <p className="mt-3 text-xs font-bold tracking-wide text-ink-soft uppercase">{sceneOf(index + 1, flows.length)[lang]}</p>
            <h2 className="text-lg leading-tight font-extrabold">{flow.title[lang]}</h2>
            <p className="mt-1 text-sm leading-snug text-ink-soft">{flow.summary[lang]}</p>
            {sceneExtra?.(flow, index)}
            <h3 className="mt-4 text-sm font-extrabold">{w.who[lang]}</h3>
            <ul className="mt-2 grid gap-2">
              {flats[index].cast.map((c) => {
                const a = flow.actors.find((x) => x.id === c.id)!
                return (
                  <li key={c.id} className="flex gap-2.5">
                    <span className="mt-1 size-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: c.color }} />
                    <div className="min-w-0">
                      <p className="text-sm leading-tight font-bold">{a.name[lang]}</p>
                      {a.note[lang] && <p className="text-[13px] leading-snug text-ink-soft">{a.note[lang]}</p>}
                    </div>
                  </li>
                )
              })}
            </ul>
            <h3 className="mt-4 text-sm font-extrabold">{w.stepsTitle[lang]}</h3>
            <ol className="mt-2 grid gap-1.5">
              {flow.steps.map((s, i) => (
                <li
                  key={i}
                  aria-current={i === caption.step ? 'step' : undefined}
                  className={`flex gap-2 rounded-xl px-2 py-1.5 text-[13px] leading-snug transition-colors ${i === caption.step ? 'bg-accent/10 font-bold text-ink' : 'text-ink-soft'}`}
                >
                  <span className="w-4 shrink-0 text-right font-extrabold tabular-nums">{i + 1}</span>
                  <span>{s.text[lang]}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <div className="mt-4">{intro}</div>
            <h2 className="mt-4 text-base font-extrabold">{listTitle[lang]}</h2>
            <p className="text-xs text-ink-soft">{listLead[lang]}</p>
            <ul className="mt-2 grid gap-2">
              {flows
                .map((f, i) => ({ f, i }))
                .reverse()
                .map(({ f, i }) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => enter(f.id)}
                      onMouseEnter={() => setHovered(f.id)}
                      onMouseLeave={() => setHovered(null)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${hovered === f.id ? 'bg-white' : 'bg-white/50 hover:bg-white'}`}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-ink/5 text-xs font-extrabold text-ink-soft">{i + 1}º</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold">{f.title[lang]}</span>
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
                          <span className="size-2 shrink-0 rounded-full" style={{ background: flats[i].language.color }} />
                          <span className="truncate">
                            {flats[i].language.name} · {w.steps(f.steps.length)[lang]}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
            {listFooter}
          </>
        )}
        <p className="mt-4 border-t border-ink/10 pt-3 text-xs leading-snug text-ink-soft">{note[lang]}</p>
      </aside>

      <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3 md:p-4 ${hud ? '' : 'hidden'}`}>
        {/* Phones have no side panel: back and present sit at the bottom. */}
        <div className="pointer-events-auto flex flex-wrap justify-center gap-2 lg:hidden">
          {flow && (
            <button type="button" onClick={back} className={`${glass} h-10 px-4 text-sm font-extrabold`}>
              ← {listTitle[lang]}
            </button>
          )}
          <button type="button" onClick={() => (setup ? setPreparing(true) : startPresenting())} disabled={!flats.length} className="h-10 rounded-full bg-accent px-4 text-sm font-extrabold text-white disabled:opacity-50">
            ▶ {w.present[lang]}
          </button>
          {tools}
        </div>
        {flow ? (
          <>
            <LoopStrip steps={flats[index].stories.main.captions.map((c) => c.caption)} current={caption.step} text={caption.text?.[lang] ?? ''} loopLabel={w.loop[lang]} onPick={seek} />
            {playback}
          </>
        ) : (
          flats.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <div className={`${glass} px-4 py-2.5 text-center text-sm font-bold text-ink-soft`}>{(TOUCH ? w.hintTouch : w.hint)[lang]}</div>
              {moved && (
                <button type="button" onClick={() => setRecenter((n) => n + 1)} className={`${glass} pointer-events-auto px-4 py-2.5 text-sm font-extrabold`}>
                  ↺
                </button>
              )}
            </div>
          )
        )}
      </div>
      {preparing && setup && (
        <PresentSetup
          options={setup}
          lang={lang}
          auto={auto}
          onAuto={setAuto}
          onStart={() => {
            setPreparing(false)
            startPresenting()
          }}
          onClose={() => setPreparing(false)}
        />
      )}
    </div>
  )
}
