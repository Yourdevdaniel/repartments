import { componentOf } from '../../shared/components'
import type { ChurnFile, CommitFile, Component } from '../../shared/studio'

/** Lines a component had changed across the commits looked at. */
export type ChurnTotals = { additions: number; deletions: number; total: number }

/**
 * Adds up the churn of every file to the component that owns it. Files outside every component
 * (the repo was only partly read) are left out. The busiest files come from `Churn`, so these
 * totals are a lower bound, which is fine for showing where the work concentrates.
 */
export function componentChurn(
  components: Pick<Component, 'id' | 'path' | 'direct'>[],
  files: Pick<ChurnFile, 'path' | 'additions' | 'deletions'>[],
): Map<string, ChurnTotals> {
  const out = new Map<string, ChurnTotals>()
  for (const f of files) {
    const owner = componentOf(f.path, components)
    if (!owner) continue
    const t = out.get(owner.id) ?? { additions: 0, deletions: 0, total: 0 }
    t.additions += f.additions
    t.deletions += f.deletions
    t.total = t.additions + t.deletions
    out.set(owner.id, t)
  }
  return out
}

/**
 * Which components a commit touched, with how many of its files each one holds. A file counts once
 * per component even when the component is found under two paths (renames).
 */
export function touchedComponents(
  components: Pick<Component, 'id' | 'path' | 'direct'>[],
  files: Pick<CommitFile, 'path' | 'previousPath'>[],
): Map<string, number> {
  const out = new Map<string, number>()
  for (const f of files) {
    const seen = new Set<string>()
    for (const p of [f.path, f.previousPath]) {
      if (p === null) continue
      const owner = componentOf(p, components)
      if (owner) seen.add(owner.id)
    }
    for (const id of seen) out.set(id, (out.get(id) ?? 0) + 1)
  }
  return out
}

/**
 * How hot something is on a 0 to 1 scale, relative to the hottest one. A square root keeps the
 * quieter parts visible next to a single very busy one.
 */
export function heatRatio(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0
  return Math.min(1, Math.sqrt(value / max))
}

const HEAT_STOPS = ['#fff7ec', '#f28c28', '#c2410c']

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** One colour of the single-hue scale used for commit heat: pale cream at 0, deep rust at 1. */
export function heatColor(t: number): string {
  const k = Math.max(0, Math.min(1, t))
  const [a, b, u] = k < 0.5 ? [HEAT_STOPS[0], HEAT_STOPS[1], k * 2] : [HEAT_STOPS[1], HEAT_STOPS[2], (k - 0.5) * 2]
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const mix = ca.map((v, i) => Math.round(v + (cb[i] - v) * u))
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
