import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CanvasTexture, SRGBColorSpace, type Group, type MeshStandardMaterial } from 'three'
import { Box } from './Flat'
import type { Vec3 } from './story'
import type { FlatData } from './types'

/**
 * The building from the street: a tall block, one floor per repo. You can't see the rooms clearly from
 * out here; the windows are frosted glass with the residents moving behind them as soft coloured
 * shapes. Click a floor to go inside.
 */

export const TOWER = { width: 4.4, depth: 2.4, floor: 1.15, lobby: 1.3 }
const SLAB = 0.12
const SILL = 0.32
const LINTEL = 0.2
const WINDOW_W = 1.1
const PIER = 0.2
const EDGE = (TOWER.width - 3 * WINDOW_W - 2 * PIER) / 2
const FRONT = TOWER.depth / 2
const TRIM = '#fbf6ee'
/** One pastel per floor, so every repo reads as its own block. */
const FACADES = ['#f1d3b3', '#f4bfa9', '#c6e3c9', '#cfc6f0', '#f2dc98', '#bcd9f2', '#f0c2d8']
const LOBBY = '#e7a98c'

export function towerHeight(floors: number) {
  return TOWER.lobby + floors * TOWER.floor
}

export const floorBase = (i: number) => TOWER.lobby + i * TOWER.floor

const FONT = 'ui-rounded, "Nunito Variable", "Nunito", "Segoe UI", system-ui, sans-serif'

