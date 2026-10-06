import type { Role } from '../shared/types'
import type { Caption, Story, Vec3 } from './story'

export type Placement = { model: string; at: Vec3; rotY?: number; scale?: number; tint?: string }

export type Room = {
  id: string
  x0: number
  x1: number
  wall: string
  floor: string
  furniture: Placement[]
}

export type CastMember = {
  id: string
  tech: string
  role: Role
  /** Kenney Mini Characters file name, without extension. */
  model: string
  color: string
  /** Key of the story that drives this resident. */
  story: string
}

export type FlatLayout = {
  width: number
  depth: number
  height: number
  rooms: Room[]
  /** z range of the door gap in every inner wall. */
  door: [number, number]
  tv?: { at: Vec3; size: [number, number] }
}

/** Everything one apartment needs: its rooms, who lives there and what they do. */
export type FlatData = {
  id: string
  repo: string
  language: { name: string; color: string }
  docker: boolean
  layout: FlatLayout
  cast: CastMember[]
  stories: Record<string, Story>
  /** The story whose captions narrate this flat. */
  narrator: string
  intro: Caption
}
