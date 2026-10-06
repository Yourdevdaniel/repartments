import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  type DirectionalLight,
  type Group,
  type HemisphereLight,
  type InstancedMesh,
  type MeshStandardMaterial,
  Object3D,
} from 'three'
import { LOOK, useWeather } from './weather'

const ease = (delta: number) => 1 - Math.exp(-delta * 1.6)

/** Sun, sky light and fill, easing towards the current weather instead of snapping. */
export function WeatherLights({ shadowTop }: { shadowTop: number }) {
  const weather = useWeather()
  const hemi = useRef<HemisphereLight>(null)
  const sun = useRef<DirectionalLight>(null)
  const fill = useRef<DirectionalLight>(null)
  const tmp = useMemo(() => new Color(), [])

  useFrame((_, delta) => {
    const look = LOOK[weather]
    const k = ease(delta)
    if (hemi.current) {
      hemi.current.intensity += (look.hemi - hemi.current.intensity) * k
      hemi.current.color.lerp(tmp.set(look.sky), k)
      hemi.current.groundColor.lerp(tmp.set(look.ground), k)
    }
    if (sun.current) {
      sun.current.intensity += (look.sun - sun.current.intensity) * k
      sun.current.color.lerp(tmp.set(look.sunColor), k)
    }
    if (fill.current) fill.current.intensity += (look.fill - fill.current.intensity) * k
  })

  return (
    <>
      <hemisphereLight ref={hemi} args={['#ffffff', '#c3cdf5', 1.05]} />
      <directionalLight
        ref={sun}
        position={[5, 11, 9]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={shadowTop}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight ref={fill} position={[-6, 4, 5]} intensity={0.45} color="#ffe9d6" />
    </>
  )
}

/** Puffy low-poly clouds drifting across, more and greyer when it rains. */
export function Clouds({ top }: { top: number }) {
  const weather = useWeather()
  const group = useRef<Group>(null)
  const materials = useRef<MeshStandardMaterial[]>([])
  const clouds = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        x: -14 + i * 3.7 + (i % 3) * 0.8,
        // Just below the roofline and behind the tower, so they drift past beside it.
        y: top - 1.4 + (i % 4) * 0.55,
        z: -4.6 + (i % 3) * 1.1,
        speed: 0.18 + (i % 4) * 0.05,
        scale: 0.8 + (i % 3) * 0.3,
        // Clouds past this index only show up in cloudy or rainy weather.
        rank: i / 8,
      })),
    [top],
  )
  const tmp = useMemo(() => new Color(), [])

  useFrame(({ clock }, delta) => {
    const g = group.current
    if (!g) return
    const look = LOOK[weather]
    const k = ease(delta)
    g.children.forEach((child, i) => {
      const c = clouds[i]
      const span = 32
      child.position.x = ((c.x + clock.elapsedTime * c.speed + span / 2) % span) - span / 2
      const target = c.rank < look.clouds ? 1 : 0
      const s = child.userData.s ?? 0
      child.userData.s = s + (target - s) * k
      child.scale.setScalar(c.scale * child.userData.s)
      child.visible = child.userData.s > 0.02
    })
    for (const m of materials.current) if (m) m.color.lerp(tmp.set(look.cloudColor), k)
  })

  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]}>
          {[
            [0, 0, 0, 0.55],
            [0.55, -0.1, 0.1, 0.42],
            [-0.55, -0.12, 0, 0.4],
            [0.2, 0.25, -0.1, 0.38],
          ].map(([x, y, z, r], j) => (
            <mesh key={j} position={[x, y, z]} scale={[1, 0.72, 0.8]}>
              <icosahedronGeometry args={[r, 1]} />
              <meshStandardMaterial
                ref={(m) => {
                  if (m) materials.current[i * 4 + j] = m
                }}
                color="#ffffff"
                roughness={1}
                flatShading
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

const DROPS = 700

/** Rain: thin streaks falling over the street and the building, fading in and out with the weather. */
export function Rain({ top }: { top: number }) {
  const weather = useWeather()
  const mesh = useRef<InstancedMesh>(null)
  const material = useRef<MeshStandardMaterial>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const drops = useMemo(
    () =>
      Array.from({ length: DROPS }, () => ({
        x: (Math.random() - 0.5) * 22,
        y: Math.random() * (top + 3),
        z: -2.5 + Math.random() * 7,
        v: 6 + Math.random() * 3,
      })),
    [top],
  )
  const amount = useRef(0)

  useLayoutEffect(() => {
    if (mesh.current) mesh.current.count = 0
  }, [])

  useFrame((_, delta) => {
    const m = mesh.current
    if (!m) return
    const target = LOOK[weather].rain
    amount.current += (target - amount.current) * ease(delta)
    const shown = Math.floor(DROPS * amount.current)
    m.count = shown
    if (material.current) material.current.opacity = 0.55 * Math.min(1, amount.current * 1.5)
    if (!shown) return
    const dt = Math.min(delta, 0.05)
    for (let i = 0; i < shown; i++) {
      const d = drops[i]
      d.y -= d.v * dt
      d.x += 0.6 * dt
      if (d.y < 0) {
        d.y = top + 3
        d.x = (Math.random() - 0.5) * 22
      }
      dummy.position.set(d.x, d.y, d.z)
      dummy.rotation.set(0, 0, -0.08)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, DROPS]} frustumCulled={false}>
      <boxGeometry args={[0.012, 0.22, 0.012]} />
      <meshStandardMaterial ref={material} color="#dfe9ff" transparent opacity={0} depthWrite={false} />
    </instancedMesh>
  )
}
