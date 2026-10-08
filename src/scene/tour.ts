/**
 * The presentation generator. A `Flow` from the architecture analysis (who takes part and what each
 * one does, step by step) becomes a flat the existing renderer can play: one room per participant,
 * lined up in the order they first appear, a character for each one wearing their name, and a story
 * where they walk over to each other, hand a letter or a parcel along, and act out the step while
 * the caption explains it in plain words.
 *
 * Unlike `rooms.ts`, which hand-choreographs a known stack (front end, guard, back end…), this
 * choreographs any sequence of steps with a few rules, so it works for whatever the analysis finds:
 * - a step between two people: the giver walks to the receiver's room carrying the prop, hands it
 *   over, and the receiver does their part;
 * - if the receiver is already waiting in the giver's room (they just came over), the hand-over
 *   happens right there, after the giver gets back to their spot;
 * - a step someone does alone (thinking, deciding, showing on screen) plays where they stand;
 * - anyone not in the current step drifts back to their spot, except the person using the system,
 *   who stays to watch; at the end everyone goes home, so the loop starts over cleanly.
 */
import type { Actor, ActorKind, Flow, FlowStep, StepAction, Text } from '../shared/studio'
import type { Role } from '../shared/types'
import { ptGender } from '../architecture/plain'
import { footprintOf, navigator } from './nav'
import { FOOTPRINTS } from './footprints'
import { DEPTH, HEIGHT } from './rooms'
import { compile, WALK_SPEED, type Beat, type Bubble, type Holder, type Story, type Vec2, type Vec3 } from './story'
import type { CastMember, Decor, FlatData, FlatLayout, Placement, Rect, Room } from './types'

const BACK = -DEPTH / 2
/** The walking lane along the front of the rooms, as in `rooms.ts`. */
const LANE = 0.55
const DOOR: [number, number] = [0.05, 0.95]

type Template = {
  width: number
  wall: string
  floor: string
  furniture: Placement[]
  decor?: Decor[]
  /** Where its resident stands, and what they turn to when they work. */
  home: Vec2
  face: Vec2
  tv?: { at: Vec3; size: [number, number] }
}

/**
 * Rooms for the presentation. Everything solid stands against the back wall (z ≤ −0.75), so the
 * stretch between a resident's spot and the lane, and the lane itself, are always clear to walk.
 */
