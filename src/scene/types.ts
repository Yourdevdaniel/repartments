import type { Role } from '../shared/types'
import type { Caption, Story, Vec3 } from './story'

export type Placement = { model: string; at: Vec3; rotY?: number; scale?: number; tint?: string }

/** Something on a back wall: a window onto the sky, a framed picture, a board of sticky notes. */
export type Decor = { kind: 'window' | 'picture' | 'board' | 'clock'; x: number; y: number; w: number; h: number; color?: string }

/** A rectangle on the floor: x0..x1 left to right, z0..z1 back to front. */
export type Rect = { x0: number; z0: number; x1: number; z1: number }

export type Room = {
  id: string
  label?: Caption
  x0: number
  x1: number
  /**
   * Office plans only: the room's depth range, and which row it sits in. Back-row rooms have a tall
   * back wall; front-row rooms have low partitions, so the camera sees over them.
   */
  z0?: number
  z1?: number
  row?: 'back' | 'front'
  wall: string
  floor: string
  furniture: Placement[]
  decor?: Decor[]
}

export type CastMember = {
  id: string
  tech: string
  /** Said before the name on the tag, for someone who isn't a technology ("Síndico @octocat"). */
  title?: { en: string; pt: string }
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
  /**
   * `strip` (the default): rooms side by side along one lane, like the public building's flats.
   * `office`: two rows of rooms on either side of a corridor, for the studio's bigger scenes.
   */
  plan?: 'strip' | 'office'
  /** Where people walk between rooms (z): the strip's lane or the office's corridor. */
  lane?: number
  /** Office plans: the walls and partitions residents can't walk through. */
  walls?: Rect[]
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
  url?: string
  stars?: number
}

/** Public facts about the repo that change what happens in the flat. */
export type FlatStatus = {
  /** Latest checks on the default branch. */
  ci?: 'passing' | 'failing'
  /** Open pull requests, and whether any can't be merged cleanly. */
  prs?: { open: number; conflict?: boolean }
}
