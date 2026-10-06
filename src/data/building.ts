import { useEffect, useState } from 'react'
import { buildFlat } from '../scene/rooms'
import type { FlatData } from '../scene/types'
import type { Apartment, Building, BuildingError } from '../shared/types'
import { copy } from '../ui/roles'

export type BuildingState =
  | { kind: 'loading' }
  | { kind: 'error'; error: BuildingError['error'] }
  | { kind: 'ready'; owner: Building['owner']; flats: FlatData[] }

/** `/` is the landing page, `/demo` the hand-made demo building, `/<login>` someone's building. */
export type Route = { login: string | null; demo: boolean }

export function parseRoute(path: string): Route {
  let seg = path.replace(/^\/+|\/+$/g, '').split('/')[0]
  try {
    seg = decodeURIComponent(seg)
  } catch {
    // A broken %-escape in a hand-typed URL: use it as it is, the API will call it an invalid name.
  }
  if (!seg) return { login: null, demo: false }
  if (seg === 'demo') return { login: null, demo: true }
  return { login: seg, demo: false }
}

/** The username out of whatever was typed or pasted: `@name`, `github.com/name`, a repo or profile URL. */
export function loginFrom(input: string): string {
  return input
    .trim()
    .replace(/^@/, '')
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '')
    .split(/[/?#]/)[0]
}

const list = (items: string[], and: string) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`

/** When a repo has no description, say what it's made of. */
function intro(a: Apartment) {
  if (a.description) return { en: a.description, pt: a.description }
  if (!a.residents.length) return copy.vacant
  const techs = a.residents.map((r) => r.tech)
  if (techs.length === 1) return { en: `A ${techs[0]} project.`, pt: `Um projeto em ${techs[0]}.` }
  return { en: `A project with ${list(techs, 'and')}.`, pt: `Um projeto com ${list(techs, 'e')}.` }
}

export function toFlats(building: Building): FlatData[] {
  return building.apartments.map((a) =>
    buildFlat({
      id: a.name,
      repo: a.name,
      language: a.language,
      intro: intro(a),
      residents: a.residents,
      status: a.status,
      url: a.url,
      stars: a.stars,
    }),
  )
}

export async function fetchBuilding(login: string, signal?: AbortSignal): Promise<Building | BuildingError> {
  try {
    const res = await fetch(`/api/building?user=${encodeURIComponent(login.toLowerCase())}`, { signal })
    return (await res.json()) as Building | BuildingError
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    return { error: 'unavailable' }
  }
}

/** Loads one owner's building, keeping the last answer while the next one loads. */
export function useBuilding(login: string | null): BuildingState | null {
  const [state, setState] = useState<BuildingState | null>(null)
  useEffect(() => {
    if (!login) {
      setState(null)
      return
    }
    const abort = new AbortController()
    setState({ kind: 'loading' })
    fetchBuilding(login, abort.signal)
      .then((answer) => {
        if ('error' in answer) setState({ kind: 'error', error: answer.error })
        else setState({ kind: 'ready', owner: answer.owner, flats: toFlats(answer) })
      })
      .catch(() => {
        // Aborted because the visitor asked for someone else.
      })
    return () => abort.abort()
  }, [login])
  return state
}
