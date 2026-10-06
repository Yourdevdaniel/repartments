import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { MeshStandardMaterial, PointLight } from 'three'
import { Box } from './Flat'
import { LOOK, useWeather } from './weather'


/** A chunky low-poly tree: trunk plus a few flat-shaded blobs of leaves. */
function Tree({ x, z, size = 1, hue = 0 }: { x: number; z: number; size?: number; hue?: number }) {
  const greens = ['#8fcf8a', '#7cc27f', '#a6d98c', '#6fb87a']
  const c = (i: number) => greens[(i + hue) % greens.length]
  return (
    <group position={[x, 0, z]} scale={size}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 0.7, 7]} />
        <meshStandardMaterial color="#a77b5a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <icosahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial color={c(0)} roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0.22, 0.78, 0.12]} castShadow>
        <icosahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color={c(1)} roughness={0.85} flatShading />
      </mesh>
      <mesh position={[-0.2, 0.82, -0.1]} castShadow>
        <icosahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color={c(2)} roughness={0.85} flatShading />
      </mesh>
    </group>
  )
}

function Bush({ x, z, w = 0.5 }: { x: number; z: number; w?: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box size={[w, 0.16, 0.24]} at={[0, 0.08, 0]} color="#d9cbb8" />
      {[-w / 3, 0, w / 3].map((dx, i) => (
        <mesh key={dx} position={[dx, 0.22, 0]} castShadow>
          <icosahedronGeometry args={[0.13 + (i % 2) * 0.03, 0]} />
          <meshStandardMaterial color={i % 2 ? '#86c784' : '#9bd38c'} roughness={0.85} flatShading />
        </mesh>
      ))}
    </group>
  )
}

function Lamp({ x, z }: { x: number; z: number }) {
  const weather = useWeather()
  const bulb = useRef<MeshStandardMaterial>(null)
  const light = useRef<PointLight>(null)
  useFrame((_, delta) => {
    const glow = LOOK[weather].glow
    const k = Math.min(1, delta * 2)
    if (bulb.current) bulb.current.emissiveIntensity += (0.3 + glow * 2.2 - bulb.current.emissiveIntensity) * k
    if (light.current) light.current.intensity += (glow * 2.4 - light.current.intensity) * k
  })
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.022, 0.03, 1.1, 8]} />
        <meshStandardMaterial color="#4a4f66" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.13, 0]}>
        <sphereGeometry args={[0.07, 12, 10]} />
        <meshStandardMaterial ref={bulb} color="#fff6d8" emissive="#ffe9a8" emissiveIntensity={0.3} />
      </mesh>
      <pointLight ref={light} position={[0, 1.05, 0]} color="#ffd98a" intensity={0} distance={3} decay={1.6} />
    </group>
  )
}

function Bench({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box size={[0.6, 0.04, 0.2]} at={[0, 0.2, 0]} color="#c98f5f" />
      <Box size={[0.6, 0.16, 0.03]} at={[0, 0.32, -0.09]} color="#c98f5f" />
      {[-0.25, 0.25].map((dx) => (
        <Box key={dx} size={[0.03, 0.2, 0.16]} at={[dx, 0.1, 0]} color="#4a4f66" />
      ))}
    </group>
  )
}

/** Sidewalk, curb, a strip of road, grass on the sides, trees and lamps. Kept off the flats' faces. */
export function Street({ width, depth }: { width: number; depth: number }) {
  const half = width / 2
  const FRONT = depth / 2
  const walk = 1.3
  const road = 1.5
  const span = width + 30
  const tiles = useMemo(() => {
    const list: number[] = []
    for (let x = -span / 2 + 0.5; x < span / 2; x += 0.5) list.push(x)
    return list
  }, [span])

  return (
    <group>
      {/* Grass from just behind the trees forward; behind that the blurred city takes over */}
      <mesh position={[0, -0.1, 9.5]} receiveShadow>
        <boxGeometry args={[200, 0.1, 22]} />
        <meshStandardMaterial color="#d3ebc4" roughness={1} />
      </mesh>
      <Box size={[span, 0.06, walk]} at={[0, -0.03, FRONT + walk / 2]} color="#ece7df" cast={false} />
      {tiles.map((x) => (
        <Box key={x} size={[0.012, 0.004, walk]} at={[x, 0.001, FRONT + walk / 2]} color="#ddd5ca" cast={false} />
      ))}
      <Box size={[span, 0.09, 0.08]} at={[0, -0.015, FRONT + walk + 0.04]} color="#d4cdc2" />
      <Box size={[200, 0.05, road]} at={[0, -0.035, FRONT + walk + 0.08 + road / 2]} color="#8c90a3" cast={false} />
      <Box size={[200, 0.06, walk]} at={[0, -0.03, FRONT + walk + 0.16 + road + walk / 2]} color="#ece7df" cast={false} />
      {tiles
        .filter((_, i) => i % 3 === 0)
        .map((x) => (
          <Box key={`d${x}`} size={[0.5, 0.004, 0.05]} at={[x, -0.008, FRONT + walk + 0.08 + road / 2]} color="#f4f1ea" cast={false} />
        ))}

      {/* Planters along the ground floor, low enough not to hide anything */}
      <Bush x={-half + 0.6} z={FRONT + 0.22} />
      <Bush x={half - 0.6} z={FRONT + 0.22} />

      {/* Trees and lamps sit beside the building, never in front of a flat */}
      <Tree x={-half - 1.1} z={-0.3} size={1.25} />
      <Tree x={-half - 2.3} z={0.4} size={0.95} hue={1} />
      <Tree x={-half - 1.6} z={FRONT + 0.75} size={0.8} hue={2} />
      <Tree x={half + 1.15} z={-0.4} size={1.3} hue={3} />
      <Tree x={half + 2.4} z={0.3} size={1} hue={1} />
      <Lamp x={-half - 0.55} z={FRONT + walk - 0.15} />
      <Lamp x={half + 0.55} z={FRONT + walk - 0.15} />
      <Bench x={half + 1.4} z={FRONT + 0.75} />
      <mesh position={[half + 0.8, 0.09, FRONT + walk - 0.2]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 0.18, 10]} />
        <meshStandardMaterial color="#e2554f" roughness={0.6} />
      </mesh>
    </group>
  )
}