const ROOM: Record<string, Template> = {
  entrance: {
    width: 1.8,
    wall: '#cfe9dc',
    floor: '#dcd5c8',
    furniture: [
      { model: 'doorway', at: [0.5, 0, BACK + 0.1] },
      { model: 'rugDoormat', at: [0.53, 0.004, BACK + 0.4] },
      { model: 'coatRack', at: [1.45, 0, BACK + 0.2] },
      { model: 'plantSmall1', at: [1.55, 0, 1.05] },
    ],
    decor: [{ kind: 'picture', x: 1.3, y: 1.05, w: 0.34, h: 0.26, color: '#3f9c8f' }],
    home: [0.75, -0.45],
    face: [0.75, 1.2],
  },
  screen: {
    width: 2.6,
    wall: '#f7d9c9',
    floor: '#ecd2b0',
    furniture: [
      { model: 'cabinetTelevision', at: [0.9, 0, BACK + 0.25] },
      { model: 'televisionModern', at: [1.3, 0.31, BACK + 0.12] },
      { model: 'speaker', at: [0.6, 0, BACK + 0.2] },
      { model: 'speaker', at: [1.82, 0, BACK + 0.2] },
      { model: 'lampRoundFloor', at: [0.15, 0, BACK + 0.22] },
      { model: 'pottedPlant', at: [2.3, 0, BACK + 0.3] },
      { model: 'rugRounded', at: [0.55, 0.004, 0.75] },
    ],
    decor: [{ kind: 'window', x: 2.15, y: 1.05, w: 0.5, h: 0.45 }],
    home: [1.3, -0.4],
    face: [1.3, BACK],
    tv: { at: [1.3, 0.56, BACK + 0.19], size: [0.58, 0.33] },
  },
  desk: {
    width: 2.4,
    wall: '#ddd6f3',
    floor: '#e3cfae',
    furniture: [
      { model: 'desk', at: [1.2, 0, -0.95], rotY: -Math.PI / 2 },
      { model: 'computerScreen', at: [1.42, 0.38, -0.81], rotY: -Math.PI / 2 },
      { model: 'computerKeyboard', at: [1.23, 0.38, -0.75], rotY: -Math.PI / 2 },
      { model: 'bookcaseOpen', at: [1.95, 0, BACK + 0.25] },
      { model: 'books', at: [2.05, 0.44, BACK + 0.17] },
      { model: 'trashcan', at: [0.2, 0, BACK + 0.2] },
    ],
    decor: [{ kind: 'board', x: 0.6, y: 0.95, w: 0.7, h: 0.45 }],
    home: [0.92, -0.62],
    face: [1.5, -0.62],
  },
  agent: {
    width: 2.6,
    wall: '#e8e0fb',
    floor: '#e6cfa9',
    furniture: [
      { model: 'desk', at: [1.3, 0, -0.95], rotY: -Math.PI / 2 },
      { model: 'laptop', at: [1.34, 0.38, -0.7], rotY: -Math.PI / 2 },
      { model: 'books', at: [1.5, 0.38, -1.05] },
      { model: 'bookcaseOpen', at: [2.15, 0, BACK + 0.25] },
      { model: 'books', at: [2.25, 0.44, BACK + 0.17] },
      { model: 'lampSquareFloor', at: [0.2, 0, BACK + 0.2] },
    ],
    decor: [
      { kind: 'board', x: 0.65, y: 0.98, w: 0.75, h: 0.48 },
      { kind: 'clock', x: 1.85, y: 1.2, w: 0.22, h: 0.22, color: '#7c5cff' },
    ],
    home: [1.02, -0.58],
    face: [1.5, -0.58],
  },
  model: {
    width: 2.2,
    wall: '#d6eef5',
    floor: '#e0d3bf',
    furniture: [
      { model: 'sideTable', at: [0.8, 0, BACK + 0.22] },
      { model: 'computerScreen', at: [0.9, 0.38, BACK + 0.14] },
      { model: 'lampSquareTable', at: [0.5, 0.38, BACK + 0.15] },
      { model: 'bookcaseClosed', at: [1.55, 0, BACK + 0.25] },
    ],
    decor: [{ kind: 'picture', x: 1.75, y: 1.08, w: 0.36, h: 0.26, color: '#10a37f' }],
    home: [0.95, -0.5],
    face: [0.95, BACK],
  },
  archive: {
    width: 2.4,
    wall: '#f4e6b8',
    floor: '#d9cdb5',
    furniture: [
      { model: 'bookcaseClosedWide', at: [0.3, 0, BACK + 0.25] },
      { model: 'bookcaseOpen', at: [1.12, 0, BACK + 0.25] },
      { model: 'books', at: [1.2, 0.44, BACK + 0.17] },
      { model: 'bookcaseClosedWide', at: [1.56, 0, BACK + 0.25] },
      { model: 'cardboardBoxClosed', at: [2.12, 0, 1.0] },
    ],
    home: [1.3, -0.55],
    face: [1.3, BACK],
  },
  pantry: {
    width: 1.9,
    wall: '#fde3d2',
    floor: '#e9dccb',
    furniture: [
      { model: 'kitchenFridgeSmall', at: [0.35, 0, BACK + 0.29] },
      { model: 'kitchenBar', at: [0.85, 0, BACK + 0.21] },
      { model: 'kitchenCoffeeMachine', at: [0.97, 0.42, BACK + 0.24] },
    ],
    home: [0.75, -0.45],
    face: [0.55, BACK],
  },
  mailroom: {
    width: 2.1,
    wall: '#e4f0d4',
    floor: '#ddd2bd',
    furniture: [
      { model: 'kitchenBar', at: [0.3, 0, BACK + 0.21] },
      { model: 'kitchenBar', at: [0.73, 0, BACK + 0.21] },
      { model: 'books', at: [0.4, 0.42, BACK + 0.15] },
      { model: 'books', at: [0.85, 0.42, BACK + 0.15] },
      { model: 'cardboardBoxOpen', at: [1.65, 0, BACK + 0.3] },
    ],
    decor: [{ kind: 'picture', x: 1.55, y: 1.0, w: 0.4, h: 0.28, color: '#86c784' }],
    home: [0.6, -0.55],
    face: [0.6, BACK],
  },
  workshop: {
    width: 2.0,
    wall: '#dcebfb',
    floor: '#d3dbe6',
    furniture: [
      { model: 'sideTable', at: [0.35, 0, BACK + 0.22] },
      { model: 'radio', at: [0.42, 0.38, BACK + 0.14] },
      { model: 'cardboardBoxClosed', at: [1.2, 0, BACK + 0.25], tint: '#f2a65a' },
      { model: 'cardboardBoxClosed', at: [1.43, 0, BACK + 0.25], tint: '#f2a65a' },
      { model: 'cardboardBoxClosed', at: [1.32, 0.28, BACK + 0.27], tint: '#f2a65a' },
    ],
    decor: [{ kind: 'clock', x: 0.9, y: 1.15, w: 0.24, h: 0.24, color: '#f2a65a' }],
    home: [0.85, -0.45],
    face: [1.3, BACK],
  },
}

/** Which room each kind of participant gets. */
const ROOM_FOR: Record<ActorKind, keyof typeof ROOM> = {
  person: 'entrance',
  screen: 'screen',
  api: 'desk',
  security: 'desk',
  service: 'desk',
  agent: 'agent',
  llm: 'model',
  tool: 'workshop',
  worker: 'mailroom',
  queue: 'mailroom',
  database: 'archive',
  cache: 'pantry',
  external: 'mailroom',
}

/** A wall colour per kind, so two desks in a row still read as different rooms. */
const WALL: Partial<Record<ActorKind, string>> = { api: '#ddd6f3', security: '#cfe9dc', service: '#d5ecd9', queue: '#e4f0d4', external: '#fbe0cf' }

