/**
 * The flat generator. Given who lives in a repo (React, Django, PostgreSQL…), it picks a room for each
 * role, lines the rooms up, and writes the story they act out. Hand-placed demo data and real GitHub
 * data both go through here, so every flat follows the same rules.
 *
 * Big rooms on purpose: this is what you see when you step inside, full screen.
 */
import type { Role } from '../shared/types'
import { compile, type Beat, type Caption, type Story, type Vec2, type Vec3 } from './story'
import type { CastMember, Decor, FlatData, FlatLayout, Placement, Room } from './types'

export const DEPTH = 2.6
export const HEIGHT = 1.55
const BACK = -DEPTH / 2
/** The walking lane through the door gaps. */
const LANE = 0.55
const DOOR: [number, number] = [0.05, 0.95]
const DOCKER_BLUE = '#2f8fe6'

type Template = {
  kind: string
  /** The little sign over the room. */
  label: Caption
  width: number
  wall: string
  floor: string
  furniture: Placement[]
  decor?: Decor[]
  /** Named spots on the floor, in room coordinates. */
  spots: Record<string, Vec2>
  /** Named points in the air (where a prop rests), in room coordinates. */
  points?: Record<string, Vec3>
  tv?: { at: Vec3; size: [number, number] }
}

const T: Record<string, Template> = {
  living: {
    kind: 'living',
    label: { en: 'Front end', pt: 'Front-end' },
    width: 3.0,
    wall: '#f7d9c9',
    floor: '#ecd2b0',
    furniture: [
      { model: 'rugRounded', at: [0.75, 0.004, 0.8] },
      { model: 'cabinetTelevision', at: [1.1, 0, BACK + 0.25] },
      { model: 'televisionModern', at: [1.5, 0.31, BACK + 0.12] },
      { model: 'speaker', at: [0.8, 0, BACK + 0.2] },
      { model: 'speaker', at: [2.02, 0, BACK + 0.2] },
      { model: 'loungeSofa', at: [0.5, 0, 0.72], rotY: Math.PI / 2 },
      { model: 'pillowBlue', at: [0.2, 0.25, 0.2], rotY: Math.PI / 2 },
      { model: 'tableCoffee', at: [1.85, 0, 0.42] },
      { model: 'lampRoundFloor', at: [0.15, 0, BACK + 0.22] },
      { model: 'pottedPlant', at: [2.66, 0, BACK + 0.3] },
      { model: 'books', at: [1.5, 0.235, 0.28] },
    ],
    decor: [
      { kind: 'window', x: 0.55, y: 0.95, w: 0.62, h: 0.62 },
      { kind: 'picture', x: 1.5, y: 1.13, w: 0.5, h: 0.3, color: '#f2a65a' },
      { kind: 'picture', x: 2.45, y: 1.0, w: 0.3, h: 0.38, color: '#7c83ff' },
    ],
    spots: { home: [1.05, 1.0], table: [2.15, 0.85], tableFace: [1.7, 0.3], tv: [1.5, BACK], drop: [2.45, 0.6] },
    points: { onTable: [1.7, 0.235, 0.3] },
    tv: { at: [1.5, 0.56, BACK + 0.19], size: [0.58, 0.33] },
  },
  hall: {
    kind: 'hall',
    label: { en: 'Security', pt: 'Segurança' },
    width: 1.8,
    wall: '#cfe9dc',
    floor: '#dcd5c8',
    furniture: [
      { model: 'doorway', at: [0.5, 0, BACK + 0.1] },
      { model: 'rugDoormat', at: [0.53, 0.004, BACK + 0.4] },
      { model: 'sideTable', at: [1.15, 0, BACK + 0.22] },
      { model: 'radio', at: [1.22, 0.38, BACK + 0.14] },
      { model: 'plantSmall1', at: [1.6, 0.38, BACK + 0.12] },
      { model: 'coatRack', at: [0.05, 0.95, BACK + 0.13] },
    ],
    decor: [{ kind: 'picture', x: 1.4, y: 1.0, w: 0.36, h: 0.26, color: '#3f9c8f' }],
    spots: { post: [1.15, -0.55], check: [0.75, LANE] },
  },
  office: {
    kind: 'office',
    label: { en: 'API', pt: 'API' },
    width: 3.0,
    wall: '#ddd6f3',
    floor: '#e3cfae',
    furniture: [
      // Desk turned sideways so whoever works at it is seen in profile, not hidden behind the screen.
      { model: 'desk', at: [1.5, 0, -0.95], rotY: -Math.PI / 2 },
      { model: 'computerScreen', at: [1.72, 0.38, -0.81], rotY: -Math.PI / 2 },
      { model: 'computerKeyboard', at: [1.53, 0.38, -0.75], rotY: -Math.PI / 2 },
      { model: 'plantSmall2', at: [1.77, 0.38, -0.32] },
      { model: 'bookcaseOpen', at: [2.48, 0, BACK + 0.25] },
      { model: 'books', at: [2.58, 0.44, BACK + 0.17] },
      { model: 'books', at: [2.6, 0.03, BACK + 0.17] },
      { model: 'trashcan', at: [0.25, 0, BACK + 0.2] },
      { model: 'lampSquareFloor', at: [2.2, 0, BACK + 0.15] },
    ],
    decor: [{ kind: 'board', x: 0.85, y: 0.95, w: 0.9, h: 0.5 }],
    spots: { work: [1.22, -0.62], tray: [1.66, -0.3], deliver: [1.35, 0.42], aisle: [1.2, LANE], exit: [2.75, LANE] },
    points: { tray: [1.66, 0.39, -0.3] },
  },
  lab: {
    kind: 'lab',
    label: { en: 'Tests', pt: 'Testes' },
    width: 1.8,
    wall: '#d6eef5',
    floor: '#e0d3bf',
    furniture: [
      { model: 'sideTable', at: [0.4, 0, BACK + 0.22] },
      { model: 'lampSquareTable', at: [0.5, 0.38, BACK + 0.15] },
      { model: 'books', at: [0.75, 0.38, BACK + 0.12] },
      { model: 'bookcaseClosed', at: [1.28, 0, BACK + 0.25] },
      { model: 'plantSmall3', at: [1.0, 0.38, BACK + 0.1] },
    ],
    decor: [{ kind: 'picture', x: 0.65, y: 1.05, w: 0.34, h: 0.26, color: '#0a9edc' }],
    spots: { home: [0.75, -0.55], check: [0.42, LANE + 0.1] },
  },
  archive: {
    kind: 'archive',
    label: { en: 'Database', pt: 'Banco de dados' },
    width: 2.4,
    wall: '#f4e6b8',
    floor: '#d9cdb5',
    furniture: [
      { model: 'bookcaseClosedWide', at: [0.3, 0, BACK + 0.25] },
      { model: 'bookcaseOpen', at: [1.12, 0, BACK + 0.25] },
      { model: 'books', at: [1.2, 0.44, BACK + 0.17] },
      { model: 'bookcaseClosedWide', at: [1.56, 0, BACK + 0.25] },
      { model: 'cardboardBoxClosed', at: [1.95, 0, 0.62] },
      { model: 'cardboardBoxClosed', at: [2.17, 0, 0.62] },
      { model: 'cardboardBoxClosed', at: [2.06, 0.28, 0.58] },
      { model: 'cardboardBoxOpen', at: [0.15, 0, 1.15] },
    ],
    spots: { home: [1.3, -0.6], shelf: [1.3, BACK], handoff: [0.5, LANE] },
    points: { shelf: [1.25, 0.43, -1.13] },
  },
  pantry: {
    kind: 'pantry',
    label: { en: 'Cache', pt: 'Cache' },
    width: 1.7,
    wall: '#fde3d2',
    floor: '#e9dccb',
    furniture: [
      { model: 'kitchenFridgeSmall', at: [0.35, 0, BACK + 0.29] },
      { model: 'kitchenBar', at: [0.85, 0, BACK + 0.21] },
      { model: 'kitchenCoffeeMachine', at: [0.97, 0.42, BACK + 0.24] },
      { model: 'stoolBar', at: [1.25, 0, -0.55] },
    ],
    spots: { home: [0.75, -0.45], fridge: [0.55, BACK], ask: [0.3, LANE] },
  },
  mailroom: {
    kind: 'mailroom',
    label: { en: 'Background jobs', pt: 'Fila de tarefas' },
    width: 2.0,
    wall: '#e4f0d4',
    floor: '#ddd2bd',
    furniture: [
      { model: 'kitchenBar', at: [0.3, 0, BACK + 0.21] },
      { model: 'kitchenBar', at: [0.73, 0, BACK + 0.21] },
      { model: 'books', at: [0.4, 0.42, BACK + 0.15] },
      { model: 'books', at: [0.85, 0.42, BACK + 0.15] },
      { model: 'cardboardBoxOpen', at: [1.45, 0, -0.35] },
      { model: 'cardboardBoxClosed', at: [1.55, 0, 0.75] },
    ],
    decor: [{ kind: 'picture', x: 1.45, y: 1.0, w: 0.4, h: 0.28, color: '#86c784' }],
    spots: { home: [0.6, -0.6], sort: [0.6, BACK], out: [1.4, 0.35], outFace: [1.55, -0.4] },
  },
  workshop: {
    kind: 'workshop',
    label: { en: 'Docker', pt: 'Docker' },
    width: 2.0,
    wall: '#dcebfb',
    floor: '#d3dbe6',
    furniture: [
      { model: 'cardboardBoxClosed', at: [0.9, 0, BACK + 0.25], tint: DOCKER_BLUE },
      { model: 'cardboardBoxClosed', at: [1.13, 0, BACK + 0.25], tint: DOCKER_BLUE },
      { model: 'cardboardBoxClosed', at: [1.02, 0.28, BACK + 0.27], tint: DOCKER_BLUE },
      { model: 'cardboardBoxClosed', at: [1.65, 0, 0.55], tint: DOCKER_BLUE },
      { model: 'cardboardBoxClosed', at: [1.65, 0.28, 0.52], tint: DOCKER_BLUE },
      { model: 'cardboardBoxOpen', at: [0.2, 0, -0.5], tint: DOCKER_BLUE },
    ],
    decor: [{ kind: 'picture', x: 1.55, y: 1.0, w: 0.42, h: 0.28, color: DOCKER_BLUE }],
    spots: { home: [0.85, -0.45], pack: [1.0, BACK], front: [1.15, 0.75], packFront: [1.7, 0.8] },
  },
  balcony: {
    kind: 'balcony',
    label: { en: 'Mobile', pt: 'Mobile' },
    width: 1.8,
    wall: '#e8e0fb',
    floor: '#dfe7d9',
    furniture: [
      { model: 'loungeChairRelax', at: [0.2, 0, 0.1], rotY: Math.PI / 2 },
      { model: 'pottedPlant', at: [1.45, 0, BACK + 0.3] },
      { model: 'plantSmall1', at: [1.6, 0, 0.9] },
      { model: 'rugRound', at: [0.5, 0.004, 1.15] },
    ],
    decor: [{ kind: 'window', x: 0.85, y: 0.95, w: 0.7, h: 0.66 }],
    spots: { home: [0.95, 0.15], sky: [0.95, BACK] },
  },
  studio: {
    kind: 'studio',
    label: { en: 'Code', pt: 'Código' },
    width: 3.2,
    wall: '#d5ecd9',
    floor: '#e6cfa9',
    furniture: [
      { model: 'rugRound', at: [0.25, 0.004, 1.1] },
      { model: 'loungeChairRelax', at: [0.85, 0, 0.92], rotY: Math.PI / 2 },
      { model: 'lampSquareFloor', at: [0.15, 0, BACK + 0.2] },
      { model: 'desk', at: [1.6, 0, -0.95], rotY: -Math.PI / 2 },
      { model: 'laptop', at: [1.64, 0.38, -0.7], rotY: -Math.PI / 2 },
      { model: 'plantSmall1', at: [1.86, 0.38, -0.32] },
      { model: 'bookcaseOpen', at: [2.55, 0, BACK + 0.25] },
      { model: 'books', at: [2.65, 0.44, BACK + 0.17] },
      { model: 'pottedPlant', at: [3.0, 0, 0.2] },
    ],
    decor: [
      { kind: 'window', x: 0.9, y: 0.95, w: 0.62, h: 0.62 },
      { kind: 'picture', x: 2.0, y: 1.1, w: 0.42, h: 0.3, color: '#3572a5' },
    ],
    spots: { desk: [1.35, -0.58], laptop: [1.75, -0.58], shelf: [2.75, -0.62], shelfFace: [2.75, BACK], exit: [3.0, LANE] },
  },
  kitchen: {
    kind: 'kitchen',
    label: { en: 'Kitchen', pt: 'Cozinha' },
    width: 2.3,
    wall: '#fbe0cf',
    floor: '#e9dccb',
    furniture: [
      { model: 'kitchenCabinet', at: [0.3, 0, BACK + 0.45] },
      { model: 'kitchenSink', at: [0.73, 0, BACK + 0.45] },
      { model: 'kitchenStove', at: [1.16, 0, BACK + 0.45] },
      { model: 'kitchenCoffeeMachine', at: [0.42, 0.45, BACK + 0.3] },
      { model: 'kitchenFridgeSmall', at: [1.65, 0, BACK + 0.29] },
      { model: 'table', at: [0.7, 0, 0.95] },
      { model: 'chair', at: [0.55, 0, 0.6] },
      { model: 'chair', at: [1.15, 0, 0.6] },
    ],
    decor: [{ kind: 'window', x: 1.15, y: 1.05, w: 0.55, h: 0.45 }],
    spots: { coffee: [0.5, -0.62], coffeeFace: [0.5, BACK], entry: [0.25, LANE] },
  },
  bedroom: {
    kind: 'bedroom',
    label: { en: 'Bedroom', pt: 'Quarto' },
    width: 2.6,
    wall: '#f6d6e2',
    floor: '#e3cdb2',
    furniture: [
      { model: 'bedSingle', at: [1.35, 0, 0.45], scale: 0.9 },
      { model: 'sideTable', at: [0.6, 0, BACK + 0.22] },
      { model: 'lampSquareTable', at: [0.7, 0.38, BACK + 0.15] },
      { model: 'rugRectangle', at: [0.2, 0.004, 1.2], scale: 0.7 },
      { model: 'plantSmall2', at: [2.35, 0, 1.0] },
    ],
    decor: [
      { kind: 'window', x: 1.75, y: 1.05, w: 0.6, h: 0.5 },
      { kind: 'picture', x: 0.75, y: 1.05, w: 0.32, h: 0.32, color: '#e88aa8' },
    ],
    spots: { home: [1.0, 0.6] },
  },
}

