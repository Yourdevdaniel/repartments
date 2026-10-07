import PptxGenJS from 'pptxgenjs'

/** One scene of the presentation, already translated and with its picture captured by the browser. */
export type DeckScene = {
  /** "Criar leads" */
  title: string
  /** "Pedido", "Agente de IA", "Commit"… shown small above the title. */
  kind: string
  /** One or two sentences. */
  summary: string
  /** A PNG or JPEG data URL of the scene (16:9-ish), or null when it couldn't be captured. */
  image: string | null
  /** The captions in order, plain sentences. Up to ~14. */
  steps: string[]
  /** Who takes part: name, a short note, and the colour of their dot ("#2f8fe6"). */
  cast: { name: string; note: string; color: string }[]
}

/** The whole show: a cover built from the repo's summary, then one slide per scene. */
export type Deck = {
  lang: 'en' | 'pt'
  /** "exemplo/crm" */
  title: string
  /** The system summary paragraph, for the cover. */
  summary: string
  /** "Lido em 7 de out. de 2026" — under the title on the cover. */
  subtitle: string
  scenes: DeckScene[]
}

const INK = '23263A'
const SOFT = '5B6078'
const ACCENT = '2F8FE6'
const BACKGROUND = 'F4F6FD'
const CARD = 'FFFFFF'
const FONT = 'Nunito'
const MAX_TITLE = 60
const MAX_CAST = 7
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g);base64,/i

const LABEL = {
  presentation: { en: 'PRESENTATION', pt: 'APRESENTAÇÃO' },
  stepByStep: { en: 'Step by step', pt: 'Passo a passo' },
  takesPart: { en: 'Who takes part', pt: 'Quem participa' },
  noImage: { en: '(no image)', pt: '(sem imagem)' },
  closing: {
    en: "Generated automatically from the system's own code.",
    pt: 'Gerado automaticamente a partir do código do próprio sistema.',
  },
} as const

/**
 * The largest font size (points) at which the steps fit their box, estimated from their length: an
 * average character is about half the font size wide. "Shrink to fit" only happens once PowerPoint
 * edits a box, so the file has to be right as it is opened.
 */
export function stepFontSize(steps: string[], width: number, height: number): number {
  for (const size of [12, 11, 10, 9, 8]) {
    const perLine = Math.max(1, Math.floor((width * 72) / (size * 0.5)))
    const lines = steps.reduce((n, s) => n + Math.max(1, Math.ceil(s.length / perLine)), 0)
    const needed = (lines * size * 1.2 + Math.max(0, steps.length - 1) * size * 0.4) / 72
    if (needed <= height) return size
  }
  return 8
}