/** The character each kind prefers, then spares for when two of a kind share a scene. */
const MODEL: Record<ActorKind, string> = {
  person: 'character-female-d',
  screen: 'character-female-b',
  api: 'character-male-d',
  security: 'character-male-c',
  service: 'character-male-f',
  agent: 'character-female-a',
  llm: 'character-female-e',
  tool: 'character-male-a',
  worker: 'character-female-f',
  queue: 'character-female-f',
  database: 'character-male-b',
  cache: 'character-female-c',
  external: 'character-male-e',
}
const SPARE = ['character-male-a', 'character-male-e', 'character-female-c', 'character-male-f', 'character-female-f', 'character-male-b', 'character-female-e', 'character-male-c']

/** Name-tag dot colour per kind. */
const COLOR: Record<ActorKind, string> = {
  person: '#f2a65a',
  screen: '#61dafb',
  api: '#7c5cff',
  security: '#3f9c8f',
  service: '#2f8fe6',
  agent: '#a855f7',
  llm: '#10a37f',
  tool: '#f59e0b',
  worker: '#37814a',
  queue: '#37814a',
  database: '#4169e1',
  cache: '#dc382d',
  external: '#8d6748',
}

/** The game role closest to each kind (the renderer and the side panel's legend speak in roles). */
const ROLE: Record<ActorKind, Role> = {
  person: 'coder',
  screen: 'frontend',
  api: 'backend',
  security: 'security',
  service: 'backend',
  agent: 'coder',
  llm: 'coder',
  tool: 'devops',
  worker: 'worker',
  queue: 'worker',
  database: 'database',
  cache: 'cache',
  external: 'devops',
}

/** Every model a presentation can use, so they can be fetched before the first scene. */
export const TOUR_MODELS = {
  furniture: [...new Set(Object.values(ROOM).flatMap((t) => t.furniture.map((f) => f.model)))],
  characters: [...new Set([...Object.values(MODEL), ...SPARE])],
}

/** How each action looks: the prop carried over, the icon, and what the receiver (or the doer) plays. */
const ACTION: Record<StepAction, { prop: 'letter' | 'box'; icon: string; anim: 'interact-right' | 'interact-left' | 'pick-up' | 'emote-yes'; done: string }> = {
  ask: { prop: 'letter', icon: '📨', anim: 'interact-right', done: '🧐' },
  check: { prop: 'letter', icon: '🔑', anim: 'interact-right', done: '🔍' },
  call: { prop: 'letter', icon: '📋', anim: 'interact-right', done: '💼' },
  fetch: { prop: 'letter', icon: '🔎', anim: 'pick-up', done: '📦' },
  save: { prop: 'box', icon: '💾', anim: 'interact-right', done: '🗄️' },
  think: { prop: 'letter', icon: '📜', anim: 'interact-right', done: '📜' },
  decide: { prop: 'letter', icon: '🤔', anim: 'emote-yes', done: '💡' },
  'use-tool': { prop: 'letter', icon: '🛠️', anim: 'interact-right', done: '🔧' },
  reply: { prop: 'box', icon: '📦', anim: 'emote-yes', done: '👍' },
  show: { prop: 'box', icon: '🖥️', anim: 'emote-yes', done: '✨' },
  queue: { prop: 'letter', icon: '✉️', anim: 'pick-up', done: '📬' },
  send: { prop: 'letter', icon: '📤', anim: 'interact-left', done: '🚀' },
}

const KIND_LABEL: Record<Flow['kind'], { name: Text; color: string }> = {
  features: { name: { en: 'Features', pt: 'Funcionalidades' }, color: '#e05d8c' },
  agent: { name: { en: 'AI agent', pt: 'Agente de IA' }, color: '#a855f7' },
  request: { name: { en: 'Request', pt: 'Pedido' }, color: '#2f8fe6' },
  job: { name: { en: 'Background', pt: 'Segundo plano' }, color: '#37814a' },
  overview: { name: { en: 'Overview', pt: 'Visão geral' }, color: '#f2a65a' },
  commit: { name: { en: 'Commit', pt: 'Commit' }, color: '#3f9c8f' },
  activity: { name: { en: 'Activity', pt: 'Atividade' }, color: '#f28c28' },
}

export type TourOptions = {
  /** What the floor's sign shows next to the title (an author, say), instead of the kind of scene. */
  label?: { name: string; color: string }
  /** How "hot" each participant's room is (0 to 1): its walls warm up towards orange. */
  heat?: Record<string, number>
}

/** Warms a wall colour towards orange by `amount` (0 leaves it as it is). */
export function warm(hex: string, amount: number): string {
  const k = Math.min(1, Math.max(0, amount)) * 0.75
  const from = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const to = [0xf9, 0xa8, 0x6a]
  return '#' + from.map((c, i) => Math.round(c + (to[i] - c) * k).toString(16).padStart(2, '0')).join('')
}

const add = (a: Vec2, x0: number): Vec2 => [a[0] + x0, a[1]]
const add3 = (a: Vec3, x0: number): Vec3 => [a[0] + x0, a[1], a[2]]
const same = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6

// ─── Floor plans ────────────────────────────────────────────────────────────────────────────────

