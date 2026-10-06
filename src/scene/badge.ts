import { CanvasTexture, SRGBColorSpace } from 'three'

const cache = new Map<string, { texture: CanvasTexture; aspect: number }>()

/** A name tag pill (coloured dot + technology name), drawn once per tech and reused. */
export function badgeTexture(text: string, color: string) {
  const key = `${text}|${color}`
  const hit = cache.get(key)
  if (hit) return hit

  const scale = 4
  const font = `700 ${22 * scale}px ui-rounded, "Nunito", "Segoe UI", system-ui, sans-serif`
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = font
  const textWidth = probe.measureText(text).width
  const h = 40 * scale
  const pad = 14 * scale
  const dot = 14 * scale
  const w = Math.ceil(pad + dot + 9 * scale + textWidth + pad)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h + 6 * scale
  const ctx = canvas.getContext('2d')!

  // Soft shadow under the pill so it reads on any wall colour.
  ctx.fillStyle = 'rgba(30, 34, 60, 0.18)'
  roundRect(ctx, 0, 5 * scale, w, h, h / 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, 0, 0, w, h, h / 2)
  ctx.fill()

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(pad + dot / 2, h / 2, dot / 2, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#23263a'
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.fillText(text, pad + dot + 9 * scale, h / 2 + scale)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  const entry = { texture, aspect: canvas.width / canvas.height }
  cache.set(key, entry)
  return entry
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
