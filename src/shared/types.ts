/**
 * The only shape that crosses from the server to the browser. It carries derived tags, never file
 * contents, routes, payloads or secrets: what a repo is made of, not what it does.
 */

export type Role =
  | 'frontend'
  | 'backend'
  | 'database'
  | 'cache'
  | 'worker'
  | 'security'
  | 'tests'
  | 'devops'
  | 'mobile'
  | 'coder'

/** One technology living in the flat. `tech` is a display name such as "Django". */
export type Resident = { tech: string; role: Role }

export type FlowKind = 'parcel' | 'letter' | 'badge' | 'inspect' | 'build'
export type Flow = { from: Role; to: Role; kind: FlowKind }

export type Apartment = {
  name: string
  description: string | null
  url: string
  stars: number
  pushedAt: string
  languages: { name: string; color: string; share: number }[]
  residents: Resident[]
  flows: Flow[]
  docker: boolean
}

export type Building = {
  user: { login: string; name: string | null; avatarUrl: string }
  apartments: Apartment[]
}