/** Which character plays which role, so a role always looks the same everywhere. */
const MODEL: Record<Role, string> = {
  frontend: 'character-female-b',
  security: 'character-male-c',
  backend: 'character-male-d',
  tests: 'character-female-e',
  database: 'character-male-b',
  cache: 'character-female-c',
  worker: 'character-female-f',
  devops: 'character-male-e',
  mobile: 'character-female-a',
  coder: 'character-male-a',
}

const ROOM_FOR: Record<Role, string> = {
  mobile: 'balcony',
  frontend: 'living',
  security: 'hall',
  backend: 'office',
  tests: 'lab',
  database: 'archive',
  cache: 'pantry',
  worker: 'mailroom',
  devops: 'workshop',
  coder: 'studio',
}

/**
 * Left to right in the order a request travels: front end, guard, back end, the cache right next door,
 * tests on the way back, the database at the far end; jobs and the workshop after that.
 */
const ORDER: Role[] = ['mobile', 'frontend', 'security', 'backend', 'cache', 'tests', 'database', 'worker', 'devops', 'coder']

/** Every model a flat can use, so they can all be fetched before anyone steps inside. */
export const ALL_MODELS = {
  furniture: [...new Set(Object.values(T).flatMap((t) => t.furniture.map((f) => f.model)))],
  characters: [...new Set(Object.values(MODEL))],
}