function texture(draw: (g: CanvasRenderingContext2D) => void, w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** The sign on each floor: repo name, language dot, Docker pill. */
function Sign({ flat, at, lit }: { flat: FlatData; at: Vec3; lit: boolean }) {
  const { map, aspect } = useMemo(() => {
    const s = 3
    const h = 46 * s
    const probe = document.createElement('canvas').getContext('2d')!
    probe.font = `800 ${24 * s}px ${FONT}`
    const name = probe.measureText(flat.repo).width
    probe.font = `700 ${17 * s}px ${FONT}`
    const lang = probe.measureText(flat.language.name).width
    const pill = flat.docker ? probe.measureText('Docker').width + 36 * s : 0
    const w = Math.ceil(20 * s + name + 22 * s + 16 * s + lang + pill + 20 * s)
    const map = texture(
      (g) => {
        g.fillStyle = '#ffffff'
        g.beginPath()
        g.roundRect(0, 0, w, h, 14 * s)
        g.fill()
        g.textBaseline = 'middle'
        g.fillStyle = '#23263a'
        g.font = `800 ${24 * s}px ${FONT}`
        let x = 20 * s
        g.fillText(flat.repo, x, h / 2 + s)
        x += name + 22 * s
        g.fillStyle = flat.language.color
        g.beginPath()
        g.arc(x + 6 * s, h / 2, 6 * s, 0, Math.PI * 2)
        g.fill()
        x += 16 * s + 2 * s
        g.fillStyle = '#5b6078'
        g.font = `700 ${17 * s}px ${FONT}`
        g.fillText(flat.language.name, x, h / 2 + s)
        if (flat.docker) {
          x += lang + 14 * s
          const pw = probe.measureText('Docker').width + 22 * s
          g.fillStyle = '#2f8fe6'
          g.beginPath()
          g.roundRect(x, h / 2 - 14 * s, pw, 28 * s, 14 * s)
          g.fill()
          g.fillStyle = '#ffffff'
          g.fillText('Docker', x + 11 * s, h / 2 + s)
        }
      },
      w,
      h,
    )
    return { map, aspect: w / h }
  }, [flat])
  const height = 0.2
  return (
    <mesh position={at} scale={lit ? 1.06 : 1}>
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  )
}

/** Behind the frosted glass: a lit room and the residents as soft shapes pacing about. */
function Inside({ flat, seed }: { flat: FlatData; seed: number }) {
  const people = useRef<Group>(null)
  const wall = flat.layout.rooms[0]?.wall ?? '#f3e6d6'
  const residents = flat.cast.slice(0, 6)
  useFrame(({ clock }) => {
    const g = people.current
    if (!g) return
    const t = clock.elapsedTime
    g.children.forEach((child, i) => {
      const phase = seed * 1.7 + i * 2.1
      child.position.x = child.userData.home + Math.sin(t * (0.35 + i * 0.07) + phase) * 0.45
      child.position.y = Math.abs(Math.sin(t * 3 + phase)) * 0.015
    })
  })
  const span = TOWER.width - 0.8
  return (
    <group>
      {/* Lit from inside: unlit warm wall so the windows glow through the frosted glass */}
      <mesh position={[TOWER.width / 2, (TOWER.floor - SLAB) / 2, -0.4]}>
        <planeGeometry args={[TOWER.width, TOWER.floor - SLAB]} />
        <meshBasicMaterial color={wall} />
      </mesh>
      <Box size={[TOWER.width, 0.02, FRONT + 0.4]} at={[TOWER.width / 2, 0.01, (FRONT - 0.4) / 2]} color="#e6d6bf" cast={false} />
      <mesh position={[TOWER.width / 2, TOWER.floor - SLAB - 0.05, -0.1]}>
        <boxGeometry args={[TOWER.width - 0.6, 0.03, 0.1]} />
        <meshBasicMaterial color="#fff3d1" toneMapped={false} />
      </mesh>
      <group ref={people}>
        {residents.map((r, i) => {
          const home = 0.4 + ((i + 0.5) / residents.length) * span
          return (
            <group key={r.id} position={[home, 0, -0.05 + (i % 2) * 0.25]} userData={{ home }}>
              <mesh position={[0, 0.22, 0]}>
                <capsuleGeometry args={[0.11, 0.2, 4, 10]} />
                <meshBasicMaterial color={r.color} toneMapped={false} />
              </mesh>
              <mesh position={[0, 0.48, 0]}>
                <sphereGeometry args={[0.12, 14, 12]} />
                <meshBasicMaterial color="#f2c7a5" toneMapped={false} />
              </mesh>
            </group>
          )
        })}
      </group>
    </group>
  )
}

function Floor({
  flat,
  index,
  hovered,
  onHover,
  onSelect,
}: {
  flat: FlatData
  index: number
  hovered: boolean
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}) {
  const H = TOWER.floor
  const facade = FACADES[index % FACADES.length]
  const winH = H - SLAB - SILL - LINTEL
  const winY = SLAB + SILL + winH / 2
  const xs = [0, 1, 2].map((k) => EDGE + WINDOW_W / 2 + k * (WINDOW_W + PIER))
  const glass = useRef<MeshStandardMaterial[]>([])

  useFrame((_, delta) => {
    for (const m of glass.current) {
      if (!m) continue
      const target = hovered ? 0.55 : 0.12
      m.emissiveIntensity += (target - m.emissiveIntensity) * Math.min(1, delta * 8)
    }
  })

  const events = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      onHover(flat.id)
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => {
      onHover(null)
      document.body.style.cursor = ''
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      document.body.style.cursor = ''
      onSelect(flat.id)
    },
  }

  return (
    <group position={[0, floorBase(index), 0]}>
      <Box size={[TOWER.width + 0.1, SLAB, TOWER.depth + 0.1]} at={[TOWER.width / 2, SLAB / 2, 0]} color={TRIM} />
      <group position={[0, SLAB, 0]}>
        <Inside flat={flat} seed={index} />
      </group>

      {/* Façade: spandrel, lintel and piers around three windows */}
      <Box size={[TOWER.width, SILL, 0.1]} at={[TOWER.width / 2, SLAB + SILL / 2, FRONT]} color={facade} />
      <Box size={[TOWER.width, LINTEL, 0.1]} at={[TOWER.width / 2, H - LINTEL / 2, FRONT]} color={facade} />
      {[EDGE / 2, TOWER.width - EDGE / 2].map((x) => (
        <Box key={x} size={[EDGE, winH, 0.1]} at={[x, winY, FRONT]} color={facade} />
      ))}
      {[0, 1].map((k) => (
        <Box key={k} size={[PIER, winH, 0.1]} at={[EDGE + WINDOW_W + PIER / 2 + k * (WINDOW_W + PIER), winY, FRONT]} color={facade} />
      ))}

      {xs.map((x, k) => (
        <group key={x} position={[x, winY, FRONT]}>
          {/* Frosted glass: the rooms behind it go soft, which is the point from out here */}
          <mesh>
            <planeGeometry args={[WINDOW_W, winH]} />
            <meshPhysicalMaterial
              transmission={1}
              roughness={0.38}
              thickness={0.25}
              ior={1.25}
              color="#f2f7ff"
              emissive="#fff1cf"
              emissiveIntensity={0.12}
              ref={(m) => {
                if (m) glass.current[k] = m
              }}
            />
          </mesh>
          <Box size={[WINDOW_W + 0.06, 0.04, 0.06]} at={[0, winH / 2, 0.02]} color={TRIM} />
          <Box size={[WINDOW_W + 0.1, 0.05, 0.12]} at={[0, -winH / 2 - 0.01, 0.04]} color={TRIM} />
          <Box size={[0.04, winH, 0.06]} at={[-WINDOW_W / 2, 0, 0.02]} color={TRIM} />
          <Box size={[0.04, winH, 0.06]} at={[WINDOW_W / 2, 0, 0.02]} color={TRIM} />
          <Box size={[0.03, winH, 0.05]} at={[0, 0, 0.02]} color={TRIM} />
        </group>
      ))}

      {/* A little balcony on every other floor */}
      {index % 2 === 1 && (
        <group position={[xs[1], SLAB + SILL, FRONT + 0.2]}>
          <Box size={[WINDOW_W + 0.3, 0.05, 0.38]} at={[0, -0.02, 0]} color={TRIM} />
          <Box size={[WINDOW_W + 0.3, 0.035, 0.035]} at={[0, 0.26, 0.18]} color="#ffffff" />
          {Array.from({ length: 9 }, (_, i) => (
            <Box key={i} size={[0.02, 0.26, 0.02]} at={[-WINDOW_W / 2 - 0.12 + i * ((WINDOW_W + 0.24) / 8), 0.13, 0.18]} color="#ffffff" />
          ))}
        </group>
      )}

      <Sign flat={flat} at={[TOWER.width / 2, SLAB + SILL / 2 + 0.01, FRONT + 0.056]} lit={hovered} />

      {/* Glow outline when hovered */}
      <group visible={hovered}>
        {[
          { size: [TOWER.width + 0.14, 0.035, 0.03] as Vec3, at: [TOWER.width / 2, H, FRONT + 0.09] as Vec3 },
          { size: [TOWER.width + 0.14, 0.035, 0.03] as Vec3, at: [TOWER.width / 2, SLAB, FRONT + 0.09] as Vec3 },
          { size: [0.035, H - SLAB, 0.03] as Vec3, at: [-0.07, (H + SLAB) / 2, FRONT + 0.09] as Vec3 },
          { size: [0.035, H - SLAB, 0.03] as Vec3, at: [TOWER.width + 0.07, (H + SLAB) / 2, FRONT + 0.09] as Vec3 },
        ].map((b, i) => (
          <mesh key={i} position={b.at}>
            <boxGeometry args={b.size} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
        ))}
      </group>

      {/* One click target for the whole floor */}
      <mesh position={[TOWER.width / 2, H / 2, FRONT + 0.1]} {...events}>
        <boxGeometry args={[TOWER.width + 0.1, H, 0.05]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  )
}

/** Ground floor with the entrance and the owner's name over the door. */
function Lobby({ owner }: { owner: string }) {
  const W = TOWER.width
  const H = TOWER.lobby
  const sign = useMemo(
    () =>
      texture(
        (g) => {
          g.fillStyle = '#2e3350'
          g.beginPath()
          g.roundRect(0, 0, 720, 120, 26)
          g.fill()
          g.fillStyle = '#ffe9b0'
          g.font = `800 64px ${FONT}`
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText(owner, 360, 64)
        },
        720,
        120,
      ),
    [owner],
  )
  const door = { w: 0.8, h: 0.85 }
  return (
    <group>
      <Box size={[W, H, TOWER.depth]} at={[W / 2, H / 2, 0]} color="#efe5d8" cast={false} />
      <Box size={[(W - door.w) / 2, H, 0.1]} at={[(W - door.w) / 4, H / 2, FRONT]} color={LOBBY} />
      <Box size={[(W - door.w) / 2, H, 0.1]} at={[W - (W - door.w) / 4, H / 2, FRONT]} color={LOBBY} />
      <Box size={[door.w, H - door.h, 0.1]} at={[W / 2, (H + door.h) / 2, FRONT]} color={LOBBY} />
      <mesh position={[W / 2, door.h / 2, FRONT + 0.02]}>
        <boxGeometry args={[door.w - 0.06, door.h, 0.03]} />
        <meshStandardMaterial color="#bfe2f5" roughness={0.1} emissive="#fff1c9" emissiveIntensity={0.25} />
      </mesh>
      <Box size={[0.03, door.h, 0.05]} at={[W / 2, door.h / 2, FRONT + 0.04]} color={TRIM} />
      <mesh position={[W / 2, door.h + 0.08, FRONT + 0.2]} rotation={[0.35, 0, 0]} castShadow>
        <boxGeometry args={[door.w + 0.36, 0.035, 0.42]} />
        <meshStandardMaterial color="#3f9c8f" roughness={0.7} />
      </mesh>
      <mesh position={[W / 2, H - 0.14, FRONT + 0.07]}>
        <planeGeometry args={[1.5, 0.25]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      {[W * 0.17, W * 0.83].map((x) => (
        <group key={x} position={[x, 0.62, FRONT + 0.055]}>
          <mesh>
            <planeGeometry args={[0.7, 0.55]} />
            <meshBasicMaterial color={TRIM} />
          </mesh>
          <mesh position={[0, 0, 0.002]}>
            <planeGeometry args={[0.6, 0.46]} />
            <meshStandardMaterial color="#cfe6f7" roughness={0.15} emissive="#fff1c9" emissiveIntensity={0.25} />
          </mesh>
          <Box size={[0.74, 0.04, 0.09]} at={[0, -0.3, 0.03]} color={TRIM} />
        </group>
      ))}
    </group>
  )
}

function Roof({ y }: { y: number }) {
  const W = TOWER.width
  const D = TOWER.depth
  const parapet = 0.22
  return (
    <group position={[0, y, 0]}>
      <Box size={[W + 0.14, SLAB, D + 0.14]} at={[W / 2, SLAB / 2, 0]} color={TRIM} />
      <Box size={[W + 0.14, parapet, 0.08]} at={[W / 2, SLAB + parapet / 2, D / 2 + 0.03]} color={FACADES[0]} />
      <Box size={[W + 0.14, parapet, 0.08]} at={[W / 2, SLAB + parapet / 2, -D / 2 - 0.03]} color={FACADES[0]} />
      <Box size={[0.08, parapet, D + 0.14]} at={[-0.03, SLAB + parapet / 2, 0]} color={FACADES[0]} />
      <Box size={[0.08, parapet, D + 0.14]} at={[W + 0.03, SLAB + parapet / 2, 0]} color={FACADES[0]} />
      <group position={[W - 1.0, SLAB, -0.3]}>
        {[
          [-0.18, -0.18],
          [0.18, -0.18],
          [-0.18, 0.18],
          [0.18, 0.18],
        ].map(([x, z]) => (
          <Box key={`${x}${z}`} size={[0.04, 0.32, 0.04]} at={[x, 0.16, z]} color="#9aa3b5" />
        ))}
        <mesh position={[0, 0.55, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.46, 20]} />
          <meshStandardMaterial color="#8fb7d8" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.82, 0]} castShadow>
          <coneGeometry args={[0.32, 0.13, 20]} />
          <meshStandardMaterial color="#6f97ba" roughness={0.6} />
        </mesh>
      </group>
      <Box size={[0.025, 0.75, 0.025]} at={[W * 0.35, SLAB + 0.37, -0.5]} color="#9aa3b5" />
      <Box size={[0.32, 0.02, 0.02]} at={[W * 0.35, SLAB + 0.62, -0.5]} color="#9aa3b5" />
      <mesh position={[0.6, SLAB + 0.2, 0.2]} castShadow>
        <icosahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color="#8fcf8a" flatShading roughness={0.85} />
      </mesh>
      <Box size={[0.3, 0.12, 0.3]} at={[0.6, SLAB + 0.06, 0.2]} color="#d9cbb8" />
    </group>
  )
}

