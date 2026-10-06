import type { Role } from '../shared/types'
import type { Caption, Story, Vec3 } from './story'

export type Placement = { model: string; at: Vec3; rotY?: number; scale?: number; tint?: string }

/** Something on a back wall: a window onto the sky, a framed picture, a board of sticky notes. */
export type Decor = { kind: 'window' | 'picture' | 'board' | 'clock'; x: number; y: number; w: number; h: number; color?: string }

export type Room = {
  id: string
  label?: Caption
  x0: number
  x1: number
  wall: string
  floor: string
  furniture: Placement[]
  decor?: Decor[]
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
  /** People who drop by but don't live here (someone bringing a pull request). */
  visitors: CastMember[]
  status: FlatStatus
}

/** Public facts about the repo that change what happens in the flat. */
export type FlatStatus = {
  /** Latest checks on the default branch. */
  ci?: 'passing' | 'failing'
  /** Open pull requests, and whether any can't be merged cleanly. */
  prs?: { open: number; conflict?: boolean }
}
