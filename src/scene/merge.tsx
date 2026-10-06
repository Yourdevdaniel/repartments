import { useMemo } from 'react'
import { BoxGeometry, type BufferGeometry, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Vec3 } from './story'

/**
 * Static scenery (walls, slabs, frames, paving) is made of hundreds of little boxes. Drawn one by
 * one they cost a draw call each, which is what made the tower lag. Here they're baked into one
 * geometry per colour, so the whole building is a handful of draw calls.
 */
export type BoxSpec = { size: Vec3; at: Vec3; color: string; rotX?: number }

const standard = new Map<string, MeshStandardMaterial>()
const basic = new Map<string, MeshBasicMaterial>()

/** One shared material per colour, instead of one per mesh. */
export function materialFor(color: string, unlit = false): MeshBasicMaterial | MeshStandardMaterial {
  if (unlit) {
    let m = basic.get(color)
    if (!m) basic.set(color, (m = new MeshBasicMaterial({ color })))
    return m
  }
  let m = standard.get(color)
  if (!m) standard.set(color, (m = new MeshStandardMaterial({ color, roughness: 0.92 })))
  return m
}

export function mergeBoxes(boxes: BoxSpec[]): { color: string; geometry: BufferGeometry }[] {
  const byColor = new Map<string, BufferGeometry[]>()
  for (const b of boxes) {
    const g = new BoxGeometry(b.size[0], b.size[1], b.size[2])
    if (b.rotX) g.rotateX(b.rotX)
    g.translate(b.at[0], b.at[1], b.at[2])
    const list = byColor.get(b.color) ?? []
    list.push(g)
    byColor.set(b.color, list)
  }
  return [...byColor].map(([color, list]) => {
    const geometry = mergeGeometries(list)
    for (const g of list) g.dispose()
    return { color, geometry }
  })
}

/** Renders a list of static boxes as one mesh per colour. */
export function Boxes({ boxes, cast = false, unlit = false }: { boxes: BoxSpec[]; cast?: boolean; unlit?: boolean }) {
  const merged = useMemo(() => mergeBoxes(boxes), [boxes])
  return (
    <group>
      {merged.map(({ color, geometry }) => (
        <mesh key={color} geometry={geometry} material={materialFor(color, unlit)} castShadow={cast} receiveShadow={!unlit} />
      ))}
    </group>
  )
}