/** Cuts a long title with an ellipsis so it never overflows the slide. */
function clip(text: string, max = MAX_TITLE): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** Builds the presentation in memory, without writing it anywhere. */
function assemble(deck: Deck): PptxGenJS {
  const { lang } = deck
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = deck.title

  const shapes = pptx.ShapeType

  // Cover
  const cover = pptx.addSlide()
  cover.background = { color: BACKGROUND }
  cover.addShape(shapes.rect, { x: 0.5, y: 0.7, w: 0.9, h: 0.07, fill: { color: ACCENT }, line: { type: 'none' } })
  cover.addText(LABEL.presentation[lang], {
    x: 0.5, y: 0.9, w: 12.3, h: 0.35,
    fontFace: FONT, fontSize: 12, bold: true, color: ACCENT, charSpacing: 2,
  })
  cover.addText(clip(deck.title, 80), {
    x: 0.5, y: 1.3, w: 12.3, h: 1.3,
    fontFace: FONT, fontSize: 40, bold: true, color: INK, valign: 'top', fit: 'shrink',
  })
  cover.addText(deck.subtitle, {
    x: 0.5, y: 2.6, w: 12.3, h: 0.4,
    fontFace: FONT, fontSize: 14, color: SOFT,
  })
  cover.addText(deck.summary, {
    x: 0.5, y: 3.3, w: 12.3, h: 2.9,
    shape: shapes.roundRect, rectRadius: 0.15, fill: { color: CARD }, line: { type: 'none' },
    fontFace: FONT, fontSize: 16, color: INK, lineSpacingMultiple: 1.2,
    valign: 'top', margin: 20, fit: 'shrink',
  })

  // One slide per scene
  const total = deck.scenes.length
  deck.scenes.forEach((scene, index) => {
    const slide = pptx.addSlide()
    slide.background = { color: BACKGROUND }

    const kicker = lang === 'pt' ? `Cena ${index + 1} de ${total}` : `Scene ${index + 1} of ${total}`
    slide.addText(`${kicker} · ${scene.kind}`, {
      x: 0.5, y: 0.4, w: 12.3, h: 0.35,
      fontFace: FONT, fontSize: 12, bold: true, color: SOFT,
    })
    slide.addText(clip(scene.title), {
      x: 0.5, y: 0.75, w: 12.3, h: 0.7,
      fontFace: FONT, fontSize: 28, bold: true, color: INK, valign: 'top', fit: 'shrink',
    })
    slide.addText(scene.summary, {
      x: 0.5, y: 1.45, w: 12.3, h: 0.7,
      fontFace: FONT, fontSize: 13, color: SOFT, valign: 'top', fit: 'shrink',
    })

    // Picture, kept in its own aspect ratio inside a white card
    const card = { x: 0.5, y: 2.3, w: 7.6, h: 3.7 }
    slide.addShape(shapes.roundRect, {
      ...card, rectRadius: 0.12, fill: { color: CARD }, line: { type: 'none' },
    })
    const image = scene.image && IMAGE_DATA_URL.test(scene.image) ? scene.image : null
    if (image) {
      const inset = { x: card.x + 0.1, y: card.y + 0.1, w: card.w - 0.2, h: card.h - 0.2 }
      slide.addImage({
        data: image,
        ...inset,
        sizing: { type: 'contain', w: inset.w, h: inset.h, x: inset.x, y: inset.y },
      })
    } else {
      slide.addText(LABEL.noImage[lang], {
        ...card, fontFace: FONT, fontSize: 14, color: SOFT, align: 'center', valign: 'middle',
      })
    }

    // Who takes part, under the picture: a coloured dot, the name, then the note
    const cast = scene.cast.slice(0, MAX_CAST)
    if (cast.length > 0) {
      slide.addText(LABEL.takesPart[lang], {
        x: 0.5, y: 6.15, w: 7.6, h: 0.3,
        fontFace: FONT, fontSize: 14, bold: true, color: INK,
      })
      // Notes cut short: the cast is a reminder of who is who, the steps tell the story.
      const runs = cast.flatMap((actor) => [
        { text: '● ', options: { color: actor.color, fontSize: 10 } },
        { text: actor.name, options: { bold: true, color: INK } },
        { text: actor.note ? ` ${clip(actor.note, 46)}    ` : '    ', options: { color: SOFT } },
      ])
      slide.addText(runs, {
        x: 0.5, y: 6.45, w: 7.6, h: 0.85,
        fontFace: FONT, fontSize: cast.length > 5 ? 8.5 : 9.5, valign: 'top', fit: 'shrink',
      })
    }

    // Steps, numbered, on the right
    const stepBox = { x: 8.45, y: 2.7, w: 4.38, h: 4.55 }
    const stepSize = stepFontSize(scene.steps, stepBox.w - 0.45, stepBox.h - 0.1)
    slide.addText(LABEL.stepByStep[lang], {
      x: 8.45, y: 2.3, w: 4.38, h: 0.35,
      fontFace: FONT, fontSize: 14, bold: true, color: INK,
    })
    slide.addText(
      scene.steps.map((step) => ({
        text: step,
        options: { bullet: { type: 'number' as const }, breakLine: true, paraSpaceAfter: Math.round(stepSize * 0.4) },
      })),
      {
        ...stepBox,
        fontFace: FONT, fontSize: stepSize, color: INK, valign: 'top', fit: 'shrink', margin: 0,
      },
    )

    const notes = [scene.summary, ...scene.steps.map((step, i) => `${i + 1}. ${step}`)]
    slide.addNotes(notes.join('\n'))
  })

  // Closing
  const closing = pptx.addSlide()
  closing.background = { color: BACKGROUND }
  closing.addText(LABEL.closing[lang], {
    x: 0.5, y: 2.8, w: 12.3, h: 1.5,
    fontFace: FONT, fontSize: 16, color: SOFT, align: 'center', valign: 'middle',
  })

  return pptx
}

/** The presentation as raw bytes; the tests read it, the browser wraps it in a Blob. */
export async function deckBytes(deck: Deck): Promise<ArrayBuffer> {
  const bytes = await assemble(deck).write({ outputType: 'arraybuffer' })
  return bytes as ArrayBuffer
}

/** Builds the .pptx in memory, ready to download. */
export async function buildDeck(deck: Deck): Promise<Blob> {
  const blob = (await assemble(deck).write({ outputType: 'blob' })) as Blob
  // Typed as a presentation, so the system opens it with the right program.
  return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
}

/**
 * File name for the download. Accents are folded to plain letters and every
 * other odd character becomes a dash, so the name is safe on any system.
 */
export function deckFileName(title: string, lang: 'en' | 'pt'): string {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  const suffix = lang === 'pt' ? 'apresentacao' : 'presentation'
  return `${base || 'deck'}-${suffix}.pptx`
}