/** Scenes with this many rooms or more get an office floor instead of a strip of rooms. */
const OFFICE_FROM = 4
/** Office grid: column width, the two rows' depths and the corridor between them. */
const COL = 2.5
const ROW_BACK = 1.9
const CORRIDOR = 1.0
const ROW_FRONT = 1.7
const OFFICE_DEPTH = ROW_BACK + CORRIDOR + ROW_FRONT
/** Front-row furniture taller than this stays out, so the camera sees over it into the back row. */
const LOW = 0.5
/** Rooms that need a tall back wall (a door, a TV, shelves, a fridge) go in the back row when they can. */
const BACK_KINDS = new Set<ActorKind>(['person', 'screen', 'database', 'cache', 'llm'])

type Plan = {
  layout: FlatLayout
  homes: Map<string, Vec2>
  faces: Map<string, Vec2>
  /** The z of the spot in front of each room where visitors wait. */
  meetZ: Map<string, number>
  lane: number
}

const labelOf = (actor: Actor): Text => (actor.kind === 'person' ? { en: 'Entrance', pt: 'Entrada' } : actor.name)

/** Rooms side by side along one lane: small scenes, and the shape the public building uses. */
function stripPlan(order: Actor[], options: TourOptions): Plan {
  let x = 0
  const rooms: Room[] = []
  const homes = new Map<string, Vec2>()
  const faces = new Map<string, Vec2>()
  const meetZ = new Map<string, number>()
  let tv: FlatLayout['tv']
  for (const actor of order) {
    const t = ROOM[ROOM_FOR[actor.kind]]
    rooms.push({
      id: actor.id,
      label: labelOf(actor),
      x0: x,
      x1: x + t.width,
      wall: warm(WALL[actor.kind] ?? t.wall, options.heat?.[actor.id] ?? 0),
      floor: t.floor,
      furniture: t.furniture.map((f) => ({ ...f, at: add3(f.at, x) })),
      decor: (t.decor ?? []).map((d) => ({ ...d, x: d.x + x })),
    })
    homes.set(actor.id, add(t.home, x))
    faces.set(actor.id, add(t.face, x))
    meetZ.set(actor.id, LANE - 0.05)
    if (t.tv && !tv) tv = { ...t.tv, at: add3(t.tv.at, x) }
    x += t.width
  }
  return { layout: { width: x, depth: DEPTH, height: HEIGHT, door: DOOR, rooms, tv, plan: 'strip', lane: LANE }, homes, faces, meetZ, lane: LANE }
}

/**
 * An office floor: two rows of rooms facing each other across a corridor, the rows' rooms in the
 * order people first appear. Back-row rooms keep their templates as they are (tall back wall,
 * shelves, TV); front-row rooms are their mirror image against the low front wall, with only low
 * furniture, so the camera looks over them. Everyone walks along the corridor.
 */
function officePlan(order: Actor[], options: TourOptions): Plan {
  const backN = Math.ceil(order.length / 2)
  const frontN = order.length - backN
  const back: Actor[] = []
  const front: Actor[] = []
  for (const a of order) {
    const backFull = back.length >= backN
    const frontFull = front.length >= frontN
    if ((BACK_KINDS.has(a.kind) && !backFull) || frontFull) back.push(a)
    else front.push(a)
  }
  const zBack = -OFFICE_DEPTH / 2
  const backEdge = zBack + ROW_BACK
  const frontEdge = backEdge + CORRIDOR
  const zFront = OFFICE_DEPTH / 2
  const lane = (backEdge + frontEdge) / 2
  const rooms: Room[] = []
  const homes = new Map<string, Vec2>()
  const faces = new Map<string, Vec2>()
  const meetZ = new Map<string, number>()
  const walls: Rect[] = []
  let tv: FlatLayout['tv']

  back.forEach((actor, i) => {
    const t = ROOM[ROOM_FOR[actor.kind]]
    const x0 = i * COL
    const off = x0 + (COL - t.width) / 2
    // Template depth runs from its back wall (BACK); here the back wall is zBack.
    const z = (tz: number) => zBack + (tz - BACK)
    rooms.push({
      id: actor.id,
      label: labelOf(actor),
      x0,
      x1: x0 + COL,
      z0: zBack,
      z1: backEdge,
      row: 'back',
      wall: warm(WALL[actor.kind] ?? t.wall, options.heat?.[actor.id] ?? 0),
      floor: t.floor,
      furniture: t.furniture.filter((f) => f.at[2] - BACK <= ROW_BACK - 0.15).map((f) => ({ ...f, at: [f.at[0] + off, f.at[1], z(f.at[2])] as Vec3 })),
      decor: (t.decor ?? []).map((d) => ({ ...d, x: d.x + off })),
    })
    homes.set(actor.id, [t.home[0] + off, z(t.home[1])])
    faces.set(actor.id, [t.face[0] + off, z(t.face[1])])
    meetZ.set(actor.id, backEdge + 0.22)
    if (t.tv && !tv) tv = { ...t.tv, at: [t.tv.at[0] + off, t.tv.at[1], z(t.tv.at[2])] }
    if (i > 0) walls.push({ x0: x0 - 0.03, z0: zBack, x1: x0 + 0.03, z1: backEdge })
  })

  front.forEach((actor, i) => {
    const t = ROOM[ROOM_FOR[actor.kind]]
    const x0 = i * COL
    const off = x0 + (COL - t.width) / 2
    // Mirrored: the template's back wall becomes the low front wall at zFront.
    const z = (tz: number) => zFront - (tz - BACK)
    const floorItems = t.furniture.filter((f) => f.at[1] <= 0.25 && (FOOTPRINTS[f.model]?.h ?? 0) * (f.scale ?? 1) <= LOW && f.at[2] - BACK <= ROW_FRONT - 0.15)
    const placed: Placement[] = floorItems.map((f) => mirrored(f, off, z))
    const rests = placed.map(footprintOf).filter((r): r is Rect => r !== null)
    // Things standing on furniture come along only if what they stand on did.
    const onTop = t.furniture
      .filter((f) => f.at[1] > 0.25)
      .map((f): Placement => ({ ...f, at: [f.at[0] + off, f.at[1], z(f.at[2])], rotY: Math.PI - (f.rotY ?? 0) }))
      .filter((f) => rests.some((r) => f.at[0] > r.x0 && f.at[0] < r.x1 && f.at[2] > r.z0 && f.at[2] < r.z1))
    rooms.push({
      id: actor.id,
      label: labelOf(actor),
      x0,
      x1: x0 + COL,
      z0: frontEdge,
      z1: zFront,
      row: 'front',
      wall: warm(WALL[actor.kind] ?? t.wall, options.heat?.[actor.id] ?? 0),
      floor: t.floor,
      furniture: [...placed, ...onTop],
      decor: [],
    })
    homes.set(actor.id, [t.home[0] + off, z(t.home[1])])
    faces.set(actor.id, [t.face[0] + off, z(t.face[1])])
    meetZ.set(actor.id, frontEdge - 0.22)
    if (i > 0) walls.push({ x0: x0 - 0.03, z0: frontEdge, x1: x0 + 0.03, z1: zFront })
  })

  return {
    layout: { width: back.length * COL, depth: OFFICE_DEPTH, height: HEIGHT, door: DOOR, rooms, tv, plan: 'office', lane, walls },
    homes,
    faces,
    meetZ,
    lane,
  }
}

