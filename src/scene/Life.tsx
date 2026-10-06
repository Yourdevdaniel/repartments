import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group, MeshStandardMaterial } from 'three'
import { Resident } from './Resident'
import { compile, type Beat, type Vec2 } from './story'
import { TOWER } from './Tower'
import { LOOK, useWeather } from './weather'

/**
 * Street life around the building: people walking by, going in and coming out, and little cars on
 * the road. It's all scenery, on loops long enough not to look like loops.
 */

const FRONT = TOWER.depth / 2
const NEAR = FRONT + 0.42
const FAR = FRONT + 0.95
const EDGE = 11
const DOOR_OUT: Vec2 = [0, FRONT + 0.42]
const DOOR_IN: Vec2 = [0, FRONT - 0.05]

type Walker = { id: string; model: string; color: string; offset: number; beats: Beat[]; start: Vec2 }

const hide = (id: string, on: boolean) => ({ [`${id}:hidden`]: on })

function walkers(): Walker[] {
  const passer = (id: string, model: string, color: string, offset: number, lane: number): Walker => ({
    id,
    model,
    color,
    offset,
    start: [-EDGE, lane],
    beats: [{ acts: { [id]: { walk: [EDGE, lane] } } }, { acts: { [id]: { walk: [EDGE, lane === NEAR ? FAR : NEAR] } } }, { acts: { [id]: { walk: [-EDGE, lane === NEAR ? FAR : NEAR] } } }, { acts: { [id]: { walk: [-EDGE, lane] } } }],
  })
  const visitor = (id: string, model: string, color: string, offset: number, from: number): Walker => ({
    id,
    model,
    color,
    offset,
    start: [from, NEAR],
    beats: [
      { flags: hide(id, false), acts: { [id]: { path: [[from * 0.12, NEAR], DOOR_OUT] } } },
      { dur: 0.8, acts: { [id]: { anim: 'interact-right', face: DOOR_IN } } },
      { acts: { [id]: { walk: DOOR_IN } } },
      // Inside for a while, then out again the other way.
      { dur: 9, flags: hide(id, true), acts: { [id]: { anim: 'idle' } } },
      { flags: hide(id, false), acts: { [id]: { walk: DOOR_OUT } } },
      { acts: { [id]: { path: [[-from * 0.12, NEAR], [-from, NEAR]] } } },
      { flags: hide(id, true), acts: { [id]: { path: [[-from, FAR + 2], [from, FAR + 2], [from, NEAR]] } } },
    ],
  })
  const bencher = (id: string, model: string, color: string, offset: number): Walker => ({
    id,
    model,
    color,
    offset,
    start: [EDGE, FAR],
    beats: [
      { acts: { [id]: { walk: [TOWER.width / 2 + 1.4, FAR] } } },
      { dur: 1.4, acts: { [id]: { anim: 'emote-yes', face: [TOWER.width / 2 + 1.4, 8] } } },
      { dur: 2.5, acts: { [id]: { anim: 'idle', face: [0, FAR] } } },
      { acts: { [id]: { walk: [-EDGE, FAR] } } },
      { flags: hide(id, true), acts: { [id]: { path: [[-EDGE, FAR + 2], [EDGE, FAR + 2], [EDGE, FAR]] } } },
      { flags: hide(id, false), dur: 0.1 },
    ],
  })
  return [
    passer('p1', 'character-female-d', '#f2a65a', 0, FAR),
    passer('p2', 'character-male-f', '#7c83ff', 17, NEAR),
    visitor('v1', 'character-female-c', '#e88aa8', 4, EDGE),
    visitor('v2', 'character-male-a', '#3f9c8f', 21, -EDGE),
    bencher('b1', 'character-male-b', '#f4d35e', 9),
  ]
}

export function Pedestrians() {
  const people = useMemo(
    () =>
      walkers().map((w) => ({
        ...w,
        story: compile({ [w.id]: { at: w.start, yaw: Math.PI / 2 } }, w.beats),
      })),
    [],
  )
  return (
    <group>
      {people.map((p) => (
        <Resident
          key={p.id}
          id={p.id}
          model={p.model}
          story={p.story}
          color={p.color}
          offset={p.offset}
          hideFlag={`${p.id}:hidden`}
          umbrella
        />
      ))}
    </group>
  )
}

const CAR_COLORS = ['#f2a65a', '#7cc6e8', '#e88aa8', '#9bd38c', '#f4d35e']

function Car({ color, lane, dir, speed, phase }: { color: string; lane: number; dir: 1 | -1; speed: number; phase: number }) {
  const ref = useRef<Group>(null)
  const wheels = useRef<Group>(null)
  const lights = useRef<MeshStandardMaterial[]>([])
  const weather = useWeather()

  useFrame(({ clock }, delta) => {
    const g = ref.current
    if (!g) return
    const span = 34
    const t = clock.elapsedTime * speed + phase
    const x = ((t % span) + span) % span - span / 2
    g.position.x = dir * x
    g.position.y = Math.abs(Math.sin(clock.elapsedTime * 9 + phase)) * 0.008
    wheels.current?.children.forEach((w) => (w.rotation.x -= delta * speed * 4 * dir))
    const glow = LOOK[weather].glow
    for (const m of lights.current) if (m) m.emissiveIntensity += (glow * 2 - m.emissiveIntensity) * Math.min(1, delta * 2)
  })

  return (
    <group ref={ref} position={[0, 0, lane]} rotation={[0, dir === 1 ? 0 : Math.PI, 0]}>
      <mesh position={[0, 0.17, 0]} castShadow>
        <boxGeometry args={[0.9, 0.2, 0.44]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <mesh position={[-0.05, 0.34, 0]} castShadow>
        <boxGeometry args={[0.48, 0.16, 0.4]} />
        <meshStandardMaterial color="#eef6ff" roughness={0.2} />
      </mesh>
      <mesh position={[-0.05, 0.43, 0]} castShadow>
        <boxGeometry args={[0.5, 0.03, 0.42]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      {[0.12, -0.12].map((z) => (
        <mesh key={z} position={[0.455, 0.19, z]}>
          <boxGeometry args={[0.02, 0.05, 0.08]} />
          <meshStandardMaterial
            ref={(m) => {
              if (m) lights.current[z > 0 ? 0 : 1] = m
            }}
            color="#fff7d6"
            emissive="#ffe9a8"
            emissiveIntensity={0}
          />
        </mesh>
      ))}
      <group ref={wheels}>
        {[
          [0.28, 0.21],
          [-0.28, 0.21],
          [0.28, -0.21],
          [-0.28, -0.21],
        ].map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, 0.08, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.06, 12]} />
            <meshStandardMaterial color="#3a3f55" roughness={0.8} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** A few cars on both lanes of the road in front. */
export function Traffic() {
  const road = FRONT + 1.3 + 0.08
  return (
    <group>
      <Car color={CAR_COLORS[0]} lane={road + 0.38} dir={1} speed={2.1} phase={0} />
      <Car color={CAR_COLORS[1]} lane={road + 0.38} dir={1} speed={2.1} phase={15} />
      <Car color={CAR_COLORS[2]} lane={road + 1.1} dir={-1} speed={1.8} phase={6} />
      <Car color={CAR_COLORS[3]} lane={road + 1.1} dir={-1} speed={1.8} phase={23} />
    </group>
  )
}
