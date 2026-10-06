import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CanvasTexture, SRGBColorSpace, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import { Container } from './Container'
import type { CastMember, FlatLayout, Placement } from './probe'
import { Resident } from './Resident'
import { flagAt, propAt, sample, type Story, type Vec3 } from './story'
import { useStoryTime } from './time'

const WALL = 0.06
const STUB = 0.28

function Furniture({ model, at, rotY = 0, scale = 1 }: Placement) {
  const gltf = useGLTF(`/models/furniture/${model}.glb`)
  const scene = useMemo(() => {
    const copy = gltf.scene.clone(true)
    copy.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    return copy
  }, [gltf.scene])
  return <primitive object={scene} position={at} rotation={[0, rotY, 0]} scale={scale} />
}

function Box({ size, at, color }: { size: Vec3; at: Vec3; color: string }) {
  return (
    <mesh position={at} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.92} />
    </mesh>
  )
}

/** Rooms, walls and furniture. The front is left open, dollhouse style. */
function Shell({ layout }: { layout: FlatLayout }) {
  const { depth: D, height: H, door } = layout
  const back = -D / 2
  const front = D / 2
  const walls: React.ReactNode[] = []

  layout.rooms.forEach((room, i) => {
    const w = room.x1 - room.x0
    const cx = (room.x0 + room.x1) / 2
    walls.push(<Box key={`f${i}`} size={[w, 0.06, D]} at={[cx, -0.03, 0]} color={room.floor} />)
    walls.push(<Box key={`e${i}`} size={[w, 0.07, 0.03]} at={[cx, -0.035, front + 0.015]} color="#f6efe4" />)
    walls.push(<Box key={`b${i}`} size={[w, H, WALL]} at={[cx, H / 2, back - WALL / 2]} color={room.wall} />)
    // Skirting along the back wall: a tiny detail that makes the rooms read as rooms.
    walls.push(<Box key={`s${i}`} size={[w, 0.05, 0.015]} at={[cx, 0.025, back + 0.008]} color="#ffffff" />)

    if (i > 0) {
      const x = room.x0
      const color = '#f5f1ea'
      walls.push(
        <Box key={`ib${i}`} size={[WALL, H, door[0] - back]} at={[x, H / 2, (back + door[0]) / 2]} color={color} />,
        // Low stub at the front: keeps the rooms apart without hiding whoever walks through the door.
        <Box key={`if${i}`} size={[WALL, STUB, front - door[1]]} at={[x, STUB / 2, (door[1] + front) / 2]} color={color} />,
      )
    }
  })

  walls.push(
    <Box key="left" size={[WALL, H, D + WALL]} at={[-WALL / 2, H / 2, -WALL / 2]} color="#efe9df" />,
    <Box key="right" size={[WALL, H, D + WALL]} at={[layout.width + WALL / 2, H / 2, -WALL / 2]} color="#efe9df" />,
  )

  return (
    <group>
      {walls}
      {layout.rooms.flatMap((room) => room.furniture.map((f, j) => <Furniture key={`${room.id}-${j}`} {...f} />))}
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
  const cards = ['#e9f7fd', '#fdf0e7', '#eef0ff']
  cards.forEach((color, i) => {
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
function Screen({ layout, story }: { layout: FlatLayout; story: Story }) {
  const time = useStoryTime()
  const page = useMemo(screenTexture, [])
  const material = useRef<MeshBasicMaterial>(null)
  useFrame((_, delta) => {
    const m = material.current
    if (!m) return
    const target = flagAt(story, 'tv', time.current) ? 1 : 0
    m.opacity += (target - m.opacity) * Math.min(1, delta * (time.paused ? 1000 : 6))
  })
  const [w, h] = layout.tv.size
  return (
    <group position={layout.tv.at}>
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

const CARRY: Vec3 = [0, 0.22, 0.15]

/** A letter or parcel that is handed from resident to resident. */
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
      const s = Math.sin(pose.yaw)
      const c = Math.cos(pose.yaw)
      g.position.set(pose.x + CARRY[2] * s, CARRY[1], pose.z + CARRY[2] * c)
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

export function Flat({
  layout,
  cast,
  stories,
  roofY,
}: {
  layout: FlatLayout
  cast: CastMember[]
  stories: Record<CastMember['story'], Story>
  roofY: number
}) {
  return (
    <group position={[-layout.width / 2, 0, 0]}>
      <Shell layout={layout} />
      <Screen layout={layout} story={stories.main} />
      {layout.docker && <Container width={layout.width} depth={layout.depth} height={layout.height} />}
      {cast.map((c) => (
        <Resident
          key={c.id}
          id={c.id}
          model={c.model}
          story={stories[c.story]}
          label={c.tech}
          color={c.color}
          y={c.story === 'roof' ? roofY : 0}
        />
      ))}
      <Prop id="letter" story={stories.main} cast={cast} />
      <Prop id="box" story={stories.main} cast={cast} />
    </group>
  )
}

useGLTF.preload('/models/furniture/cardboardBoxClosed.glb')
