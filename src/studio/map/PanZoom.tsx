import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { Lang } from '../../ui/roles'
import { fitView, panBy, zoomAt, type View } from './view'

const TEXT = {
  zoomIn: { en: 'Zoom in', pt: 'Aproximar' },
  zoomOut: { en: 'Zoom out', pt: 'Afastar' },
  fit: { en: 'Fit', pt: 'Ajustar' },
  hint: { en: 'Drag to move, scroll to zoom, arrow keys to move', pt: 'Arraste para mover, use a roda do mouse para aproximar e as setas do teclado' },
}

/**
 * A window onto SVG content of a fixed size: drag or arrow keys to pan, wheel, pinch or + and −
 * to zoom, Ajustar to fit again. It starts fitted and keeps fitting on resize until the person
 * moves the map themselves. Clicks that end a drag are swallowed, so panning never selects a card.
 */
export function PanZoom({
  width,
  height,
  label,
  lang,
  className = '',
  children,
}: {
  /** The size of the content in SVG units. */
  width: number
  height: number
  label: string
  lang: Lang
  className?: string
  children: ReactNode
}) {
  const t = (k: keyof typeof TEXT) => TEXT[k][lang]
  const hintId = useId()
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })
  const touched = useRef(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; x: number; y: number } | null>(null)
  const travel = useRef(0)
  const dragged = useRef(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // A new map starts fitted again.
  useEffect(() => {
    touched.current = false
  }, [width, height])

  useEffect(() => {
    if (!touched.current && size.w > 0 && size.h > 0) setView(fitView(size.w, size.h, width, height))
  }, [size, width, height])

  // Wheel needs a non-passive listener, or the page scrolls while the map zooms.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      touched.current = true
      const f = Math.exp(-dy * 0.0015)
      setView((v) => zoomAt(v, f, e.clientX - r.left, e.clientY - r.top))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = (f: number) => {
    const el = box.current
    if (!el) return
    touched.current = true
    setView((v) => zoomAt(v, f, el.clientWidth / 2, el.clientHeight / 2))
  }

  const fit = () => {
    const el = box.current
    if (!el) return
    touched.current = false
    setView(fitView(el.clientWidth, el.clientHeight, width, height))
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      travel.current = 0
      dragged.current = false
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev || !box.current) return
    const next = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, next)
    if (pointers.current.size === 1) {
      const dx = next.x - prev.x
      const dy = next.y - prev.y
      travel.current += Math.abs(dx) + Math.abs(dy)
      if (travel.current > 6) dragged.current = true
      touched.current = true
      setView((v) => panBy(v, dx, dy))
    } else if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const r = box.current.getBoundingClientRect()
      const f = pinch.current.dist > 0 ? dist / pinch.current.dist : 1
      const anchor = pinch.current
      dragged.current = true
      touched.current = true
      setView((v) => panBy(zoomAt(v, f, anchor.x - r.left, anchor.y - r.top), mid.x - anchor.x, mid.y - anchor.y))
      pinch.current = { dist, x: mid.x, y: mid.y }
    }
  }

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    pinch.current = null
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 120 : 40
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    const move = moves[e.key]
    if (move) {
      e.preventDefault()
      touched.current = true
      setView((v) => panBy(v, move[0], move[1]))
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      zoomBy(1.25)
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      zoomBy(1 / 1.25)
    } else if (e.key === '0') {
      e.preventDefault()
      fit()
    }
  }

  const button = 'grid h-9 min-w-9 place-items-center rounded-full bg-white px-3 text-sm font-extrabold text-ink shadow-[0_6px_16px_-8px_rgba(40,52,110,0.5)] transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent'

  return (
    <div className={`relative ${className}`}>
      <div
        ref={box}
        role="group"
        aria-label={label}
        aria-describedby={hintId}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerEnd}
        onKeyDown={onKeyDown}
        onClickCapture={(e) => {
          if (dragged.current) {
            e.stopPropagation()
            e.preventDefault()
          }
        }}
        className="absolute inset-0 touch-none overflow-hidden rounded-[22px] outline-none select-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
      >
        <svg className="absolute inset-0 h-full w-full" role="presentation" focusable="false">
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>{children}</g>
        </svg>
      </div>
      <span id={hintId} className="sr-only">
        {t('hint')}
      </span>
      <div className="absolute right-3 bottom-3 flex items-center gap-1.5">
        <button type="button" className={button} aria-label={t('zoomOut')} onClick={() => zoomBy(1 / 1.25)}>
          −
        </button>
        <button type="button" className={button} aria-label={t('zoomIn')} onClick={() => zoomBy(1.25)}>
          +
        </button>
        <button type="button" className={button} onClick={fit}>
          {t('fit')}
        </button>
      </div>
    </div>
  )
}
