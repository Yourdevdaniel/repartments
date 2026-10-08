import type { Component } from './studio'

/** The folder a repo path lives in ("" for files at the root). */
export function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

/**
 * Which component a file belongs to: the one covering the deepest folder that contains it. A
 * `direct` component only takes the files sitting right in its folder, not those in subfolders.
 * Used on the server to file every source file, and in the browser to tell which parts of the
 * system a commit touched. Null when no component covers the path (a file outside what was read).
 */
export function componentOf<C extends Pick<Component, 'id' | 'path' | 'direct'>>(path: string, components: C[]): C | null {
  const dir = dirOf(path)
  let best: C | null = null
  for (const c of components) {
    const covers = c.direct ? dir === c.path : c.path === '' || dir === c.path || dir.startsWith(c.path + '/')
    if (!covers) continue
    // Deeper folders win; at the same depth, a direct component is the more specific one.
    if (!best || c.path.length > best.path.length || (c.path.length === best.path.length && c.direct && !best.direct)) best = c
  }
  return best
}
