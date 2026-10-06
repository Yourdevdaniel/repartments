import { Box, Flat } from './Flat'
import type { FlatData } from './types'

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
      <Flat flat={flat} hovered={false} interactive={false} onHover={() => {}} onSelect={() => {}} />
    </group>
  )
}
