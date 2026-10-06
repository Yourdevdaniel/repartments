import { ContactShadows, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { OrthographicCamera as OrthoCam, Vector3 } from 'three'
import { Interior } from './Interior'
import { ALL_MODELS } from './rooms'
import { captionAt, sample, type Caption } from './story'
import { Street } from './Street'
import { SceneLangContext, type SceneLang } from './lang'
import { StoryTimeContext, useStoryTime, type StoryTime } from './time'
import { floorBase, Tower, TOWER, towerHeight } from './Tower'
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
    if (pose.anim === 'idle') continue
    sum += pose.x
    n++
  }
  return n ? sum / n : null
}

/**
 * Outside, the camera frames the whole tower from across the street, and dives at a floor when you
 * click it. Inside, it comes in close and drifts along with whoever is doing something.
 */
function CameraRig({ flats, view, instant }: { flats: FlatData[]; view: View; instant: boolean }) {
  const { camera, size, pointer } = useThree()
  const time = useStoryTime()
  const cam = camera as OrthoCam
  const height = towerHeight(flats.length)
  const inside = view.mode === 'inside' ? (flats.find((f) => f.id === view.id) ?? null) : null
  const follow = useRef<number | null>(null)
  const now = useRef<Frame | null>(null)
  const mode = useRef<string>('')

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
    return { target: new Vector3(0, height * 0.47, 0.6), az: 0.36, el: 0.17, fitW: TOWER.width + 7.5, fitH: height + 2.2 }
  }, [inside, view, flats, height])

  useEffect(() => {
    const panel = size.width >= 1024 ? PANEL : 0
    if (panel) cam.setViewOffset(size.width, size.height, panel / 2, 0, size.width, size.height)
    else cam.clearViewOffset()
    cam.updateProjectionMatrix()
  }, [cam, size.width, size.height])

  useFrame((_, delta) => {
    const key = inside ? `in:${inside.id}` : 'out'
    if (key !== mode.current) {
      // Changing worlds: start from a wider shot of the new one and settle in, instead of sliding across.
      mode.current = key
      follow.current = null
      now.current = { ...want, target: want.target.clone(), fitW: want.fitW * 1.35, fitH: want.fitH * 1.35 }
    }
    const v = now.current!
    const speed = view.mode === 'building' && view.entering ? 6 : 3.2
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

    v.target.lerp(want.target, k)
    v.az += (want.az - v.az) * k
    v.el += (want.el - v.el) * k
    v.fitW += (want.fitW - v.fitW) * k
    v.fitH += (want.fitH - v.fitH) * k

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
  flats: FlatData[]
  owner: string
  view: View
  hovered: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
  onBack: () => void
  onCaption: (c: Caption | null, step: number, total: number) => void
}

export function Stage({ lang, flats, owner, view, hovered, onHover, onSelect, onBack, onCaption }: Props) {
  const reduce = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const time = useMemo<StoryTime>(() => ({ current: reduce ? 9 : 0, paused: reduce }), [reduce])
  const inside = view.mode === 'inside' ? (flats.find((f) => f.id === view.id) ?? null) : null

  return (
    <Canvas
      shadows
      flat
      orthographic
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [10, 8, 30], near: 0.1, far: 200, zoom: 60 }}
      onPointerMissed={() => inside && onBack()}
    >
      {/* No tone mapping (flat), so the pastels come out as picked instead of washed out. */}
      <hemisphereLight args={['#ffffff', '#c3cdf5', 1.05]} />
      <directionalLight
        position={[5, 11, 9]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={inside ? 4 : 12}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-6, 4, 5]} intensity={0.45} color="#ffe9d6" />
      <SceneLangContext.Provider value={lang}>
      <StoryTimeContext.Provider value={time}>
        <Clock time={time} narrator={inside} onCaption={onCaption} />
        <CameraRig flats={flats} view={view} instant={reduce} />
        <Suspense fallback={null}>
          {inside ? (
            <Interior flat={inside} />
          ) : (
            <>
              <Tower flats={flats} owner={owner} hovered={hovered} onHover={onHover} onSelect={onSelect} />
              <Street width={TOWER.width} depth={TOWER.depth} />
            </>
          )}
        </Suspense>
      </StoryTimeContext.Provider>
      </SceneLangContext.Provider>
      <ContactShadows position={[0, inside ? -0.33 : -0.019, 0]} opacity={0.22} scale={inside ? 14 : 22} blur={2.4} far={3} />
    </Canvas>
  )
}
