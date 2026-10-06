/**
 * Demo flat: a single-language project (a Python command-line tool). With nothing to talk to, the one
 * resident just lives there: codes, checks the docs, has a coffee.
 */
import { compile, type Beat, type Vec2 } from '../story'
import type { FlatData, FlatLayout } from '../types'

const D = 1.8
const BACK = -D / 2

const layout: FlatLayout = {
  width: 7.6,
  depth: D,
  height: 1.15,
  door: [-0.05, 0.62],
  rooms: [
    {
      id: 'studio',
      x0: 0,
      x1: 3.4,
      wall: '#d5ecd9',
      floor: '#e6cfa9',
      furniture: [
        { model: 'rugRound', at: [0.25, 0.004, 0.78] },
        { model: 'loungeChairRelax', at: [0.85, 0, 0.62], rotY: Math.PI / 2 },
        { model: 'lampSquareFloor', at: [0.15, 0, -0.66] },
        { model: 'desk', at: [1.6, 0, -0.7], rotY: -Math.PI / 2 },
        { model: 'laptop', at: [1.64, 0.38, -0.46], rotY: -Math.PI / 2 },
        { model: 'plantSmall1', at: [1.86, 0.38, -0.06] },
        { model: 'bookcaseOpen', at: [2.62, 0, BACK + 0.25] },
        { model: 'books', at: [2.72, 0.44, BACK + 0.17] },
        { model: 'pottedPlant', at: [3.18, 0, -0.74] },
      ],
    },
    {
      id: 'kitchen',
      x0: 3.4,
      x1: 5.4,
      wall: '#fbe0cf',
      floor: '#e9dccb',
      furniture: [
        { model: 'kitchenBar', at: [3.95, 0, BACK + 0.21] },
        { model: 'kitchenCoffeeMachine', at: [4.06, 0.42, BACK + 0.24] },
        { model: 'kitchenFridgeSmall', at: [4.55, 0, BACK + 0.29] },
        { model: 'tableRound', at: [4.0, 0.27, 0.75], scale: 0.8 },
        { model: 'plantSmall2', at: [5.1, 0, -0.78] },
      ],
    },
    {
      id: 'bedroom',
      x0: 5.4,
      x1: 7.6,
      wall: '#f6d6e2',
      floor: '#e3cdb2',
      furniture: [
        { model: 'bedSingle', at: [6.65, 0, 0.42], scale: 0.75 },
        { model: 'sideTable', at: [5.9, 0, BACK + 0.22] },
        { model: 'lampSquareTable', at: [6.0, 0.38, BACK + 0.15] },
        { model: 'rugRectangle', at: [5.55, 0.004, 0.78], scale: 0.62 },
      ],
    },
  ],
}

const P = {
  desk: [1.35, -0.33] as Vec2,
  laptop: [1.75, -0.33] as Vec2,
  shelf: [2.82, -0.36] as Vec2,
  shelfFace: [2.82, -0.9] as Vec2,
  door1: [3.2, 0.3] as Vec2,
  door2: [3.7, 0.3] as Vec2,
  coffee: [4.15, -0.36] as Vec2,
  coffeeFace: [4.15, -0.9] as Vec2,
}

const beats: Beat[] = [
  {
    caption: { en: 'Python writes the code', pt: 'O Python escreve o código' },
    dur: 3.2,
    acts: { python: { anim: 'interact-right', face: P.laptop } },
  },
  {
    caption: { en: '…checks something in the docs', pt: '…confere algo na documentação' },
    acts: { python: { walk: P.shelf } },
  },
  { dur: 1.6, acts: { python: { anim: 'interact-left', face: P.shelfFace } } },
  {
    caption: { en: 'Coffee break', pt: 'Pausa pro café' },
    acts: { python: { path: [P.door1, P.door2, P.coffee] } },
  },
  { dur: 1.6, acts: { python: { anim: 'interact-right', face: P.coffeeFace } } },
  { dur: 0.9, acts: { python: { anim: 'emote-yes', face: [4.15, 0.6] } } },
  {
    caption: { en: 'Back to work', pt: 'De volta ao trabalho' },
    acts: { python: { path: [P.door2, P.door1, P.desk] } },
  },
]

export const studio: FlatData = {
  id: 'transit-router',
  repo: 'transit-router',
  language: { name: 'Python', color: '#3572A5' },
  docker: false,
  layout,
  narrator: 'main',
  intro: {
    en: 'A command-line tool in plain Python. One resident, no visitors.',
    pt: 'Uma ferramenta de linha de comando em Python puro. Um morador, sem visitas.',
  },
  cast: [{ id: 'python', tech: 'Python', role: 'coder', model: 'character-male-f', color: '#3572a5', story: 'main' }],
  stories: { main: compile({ python: { at: P.desk, yaw: Math.PI / 2 } }, beats) },
}