/**
 * A floor item flipped to the other side of the room: it faces the corridor instead of the back
 * wall. Turning by π − angle gives the right facing; then it's moved so its footprint lands exactly
 * where the original's would after the flip (models aren't centred on their origin).
 */
function mirrored(f: Placement, off: number, z: (tz: number) => number): Placement {
  const original = footprintOf({ ...f, at: [f.at[0] + off, f.at[1], f.at[2]] })
  const turned: Placement = { ...f, rotY: Math.PI - (f.rotY ?? 0), at: [f.at[0] + off, f.at[1], z(f.at[2])] }
  if (!original) return turned
  // Where the footprint should be: the original's depth range, flipped.
  const wantZ0 = z(original.z1)
  const now = footprintOf(turned)!
  return { ...turned, at: [turned.at[0] + (original.x0 - now.x0), turned.at[1], turned.at[2] + (wantZ0 - now.z0)] }
}

/** Where someone is between steps: at their own spot, or waiting in someone else's room. */
type Where = { home: true } | { home: false; with: string; at: Vec2 }

/** Builds the playable flat for one scene of the presentation, with its texts in both languages. */
export function buildTour(flow: Flow, lang: 'en' | 'pt', options: TourOptions = {}): FlatData {
  // Rooms in the order people first appear; whoever uses the system always comes in from the left.
  const order: Actor[] = []
  const byId = new Map(flow.actors.map((a) => [a.id, a]))
  const see = (id: string) => {
    const a = byId.get(id)
    if (a && !order.includes(a)) order.push(a)
  }
  const person = flow.actors.find((a) => a.kind === 'person')
  if (person) see(person.id)
  for (const s of flow.steps) {
    see(s.from)
    see(s.to)
  }
  // Steps naming someone who isn't in the scene are left out rather than breaking it.
  const steps = flow.steps.filter((s) => byId.has(s.from) && byId.has(s.to))

  const plan = order.length >= OFFICE_FROM ? officePlan(order, options) : stripPlan(order, options)
  const { layout, homes, faces, meetZ, lane } = plan
  const rooms = layout.rooms
  // Every walk goes round the furniture (and, in an office, along the corridor).
  const nav = navigator(layout)

  const used = new Set<string>()
  const cast: CastMember[] = order.map((a) => {
    let model = MODEL[a.kind]
    if (used.has(model)) model = SPARE.find((m) => !used.has(m)) ?? model
    used.add(model)
    return { id: a.id, tech: a.name[lang], role: ROLE[a.kind], model, color: COLOR[a.kind], story: 'main' }
  })

  const where = new Map<string, Where>(order.map((a) => [a.id, { home: true }]))
  const home = (id: string) => homes.get(id)!
  const pos = (id: string): Vec2 => {
    const w = where.get(id)!
    return w.home ? home(id) : w.at
  }
  /** The way there along the lane: out to the lane, along it, in to the spot. */
  const route = (from: Vec2, to: Vec2): Vec2[] => {
    const path: Vec2[] = []
    const push = (p: Vec2) => {
      if (!same(path[path.length - 1] ?? from, p)) path.push(p)
    }
    if (Math.abs(from[1] - lane) > 0.05) push([from[0], lane])
    push([to[0], lane])
    push(to)
    return path
  }
  /** A clear spot in front of someone's room, beside whoever is already waiting there. */
  const spotBy = (host: string, guest: string): Vec2 => {
    const h = home(host)
    const taken = [...where].filter(([id, w]) => id !== guest && !w.home && w.with === host).length
    const room = rooms.find((r) => r.id === host)!
    const dx = taken === 0 ? 0.48 : -0.42
    return nav.nearestFree([Math.min(room.x1 - 0.2, Math.max(room.x0 + 0.2, h[0] + dx)), meetZ.get(host)! + taken * 0.1])
  }

  // Everyone starts facing the audience.
  const start = Object.fromEntries(order.map((a) => [a.id, { at: home(a.id), yaw: 0 }]))
  const beats: Beat[] = []
  const bubble = (icon: string, text?: Text): Bubble => (text ? { icon, text } : { icon })
  const caption = (s: FlowStep, icon: string) => ({ en: s.text.en, pt: s.text.pt, icon })

  /** Everyone not in this step goes back to their spot (the person using the system stays to watch). */
  const strays = (busy: string[]): Beat['acts'] => {
    const acts: NonNullable<Beat['acts']> = {}
    for (const [id, w] of where) {
      if (w.home || busy.includes(id) || byId.get(id)?.kind === 'person') continue
      acts[id] = { path: route(w.at, home(id)) }
      where.set(id, { home: true })
    }
    return acts
  }

  beats.push({ dur: 0.6, flags: { tv: false }, props: { letter: null, box: null } })

  for (const step of steps) {
    const look = ACTION[step.action]
    const icon = look.icon
    const other = look.prop === 'letter' ? 'box' : 'letter'

    if (step.from === step.to) {
      // Something done alone: think, decide, show it on screen.
      const id = step.from
      const back = strays([id])
      const acts: NonNullable<Beat['acts']> = { ...back }
      if (!where.get(id)!.home) {
        acts[id] = { path: route(pos(id), home(id)) }
        where.set(id, { home: true })
        beats.push({ caption: caption(step, icon), dur: 0.8, acts })
        beats.push({ dur: 1.8, say: { [id]: bubble(icon, step.say) }, acts: { [id]: { anim: look.anim, face: faces.get(id) } }, flags: step.action === 'show' ? { tv: true } : undefined })
      } else {
        acts[id] = { anim: step.action === 'decide' ? 'idle' : look.anim, face: faces.get(id) }
        beats.push({ caption: caption(step, icon), dur: 1.9, say: { [id]: bubble(icon, step.say) }, acts, flags: step.action === 'show' ? { tv: true } : undefined })
      }
      if (step.action === 'decide') {
        beats.push({ dur: 1.1, say: { [id]: { icon: look.done } }, acts: { [id]: { anim: 'emote-yes', face: [home(id)[0], 2] } } })
      }
      continue
    }

    const { from, to } = step
    const wf = where.get(from)!
    const wt = where.get(to)!
    const back = strays([from, to])
    const props: Record<string, Holder> = { [look.prop]: from, [other]: null }

    if (!wt.home && wt.with === from) {
      // The receiver came over and is waiting here: the giver gets back to their spot and hands it over.
      const acts: NonNullable<Beat['acts']> = { ...back }
      if (!wf.home) {
        acts[from] = { path: route(wf.at, home(from)) }
        where.set(from, { home: true })
      } else acts[from] = { anim: 'interact-right', face: faces.get(from) }
      beats.push({ caption: caption(step, icon), dur: 0.9, props, say: { [from]: bubble(icon, step.say) }, acts })
      beats.push({
        dur: 1.3,
        props: { [look.prop]: to },
        say: { [to]: { icon: look.done } },
        acts: { [from]: { anim: 'interact-right', face: wt.at }, [to]: { anim: look.anim === 'pick-up' ? 'emote-yes' : look.anim, face: home(from) } },
      })
      continue
    }

    // Otherwise the giver walks over to the receiver, who first gets back to their own spot if needed.
    const acts: NonNullable<Beat['acts']> = { ...back }
    if (!wt.home) {
      acts[to] = { path: route(wt.at, home(to)) }
      where.set(to, { home: true })
    }
    const meet = wf.home || wf.with !== to ? spotBy(to, from) : wf.at
    if (!same(pos(from), meet)) acts[from] = { path: route(pos(from), meet) }
    where.set(from, { home: false, with: to, at: meet })
    // A caption needs a moment on screen even when nobody has to walk.
    beats.push({ caption: caption(step, icon), dur: 0.9, props, say: { [from]: bubble(icon, step.say) }, acts })
    beats.push({
      dur: 1.5,
      props: { [look.prop]: to },
      say: { [to]: { icon: look.done } },
      acts: { [to]: { anim: look.anim, face: look.anim === 'pick-up' ? faces.get(to) : meet }, [from]: { anim: 'idle', face: home(to) } },
    })
  }

  // Curtain: everyone back to their spot, so the loop starts where it began.
  const finale: NonNullable<Beat['acts']> = {}
  for (const [id, w] of where) if (!w.home) finale[id] = { path: route(w.at, home(id)) }
  beats.push({ acts: finale, props: { letter: null, box: null } })
  beats.push({ dur: 1.4, flags: { tv: false } })

  const story: Story = compile(start, beats, WALK_SPEED, nav.route)
  const kind = KIND_LABEL[flow.kind]
  return {
    id: flow.id,
    repo: flow.title[lang],
    language: options.label ?? { name: kind.name[lang], color: kind.color },
    docker: false,
    layout,
    cast,
    stories: { main: story },
    narrator: 'main',
    intro: { en: flow.summary.en, pt: flow.summary.pt },
    visitors: [],
    status: {},
  }
}

