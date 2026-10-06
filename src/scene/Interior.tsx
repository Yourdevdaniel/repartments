import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { Box, Flat } from './Flat'
import type { FlatData } from './types'

/**
 * A dotted path along the walking lane between the rooms the request visits, its dots drifting
 * towards the back end: the route of a request, at a glance.
 */
function Route({ flat }: { flat: FlatData }) {
  const story = flat.stories.main
  const span = useMemo(() => {
    if (!story) return null
    const xs = flat.cast.filter((c) => c.story === 'main').flatMap((c) => story.tracks[c.id].flatMap((s) => [s.from[0], s.to[0]]))
    return xs.length ? [Math.min(...xs), Math.max(...xs)] : null
  }, [flat, story])
  const map = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 16
    const g = c.getContext('2d')!
    g.fillStyle = 'rgba(255,255,255,0.95)'
    g.beginPath()
    g.roundRect(8, 4, 26, 8, 4)
    g.fill()
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.wrapS = RepeatWrapping
    return t
  }, [])
  useFrame((_, delta) => {
    map.offset.x -= delta * 0.5
  })
  if (!span) return null
  const [x0, x1] = span
  map.repeat.set((x1 - x0) / 0.22, 1)
  return (
    <mesh position={[(x0 + x1) / 2, 0.006, 0.55]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[x1 - x0, 0.05]} />
      <meshBasicMaterial map={map} transparent opacity={0.85} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

const SIDE = 0.18
const BASE = 0.3

/**
 * One apartment on its own, full screen: the flat sits on a thick slab like a slice of the building,
 * open at the front and the top so every room is in view.
 */
export function Interior({ flat }: { flat: FlatData }) {
  const { width: W, depth: D, height: H } = flat.layout
  const wall = '#efe2d0'
  return (
    <group position={[-W / 2, 0, 0]}>
      <Box size={[W + SIDE * 2, BASE, D + 0.2]} at={[W / 2, -BASE / 2 - 0.04, -0.05]} color="#fbf6ee" />
      <Box size={[W + SIDE * 2 + 0.04, 0.05, 0.05]} at={[W / 2, -0.05, D / 2 + 0.06]} color="#e9dfd2" />
      {[-SIDE / 2, W + SIDE / 2].map((x) => (
        <Box key={x} size={[SIDE, H + 0.1, D + 0.2]} at={[x, (H + 0.1) / 2 - 0.04, -0.05]} color={wall} />
      ))}
      <Box size={[W + SIDE * 2, H + 0.1, 0.1]} at={[W / 2, (H + 0.1) / 2 - 0.04, -D / 2 - 0.1]} color={wall} />
      <Route flat={flat} />
      <Flat flat={flat} hovered={false} interactive={false} onHover={() => {}} onSelect={() => {}} />
    </group>
  )
}
