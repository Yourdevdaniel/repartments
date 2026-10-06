/**
 * Milestone 1, the look probe: one hand-placed flat for a Django + React + PostgreSQL project with a
 * JWT guard, pytest and Docker. Everything here is data, in the same shape the generator will later
 * produce from a real repository, so the components don't know it's hand-made.
 */
import type { Role } from '../shared/types'
import { compile, type Beat, type Story, type Vec2, type Vec3 } from './story'

export type Placement = { model: string; at: Vec3; rotY?: number; scale?: number }

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
  /** Which story drives this resident. */
  story: 'main' | 'roof'
}

export type FlatLayout = {
  width: number
  depth: number
  height: number
  rooms: Room[]
  /** z range of the door gap in every inner wall. */
  door: [number, number]
  docker: boolean
  tv: { at: Vec3; size: [number, number] }
}

const D = 1.8
const BACK = -D / 2

export const layout: FlatLayout = {
  width: 6.6,
  depth: D,
  height: 1.15,
  door: [-0.05, 0.62],
  docker: true,
  tv: { at: [1.0, 0.56, -0.67], size: [0.58, 0.33] },
  rooms: [
    {
      id: 'living',
      x0: 0,
      x1: 2.0,
      wall: '#f7d9c9',
      floor: '#ecd2b0',
      furniture: [
        { model: 'rugRounded', at: [0.2, 0.004, 0.62] },
        { model: 'cabinetTelevision', at: [0.6, 0, BACK + 0.25] },
        { model: 'televisionModern', at: [1.0, 0.31, -0.75] },
        { model: 'loungeSofa', at: [0.43, 0, 0.62], rotY: Math.PI / 2 },
        { model: 'tableCoffee', at: [1.3, 0, 0.25] },
        { model: 'pottedPlant', at: [1.82, 0, -0.74] },
        { model: 'lampRoundFloor', at: [0.1, 0, -0.72] },
      ],
    },
    {
      id: 'hall',
      x0: 2.0,
      x1: 3.1,
      wall: '#cfe9dc',
      floor: '#dcd5c8',
      furniture: [
        { model: 'sideTable', at: [2.29, 0, BACK + 0.22] },
        { model: 'radio', at: [2.36, 0.38, BACK + 0.14] },
        { model: 'plantSmall1', at: [2.75, 0.38, BACK + 0.12] },
      ],
    },
    {
      id: 'office',
      x0: 3.1,
      x1: 5.2,
      wall: '#ddd6f3',
      floor: '#e3cfae',
      furniture: [
        // Desk turned sideways so whoever works at it is seen in profile, not hidden behind the screen.
        { model: 'desk', at: [4.1, 0, -0.7], rotY: -Math.PI / 2 },
        { model: 'computerScreen', at: [4.32, 0.38, -0.56], rotY: -Math.PI / 2 },
        { model: 'computerKeyboard', at: [4.13, 0.38, -0.5], rotY: -Math.PI / 2 },
        { model: 'plantSmall2', at: [4.36, 0.38, -0.06] },
        { model: 'bookcaseOpen', at: [4.72, 0, BACK + 0.25] },
        { model: 'books', at: [4.84, 0.44, BACK + 0.17] },
        { model: 'trashcan', at: [3.4, 0, BACK + 0.2] },
      ],
    },
    {
      id: 'storage',
      x0: 5.2,
      x1: 6.6,
      wall: '#f4e6b8',
      floor: '#d9cdb5',
      furniture: [
        { model: 'bookcaseClosedWide', at: [5.33, 0, BACK + 0.25] },
        { model: 'bookcaseOpen', at: [6.14, 0, BACK + 0.25] },
        { model: 'cardboardBoxClosed', at: [6.12, 0, 0.36] },
        { model: 'cardboardBoxClosed', at: [6.35, 0, 0.36] },
        { model: 'cardboardBoxClosed', at: [6.23, 0.28, 0.32] },
        { model: 'cardboardBoxOpen', at: [6.1, 0, 0.8] },
      ],
    },
  ],
}

export const cast: CastMember[] = [
  { id: 'react', tech: 'React', role: 'frontend', model: 'character-female-b', color: '#61dafb', story: 'main' },
  { id: 'guard', tech: 'SimpleJWT', role: 'security', model: 'character-male-c', color: '#7c5cff', story: 'main' },
  { id: 'django', tech: 'Django', role: 'backend', model: 'character-male-d', color: '#0c4b33', story: 'main' },
  { id: 'tester', tech: 'pytest', role: 'tests', model: 'character-female-e', color: '#0a9edc', story: 'main' },
  { id: 'postgres', tech: 'PostgreSQL', role: 'database', model: 'character-male-b', color: '#4169e1', story: 'main' },
  { id: 'docker', tech: 'Docker', role: 'devops', model: 'character-male-e', color: '#2496ed', story: 'roof' },
]

