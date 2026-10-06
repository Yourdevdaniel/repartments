import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { CanvasTexture, Color, type InstancedMesh, type MeshStandardMaterial, Object3D, PlaneGeometry, SRGBColorSpace } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Boxes, type BoxSpec } from './merge'
import type { Vec3 } from './story'
import type { FlatData } from './types'
import { LOOK, useWeather } from './weather'

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
const SIDE_WALL = '#efe2d0'
const WIN_H = TOWER.floor - SLAB - SILL - LINTEL
const WIN_Y = SLAB + SILL + WIN_H / 2
const WINDOW_XS = [0, 1, 2].map((k) => EDGE + WINDOW_W / 2 + k * (WINDOW_W + PIER))

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

/**
 * Every static box of the tower (slabs, façade, window frames, balconies, walls, lobby, roof), as
 * plain data. They're merged into one mesh per colour, so the whole building costs a handful of draw
 * calls instead of the ~1,800 it took when each box was its own mesh.
 */
function towerBoxes(flats: FlatData[]): { lit: BoxSpec[]; unlit: BoxSpec[] } {
  const W = TOWER.width
  const D = TOWER.depth
  const height = towerHeight(flats.length)
  const lit: BoxSpec[] = []
  const unlit: BoxSpec[] = []
  const add = (size: Vec3, at: Vec3, color: string) => lit.push({ size, at, color })

  flats.forEach((flat, i) => {
    const y = floorBase(i)
    const facade = FACADES[i % FACADES.length]
    add([W + 0.1, SLAB, D + 0.1], [W / 2, y + SLAB / 2, 0], TRIM)
    // The room behind the glass: a floor, a warm unlit back wall and a light strip.
    add([W, 0.02, FRONT + 0.4], [W / 2, y + SLAB + 0.01, (FRONT - 0.4) / 2], '#e6d6bf')
    unlit.push({
      size: [W, TOWER.floor - SLAB, 0.02],
      at: [W / 2, y + SLAB + (TOWER.floor - SLAB) / 2, -0.4],
      color: flat.layout.rooms[0]?.wall ?? '#f3e6d6',
    })
    unlit.push({ size: [W - 0.6, 0.03, 0.1], at: [W / 2, y + TOWER.floor - 0.05, -0.1], color: '#fff3d1' })
    // Façade around three windows.
    add([W, SILL, 0.1], [W / 2, y + SLAB + SILL / 2, FRONT], facade)
    add([W, LINTEL, 0.1], [W / 2, y + TOWER.floor - LINTEL / 2, FRONT], facade)
    for (const x of [EDGE / 2, W - EDGE / 2]) add([EDGE, WIN_H, 0.1], [x, y + WIN_Y, FRONT], facade)
    for (const k of [0, 1]) add([PIER, WIN_H, 0.1], [EDGE + WINDOW_W + PIER / 2 + k * (WINDOW_W + PIER), y + WIN_Y, FRONT], facade)
    for (const x of WINDOW_XS) {
      const wy = y + WIN_Y
      add([WINDOW_W + 0.06, 0.04, 0.06], [x, wy + WIN_H / 2, FRONT + 0.02], TRIM)
      add([WINDOW_W + 0.1, 0.05, 0.12], [x, wy - WIN_H / 2 - 0.01, FRONT + 0.04], TRIM)
      add([0.04, WIN_H, 0.06], [x - WINDOW_W / 2, wy, FRONT + 0.02], TRIM)
      add([0.04, WIN_H, 0.06], [x + WINDOW_W / 2, wy, FRONT + 0.02], TRIM)
      add([0.03, WIN_H, 0.05], [x, wy, FRONT + 0.02], TRIM)
    }
    // A little balcony on every other floor.
    if (i % 2 === 1) {
      const bx = WINDOW_XS[1]
      const by = y + SLAB + SILL
      const bz = FRONT + 0.2
      add([WINDOW_W + 0.3, 0.05, 0.38], [bx, by - 0.02, bz], TRIM)
      add([WINDOW_W + 0.3, 0.035, 0.035], [bx, by + 0.26, bz + 0.18], '#ffffff')
      for (let r = 0; r < 9; r++) add([0.02, 0.26, 0.02], [bx - WINDOW_W / 2 - 0.12 + r * ((WINDOW_W + 0.24) / 8), by + 0.13, bz + 0.18], '#ffffff')
    }
    // Small window on the side wall the camera sees.
    add([0.006, 0.42, 0.5], [W + 0.124, y + 0.62, -0.2], TRIM)
    add([0.006, 0.34, 0.42], [W + 0.128, y + 0.62, -0.2], '#cfe6f7')
  })

  // Side and back walls.
  for (const x of [-0.06, W + 0.06]) add([0.12, height, D + 0.06], [x, height / 2, 0], SIDE_WALL)
  add([W, height, 0.1], [W / 2, height / 2, -FRONT], SIDE_WALL)

  // Lobby.
  const LH = TOWER.lobby
  const door = { w: 0.8, h: 0.85 }
  add([W, LH, D], [W / 2, LH / 2, 0], '#efe5d8')
  add([(W - door.w) / 2, LH, 0.1], [(W - door.w) / 4, LH / 2, FRONT], LOBBY)
  add([(W - door.w) / 2, LH, 0.1], [W - (W - door.w) / 4, LH / 2, FRONT], LOBBY)
  add([door.w, LH - door.h, 0.1], [W / 2, (LH + door.h) / 2, FRONT], LOBBY)
  add([0.03, door.h, 0.05], [W / 2, door.h / 2, FRONT + 0.04], TRIM)
  for (const x of [W * 0.17, W * 0.83]) {
    add([0.7, 0.55, 0.01], [x, 0.62, FRONT + 0.055], TRIM)
    add([0.74, 0.04, 0.09], [x, 0.32, FRONT + 0.085], TRIM)
  }

  // Roof: slab, parapet, the water tank's legs and an antenna.
  const ry = height
  const parapet = 0.22
  add([W + 0.14, SLAB, D + 0.14], [W / 2, ry + SLAB / 2, 0], TRIM)
  add([W + 0.14, parapet, 0.08], [W / 2, ry + SLAB + parapet / 2, D / 2 + 0.03], FACADES[0])
  add([W + 0.14, parapet, 0.08], [W / 2, ry + SLAB + parapet / 2, -D / 2 - 0.03], FACADES[0])
  add([0.08, parapet, D + 0.14], [-0.03, ry + SLAB + parapet / 2, 0], FACADES[0])
  add([0.08, parapet, D + 0.14], [W + 0.03, ry + SLAB + parapet / 2, 0], FACADES[0])
  for (const [x, z] of [
    [-0.18, -0.18],
    [0.18, -0.18],
    [-0.18, 0.18],
    [0.18, 0.18],
  ])
    add([0.04, 0.32, 0.04], [W - 1.0 + x, ry + SLAB + 0.16, -0.3 + z], '#9aa3b5')
  add([0.025, 0.75, 0.025], [W * 0.35, ry + SLAB + 0.37, -0.5], '#9aa3b5')
  add([0.32, 0.02, 0.02], [W * 0.35, ry + SLAB + 0.62, -0.5], '#9aa3b5')
  add([0.3, 0.12, 0.3], [0.6, ry + SLAB + 0.06, 0.2], '#d9cbb8')
  return { lit, unlit }
}