// ─── Edits ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Which names the residents wear: plain ones for people who don't code ("Recepção", "Buscar leads",
 * "Banco de dados") or the ones from the code ("Backend Routes", "search_leads", "PostgreSQL"), set
 * separately for the system's parts, the AI's tools, and the outside services and AI model.
 */
export type Naming = { parts: 'plain' | 'code'; tools: 'plain' | 'code'; services: 'plain' | 'code' }

export const PLAIN: Naming = { parts: 'plain', tools: 'plain', services: 'plain' }
export const CODE: Naming = { parts: 'code', tools: 'code', services: 'code' }

/** Which of the naming switches covers an actor (null: the person, who keeps their name). */
export function namingGroup(a: Actor): keyof Naming | null {
  if (a.kind === 'person') return null
  if (a.kind === 'tool') return 'tools'
  if (a.kind === 'llm' || (a.external && !a.component)) return 'services'
  return 'parts'
}

/**
 * What the presenter changed in the generated script: renamed participants, rewritten captions,
 * scenes left out, plain or technical names. Kept apart from the model so a fresh analysis can be
 * re-applied on top of it. Keys: actors by `actorKey`, steps by `<flow id>#<step index>`, titles by
 * flow id.
 */
export type ScriptEdits = {
  actors: Record<string, Partial<Text>>
  steps: Record<string, Partial<Text>>
  titles: Record<string, Partial<Text>>
  hidden: string[]
  /** Plain names unless set. */
  naming?: Naming
}

