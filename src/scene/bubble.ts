import { CanvasTexture, SRGBColorSpace } from 'three'

const cache = new Map<string, { texture: CanvasTexture; aspect: number }>()
const FONT = 'ui-rounded, "Nunito Variable", "Nunito", "Segoe UI", system-ui, sans-serif'
const EMOJI = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'

/** A comic speech bubble with an emoji and an optional word or two, drawn once and reused. */
export function bubbleTexture(icon: string, text?: string) {
  const key = `${icon}|${text ?? ''}`
  const hit = cache.get(key)
  if (hit) return hit

  const s = 4
  const h = 46 * s
  const tail = 10 * s
  const pad = 13 * s
  const iconW = 30 * s
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = `800 ${19 * s}px ${FONT}`
  const textW = text ? probe.measureText(text).width + 8 * s : 0
  const w = Math.ceil(pad + iconW + textW + pad)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h + tail + 4 * s
  const g = canvas.getContext('2d')!

  const shape = (dy: number) => {
    g.beginPath()
    g.roundRect(0, dy, w, h, h / 2)
    g.moveTo(w / 2 - 9 * s, dy + h - 1)
    g.lineTo(w / 2, dy + h + tail)
    g.lineTo(w / 2 + 9 * s, dy + h - 1)
    g.closePath()
  }
  g.fillStyle = 'rgba(30, 34, 60, 0.16)'
  shape(4 * s)
  g.fill()
  g.fillStyle = '#ffffff'
  shape(0)
  g.fill()

  g.textBaseline = 'middle'
  g.font = `${22 * s}px ${EMOJI}`
  g.fillText(icon, pad, h / 2 + 2 * s)
  if (text) {
    g.fillStyle = '#23263a'
    g.font = `800 ${19 * s}px ${FONT}`
    g.fillText(text, pad + iconW + 2 * s, h / 2 + 2 * s)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  const entry = { texture, aspect: canvas.width / canvas.height }
  cache.set(key, entry)
  return entry
}