type Props = {
  flats: FlatData[]
  owner: string
  hovered: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}

export function Tower({ flats, owner, hovered, onHover, onSelect }: Props) {
  const height = towerHeight(flats.length)
  return (
    <group position={[-TOWER.width / 2, 0, 0]}>
      <Lobby owner={owner} />
      {flats.map((flat, i) => (
        <Floor key={flat.id} flat={flat} index={i} hovered={hovered === flat.id} onHover={onHover} onSelect={onSelect} />
      ))}
      {/* Side and back walls, with small windows on the side the camera sees */}
      {[-0.06, TOWER.width + 0.06].map((x) => (
        <Box key={x} size={[0.12, height, TOWER.depth + 0.06]} at={[x, height / 2, 0]} color="#efe2d0" />
      ))}
      <Box size={[TOWER.width, height, 0.1]} at={[TOWER.width / 2, height / 2, -FRONT]} color="#efe2d0" />
      {flats.map((_, i) => (
        <group key={i} position={[TOWER.width + 0.125, floorBase(i) + 0.62, -0.2]} rotation={[0, Math.PI / 2, 0]}>
          <mesh>
            <planeGeometry args={[0.5, 0.42]} />
            <meshBasicMaterial color={TRIM} />
          </mesh>
          <mesh position={[0, 0, 0.002]}>
            <planeGeometry args={[0.42, 0.34]} />
            <meshStandardMaterial color="#cfe6f7" roughness={0.2} emissive="#fff1c9" emissiveIntensity={0.2} />
          </mesh>
        </group>
      ))}
      <Roof y={height} />
    </group>
  )
}
