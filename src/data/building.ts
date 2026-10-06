import { useCallback, useEffect, useRef, useState } from 'react'
import { buildFlat } from '../scene/rooms'
import type { FlatData } from '../scene/types'
import type { Apartment, Building, BuildingError } from '../shared/types'
import { copy } from '../ui/roles'

/** One building on the owner's street: its flats, and where the next one's repos start. */
export type Lot = { flats: FlatData[]; next: string | null; fetched: number }

export type BuildingState =
  | { kind: 'loading' }
  | { kind: 'error'; error: BuildingError['error'] }
  | {
      kind: 'ready'
      owner: Building['owner']
      /** Public repos the owner has, forks aside. */
      total: number
      /** The buildings visited so far, in street order. */
      lots: Lot[]
      /** The one on screen. */
      at: number
      /** Walking to a building not loaded yet: on the way, or it couldn't be reached. */
      trip: 'idle' | 'moving' | 'failed'
    }

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
      // No language GitHub can name (a Godot scene, say) but someone lives there: show who.
      language: a.language.name === '—' && a.residents[0] ? { name: a.residents[0].tech, color: a.residents[0].color } : a.language,
      intro: intro(a),
      residents: a.residents,
      status: a.status,
      url: a.url,
      stars: a.stars,
      owner: building.owner.login,
    }),
  )
}

export async function fetchBuilding(login: string, signal?: AbortSignal, after?: string): Promise<Building | BuildingError> {
  const page = after ? `&after=${encodeURIComponent(after)}` : ''
  try {
    const res = await fetch(`/api/building?user=${encodeURIComponent(login.toLowerCase())}${page}`, { signal })
    return (await res.json()) as Building | BuildingError
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    return { error: 'unavailable' }
  }
}

const lotFrom = (answer: Building): Lot => ({ flats: toFlats(answer), next: answer.next, fetched: answer.fetched })

/**
 * Loads one owner's street: the first building right away, the next ones when the visitor walks over.
 * `prepare` fetches the building one step away (if it isn't loaded yet) and says whether it's there;
 * `go` then switches to it, so the page can hide the swap behind a transition.
 */
export function useBuilding(login: string | null) {
  const [state, setState] = useState<BuildingState | null>(null)
  const latest = useRef(state)
  latest.current = state

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
        else setState({ kind: 'ready', owner: answer.owner, total: answer.total, lots: [lotFrom(answer)], at: 0, trip: 'idle' })
      })
      .catch(() => {
        // Aborted because the visitor asked for someone else.
      })
    return () => abort.abort()
  }, [login])

  const prepare = useCallback(
    async (step: 1 | -1): Promise<boolean> => {
      const s = latest.current
      if (!login || s?.kind !== 'ready' || s.trip === 'moving') return false
      const to = s.at + step
      if (to < 0) return false
      if (to < s.lots.length) return true
      const after = s.lots[s.at].next
      if (!after) return false
      setState({ ...s, trip: 'moving' })
      const answer = await fetchBuilding(login, undefined, after)
      const cur = latest.current
      // The visitor may have gone to someone else's street meanwhile.
      if (cur?.kind !== 'ready' || cur.owner.login !== s.owner.login) return false
      if ('error' in answer) {
        setState({ ...cur, trip: 'failed' })
        return false
      }
      setState({ ...cur, lots: [...cur.lots, lotFrom(answer)], trip: 'idle' })
      return true
    },
    [login],
  )

  const go = useCallback((step: 1 | -1) => {
    setState((cur) => {
      if (cur?.kind !== 'ready') return cur
      const to = cur.at + step
      return to >= 0 && to < cur.lots.length ? { ...cur, at: to, trip: 'idle' } : cur
    })
  }, [])

  return { state, prepare, go }
}
