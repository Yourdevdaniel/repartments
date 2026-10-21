/**
 * The studio's <details>/<summary> menus: one open at a time, closed by a click outside or by Esc
 * (which gives the focus back to the summary), and the summary says whether the menu is open.
 */
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'

/** The window event that asks the Theater to export: `detail.kind` is 'deck' (PowerPoint) or 'video'. */
export const EXPORT_EVENT = 'repartments:export'
export type ExportKind = 'deck' | 'video'

/** Every menu mounted now, so that opening one closes the others. */
const menus = new Set<HTMLDetailsElement>()

export function useDetailsMenu() {
  const details = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)

  const close = useCallback(() => {
    if (details.current?.open) details.current.open = false
  }, [])

  useEffect(() => {
    const el = details.current
    if (!el) return
    menus.add(el)
    return () => {
      menus.delete(el)
    }
  }, [])

  // A click or touch outside the menu closes it.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = details.current
      if (el?.open && !el.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [close])

  // Esc closes the open menu and puts the focus back on its summary.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !details.current?.open) return
      close()
      summary.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [close])

  // Wired to the <details> onToggle: keeps `open` in step with the DOM and closes the other menus.
  const onToggle = (e: SyntheticEvent<HTMLDetailsElement>) => {
    const el = e.currentTarget
    setOpen(el.open)
    if (!el.open) return
    for (const other of menus) if (other !== el && other.open) other.open = false
  }

  return { details, summary, open, close, onToggle }
}
