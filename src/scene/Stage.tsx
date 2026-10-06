import { ContactShadows, OrbitControls, OrthographicCamera } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import type { OrthographicCamera as OrthoCam } from 'three'
import { Flat } from './Flat'
import { cast, layout, ROOF_Y, stories } from './probe'
import { captionAt, type Caption } from './story'
import { StoryTimeContext, type StoryTime } from './time'

/** Room the side panel takes on wide screens; the scene centres in what's left. */
const PANEL = 340

/** Fits the flat to the window whenever it resizes. */
function Fit({ width, height }: { width: number; height: number }) {
  const { size, camera } = useThree()
  useEffect(() => {
    const cam = camera as OrthoCam
    const panel = size.width >= 1024 ? PANEL : 0
    cam.zoom = Math.min((size.width - panel) / width, size.height / height)
    if (panel) cam.setViewOffset(size.width, size.height, panel / 2, 0, size.width, size.height)
    else cam.clearViewOffset()
    cam.updateProjectionMatrix()
  }, [size.width, size.height, camera, width, height])
  return null
}

function Clock({ time, onCaption }: { time: StoryTime; onCaption: (c: Caption | null, step: number) => void }) {
  const last = useRef<Caption | null | undefined>(undefined)
  useFrame((_, delta) => {
    if (!time.paused) time.current += Math.min(delta, 0.1)
    const caption = captionAt(stories.main, time.current)
    if (caption !== last.current) {
      last.current = caption
      onCaption(caption, caption ? stories.main.captions.findIndex((c) => c.caption === caption) : -1)
    }
  })
  return null
}

const STILL = (() => {
  // With reduced motion, freeze on the moment that explains the most: the parcel being checked.
  const beat = stories.main.captions.find((c) => c.caption.en.startsWith('pytest'))
  return beat ? beat.t0 + 2.2 : 0
})()

export function Stage({ onCaption }: { onCaption: (c: Caption | null, step: number) => void }) {
  const time = useMemo<StoryTime>(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    return { current: reduce ? STILL : 0, paused: reduce }
  }, [])

  return (
    <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <OrthographicCamera makeDefault position={[5.2, 5.6, 15]} near={0.1} far={100} />
      <Fit width={7.6} height={4.4} />
      <OrbitControls
        target={[0, 0.55, 0]}
        enablePan={false}
        minAzimuthAngle={-0.7}
        maxAzimuthAngle={0.9}
        minPolarAngle={0.95}
        maxPolarAngle={1.4}
        minZoom={60}
        maxZoom={420}
        enableDamping
      />
      <hemisphereLight args={['#ffffff', '#b9c6ff', 1.25]} />
      <directionalLight
        position={[4, 9, 7]}
        intensity={1.9}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-6, 3, 4]} intensity={0.45} color="#ffe9d6" />
      <StoryTimeContext.Provider value={time}>
        <Clock time={time} onCaption={onCaption} />
        <Suspense fallback={null}>
          <Flat layout={layout} cast={cast} stories={stories} roofY={ROOF_Y} />
        </Suspense>
      </StoryTimeContext.Provider>
      <ContactShadows position={[0, -0.15, 0]} opacity={0.28} scale={14} blur={2.6} far={2} />
    </Canvas>
  )
}