/** The three window panes of a floor as a single plane geometry. */
const PANES = mergeGeometries(
  WINDOW_XS.map((x) => {
    const g = new PlaneGeometry(WINDOW_W, WIN_H)
    g.translate(x, WIN_Y, FRONT)
    return g
  }),
)

/**
 * Everyone behind the frosted glass, in the whole tower, as two instanced meshes (bodies and heads):
 * two draw calls however many floors there are.
 */
function TowerPeople({ flats }: { flats: FlatData[] }) {
  const bodies = useRef<InstancedMesh>(null)
  const heads = useRef<InstancedMesh>(null)
  const people = useMemo(
    () =>
      flats.flatMap((flat, floor) => {
        const residents = flat.cast.slice(0, 6)
        const span = TOWER.width - 0.8
        return residents.map((r, i) => ({
          floor,
          i,
          home: 0.4 + ((i + 0.5) / residents.length) * span,
          z: -0.05 + (i % 2) * 0.25,
          color: r.color,
        }))
      }),
    [flats],
  )
  const dummy = useMemo(() => new Object3D(), [])

  useLayoutEffect(() => {
    const color = new Color()
    people.forEach((p, n) => {
      bodies.current?.setColorAt(n, color.set(p.color))
      heads.current?.setColorAt(n, color.set('#f2c7a5'))
    })
    if (bodies.current?.instanceColor) bodies.current.instanceColor.needsUpdate = true
    if (heads.current?.instanceColor) heads.current.instanceColor.needsUpdate = true
  }, [people])

  useFrame(({ clock }) => {
    const b = bodies.current
    const h = heads.current
    if (!b || !h) return
    const t = clock.elapsedTime
    people.forEach((p, n) => {
      const phase = p.floor * 1.7 + p.i * 2.1
      const x = p.home + Math.sin(t * (0.35 + p.i * 0.07) + phase) * 0.45
      const y = floorBase(p.floor) + SLAB + Math.abs(Math.sin(t * 3 + phase)) * 0.015
      dummy.position.set(x, y + 0.22, p.z)
      dummy.updateMatrix()
      b.setMatrixAt(n, dummy.matrix)
      dummy.position.set(x, y + 0.48, p.z)
      dummy.updateMatrix()
      h.setMatrixAt(n, dummy.matrix)
    })
    b.instanceMatrix.needsUpdate = true
    h.instanceMatrix.needsUpdate = true
  })

  const count = Math.max(1, people.length)
  return (
    <group>
      <instancedMesh key={`b${count}`} ref={bodies} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.11, 0.2, 3, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh key={`h${count}`} ref={heads} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.12, 10, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

/** The parts of a floor that react: frosted glass that glows, the sign, the hover frame, the click target. */
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
  const glass = useRef<MeshStandardMaterial>(null)
  const weather = useWeather()

  useFrame((_, delta) => {
    const m = glass.current
    if (!m) return
    // Windows light up at night and in the rain, and brighten under the pointer.
    const target = (hovered ? 0.55 : 0.12) + LOOK[weather].glow * 0.5
    m.emissiveIntensity += (target - m.emissiveIntensity) * Math.min(1, delta * 8)
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
      {/* Frosted glass, faked cheaply: a milky, half-transparent pane over the lit room. Real
          transmission rendered the whole scene a second time every frame. */}
      <mesh geometry={PANES}>
        <meshStandardMaterial
          ref={glass}
          color="#eef4ff"
          transparent
          opacity={0.62}
          roughness={0.3}
          emissive="#ffdca0"
          emissiveIntensity={0.12}
          depthWrite={false}
        />
      </mesh>

      <Sign flat={flat} at={[TOWER.width / 2, SLAB + SILL / 2 + 0.01, FRONT + 0.056]} lit={hovered} />

      {hovered && (
        <group>
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
      )}

      {/* One click target for the whole floor */}
      <mesh position={[TOWER.width / 2, H / 2, FRONT + 0.1]} {...events}>
        <boxGeometry args={[TOWER.width + 0.1, H, 0.05]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  )
}

/** The lobby's pieces that aren't plain boxes: glass door, awning, the owner's sign, window panes. */
function LobbyDetails({ owner }: { owner: string }) {
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
      <mesh position={[W / 2, door.h / 2, FRONT + 0.02]}>
        <boxGeometry args={[door.w - 0.06, door.h, 0.03]} />
        <meshStandardMaterial color="#bfe2f5" roughness={0.1} emissive="#fff1c9" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[W / 2, door.h + 0.08, FRONT + 0.2]} rotation={[0.35, 0, 0]} castShadow>
        <boxGeometry args={[door.w + 0.36, 0.035, 0.42]} />
        <meshStandardMaterial color="#3f9c8f" roughness={0.7} />
      </mesh>
      <mesh position={[W / 2, H - 0.14, FRONT + 0.07]}>
        <planeGeometry args={[1.5, 0.25]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      {[W * 0.17, W * 0.83].map((x) => (
        <mesh key={x} position={[x, 0.62, FRONT + 0.062]}>
          <planeGeometry args={[0.6, 0.46]} />
          <meshStandardMaterial color="#cfe6f7" roughness={0.15} emissive="#fff1c9" emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  )
}

/** Roof pieces that aren't boxes: the water tank and a bush. */
function RoofDetails({ y }: { y: number }) {
  const W = TOWER.width
  return (
    <group position={[0, y + SLAB, 0]}>
      <mesh position={[W - 1.0, 0.55, -0.3]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.46, 16]} />
        <meshStandardMaterial color="#8fb7d8" roughness={0.6} />
      </mesh>
      <mesh position={[W - 1.0, 0.82, -0.3]} castShadow>
        <coneGeometry args={[0.32, 0.13, 16]} />
        <meshStandardMaterial color="#6f97ba" roughness={0.6} />
      </mesh>
      <mesh position={[0.6, 0.2, 0.2]}>
        <icosahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color="#8fcf8a" flatShading roughness={0.85} />
      </mesh>
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
  const boxes = useMemo(() => towerBoxes(flats), [flats])
  return (
    <group position={[-TOWER.width / 2, 0, 0]}>
      <Boxes boxes={boxes.lit} cast />
      <Boxes boxes={boxes.unlit} unlit />
      <TowerPeople flats={flats} />
      <LobbyDetails owner={owner} />
      {flats.map((flat, i) => (
        <Floor key={flat.id} flat={flat} index={i} hovered={hovered === flat.id} onHover={onHover} onSelect={onSelect} />
      ))}
      <RoofDetails y={height} />
    </group>
  )
}
