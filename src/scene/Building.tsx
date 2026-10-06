import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace, type Mesh } from 'three'
import { Box, Flat } from './Flat'
import type { Vec3 } from './story'
import type { FlatData } from './types'

/** Floor to floor: room height plus the slab between floors. */
export const PITCH = 1.34
const SLAB = 0.19
const SIDE = 0.24
const DEPTH = 1.8
const FACADE = '#f3dfc6'
const TRIM = '#fbf6ee'
const LOBBY = '#eeb59b'

export function buildingSize(flats: FlatData[]) {
  const width = Math.max(...flats.map((f) => f.layout.width))
  return { width, height: PITCH * (flats.length + 1), floors: flats.length }
}

/** Where the floor of flat `i` is (the lobby is floor 0). */
export const floorY = (i: number) => PITCH * (i + 1)

function canvasText(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!, w, h)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

const FONT = 'ui-rounded, "Nunito Variable", "Nunito", "Segoe UI", system-ui, sans-serif'

/** The little sign on the slab under each flat: repo name, main language, Docker if it uses it. */
function Plaque({ flat, at }: { flat: FlatData; at: Vec3 }) {
  const { texture, aspect } = useMemo(() => {
    const scale = 3
    const h = 44 * scale
    const probe = document.createElement('canvas').getContext('2d')!
    probe.font = `800 ${22 * scale}px ${FONT}`
    const name = probe.measureText(flat.repo).width
    probe.font = `700 ${16 * scale}px ${FONT}`
    const lang = probe.measureText(flat.language.name).width
    const docker = flat.docker ? probe.measureText('Docker').width + 34 * scale : 0
    const w = Math.ceil(18 * scale + name + 20 * scale + 14 * scale + lang + docker + 18 * scale)
    const texture = canvasText(
      (g) => {
        g.fillStyle = '#ffffff'
        g.beginPath()
        g.roundRect(0, 0, w, h, 12 * scale)
        g.fill()
        g.fillStyle = '#23263a'
        g.font = `800 ${22 * scale}px ${FONT}`
        g.textBaseline = 'middle'
        let x = 18 * scale
        g.fillText(flat.repo, x, h / 2 + scale)
        x += name + 20 * scale
        g.fillStyle = flat.language.color
        g.beginPath()
        g.arc(x + 6 * scale, h / 2, 6 * scale, 0, Math.PI * 2)
        g.fill()
        x += 14 * scale + 4 * scale
        g.fillStyle = '#5b6078'
        g.font = `700 ${16 * scale}px ${FONT}`
        g.fillText(flat.language.name, x, h / 2 + scale)
        if (flat.docker) {
          x += lang + 14 * scale
          const pw = probe.measureText('Docker').width + 20 * scale
          g.fillStyle = '#2f8fe6'
          g.beginPath()
          g.roundRect(x, h / 2 - 13 * scale, pw, 26 * scale, 13 * scale)
          g.fill()
          g.fillStyle = '#ffffff'
          g.fillText('Docker', x + 10 * scale, h / 2 + scale)
        }
      },
      w,
      h,
    )
    return { texture, aspect: w / h }
  }, [flat])
  const height = 0.13
  return (
    <mesh position={[at[0] + (height * aspect) / 2, at[1], at[2]]}>
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

function Prop({ model, at, rotY = 0, scale = 1 }: { model: string; at: Vec3; rotY?: number; scale?: number }) {
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

/** Ground floor: a closed façade with a glass door, windows, an awning and the owner's name. */
function Lobby({ width, owner }: { width: number; owner: string }) {
  const H = PITCH - SLAB
  const front = DEPTH / 2
  const sign = useMemo(
    () =>
      canvasText(
        (g, w, h) => {
          g.fillStyle = '#2e3350'
          g.beginPath()
          g.roundRect(0, 0, w, h, 26)
          g.fill()
          g.fillStyle = '#ffe9b0'
          g.font = `800 64px ${FONT}`
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText(owner, w / 2, h / 2 + 4)
        },
        720,
        120,
      ),
    [owner],
  )
  const door = { x: width / 2, w: 0.7, h: 0.76 }
  const windows = [width * 0.16, width * 0.32, width * 0.68, width * 0.84]

  return (
    <group>
      <Box size={[width, 0.06, DEPTH]} at={[width / 2, -0.03, 0]} color="#e8e1d6" cast={false} />
      {/* Façade wall in pieces around the door */}
      <Box size={[door.x - door.w / 2, H, 0.08]} at={[(door.x - door.w / 2) / 2, H / 2, front]} color={LOBBY} />
      <Box
        size={[width - door.x - door.w / 2, H, 0.08]}
        at={[(width + door.x + door.w / 2) / 2, H / 2, front]}
        color={LOBBY}
      />
      <Box size={[door.w, H - door.h, 0.08]} at={[door.x, (H + door.h) / 2, front]} color={LOBBY} />
      {/* Glass door */}
      <mesh position={[door.x, door.h / 2, front - 0.01]}>
        <boxGeometry args={[door.w - 0.04, door.h, 0.03]} />
        <meshStandardMaterial color="#bfe2f5" roughness={0.1} metalness={0.1} transparent opacity={0.75} />
      </mesh>
      <Box size={[0.03, door.h, 0.05]} at={[door.x, door.h / 2, front + 0.01]} color={TRIM} />
      {/* Awning and name sign */}
      <mesh position={[door.x, door.h + 0.08, front + 0.17]} rotation={[0.35, 0, 0]} castShadow>
        <boxGeometry args={[door.w + 0.3, 0.03, 0.38]} />
        <meshStandardMaterial color="#3f9c8f" roughness={0.7} />
      </mesh>
      <mesh position={[door.x, H - 0.12, front + 0.07]}>
        <planeGeometry args={[1.32, 0.22]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      {/* Windows with white frames and a warm glow inside */}
      {windows.map((x) => (
        <group key={x} position={[x, 0.62, front + 0.045]}>
          <mesh>
            <planeGeometry args={[0.62, 0.48]} />
            <meshBasicMaterial color={TRIM} />
          </mesh>
          <mesh position={[0, 0, 0.002]}>
            <planeGeometry args={[0.54, 0.4]} />
            <meshStandardMaterial color="#cfe6f7" roughness={0.15} emissive="#fff1c9" emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[0, 0, 0.004]}>
            <planeGeometry args={[0.02, 0.4]} />
            <meshBasicMaterial color={TRIM} />
          </mesh>
          <mesh position={[0, -0.27, 0.03]}>
            <boxGeometry args={[0.66, 0.04, 0.08]} />
            <meshStandardMaterial color={TRIM} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Roof: parapet, a water tank and a few plants. */
function Roof({ width, y }: { width: number; y: number }) {
  const back = -DEPTH / 2 - 0.06
  const front = DEPTH / 2 + 0.04
  const d = front - back
  const cz = (back + front) / 2
  const parapet = 0.2
  return (
    <group position={[0, y, 0]}>
      <Box size={[width + SIDE * 2, SLAB, d]} at={[width / 2, -SLAB / 2, cz]} color={TRIM} />
      <Box size={[width + SIDE * 2, parapet, 0.08]} at={[width / 2, parapet / 2, front - 0.04]} color={FACADE} />
      <Box size={[width + SIDE * 2, parapet, 0.08]} at={[width / 2, parapet / 2, back + 0.04]} color={FACADE} />
      <Box size={[0.08, parapet, d]} at={[-SIDE + 0.04, parapet / 2, cz]} color={FACADE} />
      <Box size={[0.08, parapet, d]} at={[width + SIDE - 0.04, parapet / 2, cz]} color={FACADE} />
      {/* Water tank on legs */}
      <group position={[width - 1.1, 0, -0.35]}>
        {[
          [-0.18, -0.18],
          [0.18, -0.18],
          [-0.18, 0.18],
          [0.18, 0.18],
        ].map(([x, z]) => (
          <Box key={`${x}${z}`} size={[0.04, 0.3, 0.04]} at={[x, 0.15, z]} color="#9aa3b5" />
        ))}
        <mesh position={[0, 0.52, 0]} castShadow>
          <cylinderGeometry args={[0.28, 0.28, 0.45, 20]} />
          <meshStandardMaterial color="#8fb7d8" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.78, 0]} castShadow>
          <coneGeometry args={[0.3, 0.12, 20]} />
          <meshStandardMaterial color="#6f97ba" roughness={0.6} />
        </mesh>
      </group>
      <Prop model="pottedPlant" at={[0.4, 0, -0.2]} />
      <Prop model="pottedPlant" at={[0.75, 0, -0.45]} scale={0.8} />
      <Prop model="plantSmall2" at={[1.2, 0, -0.5]} scale={2} />
      {/* Antenna */}
      <Box size={[0.025, 0.7, 0.025]} at={[width * 0.45, 0.35, -0.5]} color="#9aa3b5" />
      <Box size={[0.3, 0.02, 0.02]} at={[width * 0.45, 0.6, -0.5]} color="#9aa3b5" />
    </group>
  )
}

type Props = {
  flats: FlatData[]
  owner: string
  hovered: string | null
  focused: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}

export function Building({ flats, owner, hovered, focused, onHover, onSelect }: Props) {
  const { width, height } = buildingSize(flats)
  const back = -DEPTH / 2 - 0.06
  const front = DEPTH / 2

  return (
    <group position={[-width / 2, 0, 0]}>
      <Lobby width={width} owner={owner} />

      {flats.map((flat, i) => {
        const y = floorY(i)
        return (
          <group key={flat.id}>
            {/* Slab under the flat; its front edge carries the plaque */}
            {/* Stops 4 cm short of the floor so it doesn't fight the room floors for the same surface */}
            <Box size={[width + SIDE * 2, SLAB - 0.04, DEPTH + 0.1]} at={[width / 2, y - 0.04 - (SLAB - 0.04) / 2, -0.04]} color={TRIM} />
            <Plaque flat={flat} at={[0.12, y - SLAB / 2, front + 0.012]} />
            <group position={[0, y, 0]}>
              <Flat
                flat={flat}
                hovered={hovered === flat.id}
                interactive={focused === null}
                onHover={onHover}
                onSelect={onSelect}
              />
            </group>
          </group>
        )
      })}

      {/* Side walls, back wall and a cornice at every floor */}
      {[-SIDE / 2, width + SIDE / 2].map((x) => (
        <Box key={x} size={[SIDE, height, DEPTH + 0.12]} at={[x, height / 2, -0.03]} color={FACADE} />
      ))}
      <Box size={[width, height, 0.08]} at={[width / 2, height / 2, back]} color={FACADE} />
      {flats.map((_, i) =>
        [-SIDE / 2, width + SIDE / 2].map((x) => (
          <Box
            key={`${i}${x}`}
            size={[SIDE + 0.06, 0.06, DEPTH + 0.2]}
            at={[x, floorY(i) - SLAB / 2, -0.02]}
            color={TRIM}
          />
        )),
      )}
      {/* Windows on the right side wall, the one the camera sees */}
      {flats.map((_, i) => (
        <group key={`w${i}`} position={[width + SIDE + 0.002, floorY(i) + 0.62, -0.1]} rotation={[0, Math.PI / 2, 0]}>
          <mesh>
            <planeGeometry args={[0.7, 0.5]} />
            <meshBasicMaterial color={TRIM} />
          </mesh>
          <mesh position={[0, 0, 0.002]}>
            <planeGeometry args={[0.6, 0.42]} />
            <meshStandardMaterial color="#cfe6f7" roughness={0.15} emissive="#fff1c9" emissiveIntensity={0.2} />
          </mesh>
        </group>
      ))}

      <Roof width={width} y={height} />
    </group>
  )
}
