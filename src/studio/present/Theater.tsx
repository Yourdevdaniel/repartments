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
 *
 * The show can also leave as files (`../export/`): a video, made frame by frame as it plays once
 * through with the captions drawn in (the tab can be hidden meanwhile), and a PowerPoint, with a
 * still of each scene and its steps.
 */
import { useGLTF, useProgress } from '@react-three/drei'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Flow } from '../../shared/studio'
import { Stage, type View } from '../../scene/Stage'
import { captionAt, type Caption } from '../../scene/story'
import type { StoryTime } from '../../scene/time'
import { TOUR_MODELS } from '../../scene/tour'
import type { FlatData } from '../../scene/types'
import { Backdrop } from '../../ui/Backdrop'
import { glass, LoopStrip } from '../../ui/kit'
import type { L, Lang } from '../../ui/roles'
import type { Deck } from '../export/deck'
import { breathe, canEncode, compositor, encodeCanvas, fontsReady, sceneFrames, VIDEO, videoFileName, type Overlay } from '../export/video'
import { saveBlob } from '../store'
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
  recording: { en: 'Recording the video', pt: 'Gravando o vídeo' },
  makingDeck: { en: 'Making the PowerPoint', pt: 'Montando o PowerPoint' },
  ended: { en: 'End of the presentation', pt: 'Fim da apresentação' },
  restart: { en: 'Restart', pt: 'Recomeçar' },
  backToBuilding: { en: 'Back to the building', pt: 'Voltar ao prédio' },
  keepOpen: { en: 'Keep this tab open and in front until it ends.', pt: 'Deixe esta aba aberta e na frente até terminar.' },
  afk: { en: 'You can switch tabs meanwhile; just keep this one open.', pt: 'Pode trocar de aba enquanto isso; só não feche esta.' },
  cancel: { en: 'Cancel', pt: 'Cancelar' },
  cancelled: { en: 'Cancelled', pt: 'Cancelado' },
  savedVideo: (ext: string): L => ({ en: `Video saved (${ext.toUpperCase()})`, pt: `Vídeo salvo (${ext.toUpperCase()})` }),
  savedDeck: { en: 'PowerPoint saved', pt: 'PowerPoint salvo' },
  noRecording: { en: 'This browser can’t make videos. Chrome, Edge, Safari or Firefox (recent) can.', pt: 'Este navegador não faz vídeos. O Chrome, o Edge, o Safari e o Firefox (recentes) fazem.' },
  videoFailed: { en: 'The video couldn’t be made.', pt: 'Não deu para fazer o vídeo.' },
  deckFailed: { en: 'The PowerPoint couldn’t be made.', pt: 'Não deu para montar o PowerPoint.' },
}

/** What a file made from the show is called and says on its cover. */
export type ExportInfo = { title: string; summary: string; subtitle: string }

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
  /** Offers the video and the PowerPoint in "Before presenting" when given. */
  exportInfo?: ExportInfo
}