// Spots on the floor, [x, z].
const P = {
  reactHome: [0.95, 0.68] as Vec2,
  reactTable: [1.4, 0.62] as Vec2,
  hallStop: [2.3, 0.3] as Vec2,
  guard: [2.6, -0.42] as Vec2,
  deskFront: [3.82, 0.26] as Vec2,
  djangoDesk: [3.84, -0.36] as Vec2,
  deskAisle: [3.82, 0.3] as Vec2,
  tray: [4.18, -0.08] as Vec2,
  storageDoor: [5.0, 0.25] as Vec2,
  pgHome: [5.78, -0.32] as Vec2,
  pgHandoff: [5.4, 0.22] as Vec2,
  shelf: [5.78, -0.9] as Vec2,
  testerHome: [4.95, -0.28] as Vec2,
  testerCheck: [4.66, 0.08] as Vec2,
  djangoCheck: [4.12, 0.3] as Vec2,
  dropSpot: [1.62, 0.36] as Vec2,
  table: [1.05, 0.12] as Vec2,
  tv: [1.0, -0.75] as Vec2,
  hallOut: [2.6, 0.3] as Vec2,
  officeIn: [3.4, 0.3] as Vec2,
}

const deskTray: Vec3 = [4.2, 0.39, -0.1]
const onShelf: Vec3 = [5.7, 0.42, -0.74]
const onTable: Vec3 = [1.08, 0.235, 0.1]

const mainBeats: Beat[] = [
  {
    caption: { en: 'React asks the API for some data', pt: 'O React pede dados para a API' },
    props: { letter: 'react', box: null },
    flags: { tv: false },
    acts: { react: { walk: P.hallStop } },
  },
  {
    caption: { en: 'The guard checks the login token', pt: 'O segurança confere o token de login' },
    dur: 1.3,
    acts: { guard: { anim: 'interact-right', face: P.hallStop }, react: { anim: 'idle', face: P.guard } },
  },
  { dur: 0.9, acts: { guard: { anim: 'emote-yes', face: P.hallStop } } },
  {
    caption: { en: 'The request reaches Django', pt: 'O pedido chega no Django' },
    acts: { react: { walk: P.deskFront }, guard: { anim: 'idle', face: [2.6, 0.6] } },
  },
  {
    caption: { en: 'Django reads the request', pt: 'O Django lê o pedido' },
    dur: 1.4,
    props: { letter: deskTray },
    acts: { react: { walk: P.reactHome }, django: { anim: 'interact-right', face: P.tray } },
  },
  {
    caption: { en: 'Django asks PostgreSQL for the rows', pt: 'O Django pede os dados ao PostgreSQL' },
    props: { letter: null },
    acts: { django: { path: [P.deskAisle, P.storageDoor] }, react: { anim: 'idle', face: P.tv } },
  },
  {
    dur: 1.0,
    props: { box: onShelf },
    acts: { postgres: { anim: 'pick-up', face: P.shelf }, django: { anim: 'idle', face: P.pgHandoff } },
  },
  { props: { box: 'postgres' }, acts: { postgres: { walk: P.pgHandoff } } },
  {
    caption: { en: 'pytest checks the answer before it leaves', pt: 'O pytest confere a resposta antes de sair' },
    props: { box: 'django' },
    acts: { django: { walk: P.djangoCheck }, postgres: { walk: P.pgHome }, tester: { walk: P.testerCheck } },
  },
  { dur: 1.2, acts: { tester: { anim: 'interact-right', face: P.djangoCheck }, django: { anim: 'idle', face: P.testerCheck } } },
  { dur: 0.8, acts: { tester: { anim: 'emote-yes', face: P.djangoCheck } } },
  {
    caption: { en: 'Django sends the response back', pt: 'O Django manda a resposta de volta' },
    acts: { django: { walk: P.dropSpot }, tester: { walk: P.testerHome }, guard: { anim: 'emote-yes', face: P.hallStop } },
  },
  {
    caption: { en: 'React opens the parcel…', pt: 'O React abre o pacote…' },
    props: { box: onTable },
    acts: { react: { walk: P.reactTable }, django: { walk: P.hallOut }, guard: { anim: 'idle', face: [2.6, 0.6] } },
  },
  { dur: 1.2, acts: { react: { anim: 'interact-right', face: P.table }, django: { walk: P.officeIn } } },
  {
    caption: { en: '…and the page shows up on screen', pt: '…e a página aparece na tela' },
    props: { box: null },
    flags: { tv: true },
    acts: { react: { anim: 'emote-yes', face: P.tv }, django: { walk: P.deskAisle } },
  },
  { acts: { django: { walk: P.djangoDesk }, react: { walk: P.reactHome } } },
  { dur: 1.6, acts: { django: { anim: 'idle', face: P.tray }, react: { anim: 'idle', face: P.tv } } },
]

const roofBeats: Beat[] = [
  { dur: 2.4, acts: { docker: { anim: 'interact-right', face: [5.6, 0.4] } } },
  { acts: { docker: { walk: [4.3, -0.55] } } },
  { dur: 1.8, acts: { docker: { anim: 'interact-left', face: [4.3, 0.4] } } },
  { dur: 0.8, acts: { docker: { anim: 'emote-yes', face: [4.3, 0.4] } } },
  { acts: { docker: { walk: [5.6, -0.55] } } },
]

export const stories: Record<CastMember['story'], Story> = {
  main: compile(
    {
      react: { at: P.reactHome, yaw: Math.PI },
      guard: { at: P.guard, yaw: 0 },
      django: { at: P.djangoDesk, yaw: Math.PI / 2 },
      tester: { at: P.testerHome, yaw: 0 },
      postgres: { at: P.pgHome, yaw: 0 },
    },
    mainBeats,
  ),
  roof: compile({ docker: { at: [5.6, -0.55], yaw: 0 } }, roofBeats),
}

/** Residents on the roof stand on the container. */
export const ROOF_Y = 1.305
