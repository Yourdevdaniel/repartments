/**
 * The presentation as a video file, made in the browser, frame by frame: the stage moves on 1/30 s
 * and draws, that frame of the 3D scene goes onto a 1920×1080 canvas with the sky behind it and the
 * scene's title and caption on top (the page's own captions are HTML, so the 3D canvas alone would
 * have no words), and the canvas is encoded (`encodeCanvas`). Nothing waits for the screen, so the
 * tab can be hidden meanwhile, and the video comes out at exactly 30 frames a second on any machine.
 * Nothing leaves the browser. The same canvas gives the still pictures for the slides (`still`).
 */

/** What is written on a frame: the scene's kicker and title, and the step's caption with its icon. */
export type Overlay = { kicker: string; title: string; caption: string; icon: string }

/** 3 Mbit/s: sharp for flat colours and big captions, and about 22 MB a minute, small enough to send. */
export const VIDEO = { width: 1920, height: 1080, fps: 30, bitrate: 3_000_000 }

/** How many frames a scene whose story lasts `seconds` takes at `rate` (1 = as written). */
export function sceneFrames(seconds: number, rate: number, fps = VIDEO.fps): number {
  return Math.max(1, Math.round((seconds / (rate > 0 ? rate : 1)) * fps))
}

/**
 * Lets the browser breathe (paint, run React) and comes straight back. A message, not a timer: a
 * hidden tab holds timers back to once a second, and after a few minutes to once a minute.
 */
export function breathe(): Promise<void> {
  return new Promise((done) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      done()
    }
    channel.port2.postMessage(null)
  })
}

const FONT = '"Nunito Variable", Nunito, ui-rounded, system-ui, sans-serif'
const INK = '#23263a'
const INK_SOFT = '#5b6078'
/** A scene change fades from white, like the page's veil. */
const FADE_MS = 420

/** "exemplo/crm" → "exemplo-crm-apresentacao.mp4". */
export function videoFileName(title: string, lang: 'en' | 'pt', ext: 'mp4' | 'webm'): string {
  const base = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'repartments'
  return `${base}-${lang === 'pt' ? 'apresentacao' : 'presentation'}.${ext}`
}

/** Where a picture goes to fit whole inside a frame, centred. */
export function fitContain(sw: number, sh: number, dw: number, dh: number): { x: number; y: number; w: number; h: number } {
  if (sw <= 0 || sh <= 0) return { x: 0, y: 0, w: dw, h: dh }
  const k = Math.min(dw / sw, dh / sh)
  const w = sw * k
  const h = sh * k
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h }
}

/**
 * Breaks a sentence into lines no wider than `max`, at spaces; past `maxLines`, the last line ends
 * with "…". `measure` gives a string's width in the font being used.
 */
export function wrapText(measure: (s: string) => number, text: string, max: number, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (!line || measure(next) <= max) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last.length > 1 && measure(`${last}…`) > max) last = last.slice(0, -1).trimEnd()
  kept[maxLines - 1] = `${last}…`
  return kept
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

/** A white card like the page's `glass`: soft shadow, nearly opaque. */
function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.save()
  ctx.shadowColor = 'rgba(40, 52, 110, 0.28)'
  ctx.shadowBlur = 48
  ctx.shadowOffsetY = 18
  ctx.fillStyle = 'rgba(255, 255, 255, 0.93)'
  roundRect(ctx, x, y, w, h, r)
  ctx.fill()
  ctx.restore()
}

/** Makes sure the product's font is ready before the first frame is drawn with it. */
export async function fontsReady() {
  try {
    await Promise.all([document.fonts.load(`800 46px ${FONT}`), document.fonts.load(`700 22px ${FONT}`)])
  } catch {
    // The fallback face reads fine.
  }
}

