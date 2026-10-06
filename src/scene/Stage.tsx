import { ContactShadows } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { OrthographicCamera as OrthoCam, Vector3 } from 'three'
import { Building, buildingSize, floorY } from './Building'
import { captionAt, sample, type Caption } from './story'
import { Street } from './Street'
import { StoryTimeContext, useStoryTime, type StoryTime } from './time'
import type { FlatData } from './types'

/** Room the side panel takes on wide screens; the scene centres in what's left. */
const PANEL = 360

type View = { target: Vector3; az: number; el: number; fitW: number; fitH: number }

/** How much of a flat fills the screen when you step in: about two rooms, so nobody is tiny. */
const FOCUS_WIDTH = 4.3

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
 * Flies the camera between the whole building and one flat. The overview looks down a little to show
 * the street. Inside a flat the camera comes in close, almost straight on (so the floor above doesn't
 * hide the back wall), and drifts along with whoever is doing something, like a documentary camera.
 */
function CameraRig({ flats, focused, instant }: { flats: FlatData[]; focused: string | null; instant: boolean }) {
  const { camera, size, pointer } = useThree()
  const time = useStoryTime()
  const cam = camera as OrthoCam
  const { width, height } = buildingSize(flats)
  const index = flats.findIndex((f) => f.id === focused)
  const follow = useRef<number | null>(null)

  const want = useMemo<View>(() => {
    if (index < 0) {
      return { target: new Vector3(0, height * 0.46, 0.4), az: 0.3, el: 0.3, fitW: width + 6.5, fitH: height + 2.4 }
    }
    return { target: new Vector3(0, floorY(index) + 0.5, 0), az: 0.12, el: 0.15, fitW: FOCUS_WIDTH, fitH: 2.6 }
  }, [index, width, height])

  const now = useRef<View | null>(null)

  useEffect(() => {
    const panel = size.width >= 1024 ? PANEL : 0
    if (panel) cam.setViewOffset(size.width, size.height, panel / 2, 0, size.width, size.height)
    else cam.clearViewOffset()
    cam.updateProjectionMatrix()
  }, [cam, size.width, size.height])

  useFrame((_, delta) => {
    const k = instant || !now.current ? 1 : 1 - Math.exp(-delta * 3.4)
    const v = (now.current ??= { ...want, target: want.target.clone() })
    const panel = size.width >= 1024 ? PANEL : 0

    if (index >= 0) {
      const flat = flats[index]
      const x = actionX(flat, time.current)
      if (x !== null || follow.current === null) {
        const goal = (x ?? flat.layout.width / 2) - width / 2
        follow.current = follow.current === null ? goal : follow.current + (goal - follow.current) * (1 - Math.exp(-delta * 1.4))
      }
      // Keep the flat's ends inside the frame.
      const avail = size.width - panel
      const half = avail / Math.min(avail / want.fitW, size.height / want.fitH) / 2
      const limit = Math.max(0, flat.layout.width / 2 - half + 0.15)
      want.target.x = Math.min(limit, Math.max(-limit, follow.current))
    } else {
      follow.current = null
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
    cam.zoom = Math.min((size.width - panel) / v.fitW, size.height / v.fitH)
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
  flats: FlatData[]
  owner: string
  focused: string | null
  hovered: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string | null) => void
  onCaption: (c: Caption | null, step: number, total: number) => void
}

export function Stage({ flats, owner, focused, hovered, onHover, onSelect, onCaption }: Props) {
  const reduce = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const time = useMemo<StoryTime>(() => ({ current: reduce ? 9 : 0, paused: reduce }), [reduce])
  const narrator = flats.find((f) => f.id === focused) ?? null
  const { width } = buildingSize(flats)

  return (
    <Canvas
      shadows
      orthographic
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [10, 8, 30], near: 0.1, far: 200, zoom: 60 }}
      onPointerMissed={() => focused && onSelect(null)}
    >
      <hemisphereLight args={['#ffffff', '#b9c6ff', 1.2]} />
      <directionalLight
        position={[5, 11, 9]}
        intensity={1.9}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={7}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-6, 4, 5]} intensity={0.45} color="#ffe9d6" />
      <StoryTimeContext.Provider value={time}>
        <Clock time={time} narrator={narrator} onCaption={onCaption} />
        <CameraRig flats={flats} focused={focused} instant={reduce} />
        <Suspense fallback={null}>
          <Building flats={flats} owner={owner} hovered={hovered} focused={focused} onHover={onHover} onSelect={onSelect} />
          <Street width={width} />
        </Suspense>
      </StoryTimeContext.Provider>
      <ContactShadows position={[0, -0.019, 0]} opacity={0.22} scale={22} blur={2.4} far={3} />
    </Canvas>
  )
}
