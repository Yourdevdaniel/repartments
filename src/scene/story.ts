/**
 * The choreography engine. A story is a list of beats played in order and looped. In each beat some
 * residents walk somewhere or play an animation; everyone else waits where they are. Props (a letter,
 * a parcel) are held by a resident, sit at a point, or are hidden. Flags switch scenery (the TV).
 *
 * `compile` turns beats into timed segments once; `sample` answers "where is everyone at time t" every
 * frame. Both are pure so the timing can be tested without a renderer.
 */

/** A point on the flat's floor: [x, z]. */
export type Vec2 = [number, number]
export type Vec3 = [number, number, number]

export type AnimName =
  | 'idle'
  | 'walk'
  | 'sit'
  | 'pick-up'
  | 'interact-right'
  | 'interact-left'
  | 'emote-yes'
  | 'emote-no'
  | 'holding-both'

/** `walk` goes straight there; `path` follows the points in order (to get around furniture). */
export type Act = { walk: Vec2 } | { path: Vec2[] } | { anim: AnimName; face?: Vec2 }

/** Who or where a prop is: a resident id, a point in the flat, or null when hidden. */
export type Holder = string | Vec3 | null

/** A step's subtitle. `icon` is the little picture the step shows in the loop strip. */
export type Caption = { en: string; pt: string; icon?: string }

/** A speech bubble over a resident's head: an emoji and, at most, a word or two. */
export type Bubble = { icon: string; text?: { en: string; pt: string } }

export type Beat = {
  caption?: Caption
  /** Minimum length in seconds. A beat lasts at least as long as its longest walk. */
  dur?: number
  acts?: Record<string, Act>
  /** Applied when the beat starts. */
  props?: Record<string, Holder>
  flags?: Record<string, boolean>
  /** Bubbles shown for the whole beat. */
  say?: Record<string, Bubble>
}

/** `rest` marks a break (a hobby), so the camera knows nothing important is happening there. */
export type Segment = { t0: number; t1: number; from: Vec2; to: Vec2; anim: AnimName; yaw: number; rest?: boolean }

export type Story = {
  duration: number
  tracks: Record<string, Segment[]>
  props: Record<string, { t: number; holder: Holder }[]>
  flags: Record<string, { t: number; on: boolean }[]>
  captions: { t0: number; t1: number; caption: Caption }[]
  bubbles: Record<string, { t0: number; t1: number; bubble: Bubble }[]>
}

export type Start = Record<string, { at: Vec2; yaw: number }>

/** Units per second. Chibi legs are short. */
export const WALK_SPEED = 0.85
const DEFAULT_ANIM = 1.2

/** Characters face +z at yaw 0. */
export function yawTowards(from: Vec2, to: Vec2, fallback: number) {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  if (Math.hypot(dx, dz) < 1e-6) return fallback
  return Math.atan2(dx, dz)
}

function pathOf(act: Act): Vec2[] | null {
  if ('walk' in act) return [act.walk]
  if ('path' in act) return act.path
  return null
}

function lengthOf(from: Vec2, path: Vec2[]) {
  let total = 0
  let at = from
  for (const p of path) {
    total += Math.hypot(p[0] - at[0], p[1] - at[1])
    at = p
  }
  return total
}

export function compile(start: Start, beats: Beat[], speed = WALK_SPEED): Story {
  const state = new Map(Object.entries(start).map(([id, s]) => [id, { ...s }]))
  const tracks: Story['tracks'] = Object.fromEntries([...state.keys()].map((id) => [id, []]))
  const props: Story['props'] = {}
  const flags: Story['flags'] = {}
  const captions: Story['captions'] = []
  const bubbles: Story['bubbles'] = {}
  let clock = 0

  for (const beat of beats) {
    const t0 = clock
    for (const [id, holder] of Object.entries(beat.props ?? {})) (props[id] ??= []).push({ t: t0, holder })
    for (const [id, on] of Object.entries(beat.flags ?? {})) (flags[id] ??= []).push({ t: t0, on })

    const acts = beat.acts ?? {}
    let length = beat.dur ?? 0
    for (const [id, act] of Object.entries(acts)) {
      const s = state.get(id)
      if (!s) throw new Error(`story: unknown resident "${id}"`)
      const path = pathOf(act)
      if (path) length = Math.max(length, lengthOf(s.at, path) / speed)
      else if (beat.dur === undefined) length = Math.max(length, DEFAULT_ANIM)
    }
    const t1 = t0 + length

    for (const [id, s] of state) {
      const act = acts[id]
      const track = tracks[id]
      const path = act ? pathOf(act) : null
      if (path) {
        let t = t0
        for (const p of path) {
          const leg = Math.hypot(p[0] - s.at[0], p[1] - s.at[1]) / speed
          if (leg <= 0) continue
          s.yaw = yawTowards(s.at, p, s.yaw)
          track.push({ t0: t, t1: t + leg, from: s.at, to: p, anim: 'walk', yaw: s.yaw })
          s.at = p
          t += leg
        }
        if (t1 > t) track.push({ t0: t, t1, from: s.at, to: s.at, anim: 'idle', yaw: s.yaw })
      } else if (act && 'anim' in act) {
        const yaw = act.face ? yawTowards(s.at, act.face, s.yaw) : s.yaw
        track.push({ t0, t1, from: s.at, to: s.at, anim: act.anim, yaw })
        s.yaw = yaw
      } else if (t1 > t0) {
        track.push({ t0, t1, from: s.at, to: s.at, anim: 'idle', yaw: s.yaw })
      }
    }

    if (beat.caption && t1 > t0) captions.push({ t0, t1, caption: beat.caption })
    for (const [id, bubble] of Object.entries(beat.say ?? {})) (bubbles[id] ??= []).push({ t0, t1, bubble })
    clock = t1
  }

  return { duration: clock, tracks, props, flags, captions, bubbles }
}

