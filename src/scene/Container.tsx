import { useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'

const BLUE = '#2f8fe6'
const RIB = '#2a80d0'
const FRAME = '#1d64ad'
const CORNER = '#174d86'

/** z where the cutaway roof stops. Anyone walking on the roof stays behind it. */
export const ROOF_CUT = -0.2

function stencil(text: string) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = FRAME
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#ffffff'
  g.font = '900 40px ui-rounded, "Nunito", "Segoe UI", system-ui, sans-serif'
  g.textBaseline = 'middle'
  g.fillText(text, 18, 34)
  // A row of little containers, the Docker whale's cargo.
  for (let i = 0; i < 4; i++) {
    g.fillRect(c.width - 150 + i * 32, 22, 26, 22)
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

/**
 * When a repo uses Docker, the whole flat sits inside a shipping container: ribbed walls and roof,
 * corner castings, lock rods on the doors. The front is open and the roof is cut back (a cutaway) so
 * the camera can see all the way to the back wall.
 */
export function Container({ width, depth, height }: { width: number; depth: number; height: number }) {
  const label = useMemo(() => stencil('docker'), [])
  const x0 = -0.1
  const x1 = width + 0.1
  const w = x1 - x0
  const cx = (x0 + x1) / 2
  const back = -depth / 2 - 0.12
  const front = depth / 2 + 0.05
  const d = front - back
  const cz = (back + front) / 2
  const top = height + 0.06
  const roofT = 0.08
  /** Where the cutaway roof ends. */
  const cut = ROOF_CUT
  const roofD = cut - back
  const roofZ = (back + cut) / 2

  const ribs = useMemo(() => {
    const list: number[] = []
    for (let x = x0 + 0.12; x < x1 - 0.08; x += 0.2) list.push(x)
    return list
  }, [x0, x1])

  const sideRibs = useMemo(() => {
    const list: number[] = []
    for (let z = back + 0.12; z < front - 0.08; z += 0.2) list.push(z)
    return list
  }, [back, front])

  return (
    <group>
      {/* Floor and roof */}
      <mesh position={[cx, -0.1, cz]} receiveShadow>
        <boxGeometry args={[w, 0.08, d]} />
        <meshStandardMaterial color={FRAME} roughness={0.7} />
      </mesh>
      <mesh position={[cx, top + roofT / 2, roofZ]} castShadow receiveShadow>
        <boxGeometry args={[w, roofT, roofD]} />
        <meshStandardMaterial color={BLUE} roughness={0.6} />
      </mesh>
      {/* The cut face of the roof, darker so it reads as a section */}
      <mesh position={[cx, top + roofT / 2, cut + 0.006]}>
        <boxGeometry args={[w, roofT + 0.002, 0.012]} />
        <meshStandardMaterial color={CORNER} roughness={0.6} />
      </mesh>
      {ribs.map((x) => (
        <mesh key={`r${x}`} position={[x, top + roofT + 0.008, roofZ]} castShadow>
          <boxGeometry args={[0.06, 0.016, roofD - 0.04]} />
          <meshStandardMaterial color={RIB} roughness={0.6} />
        </mesh>
      ))}

      {/* Back wall, behind the rooms */}
      <mesh position={[cx, height / 2, back + 0.02]}>
        <boxGeometry args={[w, height + 0.2, 0.04]} />
        <meshStandardMaterial color={BLUE} roughness={0.6} />
      </mesh>

      {/* Side walls, ribbed on the outside */}
      {[x0 - 0.02, x1 + 0.02].map((x, side) => (
        <group key={x}>
          <mesh position={[x, height / 2, cz]} castShadow receiveShadow>
            <boxGeometry args={[0.04, height + 0.2, d]} />
            <meshStandardMaterial color={BLUE} roughness={0.6} />
          </mesh>
          {sideRibs.map((z) => (
            <mesh key={z} position={[x + (side ? 0.03 : -0.03), height / 2, z]} castShadow>
              <boxGeometry args={[0.02, height + 0.12, 0.07]} />
              <meshStandardMaterial color={RIB} roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Lock rods and handles on the door end */}
      {[-0.55, -0.2, 0.15, 0.5].map((z) => (
        <group key={z} position={[x1 + 0.075, height / 2, z]}>
          <mesh>
            <cylinderGeometry args={[0.012, 0.012, height + 0.1, 8]} />
            <meshStandardMaterial color="#c9d6e6" metalness={0.4} roughness={0.4} />
          </mesh>
          <mesh position={[0.02, -0.18, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.01, 0.01, 0.06, 8]} />
            <meshStandardMaterial color="#c9d6e6" metalness={0.4} roughness={0.4} />
          </mesh>
        </group>
      ))}

      {/* Front frame (only at the bottom, so nothing hangs in front of the rooms) */}
      <mesh position={[cx, -0.1, front + 0.02]}>
        <boxGeometry args={[w + 0.08, 0.12, 0.05]} />
        <meshStandardMaterial color={FRAME} roughness={0.6} />
      </mesh>
      <mesh position={[x0 + 0.62, -0.1, front + 0.047]}>
        <planeGeometry args={[0.96, 0.12]} />
        <meshStandardMaterial map={label} roughness={0.6} />
      </mesh>
      {[x0 - 0.02, x1 + 0.02].map((x) => (
        <mesh key={`p${x}`} position={[x, height / 2, front + 0.02]} castShadow>
          <boxGeometry args={[0.08, height + 0.28, 0.06]} />
          <meshStandardMaterial color={FRAME} roughness={0.6} />
        </mesh>
      ))}
      {[x0 - 0.02, x1 + 0.02].flatMap((x) =>
        [-0.12, top + roofT].map((y) =>
          [back, y > 0 ? cut : front + 0.02].map((z) => (
            <mesh key={`c${x}${y}${z}`} position={[x, y, z]}>
              <boxGeometry args={[0.1, 0.08, 0.08]} />
              <meshStandardMaterial color={CORNER} roughness={0.5} />
            </mesh>
          )),
        ),
      )}
    </group>
  )
}