export function Theater({ flows, flats, owner, lang, sceneOf, intro, listTitle, listLead, listFooter, sceneExtra, tools, note, empty, onScene, keysOff: keysOffOuter = false, setup, exportInfo }: TheaterProps) {
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
  /** The end card after the last step of the last scene, while presenting. */
  const [ended, setEnded] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef(0)
  /** The scene's clock, handed over by the stage, to jump to a step. */
  const clock = useRef<StoryTime | null>(null)
  const timers = useRef<number[]>([])
  /** Seen the scene start, then its last step: one full play, so an automatic show can move on. */
  const seenStart = useRef(false)
  const reachedEnd = useRef(false)
  /** A file being made from the show: the video records as it plays, the slides take one still per scene. */
  const [exporting, setExporting] = useState<'video' | 'deck' | null>(null)
  const exportKind = useRef<'video' | 'deck' | null>(null)
  exportKind.current = exporting
  /** Gets every drawn frame while exporting; `frames` waits for some, `grab` reads one on the spot. */
  const sink = useRef<((canvas: HTMLCanvasElement) => void) | null>(null)
  const waiting = useRef<{ n: number; grab: (canvas: HTMLCanvasElement) => unknown; done: (v: unknown) => void }[]>([])
  const cancelled = useRef(false)
  /** Moves the stage on and draws one frame, while a video is being made (see `Stage`'s `drive`). */
  const drive = useRef<((dt: number) => void) | null>(null)
  /** How much of the video is made, 0 to 1. */
  const [progress, setProgress] = useState(0)
  /** The scene open (null: the building) when presenting or exporting began; undefined: nothing to put back. */
  const before = useRef<string | null | undefined>(undefined)
  const presentingRef = useRef(presenting)
  presentingRef.current = presenting

  const insideId = view.mode === 'inside' ? view.id : null
  const index = insideId ? flows.findIndex((f) => f.id === insideId) : -1
  const flow = index >= 0 ? flows[index] : null
  const insideRef = useRef(insideId)
  insideRef.current = insideId

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
    setEnded(false)
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
    else if (presenting) setEnded(true)
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

  /** Back to the view from before presenting or exporting: the building, or the scene that was open. */
  const restoreBefore = useCallback(() => {
    const id = before.current
    if (id === undefined) return
    before.current = undefined
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    setVeil(false)
    setView(id ? { mode: 'inside', id } : { mode: 'building', entering: null })
  }, [])

  const startPresenting = () => {
    before.current = insideRef.current
    setPresenting(true)
    document.documentElement.requestFullscreen?.().catch(() => undefined)
    if (flows.length) {
      enter(flows[index >= 0 ? index : 0].id, true)
      // The first step waits two seconds before it moves on by itself.
      if (!REDUCE) {
        setPaused(true)
        later(2000, () => setPaused(REDUCE))
      }
    }
  }
  const stopPresenting = useCallback(() => {
    setPresenting(false)
    setEnded(false)
    restoreBefore()
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
  }, [restoreBefore])

  /** From the end card to the building, whatever view was open before presenting. */
  const backToBuilding = () => {
    stopPresenting()
    setView({ mode: 'building', entering: null })
  }
  const restart = () => {
    setEnded(false)
    enter(flows[0].id, true)
  }
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    else root.current?.requestFullscreen?.().catch(() => undefined)
  }

  // Leaving full screen with the browser's own Esc also ends the presentation.
  useEffect(() => {
    const onChange = () => {
      setFullscreen(!!document.fullscreenElement)
      if (document.fullscreenElement || !presentingRef.current) return
      setPresenting(false)
      // While exporting, the view stays put: endExport puts it back when the file is done.
      if (!exportKind.current) restoreBefore()
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [restoreBefore])

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
    if (exporting) {
      if (k === 'Escape') done(cancelExport)
      return
    }
    if (help) {
      if (k === 'Escape' || k === '?') done(() => setHelp(false))
      return
    }
    if (k === 'Escape') {
      if (presenting) {
        if (ended) backToBuilding()
        else stopPresenting()
      } else if (view.mode === 'inside') back()
      return
    }
    if (k === '?') return done(() => setHelp(true))
    if (k === 'h' || k === 'H') return done(toggleHud)
    if (k === 'f' || k === 'F') return done(toggleFullscreen)
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

  /** Every frame drawn while exporting: to the recording, and to whoever waits for frames. */
  const tap = useCallback((canvas: HTMLCanvasElement) => {
    sink.current?.(canvas)
    waiting.current = waiting.current.filter((w) => {
      if (--w.n > 0) return true
      w.done(w.grab(canvas))
      return false
    })
  }, [])
  /** Resolves after `n` frames with what `grab` read from the last one, while its picture is there. */
  const frames = <T,>(n: number, grab: (canvas: HTMLCanvasElement) => T = () => null as T) =>
    new Promise<T>((done) => waiting.current.push({ n, grab, done: done as (v: unknown) => void }))
  const until = (ok: () => boolean, ms = 5000) =>
    new Promise<boolean>((done) => {
      const t0 = performance.now()
      const tick = () => (ok() ? done(true) : performance.now() - t0 > ms ? done(false) : window.setTimeout(tick, 50))
      tick()
    })
  const pause = (ms: number) => new Promise((done) => window.setTimeout(done, ms))
  /** `until` without timers, for the video: a hidden tab holds timers back, not messages. */
  const settle = async (ok: () => boolean, ms = 10_000) => {
    const t0 = performance.now()
    while (!ok()) {
      if (performance.now() - t0 > ms) return false
      await breathe()
    }
    return true
  }

  const endExport = () => {
    sink.current = null
    waiting.current = []
    setExporting(null)
    setPresenting(false)
    restoreBefore()
  }
  const recorder = useRef<Awaited<ReturnType<typeof encodeCanvas>> | null>(null)

  /**
   * The video: plays every scene once, frame by frame, each frame 1/30 s of the story at the chosen
   * speed, with its words, then saves the file. The stage draws only when asked (`drive`), so
   * nothing here waits for the screen, and the tab can be hidden meanwhile.
   */
  const recordVideo = async () => {
    setPreparing(false)
    if (!flows.length || !exportInfo) return
    if (!canEncode()) return flash(w.noRecording[lang])
    before.current = insideRef.current
    await fontsReady()
    cancelled.current = false
    const comp = compositor()
    let file: Awaited<ReturnType<typeof encodeCanvas>>
    try {
      file = await encodeCanvas(comp.canvas)
    } catch {
      return flash(w.noRecording[lang])
    }
    recorder.current = file
    const speed = rate
    const stories = flats.map((f) => f.stories[f.narrator])
    const total = stories.reduce((n, st) => n + sceneFrames(st.duration, speed), 0)
    // What goes over the frame being drawn, and when in the video it is; null while a scene loads.
    let now: { i: number; ms: number } | null = null
    sink.current = (canvas) => {
      if (!now || !canvas.width || !clock.current) return
      const { i, ms } = now
      // Before the first step starts there's no caption yet (the stage would show the last one's).
      const t = clock.current.current
      const c = t < (stories[i].captions[0]?.t0 ?? 0) ? null : captionAt(stories[i], t)
      const words: Overlay = { kicker: `${sceneOf(i + 1, flows.length)[lang]} · ${flats[i].language.name}`, title: flows[i].title[lang], caption: c?.[lang] ?? '', icon: c?.icon ?? '' }
      comp.draw(canvas, words, ms)
    }
    setHelp(false)
    setHud(true)
    setProgress(0)
    setExporting('video')
    setPresenting(true)
    setPaused(false)
    const dt = 1 / VIDEO.fps
    let made = 0
    try {
      if (!(await settle(() => drive.current !== null))) throw new Error('no stage')
      for (let i = 0; i < flows.length; i++) {
        const id = flows[i].id
        // Straight in: the video fades from white on its own at each scene change.
        setHovered(null)
        setView({ mode: 'inside', id })
        if (!(await settle(() => insideRef.current === id && clock.current !== null))) throw new Error('no scene')
        // The story waits at its start while the camera settles in and the furniture loads; these
        // frames aren't kept.
        const time = clock.current!
        time.paused = true
        now = null
        for (let k = 0; k < VIDEO.fps || (useProgress.getState().active && k < VIDEO.fps * 20); k++) {
          if (cancelled.current) return
          drive.current?.(dt)
          await breathe()
        }
        time.current = 0
        time.paused = false
        const frames = sceneFrames(stories[i].duration, speed)
        for (let k = 0; k < frames; k++) {
          if (cancelled.current) return
          now = { i, ms: (made * 1000) / VIDEO.fps }
          drive.current?.(dt)
          await file.add()
          made++
          if (made % 15 === 0) setProgress(made / total)
          await breathe()
        }
      }
      now = null
      const blob = await file.finish()
      if (cancelled.current) return
      recorder.current = null
      endExport()
      saveBlob(videoFileName(exportInfo.title, lang, file.ext), blob)
      flash(w.savedVideo(file.ext)[lang])
    } catch {
      if (cancelled.current) return
      file.cancel()
      recorder.current = null
      endExport()
      flash(w.videoFailed[lang])
    }
  }

  /** The slides: visits each scene, takes a still in the middle of it, then builds the .pptx. */
  const makeDeck = async () => {
    setPreparing(false)
    if (!flows.length || !exportInfo) return
    before.current = insideRef.current
    cancelled.current = false
    const comp = compositor(1600, 900)
    setHelp(false)
    setExporting('deck')
    setPresenting(true)
    const stills: (string | null)[] = []
    for (let i = 0; i < flows.length; i++) {
      if (cancelled.current) return
      enter(flows[i].id, true)
      await until(() => insideRef.current === flows[i].id)
      // The camera settles in from a wider shot and the residents load: give it a moment.
      await pause(1400)
      const st = flats[i].stories[flats[i].narrator]
      const k = Math.min(st.captions.length - 1, Math.max(1, Math.floor(st.captions.length * 0.4)))
      const c = st.captions[k]
      if (c && clock.current) clock.current.current = c.t0 + (c.t1 - c.t0) * 0.5
      setPaused(true)
      await frames(4)
      if (cancelled.current) return
      stills.push(await frames(1, (canvas) => (canvas.width ? comp.still(canvas) : null)))
    }
    try {
      const deck: Deck = {
        lang,
        title: exportInfo.title,
        summary: exportInfo.summary,
        subtitle: exportInfo.subtitle,
        scenes: flows.map((f, i) => ({
          title: f.title[lang],
          kind: flats[i].language.name,
          summary: f.summary[lang],
          image: stills[i] ?? null,
          steps: f.steps.map((s) => s.text[lang]),
          cast: flats[i].cast.map((c) => {
            const a = f.actors.find((x) => x.id === c.id)
            return { name: a ? a.name[lang] : c.id, note: a ? a.note[lang] : '', color: c.color }
          }),
        })),
      }
      // Loaded only now: the slide maker is the heaviest piece and few people need it.
      const { buildDeck, deckFileName } = await import('../export/deck')
      const blob = await buildDeck(deck)
      if (cancelled.current) return
      saveBlob(deckFileName(exportInfo.title, lang), blob)
      flash(w.savedDeck[lang])
    } catch {
      flash(w.deckFailed[lang])
    } finally {
      if (!cancelled.current) endExport()
    }
  }

  const cancelExport = () => {
    cancelled.current = true
    recorder.current?.cancel()
    recorder.current = null
    endExport()
    flash(w.cancelled[lang])
  }

  // The menu asks for a file by event; the same functions as the buttons answer it.
  const onExportEvent = (e: Event) => {
    const kind = (e as CustomEvent<{ kind?: string }>).detail?.kind
    if (!exportInfo || exportKind.current) return
    if (kind === 'deck') void makeDeck()
    else if (kind === 'video') void recordVideo()
  }
  const exportEvent = useRef(onExportEvent)
  exportEvent.current = onExportEvent
  useEffect(() => {
    const listen = (e: Event) => exportEvent.current(e)
    window.addEventListener('repartments:export', listen)
    return () => window.removeEventListener('repartments:export', listen)
  }, [])

  const onCaption = useCallback(
    (text: Caption | null, at: number, total: number) => {
      setCaption({ text, step: at, total })
      // Played once through (from its start to its last step) and started over: in an automatic
      // presentation, on to the next scene. A caption left over from the previous scene, before
      // the clock restarts, doesn't count as having seen the end.
      if (at === 0 && reachedEnd.current && presenting && auto && !exportKind.current) {
        reachedEnd.current = false
        if (index + 1 < flows.length) step(1)
        else setEnded(true)
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
      onFrame={exporting ? tap : undefined}
      drive={exporting === 'video' ? drive : undefined}
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
      fullscreen={fullscreen}
      onFullscreen={toggleFullscreen}
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

  // The scenes, newest first, with their numbers. The side panel shows them as cards and the phone strip as chips.
  const sceneRows = flows.map((f, i) => ({ f, i })).reverse()

  if (presenting) {
    return (
      <div ref={root} className="fixed inset-0 z-50 overflow-hidden text-ink" style={{ background: SKY }}>
        <Backdrop near={flow !== null} weather="sun" />
        {/* While recording, the scene is drawn 16:9 like the video, so it fills the frame. */}
        <div className="absolute inset-0 grid place-items-center">
          <div className={exporting ? 'relative aspect-video w-[min(100%,calc(100dvh*16/9))]' : 'absolute inset-0'}>{stage}</div>
        </div>
        <div aria-hidden="true" className={`pointer-events-none absolute inset-0 bg-white/80 transition-opacity duration-200 ${veil ? 'opacity-100' : 'opacity-0'}`} />
        {overlays}
        {ended && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-white/60 p-4">
            <section aria-labelledby="ended-title" className={`${glass} pointer-events-auto grid w-[min(30rem,100%)] gap-4 p-6 text-center`}>
              <h2 id="ended-title" className="text-2xl font-extrabold">
                {w.ended[lang]}
              </h2>
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" onClick={restart} className="h-11 rounded-full bg-accent px-5 text-sm font-extrabold text-white transition-transform active:scale-[0.97]">
                  {w.restart[lang]}
                </button>
                <button type="button" onClick={backToBuilding} className="h-11 rounded-full bg-ink/5 px-5 text-sm font-extrabold text-ink hover:bg-ink/10">
                  {w.backToBuilding[lang]}
                </button>
              </div>
            </section>
          </div>
        )}
        {exporting && (
          <div className="pointer-events-none absolute top-0 right-0 z-20 flex max-w-[min(34rem,100%)] justify-end p-4 md:p-6">
            <div className={`${glass} pointer-events-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2 px-5 py-3`} role="status">
              <span className="flex items-center gap-2 text-sm font-extrabold">
                <span aria-hidden="true" className={`size-3 rounded-full ${exporting === 'video' ? 'animate-pulse bg-[#e2554f]' : 'bg-accent'}`} />
                {(exporting === 'video' ? w.recording : w.makingDeck)[lang]}
                {flow && <span className="font-bold text-ink-soft">· {sceneOf(index + 1, flows.length)[lang]}</span>}
                {exporting === 'video' && <span className="font-bold text-ink-soft tabular-nums">· {Math.floor(progress * 100)}%</span>}
              </span>
              <span className="text-xs text-ink-soft">{(exporting === 'video' ? w.afk : w.keepOpen)[lang]}</span>
              <button type="button" onClick={cancelExport} className="h-9 rounded-full bg-ink/5 px-4 text-xs font-extrabold text-ink hover:bg-ink/10">
                {w.cancel[lang]} (Esc)
              </button>
            </div>
          </div>
        )}
        <div className={`pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-4 md:p-6 ${hud ? '' : 'hidden'}`}>
          <div className={`${glass} w-full max-w-full px-4 py-3 md:w-auto md:max-w-[min(40rem,70vw)]`}>
            <p className="text-xs font-bold tracking-wide text-ink-soft uppercase">{flow ? sceneOf(index + 1, flows.length)[lang] : owner}</p>
            <h2 className="text-lg leading-tight font-extrabold md:text-2xl">{flow ? flow.title[lang] : ''}</h2>
            {flow && <p className="mt-0.5 hidden text-sm text-ink-soft md:block">{flow.summary[lang]}</p>}
          </div>
          <div className={`pointer-events-auto flex flex-wrap items-center justify-end gap-2 ${exporting ? 'hidden' : ''}`}>
            <label className={`${glass} flex h-10 cursor-pointer items-center gap-2 px-3.5 text-xs font-extrabold text-ink-soft`}>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-[#2f8fe6]" />
              {w.auto[lang]}
            </label>
            <button type="button" onClick={toggleHud} aria-label={pw.hud[lang]} title={pw.hud[lang]} className={`${glass} h-10 px-3.5 text-xs font-extrabold text-ink-soft hover:text-ink`}>
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
          <div className={`pointer-events-auto flex flex-wrap items-center justify-center gap-2 ${exporting ? 'hidden' : ''}`}>
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
    <div ref={root} className="relative h-full overflow-hidden" style={{ background: SKY }}>
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
              {sceneRows.map(({ f, i }) => (
                  <li key={f.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => enter(f.id)}
                      onMouseEnter={() => setHovered(f.id)}
                      onMouseLeave={() => setHovered(null)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${hovered === f.id ? 'bg-white' : 'bg-white/50 hover:bg-white'}`}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-ink/5 text-xs font-extrabold text-ink-soft">{i + 1}º</span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm font-extrabold [overflow-wrap:anywhere]">{f.title[lang]}</span>
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

      <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3 md:p-4 lg:right-[22.5rem] ${hud ? '' : 'hidden'}`}>
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
            <>
              {/* Phones have no side panel: the scenes sit in a strip above the hint. */}
              <ol className={`${glass} pointer-events-auto flex w-full max-w-full gap-1.5 overflow-x-auto p-1.5 lg:hidden`}>
                {sceneRows.map(({ f, i }) => (
                  <li key={f.id} className="shrink-0">
                    <button type="button" onClick={() => enter(f.id)} className="h-9 rounded-full bg-white/50 px-3.5 text-sm font-extrabold whitespace-nowrap transition-colors hover:bg-white active:scale-[0.97]">
                      {i + 1} · {f.title[lang]}
                    </button>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <div className={`${glass} px-4 py-2.5 text-center text-sm font-bold text-ink-soft`}>{(TOUCH ? w.hintTouch : w.hint)[lang]}</div>
                {moved && (
                  <button type="button" onClick={() => setRecenter((n) => n + 1)} className={`${glass} pointer-events-auto px-4 py-2.5 text-sm font-extrabold`}>
                    ↺
                  </button>
                )}
              </div>
            </>
          )
        )}
      </div>
      {preparing && setup && (
        <PresentSetup
          options={setup}
          lang={lang}
          auto={auto}
          onAuto={setAuto}
          rate={rate}
          onRate={setRate}
          onVideo={exportInfo ? () => void recordVideo() : undefined}
          onDeck={exportInfo ? () => void makeDeck() : undefined}
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