export const NO_EDITS: ScriptEdits = { actors: {}, steps: {}, titles: {}, hidden: [] }

/** The same participant across scenes (a component or service), so renaming it once renames it everywhere. */
export const actorKey = (a: Actor) => a.component ?? a.external ?? `${a.kind}:${(a.technical ?? a.name).en}`

const merge = (base: Text, patch?: Partial<Text>): Text => ({ en: patch?.en?.trim() || base.en, pt: patch?.pt?.trim() || base.pt })

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const lowerFirst = (s: string) => s.charAt(0).toLocaleLowerCase() + s.slice(1)

type Gender = 'o' | 'a' | 'os' | 'as'
/** Portuguese articles, alone or joined to a preposition, by preposition and gender. */
const PT_FORMS: Record<string, Record<Gender, string>> = {
  '': { o: 'o', a: 'a', os: 'os', as: 'as' },
  a: { o: 'ao', a: 'à', os: 'aos', as: 'às' },
  de: { o: 'do', a: 'da', os: 'dos', as: 'das' },
  em: { o: 'no', a: 'na', os: 'nos', as: 'nas' },
  por: { o: 'pelo', a: 'pela', os: 'pelos', as: 'pelas' },
}
const PT_ARTICLE = new Map(Object.entries(PT_FORMS).flatMap(([prep, forms]) => Object.values(forms).map((form) => [form, prep] as const)))
const PT_ARTICLES = [...PT_ARTICLE.keys()].join('|')