/** The canvas frames are drawn on, at a fixed size whatever the window's. */
export function compositor(width = VIDEO.width, height = VIDEO.height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const sky = ctx.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, '#cfe0ff')
  sky.addColorStop(0.45, '#e6ecff')
  sky.addColorStop(1, '#f1f0ff')
  let scene = ''
  let changed = -Infinity

  const background = (source: HTMLCanvasElement) => {
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, width, height)
    const box = fitContain(source.width, source.height, width, height)
    ctx.drawImage(source, box.x, box.y, box.w, box.h)
  }

  const words = (o: Overlay) => {
    const pad = 44
    // The scene's title, top left.
    ctx.font = `800 22px ${FONT}`
    const kicker = o.kicker.toUpperCase()
    const kw = ctx.measureText(kicker).width
    ctx.font = `800 46px ${FONT}`
    const title = wrapText((s) => ctx.measureText(s).width, o.title, width * 0.5, 1)[0] ?? ''
    const tw = ctx.measureText(title).width
    const cw = Math.max(kw, tw) + 64
    card(ctx, pad, pad, cw, 128, 26)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    ctx.fillStyle = INK_SOFT
    ctx.font = `800 22px ${FONT}`
    ctx.fillText(kicker, pad + 32, pad + 48)
    ctx.fillStyle = INK
    ctx.font = `800 46px ${FONT}`
    ctx.fillText(title, pad + 32, pad + 102)

    // The step's caption, bottom centre.
    if (!o.caption) return
    ctx.font = `800 46px ${FONT}`
    const text = o.icon ? `${o.icon}  ${o.caption}` : o.caption
    const lines = wrapText((s) => ctx.measureText(s).width, text, width * 0.78, 3)
    const lh = 60
    const lw = Math.max(...lines.map((l) => ctx.measureText(l).width))
    const bw = lw + 96
    const bh = lines.length * lh + 52
    const bx = (width - bw) / 2
    const by = height - pad - bh
    card(ctx, bx, by, bw, bh, 30)
    ctx.fillStyle = INK
    ctx.textAlign = 'center'
    lines.forEach((l, i) => ctx.fillText(l, width / 2, by + 26 + lh * (i + 1) - 14))
  }

  return {
    canvas,
    /** One frame of the video: sky, scene, words, and a fade from white right after a scene change. */
    draw(source: HTMLCanvasElement, overlay: Overlay | null, now = performance.now()) {
      background(source)
      if (overlay) {
        const key = `${overlay.kicker}|${overlay.title}`
        if (key !== scene) {
          scene = key
          changed = now
        }
        words(overlay)
      }
      const fade = 1 - (now - changed) / FADE_MS
      if (fade > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${(fade * 0.9).toFixed(3)})`
        ctx.fillRect(0, 0, width, height)
      }
    },
    /** A still of the scene alone (no words), as a JPEG data URL, for a slide. */
    still(source: HTMLCanvasElement): string {
      background(source)
      return canvas.toDataURL('image/jpeg', 0.88)
    },
  }
}

/** Whether the browser can encode video (WebCodecs: Chrome, Edge, Safari 16.4+, Firefox 130+). */
export function canEncode(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
}

/**
 * Turns what is drawn on `canvas` into a video file, one frame per `add`, each 1/fps long whatever
 * time it took to draw: H.264 MP4 where the browser encodes it, VP9 or VP8 WebM otherwise. The muxer
 * (mediabunny) loads only now, the first time someone asks for a video. Throws when the browser
 * encodes none of them.
 */
export async function encodeCanvas(canvas: HTMLCanvasElement, fps = VIDEO.fps) {
  const mb = await import('mediabunny')
  const codec = await mb.getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8'], { width: canvas.width, height: canvas.height, bitrate: VIDEO.bitrate })
  if (!codec) throw new Error('recording-unsupported')
  const ext: 'mp4' | 'webm' = codec === 'avc' ? 'mp4' : 'webm'
  const target = new mb.BufferTarget()
  const output = new mb.Output({ format: ext === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(), target })
  // A key frame every 2 s, so a player can jump around the file.
  const source = new mb.CanvasSource(canvas, { codec, bitrate: VIDEO.bitrate, keyFrameInterval: 2 })
  output.addVideoTrack(source, { frameRate: fps })
  await output.start()
  let frames = 0
  return {
    ext,
    /** Adds what is on the canvas now as the next frame; resolves once the encoder can take another. */
    add: () => source.add(frames++ / fps, 1 / fps),
    finish: async () => {
      await output.finalize()
      return new Blob([target.buffer!], { type: `video/${ext}` })
    },
    cancel: () => void output.cancel().catch(() => undefined),
  }
}
