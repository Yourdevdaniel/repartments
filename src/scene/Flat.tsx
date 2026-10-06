import { useGLTF } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CanvasTexture, Color, SRGBColorSpace, type Group, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from 'three'
import { useSceneLang } from './lang'
import { Resident } from './Resident'
import { flagAt, propAt, sample, type Story, type Vec3 } from './story'
import { useStoryTime } from './time'
import type { CastMember, Decor, FlatData, FlatLayout, Placement } from './types'

const WALL = 0.06
const STUB = 0.28

function Furniture({ model, at, rotY = 0, scale = 1, tint }: Placement) {
  const gltf = useGLTF(`/models/furniture/${model}.glb`)
  const scene = useMemo(() => {
    const copy = gltf.scene.clone(true)
    copy.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (tint) {
        // Materials are shared between clones, so tint a copy.
        const m = (mesh.material as MeshStandardMaterial).clone()
        m.color = new Color(tint)
        mesh.material = m
      }
    })
    return copy
  }, [gltf.scene, tint])
  return <primitive object={scene} position={at} rotation={[0, rotY, 0]} scale={scale} />
}

export function Box({ size, at, color, cast = true }: { size: Vec3; at: Vec3; color: string; cast?: boolean }) {
  return (
    <mesh position={at} castShadow={cast} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.92} />
    </mesh>
  )
}

function decorTexture(d: Decor) {
  const c = document.createElement('canvas')
  const scale = 256
  c.width = Math.round(d.w * scale)
  c.height = Math.round(d.h * scale)
  const g = c.getContext('2d')!
  const W = c.width
  const H = c.height
  if (d.kind === 'window') {
    const sky = g.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#9fc9ff')
    sky.addColorStop(1, '#dcebff')
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)
    g.fillStyle = 'rgba(255,255,255,0.9)'
    ;[
      [0.25, 0.3, 0.12],
      [0.38, 0.27, 0.15],
      [0.72, 0.5, 0.1],
    ].forEach(([x, y, r]) => {
      g.beginPath()
      g.arc(x * W, y * H, r * W, 0, Math.PI * 2)
      g.fill()
    })
    g.fillStyle = '#b9dcb0'
    g.fillRect(0, H * 0.82, W, H * 0.18)
    g.fillStyle = '#c9d3f5'
    g.fillRect(W * 0.08, H * 0.6, W * 0.18, H * 0.3)
    g.fillRect(W * 0.62, H * 0.52, W * 0.22, H * 0.4)
  } else if (d.kind === 'picture') {
    g.fillStyle = '#fffaf2'
    g.fillRect(0, 0, W, H)
    g.fillStyle = d.color ?? '#f2a65a'
    g.beginPath()
    g.moveTo(W * 0.1, H * 0.85)
    g.lineTo(W * 0.42, H * 0.35)
    g.lineTo(W * 0.62, H * 0.62)
    g.lineTo(W * 0.75, H * 0.48)
    g.lineTo(W * 0.92, H * 0.85)
    g.closePath()
    g.fill()
    g.beginPath()
    g.arc(W * 0.75, H * 0.25, Math.min(W, H) * 0.1, 0, Math.PI * 2)
    g.fill()
  } else {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, W, H)
    const notes = ['#ffe08a', '#a7e3ff', '#ffc2d4', '#c7f0b5', '#ffe08a', '#d9ccff']
    notes.forEach((color, i) => {
      g.fillStyle = color
      const col = i % 3
      const row = Math.floor(i / 3)
      g.fillRect(W * (0.08 + col * 0.3), H * (0.12 + row * 0.44), W * 0.22, H * 0.32)
    })
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** A window, a framed picture or a sticky-note board hung on a back wall. */
function WallDecor({ decor, z }: { decor: Decor; z: number }) {
  const map = useMemo(() => decorTexture(decor), [decor])
  const frame = decor.kind === 'window' ? '#ffffff' : decor.kind === 'board' ? '#c9c2b8' : '#7b5a43'
  const border = decor.kind === 'window' ? 0.05 : 0.03
  return (
    <group position={[decor.x, decor.y, z]}>
      <mesh castShadow>
        <boxGeometry args={[decor.w + border * 2, decor.h + border * 2, 0.03]} />
        <meshStandardMaterial color={frame} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, 0.017]}>
        <planeGeometry args={[decor.w, decor.h]} />
        {decor.kind === 'window' ? (
          <meshBasicMaterial map={map} toneMapped={false} />
        ) : (
          <meshStandardMaterial map={map} roughness={0.9} />
        )}
      </mesh>
      {decor.kind === 'window' && (
        <>
          <mesh position={[0, 0, 0.02]}>
            <boxGeometry args={[0.025, decor.h, 0.01]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0, -decor.h / 2 - 0.06, 0.04]} castShadow>
            <boxGeometry args={[decor.w + 0.16, 0.035, 0.1]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * (decor.w / 2 + 0.06), 0.02, 0.05]} castShadow>
              <boxGeometry args={[0.12, decor.h + 0.16, 0.025]} />
              <meshStandardMaterial color="#f6b6a8" roughness={0.95} />
            </mesh>
          ))}
        </>
      )}
    </group>
  )
}