export type ResidentSpec = { tech: string; role: Role; color: string }

export type FlatSpec = {
  id: string
  repo: string
  language: { name: string; color: string }
  intro: Caption
  residents: ResidentSpec[]
}

type Placed = { template: Template; x0: number }

/** Minimum width so even a one-room project gets a proper flat. */
const MIN_WIDTH = 7.5

export function planRooms(roles: Role[]): Template[] {
  const present = ORDER.filter((r) => roles.includes(r))
  const rooms = present.map((r) => T[ROOM_FOR[r]])
  // A flat with only a front end, or only code, still needs somewhere to live.
  if (present.length === 1 || !present.some((r) => r === 'backend' || r === 'frontend')) {
    if (!rooms.includes(T.studio) && !present.includes('frontend')) rooms.push(T.studio)
  }
  let width = rooms.reduce((sum, t) => sum + t.width, 0)
  for (const extra of [T.kitchen, T.bedroom]) {
    if (width >= MIN_WIDTH) break
    rooms.push(extra)
    width += extra.width
  }
  return rooms
}

const add = (a: Vec2, x0: number): Vec2 => [a[0] + x0, a[1]]
const add3 = (a: Vec3, x0: number): Vec3 => [a[0] + x0, a[1], a[2]]

export function buildFlat(spec: FlatSpec): FlatData {
  const byRole = new Map<Role, ResidentSpec>()
  for (const r of spec.residents) if (!byRole.has(r.role)) byRole.set(r.role, r)
  const roles = [...byRole.keys()]

  const templates = planRooms(roles)
  const placed: Placed[] = []
  let x = 0
  for (const template of templates) {
    placed.push({ template, x0: x })
    x += template.width
  }

  const room = (kind: string) => placed.find((p) => p.template.kind === kind)
  const spot = (kind: string, name: string): Vec2 => {
    const p = room(kind)
    if (!p) throw new Error(`flat: no ${kind} room`)
    return add(p.template.spots[name], p.x0)
  }
  const point = (kind: string, name: string): Vec3 => {
    const p = room(kind)!
    return add3(p.template.points![name], p.x0)
  }

  const rooms: Room[] = placed.map(({ template: t, x0 }) => ({
    id: t.kind,
    label: t.label,
    x0,
    x1: x0 + t.width,
    wall: t.wall,
    floor: t.floor,
    furniture: t.furniture.map((f) => ({ ...f, at: add3(f.at, x0) })),
    decor: (t.decor ?? []).map((d) => ({ ...d, x: d.x + x0 })),
  }))

  const living = room('living')
  const layout: FlatLayout = {
    width: x,
    depth: DEPTH,
    height: HEIGHT,
    door: DOOR,
    rooms,
    tv: living?.template.tv ? { ...living.template.tv, at: add3(living.template.tv.at, living.x0) } : undefined,
  }

  const id = (role: Role) => role
  const cast: CastMember[] = []
  const stories: Record<string, Story> = {}
  const has = (r: Role) => byRole.has(r)
  const tech = (r: Role) => byRole.get(r)!.tech

  const mainRoles: Role[] = []
  const main = mainStory()
  if (main) stories.main = main.story

  for (const [role, r] of byRole) {
    const inMain = mainRoles.includes(role)
    if (!inMain) {
      const ambient = ambientStory(role)
      if (ambient) stories[role] = ambient
    }
    cast.push({ id: id(role), tech: r.tech, role, model: MODEL[role], color: r.color, story: inMain ? 'main' : role })
  }

  // Narrate the request loop if there is one, else whoever has the most to show.
  const lead = (['coder', 'frontend', 'worker', 'devops', 'mobile', 'tests', 'database'] as Role[]).find((r) => stories[r])
  const narrator = stories.main ? 'main' : (lead ?? cast[0]?.story ?? 'main')
  return {
    id: spec.id,
    repo: spec.repo,
    language: spec.language,
    docker: has('devops'),
    layout,
    cast,
    stories,
    narrator,
    intro: spec.intro,
  }

  /** The request loop: front end asks, the guard checks, the back end fetches, tests check, it comes back. */
  function mainStory(): { story: Story } | null {
    if (!has('backend')) return null
    const F = has('frontend')
    const S = has('security')
    const D = has('database')
    const C = has('cache')
    const Te = has('tests')
    mainRoles.push('backend')
    if (F) mainRoles.push('frontend')
    if (S) mainRoles.push('security')
    if (D) mainRoles.push('database')
    if (C) mainRoles.push('cache')
    if (Te) mainRoles.push('tests')

    const start: Record<string, { at: Vec2; yaw: number }> = {
      backend: { at: spot('office', 'work'), yaw: Math.PI / 2 },
    }
    if (F) start.frontend = { at: spot('living', 'home'), yaw: Math.PI }
    if (S) start.security = { at: spot('hall', 'post'), yaw: 0 }
    if (D) start.database = { at: spot('archive', 'home'), yaw: 0 }
    if (C) start.cache = { at: spot('pantry', 'home'), yaw: 0 }
    if (Te) start.tests = { at: spot('lab', 'home'), yaw: 0 }

    const B = tech('backend')
    const beats: Beat[] = []
    const tray = point('office', 'tray')

    if (F) {
      beats.push({
        caption: { en: `${tech('frontend')} asks the API for some data`, pt: `O ${tech('frontend')} pede dados para a API`, icon: '📨' },
        say: { frontend: { icon: '📨', text: { en: 'request!', pt: 'pedido!' } } },
        props: { letter: 'frontend', box: null },
        flags: { tv: false },
        acts: { frontend: { walk: S ? spot('hall', 'check') : spot('office', 'deliver') } },
      })
      if (S) {
        beats.push(
          {
            caption: { en: `${tech('security')} checks the login token`, pt: `O ${tech('security')} confere o token de login`, icon: '🔑' },
            say: { security: { icon: '🔑', text: { en: 'token?', pt: 'token?' } } },
            dur: 1.3,
            acts: {
              security: { anim: 'interact-right', face: spot('hall', 'check') },
              frontend: { anim: 'idle', face: spot('hall', 'post') },
            },
          },
          {
            dur: 0.9,
            say: { security: { icon: '✅', text: { en: 'come in', pt: 'pode entrar' } } },
            acts: { security: { anim: 'emote-yes', face: spot('hall', 'check') } },
          },
          {
            caption: { en: `The request reaches ${B}`, pt: `O pedido chega no ${B}`, icon: '🚶' },
            acts: { frontend: { walk: spot('office', 'deliver') }, security: { anim: 'idle', face: [spot('hall', 'post')[0], 1] } },
          },
        )
      }
      beats.push({
        caption: { en: `${B} reads the request`, pt: `O ${B} lê o pedido`, icon: '🧐' },
        say: { backend: { icon: '🧐', text: { en: 'on it', pt: 'deixa comigo' } } },
        dur: 1.4,
        props: { letter: tray },
        acts: { frontend: { walk: spot('living', 'home') }, backend: { anim: 'interact-right', face: spot('office', 'tray') } },
      })
    } else {
      beats.push({
        caption: { en: `A request lands on ${B}'s desk`, pt: `Um pedido chega na mesa do ${B}`, icon: '📨' },
        say: { backend: { icon: '📨', text: { en: 'new request', pt: 'pedido novo' } } },
        dur: 1.6,
        props: { letter: tray, box: null },
        acts: { backend: { anim: 'interact-right', face: spot('office', 'tray') } },
      })
    }

    if (C) {
      beats.push(
        {
          caption: { en: `${B} checks the ${tech('cache')} cache first`, pt: `O ${B} olha primeiro no cache do ${tech('cache')}`, icon: '⚡' },
          say: { backend: { icon: '⚡', text: { en: 'got it saved?', pt: 'tem guardado?' } } },
          props: { letter: null },
          acts: { backend: { path: [spot('office', 'aisle'), spot('pantry', 'ask')] } },
        },
        { dur: 1.1, say: { cache: { icon: '🔎' } }, acts: { cache: { anim: 'interact-right', face: spot('pantry', 'fridge') } } },
        {
          caption: { en: 'Not there yet', pt: 'Ainda não tem lá', icon: '❌' },
          say: { cache: { icon: '❌', text: { en: 'not yet', pt: 'ainda não' } } },
          dur: 0.9,
          acts: { cache: { anim: 'emote-no', face: spot('pantry', 'ask') } },
        },
      )
    }

    if (D) {
      const handoff = spot('archive', 'handoff')
      const meet: Vec2 = [handoff[0] - 0.42, handoff[1]]
      beats.push(
        {
          caption: { en: `${B} asks ${tech('database')} for the rows`, pt: `O ${B} pede os dados ao ${tech('database')}`, icon: '💾' },
          say: { backend: { icon: '💾', text: { en: 'the data, please', pt: 'os dados, por favor' } } },
          props: { letter: null },
          acts: { backend: C ? { walk: meet } : { path: [spot('office', 'aisle'), meet] } },
        },
        {
          dur: 1.0,
          props: { box: point('archive', 'shelf') },
          say: { database: { icon: '📦' } },
          acts: { database: { anim: 'pick-up', face: spot('archive', 'shelf') }, backend: { anim: 'idle', face: handoff } },
        },
        {
          props: { box: 'database' },
          say: { database: { icon: '📦', text: { en: 'here you go', pt: 'tá aqui' } } },
          acts: { database: { walk: handoff } },
        },
        { dur: 0.4, props: { box: 'backend' }, acts: { database: { anim: 'idle', face: meet } } },
      )
    } else {
      beats.push({
        caption: { en: `${B} packs the answer`, pt: `O ${B} monta a resposta`, icon: '📦' },
        say: { backend: { icon: '📦' } },
        dur: 1.2,
        props: { letter: null, box: 'backend' },
        acts: { backend: { anim: 'interact-right', face: spot('office', 'tray') } },
      })
    }

    if (Te) {
      const check = spot('lab', 'check')
      const wait: Vec2 = [check[0] - 0.45, check[1] - 0.1]
      beats.push(
        {
          caption: { en: `${tech('tests')} checks the answer before it leaves`, pt: `O ${tech('tests')} confere a resposta antes de sair`, icon: '🔍' },
          acts: { backend: { walk: wait }, tests: { walk: check }, ...(D ? { database: { walk: spot('archive', 'home') } } : {}) },
        },
        {
          dur: 1.2,
          say: { tests: { icon: '🔍', text: { en: 'checking…', pt: 'conferindo…' } } },
          acts: { tests: { anim: 'interact-right', face: wait }, backend: { anim: 'idle', face: check } },
        },
        {
          dur: 0.8,
          say: { tests: { icon: '✅', text: { en: 'all good', pt: 'tudo certo' } } },
          acts: { tests: { anim: 'emote-yes', face: wait } },
        },
      )
    }

    if (F) {
      beats.push(
        {
          caption: { en: `${B} sends the response back`, pt: `O ${B} manda a resposta de volta`, icon: '📦' },
          say: { backend: { icon: '📦', text: { en: 'response!', pt: 'resposta!' } } },
          acts: {
            backend: { walk: spot('living', 'drop') },
            ...(Te ? { tests: { walk: spot('lab', 'home') } } : {}),
            ...(D && !Te ? { database: { walk: spot('archive', 'home') } } : {}),
            ...(S ? { security: { anim: 'emote-yes', face: spot('hall', 'check') } } : {}),
          },
        },
        {
          caption: { en: `${tech('frontend')} opens the parcel…`, pt: `O ${tech('frontend')} abre o pacote…`, icon: '🎁' },
          props: { box: point('living', 'onTable') },
          acts: {
            frontend: { walk: spot('living', 'table') },
            backend: { walk: spot('office', 'aisle') },
            ...(S ? { security: { anim: 'idle', face: [spot('hall', 'post')[0], 1] } } : {}),
          },
        },
        { dur: 1.2, say: { frontend: { icon: '🎁' } }, acts: { frontend: { anim: 'interact-right', face: spot('living', 'tableFace') } } },
        {
          caption: { en: '…and the page shows up on screen', pt: '…e a página aparece na tela', icon: '🖥️' },
          say: { frontend: { icon: '✨', text: { en: 'on screen!', pt: 'na tela!' } } },
          props: { box: null },
          flags: { tv: true },
          acts: { frontend: { anim: 'emote-yes', face: spot('living', 'tv') }, backend: { walk: spot('office', 'work') } },
        },
        { dur: 1.8, acts: { frontend: { walk: spot('living', 'home') }, backend: { anim: 'idle', face: spot('office', 'tray') } } },
      )
    } else {
      const exit = S ? spot('hall', 'check') : spot('office', 'exit')
      beats.push(
        {
          caption: { en: `${B} sends the answer out`, pt: `O ${B} manda a resposta para fora`, icon: '📤' },
          say: { backend: { icon: '📦', text: { en: 'response!', pt: 'resposta!' } } },
          acts: {
            backend: { walk: exit },
            ...(Te ? { tests: { walk: spot('lab', 'home') } } : {}),
            ...(D && !Te ? { database: { walk: spot('archive', 'home') } } : {}),
          },
        },
        { dur: 0.8, props: { box: null }, acts: { backend: { anim: 'emote-yes' } } },
        { acts: { backend: { walk: spot('office', 'work') } } },
        { dur: 1.4, acts: { backend: { anim: 'idle', face: spot('office', 'tray') } } },
      )
    }

    return { story: compile(start, beats) }
  }

  /** Residents outside the request loop get a little routine of their own. */
  function ambientStory(role: Role): Story | null {
    const r = byRole.get(role)!
    const one = (at: Vec2, beats: Beat[]) => compile({ [role]: { at, yaw: 0 } }, beats)
    switch (role) {
      case 'frontend':
        return one(spot('living', 'home'), [
          {
            caption: { en: `${r.tech} builds the page`, pt: `O ${r.tech} monta a página`, icon: '🧩' },
            flags: { tv: false },
            acts: { frontend: { walk: spot('living', 'table') } },
          },
          { dur: 1.6, say: { frontend: { icon: '🧩' } }, acts: { frontend: { anim: 'interact-right', face: spot('living', 'tableFace') } } },
          {
            caption: { en: '…and puts it on screen', pt: '…e coloca na tela', icon: '🖥️' },
            say: { frontend: { icon: '✨', text: { en: 'looks good', pt: 'ficou bom' } } },
            flags: { tv: true },
            dur: 1.2,
            acts: { frontend: { anim: 'emote-yes', face: spot('living', 'tv') } },
          },
          { acts: { frontend: { walk: spot('living', 'home') } } },
          { dur: 2, acts: { frontend: { anim: 'idle', face: spot('living', 'tv') } } },
        ])
      case 'worker': {
        const home = spot('mailroom', 'home')
        return one(home, [
          {
            caption: { en: `${r.tech} sorts the background jobs`, pt: `O ${r.tech} separa as tarefas em segundo plano`, icon: '✉️' },
            say: { worker: { icon: '✉️', text: { en: 'for later', pt: 'pra depois' } } },
            dur: 2.2,
            acts: { worker: { anim: 'interact-right', face: spot('mailroom', 'sort') } },
          },
          { acts: { worker: { walk: spot('mailroom', 'out') } } },
          { dur: 1.2, acts: { worker: { anim: 'pick-up', face: spot('mailroom', 'outFace') } } },
          { acts: { worker: { walk: home } } },
        ])
      }
      case 'devops': {
        const home = spot('workshop', 'home')
        return one(home, [
          {
            caption: { en: `${r.tech} packs the app into containers`, pt: `O ${r.tech} empacota o app em contêineres`, icon: '🐳' },
            say: { devops: { icon: '🐳', text: { en: 'packing', pt: 'empacotando' } } },
            dur: 2.4,
            acts: { devops: { anim: 'interact-right', face: spot('workshop', 'pack') } },
          },
          { acts: { devops: { walk: spot('workshop', 'front') } } },
          { dur: 1.8, acts: { devops: { anim: 'interact-left', face: spot('workshop', 'packFront') } } },
          { dur: 0.8, acts: { devops: { anim: 'emote-yes', face: spot('workshop', 'packFront') } } },
          { acts: { devops: { walk: home } } },
        ])
      }
      case 'mobile':
        return one(spot('balcony', 'home'), [
          {
            caption: { en: `${r.tech} takes the app out on a phone`, pt: `O ${r.tech} leva o app pro celular`, icon: '📱' },
            say: { mobile: { icon: '📱' } },
            dur: 2,
            acts: { mobile: { anim: 'interact-left', face: spot('balcony', 'sky') } },
          },
          { dur: 1, acts: { mobile: { anim: 'emote-yes', face: [spot('balcony', 'home')[0], 2] } } },
          { dur: 1.6, acts: { mobile: { anim: 'idle', face: [spot('balcony', 'home')[0], 2] } } },
        ])
      case 'coder':
        return codingRoutine('coder', r.tech)
      case 'tests':
        return one(spot('lab', 'home'), [
          {
            caption: { en: `${r.tech} runs the checks`, pt: `O ${r.tech} roda as verificações`, icon: '🔍' },
            say: { tests: { icon: '🔍', text: { en: 'checking…', pt: 'conferindo…' } } },
            dur: 2.4,
            acts: { tests: { anim: 'interact-right', face: [spot('lab', 'home')[0], BACK] } },
          },
          { dur: 0.8, say: { tests: { icon: '✅' } }, acts: { tests: { anim: 'emote-yes' } } },
        ])
      case 'database':
        return one(spot('archive', 'home'), [
          {
            caption: { en: `${r.tech} tidies the shelves`, pt: `O ${r.tech} arruma as prateleiras`, icon: '💾' },
            say: { database: { icon: '💾' } },
            dur: 2.2,
            acts: { database: { anim: 'interact-right', face: spot('archive', 'shelf') } },
          },
          { dur: 1.6, acts: { database: { anim: 'idle' } } },
        ])
      default:
        return one(cast.length ? spot(ROOM_FOR[role], Object.keys(room(ROOM_FOR[role])!.template.spots)[0]) : [1, 0], [
          { dur: 2, acts: { [role]: { anim: 'idle' } } },
        ])
    }
  }

  /** A one-person flat: code, check the docs, coffee, back to work. */
  function codingRoutine(role: Role, name: string): Story {
    const desk = spot('studio', 'desk')
    const beats: Beat[] = [
      {
        caption: { en: `${name} writes the code`, pt: `O ${name} escreve o código`, icon: '⌨️' },
        say: { [role]: { icon: '⌨️', text: { en: 'coding', pt: 'codando' } } },
        dur: 3.2,
        acts: { [role]: { anim: 'interact-right', face: spot('studio', 'laptop') } },
      },
      {
        caption: { en: '…checks something in the docs', pt: '…confere algo na documentação', icon: '📚' },
        acts: { [role]: { walk: spot('studio', 'shelf') } },
      },
      { dur: 1.6, say: { [role]: { icon: '📚' } }, acts: { [role]: { anim: 'interact-left', face: spot('studio', 'shelfFace') } } },
    ]
    if (room('kitchen')) {
      const exit = spot('studio', 'exit')
      const entry = spot('kitchen', 'entry')
      beats.push(
        { caption: { en: 'Coffee break', pt: 'Pausa pro café', icon: '☕' }, acts: { [role]: { path: [exit, entry, spot('kitchen', 'coffee')] } } },
        { dur: 1.6, say: { [role]: { icon: '☕' } }, acts: { [role]: { anim: 'interact-right', face: spot('kitchen', 'coffeeFace') } } },
        { dur: 0.9, acts: { [role]: { anim: 'emote-yes', face: [spot('kitchen', 'coffee')[0], 1] } } },
        { caption: { en: 'Back to work', pt: 'De volta ao trabalho', icon: '💪' }, acts: { [role]: { path: [entry, exit, desk] } } },
      )
    } else {
      beats.push({ caption: { en: 'Back to work', pt: 'De volta ao trabalho', icon: '💪' }, acts: { [role]: { walk: desk } } })
    }
    return compile({ [role]: { at: desk, yaw: Math.PI / 2 } }, beats)
  }
}