/** Words that follow a subject without being its verb ("os bastidores de leads"). */
const NOT_VERBS = new Set(['de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'que', 'com', 'para', 'por', 'pelo', 'pela', 'e', 'ou', 'se', 'sem', 'sobre', 'entre', 'até', 'também', 'já', 'não', 'só', 'a', 'o', 'as', 'os'])
const PT_IRREGULAR: [string, string][] = [['lê', 'leem'], ['tem', 'têm'], ['vem', 'vêm'], ['dá', 'dão'], ['vai', 'vão'], ['é', 'são'], ['está', 'estão']]

/**
 * The verb right after a subject that went from plural to singular or back ("os bastidores pegam"
 * → "o Carteiro pega"): the scenes only use the present tense, so the regular endings and a few
 * irregular verbs cover them.
 */
function agree(verb: string, plural: boolean): string {
  const lower = verb.toLowerCase()
  if (NOT_VERBS.has(lower) || verb.length < 2) return verb
  const irregular = PT_IRREGULAR.find(([one, many]) => (plural ? one : many) === lower)
  if (irregular) return plural ? irregular[1] : irregular[0]
  if (plural) return /[ae]$/.test(lower) ? `${verb}m` : verb
  return /[ae]m$/.test(lower) ? verb.slice(0, -1) : verb
}

/**
 * Swaps whole-word mentions of each participant in a sentence. A name written with a lower-case
 * first letter mid-sentence ("o banco de dados") is swapped too; it stays lower-case when the new
 * name is a plain one, and keeps its own capitals when it's a proper name ("o PostgreSQL"). In
 * Portuguese, the article in front follows the new name ("pelos bastidores" → "pelo Carteiro").
 */
function rename(text: string, names: { from: string; to: string; plain: boolean }[], lang: 'en' | 'pt' = 'en'): string {
  let out = text
  for (const { from, to, plain } of names) {
    if (!from || from === to) continue
    const lower = lowerFirst(from)
    const swap = (w: string) => (w === from ? to : plain ? lowerFirst(to) : to)
    for (const w of lower !== from ? [from, lower] : [from]) {
      if (lang === 'pt') {
        const gender = ptGender(to)
        const plural = gender.endsWith('s')
        // A subject that starts a sentence: its verb comes right after and follows the new number.
        const subject = new RegExp(`(^|[.!?]\\s+)(${PT_ARTICLES})\\s+${escape(w)}\\s+(\\p{L}+)`, 'giu')
        out = out.replace(subject, (_, lead: string, article: string, verb: string) => {
          const was = ptGender(from).endsWith('s')
          return `${lead}${article} ${w} ${was === plural ? verb : agree(verb, plural)}`
        })
        const articled = new RegExp(`(?<![\\p{L}\\p{N}])(${PT_ARTICLES})\\s+${escape(w)}(?![\\p{L}\\p{N}])`, 'giu')
        out = out.replace(articled, (_, article: string) => {
          const form = PT_FORMS[PT_ARTICLE.get(article.toLowerCase()) ?? ''][gender]
          const cased = article[0] !== article[0].toLowerCase() ? form[0].toUpperCase() + form.slice(1) : form
          return `${cased} ${swap(w)}`
        })
      }
      out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(w)}(?![\\p{L}\\p{N}])`, 'gu'), swap(w))
    }
  }
  return out
}

/** Whether an actor shows the code's name: its switch says so and it has one. */
function usesCode(a: Actor, naming: Naming): boolean {
  const group = namingGroup(a)
  return !!group && naming[group] === 'code' && !!a.technical
}

/**
 * The flows with the presenter's changes applied (hidden scenes kept, flagged by `hidden`): the
 * chosen naming first, then renames by hand. Captions, titles and bubbles follow the new names,
 * unless a caption was rewritten by hand.
 */
export function applyEdits(flows: Flow[], edits: ScriptEdits): Flow[] {
  const naming = edits.naming ?? PLAIN
  return flows.map((f) => {
    // The code's names win over renames by hand: a rename is a plainer word for the same part, and
    // whoever chose the code's names wants those.
    const actors = f.actors.map((a) => ({ ...a, name: usesCode(a, naming) ? a.technical! : merge(a.name, edits.actors[actorKey(a)]) }))
    // Longest names first, so "Backend Routes" is swapped before a shorter name inside it.
    const swaps = (lang: 'en' | 'pt') =>
      f.actors
        .map((a, i) => ({ from: a.name[lang], to: actors[i].name[lang], plain: !usesCode(a, naming) && !edits.actors[actorKey(a)]?.[lang]?.trim() }))
        .filter(({ from, to }) => from !== to)
        .sort((a, b) => b.from.length - a.from.length)
    const en = swaps('en')
    const pt = swaps('pt')
    const both = (t: Text): Text => ({ en: rename(t.en, en), pt: rename(t.pt, pt, 'pt') })
    return {
      ...f,
      title: merge(both(f.title), edits.titles[f.id]),
      summary: both(f.summary),
      actors,
      steps: f.steps.map((s, i) => ({ ...s, text: merge(both(s.text), edits.steps[`${f.id}#${i}`]), ...(s.say ? { say: both(s.say) } : {}) })),
    }
  })
}

/**
 * A sentence about the whole system, such as the model's summary, with the presenter's renames of
 * its parts, so it calls them what the scenes do.
 */
export function renameParts(text: Text, parts: { id: string; label?: Text }[], edits: ScriptEdits): Text {
  const swaps = (lang: 'en' | 'pt') =>
    parts
      .flatMap((c) => {
        const to = edits.actors[c.id]?.[lang]?.trim()
        return c.label && to ? [{ from: c.label[lang], to, plain: false }] : []
      })
      .sort((a, b) => b.from.length - a.from.length)
  return { en: rename(text.en, swaps('en')), pt: rename(text.pt, swaps('pt'), 'pt') }
}

/** Which actors make the clearest example of a switch: the front desk before the screens, and so on. */
const EXAMPLE_ORDER: ActorKind[] = ['api', 'service', 'agent', 'security', 'database', 'llm', 'tool', 'screen', 'worker', 'queue', 'cache', 'external']

/**
 * One example per naming switch from the scenes, [plain, code], for the presenter to choose by.
 * Pass the flows with the presenter's renames applied (plain naming), so the plain side shows the
 * names the audience would actually see.
 */
export function namingExamples(flows: Flow[]): Partial<Record<keyof Naming, [Text, Text]>> {
  const out: Partial<Record<keyof Naming, [Text, Text]>> = {}
  const actors = flows.flatMap((f) => f.actors).sort((a, b) => EXAMPLE_ORDER.indexOf(a.kind) - EXAMPLE_ORDER.indexOf(b.kind))
  for (const a of actors) {
    const group = namingGroup(a)
    if (group && !out[group] && a.technical && a.technical.pt !== a.name.pt) out[group] = [a.name, a.technical]
  }
  return out
}