const SIGN_FONT = 'ui-rounded, "Nunito Variable", "Nunito", "Segoe UI", system-ui, sans-serif'

/** The little wooden sign over each room saying what it is for. */
function RoomSign({ text, at }: { text: string; at: Vec3 }) {
  const { map, aspect } = useMemo(() => {
    const s = 4
    const h = 34 * s
    const probe = document.createElement('canvas').getContext('2d')!
    probe.font = `800 ${18 * s}px ${SIGN_FONT}`
    const w = Math.ceil(probe.measureText(text).width + 30 * s)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')!
    g.fillStyle = '#a77b5a'
    g.beginPath()
    g.roundRect(0, 0, w, h, 10 * s)
    g.fill()
    g.fillStyle = '#c8986f'
    g.beginPath()
    g.roundRect(3 * s, 3 * s, w - 6 * s, h - 6 * s, 8 * s)
    g.fill()
    g.fillStyle = '#fff8ec'
    g.font = `800 ${18 * s}px ${SIGN_FONT}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, w / 2, h / 2 + s)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 4
    return { map: t, aspect: w / h }
  }, [text])
  const h = 0.13
  return (
    <group position={at}>
      {/* Two strings it hangs from */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * h * aspect * 0.3, h / 2 + 0.05, -0.002]} rotation={[0, 0, side * -0.5]}>
          <boxGeometry args={[0.006, 0.12, 0.004]} />
          <meshBasicMaterial color="#7b5a43" />
        </mesh>
      ))}
      <mesh>
        <planeGeometry args={[h * aspect, h]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Rooms, walls and furniture. The front is left open, dollhouse style. */
function Rooms({ layout }: { layout: FlatLayout }) {
  const { depth: D, height: H, door } = layout
  const lang = useSceneLang()
  const back = -D / 2
  const front = D / 2
  const parts: React.ReactNode[] = []

  layout.rooms.forEach((room, i) => {
    const w = room.x1 - room.x0
    const cx = (room.x0 + room.x1) / 2
    parts.push(<Box key={`f${i}`} size={[w, 0.04, D]} at={[cx, -0.02, 0]} color={room.floor} cast={false} />)
    parts.push(<Box key={`b${i}`} size={[w, H, WALL]} at={[cx, H / 2, back - WALL / 2]} color={room.wall} />)
    // Skirting along the back wall: a tiny detail that makes the rooms read as rooms.
    parts.push(<Box key={`s${i}`} size={[w, 0.05, 0.015]} at={[cx, 0.025, back + 0.008]} color="#ffffff" />)

    if (i > 0) {
      const x = room.x0
      const color = '#f5f1ea'
      parts.push(
        <Box key={`ib${i}`} size={[WALL, H, door[0] - back]} at={[x, H / 2, (back + door[0]) / 2]} color={color} />,
        // Low stub at the front: keeps the rooms apart without hiding whoever walks through the door.
        <Box key={`if${i}`} size={[WALL, STUB, front - door[1]]} at={[x, STUB / 2, (door[1] + front) / 2]} color={color} />,
      )
    }
  })

  return (
    <group>
      {parts}
      {layout.rooms.flatMap((room) => room.furniture.map((f, j) => <Furniture key={`${room.id}-${j}`} {...f} />))}
      {layout.rooms.flatMap((room) =>
        (room.decor ?? []).map((d, j) => <WallDecor key={`${room.id}-d${j}`} decor={d} z={back + 0.016} />),
      )}
      {layout.rooms.map(
        (room) =>
          room.label && (
            <RoomSign key={`${room.id}-sign`} text={room.label[lang]} at={[(room.x0 + room.x1) / 2, H - 0.14, back + 0.02]} />
          ),
      )}
    </group>
  )
}

function screenTexture() {
  const c = document.createElement('canvas')
  c.width = 290
  c.height = 165
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#61dafb'
  g.fillRect(0, 0, c.width, 26)
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(16, 13, 6, 0, Math.PI * 2)
  g.fill()
  ;['#e9f7fd', '#fdf0e7', '#eef0ff'].forEach((color, i) => {
    const x = 14 + i * 92
    g.fillStyle = color
    g.fillRect(x, 40, 80, 70)
    g.fillStyle = '#c9d3e6'
    g.fillRect(x + 8, 92, 50, 8)
    g.fillStyle = ['#61dafb', '#f2a65a', '#7c83ff'][i]
    g.fillRect(x + 8, 50, 30, 30)
  })
  g.fillStyle = '#dfe5f0'
  g.fillRect(14, 124, 262, 10)
  g.fillRect(14, 142, 180, 10)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/** The living-room TV: dark until the front end "renders the page". */
function Screen({ tv, story }: { tv: NonNullable<FlatLayout['tv']>; story: Story }) {
  const time = useStoryTime()
  const page = useMemo(screenTexture, [])
  const material = useRef<MeshBasicMaterial>(null)
  useFrame((_, delta) => {
    const m = material.current
    if (!m) return
    const target = flagAt(story, 'tv', time.current) ? 1 : 0
    m.opacity += (target - m.opacity) * Math.min(1, delta * (time.paused ? 1000 : 6))
  })
  const [w, h] = tv.size
  return (
    <group position={tv.at}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color="#1d2033" />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial ref={material} map={page} transparent opacity={0} toneMapped={false} />
      </mesh>
    </group>
  )
}

const CARRY: Vec3 = [0, 0.245, 0.17]

/** A letter or parcel handed from resident to resident. */
function Prop({ id, story, cast }: { id: 'letter' | 'box'; story: Story; cast: CastMember[] }) {
  const time = useStoryTime()
  const ref = useRef<Group>(null)
  const box = useGLTF('/models/furniture/cardboardBoxClosed.glb')
  const parcel = useMemo(() => {
    const copy = box.scene.clone(true)
    copy.traverse((o) => {
      if ((o as Mesh).isMesh) o.castShadow = true
    })
    return copy
  }, [box.scene])
  const residents = useMemo(() => new Set(cast.map((c) => c.id)), [cast])

  useFrame(() => {
    const g = ref.current
    if (!g) return
    const holder = propAt(story, id, time.current)
    if (holder === null) {
      g.visible = false
      return
    }
    g.visible = true
    if (typeof holder === 'string' && residents.has(holder)) {
      const pose = sample(story, holder, time.current)
      g.position.set(pose.x + CARRY[2] * Math.sin(pose.yaw), CARRY[1], pose.z + CARRY[2] * Math.cos(pose.yaw))
      g.rotation.y = pose.yaw
    } else if (Array.isArray(holder)) {
      g.position.set(holder[0], holder[1], holder[2])
      g.rotation.y = 0
    }
  })

  return (
    <group ref={ref} visible={false}>
      {id === 'box' ? (
        <primitive object={parcel} scale={0.78} position={[-0.082, 0, 0.082]} />
      ) : (
        <group>
          <mesh castShadow position={[0, 0.01, 0]}>
            <boxGeometry args={[0.16, 0.012, 0.11]} />
            <meshStandardMaterial color="#fffdf7" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.018, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.006, 16]} />
            <meshStandardMaterial color="#e2554f" />
          </mesh>
        </group>
      )}
    </group>
  )
}

/** A soft white frame around the opening of the flat under the pointer. */
function Highlight({ layout, on }: { layout: FlatLayout; on: boolean }) {
  const { width: W, height: H, depth: D } = layout
  const z = D / 2 + 0.03
  const t = 0.035
  const color = '#ffffff'
  return (
    <group visible={on}>
      {[
        { size: [W + 0.1, t, t] as Vec3, at: [W / 2, H + 0.02, z] as Vec3 },
        { size: [W + 0.1, t, t] as Vec3, at: [W / 2, -0.02, z] as Vec3 },
        { size: [t, H + 0.06, t] as Vec3, at: [-0.03, H / 2, z] as Vec3 },
        { size: [t, H + 0.06, t] as Vec3, at: [W + 0.03, H / 2, z] as Vec3 },
      ].map((b, i) => (
        <mesh key={i} position={b.at}>
          <boxGeometry args={b.size} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

type FlatProps = {
  flat: FlatData
  hovered: boolean
  interactive: boolean
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}

export function Flat({ flat, hovered, interactive, onHover, onSelect }: FlatProps) {
  const { layout, cast, stories } = flat
  const narrator = stories[flat.narrator]

  const events = interactive
    ? {
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
    : {}

  return (
    <group>
      <Rooms layout={layout} />
      {layout.tv && <Screen tv={layout.tv} story={narrator} />}
      {cast.map((c) => (
        <Resident key={c.id} id={c.id} model={c.model} story={stories[c.story]} label={c.tech} color={c.color} />
      ))}
      {Object.keys(narrator.props).includes('letter') && <Prop id="letter" story={narrator} cast={cast} />}
      {Object.keys(narrator.props).includes('box') && <Prop id="box" story={narrator} cast={cast} />}
      <Highlight layout={layout} on={hovered && interactive} />
      {/* Invisible hit area over the opening, so the whole flat is one click target. */}
      <mesh position={[layout.width / 2, layout.height / 2, 0]} {...events}>
        <boxGeometry args={[layout.width, layout.height, layout.depth]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  )
}

useGLTF.preload('/models/furniture/cardboardBoxClosed.glb')
