import { ContactShadows, PerformanceMonitor, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { OrthographicCamera as OrthoCam, Vector3 } from 'three'
import { Interior } from './Interior'
import { Manager, Pedestrians, Traffic } from './Life'
import { neighborhood } from './lot'
import { Clouds, Rain, WeatherLights } from './Sky'
import { ALL_MODELS } from './rooms'
import { clampOrbit, HOME, isHome, zoomAt, type Orbit } from './orbit'
import { captionAt, sample, type Caption } from './story'
import { Neighbors, Street } from './Street'
import { SceneLangContext, type SceneLang } from './lang'
import { StoryTimeContext, useStoryTime, type StoryTime } from './time'
import { floorBase, Tower, TOWER, towerHeight } from './Tower'
import { WeatherContext, type Weather } from './weather'
import type { FlatData } from './types'

// Fetch every flat's models up front, so stepping inside never waits on the network.
for (const m of ALL_MODELS.furniture) useGLTF.preload(`/models/furniture/${m}.glb`)
for (const m of ALL_MODELS.characters) useGLTF.preload(`/models/characters/${m}.glb`)

/** Room the side panel takes on wide screens; the scene centres in what's left. */
const PANEL = 360
/** Inside a flat, about two big rooms fill the screen. */
const INSIDE_WIDTH = 4.0

export type View = { mode: 'building'; entering: string | null } | { mode: 'inside'; id: string }

type Frame = { target: Vector3; az: number; el: number; fitW: number; fitH: number }

/** Where the action is in a flat right now: the middle of whoever isn't standing still. */
function actionX(flat: FlatData, t: number): number | null {
  const story = flat.stories[flat.narrator]
  let sum = 0
  let n = 0
  for (const c of flat.cast) {
    if (c.story !== flat.narrator) continue
    const pose = sample(story, c.id, t)
    if (pose.anim === 'idle' || pose.rest) continue
    sum += pose.x
    n++
  }
  return n ? sum / n : null
}

/** Radians the tower turns per pixel dragged sideways. */
const TURN_PER_PX = 0.006

/**
 * Outside, the camera frames the whole tower from across the street, and dives at a floor when you
 * click it. The visitor can turn round it, zoom in and ride up and down it (see `orbit.ts`). Inside,
 * it comes in close and drifts along with whoever is doing something.
 */
function CameraRig({
  flats,
  lot,
  view,
  instant,
  recenter,
  onMoved,
}: {
  flats: FlatData[]
  lot: number
  view: View
  instant: boolean
  recenter: number
  onMoved: (moved: boolean) => void
}) {
  const { camera, size, pointer, gl } = useThree()
  const time = useStoryTime()
  const cam = camera as OrthoCam
  const height = towerHeight(flats.length)
  const inside = view.mode === 'inside' ? (flats.find((f) => f.id === view.id) ?? null) : null
  const follow = useRef<number | null>(null)
  const now = useRef<Frame | null>(null)
  const mode = useRef<string>('')
  const orbit = useRef<Orbit>(HOME)
  const moved = useRef(false)
  /** Seconds the camera keeps up tightly with the visitor's hand after their last input. */
  const snappy = useRef(0)
  const aim = useMemo(() => new Vector3(), [])
  const free = view.mode === 'building' && !view.entering

  const want = useMemo<Frame>(() => {
    if (inside) {
      const fitW = Math.min(inside.layout.width + 0.8, INSIDE_WIDTH)
      return { target: new Vector3(0, 0.66, 0.1), az: 0.16, el: 0.22, fitW, fitH: 2.15 }
    }
    const entering = view.mode === 'building' ? flats.findIndex((f) => f.id === view.entering) : -1
    if (entering >= 0) {
      return {
        target: new Vector3(0, floorBase(entering) + TOWER.floor / 2, TOWER.depth / 2),
        az: 0.12,
        el: 0.08,
        fitW: TOWER.width * 0.7,
        fitH: TOWER.floor * 0.8,
      }
    }
    // Room for the roof and the street, plus the header and the hint at the bottom of the screen. A
    // phone held upright frames the tower tighter at the sides (the trees can go off screen) and
    // leaves more above and below, where its header and buttons stack up.
    const upright = size.width < size.height
    return {
      target: new Vector3(0, height * 0.5, 0.6),
      az: 0.36,
      el: 0.17,
      fitW: TOWER.width + (upright ? 2.6 : 7.5),
      fitH: upright ? height * 1.45 + 1.2 : height + 3.4,
    }
  }, [inside, view, flats, height, size.width, size.height])

  // The latest of what the input handlers read, so they're bound once instead of every render.
  const live = useRef({ free, want, size, onMoved })
  live.current = { free, want, size, onMoved }

  const report = () => {
    const m = !isHome(orbit.current)
    if (m === moved.current) return
    moved.current = m
    live.current.onMoved(m)
  }

  // A new building, a step inside, or the recentre button: back to the whole tower.
  useEffect(() => {
    orbit.current = HOME
    report()
  }, [recenter, flats, view.mode])

  useEffect(() => {
    const el = gl.domElement
    el.style.touchAction = 'none'
    const pts = new Map<number, { x: number; y: number }>()
    let travel = 0
    let dragged = false
    /** How far a press can wander and still count as a click; fingers wobble more than mice. */
    let slop = 6

    const apply = (next: Orbit) => {
      const { want } = live.current
      orbit.current = clampOrbit(next, want.az, want.fitW, want.fitH)
      snappy.current = 0.3
      report()
    }
    /** Pixels per world unit at zoom 1, and where the middle of the shot is on screen. */
    const frame = () => {
      const { want, size } = live.current
      const avail = size.width - (size.width >= 1024 ? PANEL : 0)
      const rect = el.getBoundingClientRect()
      return { scale: Math.min(avail / want.fitW, size.height / want.fitH), cx: rect.left + avail / 2, cy: rect.top + size.height / 2 }
    }
    const centre = () => {
      let x = 0
      let y = 0
      for (const p of pts.values()) {
        x += p.x
        y += p.y
      }
      return { x: x / pts.size, y: y / pts.size }
    }
    const spread = () => {
      const [a, b] = [...pts.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }

    const down = (e: PointerEvent) => {
      if (!live.current.free) return
      if (pts.size === 0) {
        travel = 0
        dragged = false
        slop = e.pointerType === 'touch' ? 12 : 6
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId)
      if (!p || !live.current.free) return
      const { scale, cx, cy } = frame()
      const o = orbit.current
      const px = scale * o.zoom
      if (pts.size === 1) {
        const dx = e.clientX - p.x
        const dy = e.clientY - p.y
        p.x = e.clientX
        p.y = e.clientY
        travel += Math.abs(dx) + Math.abs(dy)
        if (travel > slop) el.style.cursor = 'grabbing'
        // Grab and drag: sideways turns the tower, up and down rides along it. Right button or
        // Shift slides sideways instead of turning.
        if (e.buttons & 2 || e.shiftKey) apply({ ...o, s: o.s - dx / px, y: o.y + dy / px })
        else apply({ ...o, az: o.az - dx * TURN_PER_PX, y: o.y + dy / px })
        return
      }
      // Two fingers: pinch to zoom round the point between them, move them together to slide.
      const c0 = centre()
      const d0 = spread()
      p.x = e.clientX
      p.y = e.clientY
      const c1 = centre()
      const d1 = spread()
      travel += Math.abs(c1.x - c0.x) + Math.abs(c1.y - c0.y) + Math.abs(d1 - d0)
      const slid = { ...o, s: o.s - (c1.x - c0.x) / px, y: o.y + (c1.y - c0.y) / px }
      apply(d0 > 0 ? zoomAt(slid, d1 / d0, c1.x - cx, cy - c1.y, scale) : slid)
    }
    const up = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return
      if (travel > slop) dragged = true
      if (pts.size === 0) el.style.cursor = ''
    }
    // A drag that happens to end over a flat isn't a click on it.
    const click = (e: MouseEvent) => {
      if (!dragged) return
      e.stopPropagation()
      dragged = false
    }
    const wheel = (e: WheelEvent) => {
      if (!live.current.free) return
      e.preventDefault()
      const { scale, cx, cy } = frame()
      const lines = e.deltaMode === 1 ? 16 : 1
      // Trackpad pinches arrive as ctrl+wheel with small deltas.
      const factor = Math.exp(-e.deltaY * lines * (e.ctrlKey ? 0.01 : 0.0015))
      apply(zoomAt(orbit.current, factor, e.clientX - cx, cy - e.clientY, scale))
    }
    const menu = (e: MouseEvent) => live.current.free && e.preventDefault()
    const key = (e: KeyboardEvent) => {
      if (!live.current.free || e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      const o = orbit.current
      const { scale } = frame()
      const step = 60 / (scale * o.zoom)
      const next: Record<string, Orbit> = {
        ArrowLeft: { ...o, az: o.az - 0.15 },
        ArrowRight: { ...o, az: o.az + 0.15 },
        ArrowUp: { ...o, y: o.y + step },
        ArrowDown: { ...o, y: o.y - step },
        '+': zoomAt(o, 1.25, 0, 0, scale),
        '=': zoomAt(o, 1.25, 0, 0, scale),
        '-': zoomAt(o, 0.8, 0, 0, scale),
        '0': HOME,
        Escape: HOME,
      }
      if (!next[e.key]) return
      e.preventDefault()
      apply(next[e.key])
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('click', click, true)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('contextmenu', menu)
    window.addEventListener('keydown', key)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('click', click, true)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('contextmenu', menu)
      window.removeEventListener('keydown', key)
    }
  }, [gl])

  useEffect(() => {
    const panel = size.width >= 1024 ? PANEL : 0
    if (panel) cam.setViewOffset(size.width, size.height, panel / 2, 0, size.width, size.height)
    else cam.clearViewOffset()
    cam.updateProjectionMatrix()
  }, [cam, size.width, size.height])

  useFrame((_, delta) => {
    const key = inside ? `in:${inside.id}` : `out:${lot}`
    if (key !== mode.current) {
      // Changing worlds: start from a wider shot of the new one and settle in, instead of sliding across.
      mode.current = key
      follow.current = null
      now.current = { ...want, target: want.target.clone(), fitW: want.fitW * 1.35, fitH: want.fitH * 1.35 }
    }
    const v = now.current!
    snappy.current = Math.max(0, snappy.current - delta)
    const speed = snappy.current > 0 ? 14 : view.mode === 'building' && view.entering ? 6 : 3.2
    const k = instant ? 1 : 1 - Math.exp(-delta * speed)
    const panel = size.width >= 1024 ? PANEL : 0
    const avail = size.width - panel

    if (inside) {
      const x = actionX(inside, time.current)
      if (x !== null || follow.current === null) {
        const goal = (x ?? inside.layout.width / 2) - inside.layout.width / 2
        follow.current =
          follow.current === null ? goal : follow.current + (goal - follow.current) * (1 - Math.exp(-delta * 1.4))
      }
      const half = avail / Math.min(avail / want.fitW, size.height / want.fitH) / 2
      const limit = Math.max(0, inside.layout.width / 2 - half + 0.25)
      want.target.x = Math.min(limit, Math.max(-limit, follow.current))
    }

    // The visitor's turn, zoom and slide go on top of the framed shot, sliding along the screen.
    const o = free ? orbit.current : HOME
    const turn = want.az + o.az
    aim.set(Math.cos(turn) * o.s, o.y, -Math.sin(turn) * o.s).add(want.target)
    v.target.lerp(aim, k)
    v.az += (turn - v.az) * k
    v.el += (want.el - v.el) * k
    v.fitW += (want.fitW / o.zoom - v.fitW) * k
    v.fitH += (want.fitH / o.zoom - v.fitH) * k

    // A touch of parallax so the diorama feels alive under the pointer.
    const az = v.az + (instant ? 0 : pointer.x * 0.035)
    const el = v.el + (instant ? 0 : pointer.y * 0.02)
    const dist = 40
    cam.position.set(
      v.target.x + Math.sin(az) * Math.cos(el) * dist,
      v.target.y + Math.sin(el) * dist,
      v.target.z + Math.cos(az) * Math.cos(el) * dist,
    )
    cam.lookAt(v.target)
    cam.zoom = Math.min(avail / v.fitW, size.height / v.fitH)
    cam.updateProjectionMatrix()
  })

  return null
}

/** Development only: exposes draw calls and triangles on window so performance can be measured. */
function RenderStats() {
  const { gl } = useThree()
  useFrame(() => {
    ;(window as unknown as { __render?: object }).__render = { calls: gl.info.render.calls, triangles: gl.info.render.triangles, programs: gl.info.programs?.length, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures }
  })
  return null
}

function Clock({
  time,
  narrator,
  onCaption,
}: {
  time: StoryTime
  narrator: FlatData | null
  onCaption: (c: Caption | null, step: number, total: number) => void
}) {
  const last = useRef<Caption | null | undefined>(undefined)
  useFrame((_, delta) => {
    if (!time.paused) time.current += Math.min(delta, 0.1)
    const story = narrator ? narrator.stories[narrator.narrator] : null
    const caption = story ? captionAt(story, time.current) : null
    if (caption !== last.current) {
      last.current = caption
      const step = story && caption ? story.captions.findIndex((c) => c.caption === caption) : -1
      onCaption(caption, step, story?.captions.length ?? 0)
    }
  })
  return null
}

type Props = {
  lang: SceneLang
  weather: Weather
  flats: FlatData[]
  owner: string
  view: View
  hovered: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
  onBack: () => void
  onCaption: (c: Caption | null, step: number, total: number) => void
  /** Bumped to put the camera back on the whole tower. */
  recenter: number
  /** Whether the visitor has turned, zoomed or slid away from the whole-tower shot. */
  onMoved: (moved: boolean) => void
  /** Which building on the owner's street this is (0 = the first). */
  lot: number
  /** When this changes, the stories start again from their first step (a presentation entering a scene). */
  restart?: string | number | null
}

export function Stage({ lang, weather, flats, owner, view, hovered, onHover, onSelect, onBack, onCaption, recenter, onMoved, lot, restart }: Props) {
  const hood = useMemo(() => neighborhood(owner, lot), [owner, lot])
  const reduce = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const time = useMemo<StoryTime>(() => ({ current: reduce ? 9 : 0, paused: reduce }), [reduce])
  // Before the next frame draws, so the new scene never shows a moment from the middle of its story.
  useLayoutEffect(() => {
    if (restart !== undefined && restart !== null && !reduce) time.current = 0
  }, [restart, reduce, time])
  const inside = view.mode === 'inside' ? (flats.find((f) => f.id === view.id) ?? null) : null
  // Sharp on capable screens, softer when the frame rate drops (PerformanceMonitor below).
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, 1.5))

  return (
    <Canvas
      shadows
      flat
      orthographic
      dpr={dpr}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [10, 8, 30], near: 0.1, far: 200, zoom: 60 }}
      onPointerMissed={() => inside && onBack()}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(Math.min(window.devicePixelRatio || 1, 1.5))} />
      <WeatherContext.Provider value={weather}>
      {/* No tone mapping (flat), so the pastels come out as picked instead of washed out. */}
      <WeatherLights shadowTop={inside ? 4 : 12} indoor={inside !== null} />
      <SceneLangContext.Provider value={lang}>
      <StoryTimeContext.Provider value={time}>
        <Clock time={time} narrator={inside} onCaption={onCaption} />
        <CameraRig flats={flats} lot={lot} view={view} instant={reduce} recenter={recenter} onMoved={onMoved} />
        {import.meta.env.DEV && <RenderStats />}
        <Suspense fallback={null}>
          {inside ? (
            <Interior flat={inside} />
          ) : (
            <>
              <Tower flats={flats} owner={owner} hood={hood} hovered={hovered} onHover={onHover} onSelect={onSelect} />
              <Street width={TOWER.width} depth={TOWER.depth} variant={hood.street} />
              <Neighbors specs={hood.neighbors} />
              <Pedestrians />
              <Manager owner={owner} />
              <Traffic />
              <Clouds top={towerHeight(flats.length)} />
              <Rain top={towerHeight(flats.length)} />
            </>
          )}
        </Suspense>
      </StoryTimeContext.Provider>
      </SceneLangContext.Provider>
      </WeatherContext.Provider>
      {/* Rendered once per view: the soft ground shadow doesn't need redrawing every frame. */}
      <ContactShadows key={inside ? inside.id : 'out'} frames={1} position={[0, inside ? -0.33 : -0.019, 0]} opacity={0.22} scale={inside ? 14 : 22} blur={2.4} far={3} resolution={256} />
    </Canvas>
  )
}