export type Pose = { x: number; z: number; yaw: number; anim: AnimName; carrying: boolean; rest: boolean }

function last<T extends { t: number }>(list: T[] | undefined, t: number): T | undefined {
  if (!list) return undefined
  let found: T | undefined
  for (const entry of list) {
    if (entry.t <= t) found = entry
    else break
  }
  // Before the first change in a loop, the state is whatever the loop ended with.
  return found ?? list[list.length - 1]
}

export function propAt(story: Story, id: string, time: number): Holder {
  return last(story.props[id], wrap(story, time))?.holder ?? null
}

export function flagAt(story: Story, id: string, time: number): boolean {
  return last(story.flags[id], wrap(story, time))?.on ?? false
}

/** The caption stays up until the next one replaces it, so silent beats keep their context. */
export function captionAt(story: Story, time: number): Caption | null {
  const t = wrap(story, time)
  let current: Caption | null = null
  for (const c of story.captions) {
    if (c.t0 <= t) current = c.caption
    else break
  }
  return current ?? story.captions[story.captions.length - 1]?.caption ?? null
}

export type Hobby = { anim: AnimName; bubble: Bubble }

/**
 * Anyone left standing around for a while gets a break instead: they turn to face us and sit down to
 * read, game or nap (whatever their hobby is), getting up again a moment before they're needed.
 */
export function relax(story: Story, hobbies: Record<string, Hobby>, minIdle = 4.2, margin = 0.7): Story {
  const tracks = { ...story.tracks }
  const bubbles = { ...story.bubbles }
  for (const [id, hobby] of Object.entries(hobbies)) {
    const track = tracks[id]
    if (!track) continue
    const out: Segment[] = []
    const said = [...(bubbles[id] ?? [])]
    // Standing still across several beats shows up as one idle segment per beat; join them first.
    const merged: Segment[] = []
    for (const seg of track) {
      const prev = merged[merged.length - 1]
      const same =
        prev &&
        prev.anim === 'idle' &&
        seg.anim === 'idle' &&
        prev.yaw === seg.yaw &&
        prev.to[0] === seg.from[0] &&
        prev.to[1] === seg.from[1] &&
        seg.from[0] === seg.to[0] &&
        seg.from[1] === seg.to[1]
      if (same) merged[merged.length - 1] = { ...prev, t1: seg.t1 }
      else merged.push(seg)
    }
    for (const seg of merged) {
      const still = seg.from[0] === seg.to[0] && seg.from[1] === seg.to[1]
      if (seg.anim !== 'idle' || !still || seg.t1 - seg.t0 < minIdle) {
        out.push(seg)
        continue
      }
      const a = seg.t0 + margin
      const b = seg.t1 - margin
      out.push({ ...seg, t1: a })
      out.push({ ...seg, t0: a, t1: b, anim: hobby.anim, yaw: 0, rest: true })
      out.push({ ...seg, t0: b })
      said.push({ t0: a + 0.3, t1: b, bubble: hobby.bubble })
    }
    tracks[id] = out
    bubbles[id] = said.sort((x, y) => x.t0 - y.t0)
  }
  return { ...story, tracks, bubbles }
}

export function bubbleAt(story: Story, id: string, time: number): Bubble | null {
  const t = wrap(story, time)
  return story.bubbles[id]?.find((b) => t >= b.t0 && t < b.t1)?.bubble ?? null
}

export function wrap(story: Story, time: number) {
  if (story.duration <= 0) return 0
  return ((time % story.duration) + story.duration) % story.duration
}

export function sample(story: Story, id: string, time: number): Pose {
  const t = wrap(story, time)
  const track = story.tracks[id]
  const seg = track.find((s) => t >= s.t0 && t < s.t1) ?? track[track.length - 1]
  const span = seg.t1 - seg.t0
  const k = span > 0 ? Math.min(1, Math.max(0, (t - seg.t0) / span)) : 1
  const carrying = Object.keys(story.props).some((p) => propAt(story, p, t) === id)
  return {
    x: seg.from[0] + (seg.to[0] - seg.from[0]) * k,
    z: seg.from[1] + (seg.to[1] - seg.from[1]) * k,
    yaw: seg.yaw,
    anim: seg.anim,
    carrying,
    rest: seg.rest ?? false,
  }
}
