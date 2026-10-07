import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { deckBytes, deckFileName, stepFontSize, type Deck, type DeckScene } from './deck'

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function scene(over: Partial<DeckScene> = {}): DeckScene {
  return {
    title: 'Criar leads',
    kind: 'Pedido',
    summary: 'O visitante preenche o formulário e vira um lead.',
    image: null,
    steps: ['O visitante abre o formulário', 'O sistema valida os dados', 'O lead aparece no painel'],
    cast: [{ name: 'Visitante', note: 'quem pede', color: '#2f8fe6' }],
    ...over,
  }
}

function deck(scenes: DeckScene[]): Deck {
  return {
    lang: 'pt',
    title: 'exemplo/crm',
    summary: 'Um CRM que guarda clientes e negócios.',
    subtitle: 'Lido em 7 de out. de 2026',
    scenes,
  }
}

async function open(d: Deck): Promise<JSZip> {
  return JSZip.loadAsync(await deckBytes(d))
}

/** Media files inside the package, skipping folder entries. */
function mediaFiles(zip: JSZip): string[] {
  return Object.values(zip.files)
    .filter((file) => !file.dir && file.name.startsWith('ppt/media/'))
    .map((file) => file.name)
}

async function text(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path)
  if (!file) throw new Error(`missing ${path}`)
  return file.async('string')
}

describe('deckBytes', () => {
  it('writes a ZIP package (pptx starts with the PK signature)', async () => {
    const bytes = new Uint8Array(await deckBytes(deck([scene()])))
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
  })

  it('makes a cover, one slide per scene and a closing slide', async () => {
    const zip = await open(deck([scene(), scene({ title: 'Pedido pago' })]))
    const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    expect(slides).toHaveLength(4)
    expect(zip.file('ppt/slides/slide4.xml')).not.toBeNull()
  })

  it('puts the scene kicker, title and step text on the scene slide', async () => {
    const zip = await open(deck([scene(), scene({ title: 'Pedido pago' })]))
    const slide2 = await text(zip, 'ppt/slides/slide2.xml')
    expect(slide2).toContain('Cena 1 de 2')
    expect(slide2).toContain('Pedido')
    expect(slide2).toContain('Criar leads')
    expect(slide2).toContain('O sistema valida os dados')
  })

  it('puts every step, numbered, in the speaker notes of the scene slide', async () => {
    const zip = await open(deck([scene()]))
    const notes = await text(zip, 'ppt/notesSlides/notesSlide2.xml')
    expect(notes).toContain('O visitante preenche o formulário e vira um lead.')
    expect(notes).toContain('1. O visitante abre o formulário')
    expect(notes).toContain('2. O sistema valida os dados')
    expect(notes).toContain('3. O lead aparece no painel')
  })

  it('builds a scene without a picture and says so on the slide', async () => {
    const zip = await open(deck([scene({ image: null })]))
    const slide2 = await text(zip, 'ppt/slides/slide2.xml')
    expect(slide2).toContain('(sem imagem)')
  })

  it('embeds a real PNG picture as a media file', async () => {
    const zip = await open(deck([scene({ image: PNG_1X1 })]))
    expect(mediaFiles(zip)).toHaveLength(1)
    const slide2 = await text(zip, 'ppt/slides/slide2.xml')
    expect(slide2).not.toContain('(sem imagem)')
  })

  it('ignores a picture that is not a PNG or JPEG data URL', async () => {
    const zip = await open(deck([scene({ image: 'data:image/svg+xml;base64,PHN2Zy8+' })]))
    expect(mediaFiles(zip)).toHaveLength(0)
    expect(await text(zip, 'ppt/slides/slide2.xml')).toContain('(sem imagem)')
  })

  it('builds an empty deck as cover and closing only', async () => {
    const zip = await open(deck([]))
    const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    expect(slides).toHaveLength(2)
    expect(await text(zip, 'ppt/slides/slide2.xml')).toContain('Gerado automaticamente')
  })

  it('writes the English labels when the deck is in English', async () => {
    const zip = await open({ ...deck([scene({ image: null })]), lang: 'en' })
    const slide2 = await text(zip, 'ppt/slides/slide2.xml')
    expect(slide2).toContain('Scene 1 of 1')
    expect(slide2).toContain('Step by step')
    expect(slide2).toContain('(no image)')
  })

  it('keeps accented text intact in the slide XML', async () => {
    const zip = await open(deck([scene({ summary: 'Ação concluída com atenção.' })]))
    expect(await text(zip, 'ppt/slides/slide2.xml')).toContain('Ação concluída com atenção.')
  })

  it('cuts a very long scene title with an ellipsis', async () => {
    const long = 'A'.repeat(90)
    const zip = await open(deck([scene({ title: long })]))
    const slide2 = await text(zip, 'ppt/slides/slide2.xml')
    expect(slide2).not.toContain(long)
    expect(slide2).toContain('…')
  })
})

describe('deckFileName', () => {
  it('names a Portuguese deck "-apresentacao.pptx" and replaces the slash', () => {
    expect(deckFileName('exemplo/crm', 'pt')).toBe('exemplo-crm-apresentacao.pptx')
  })

  it('names an English deck "-presentation.pptx"', () => {
    expect(deckFileName('exemplo/crm', 'en')).toBe('exemplo-crm-presentation.pptx')
  })

  it('replaces odd characters with a dash and collapses runs of dashes', () => {
    expect(deckFileName('dono//repo name?!', 'pt')).toBe('dono-repo-name-apresentacao.pptx')
  })

  it('folds accents to plain letters', () => {
    expect(deckFileName('São João/Ação', 'pt')).toBe('Sao-Joao-Acao-apresentacao.pptx')
  })
})

describe('stepFontSize', () => {
  it('keeps the largest size when a few short steps fit', () => {
    expect(stepFontSize(['O usuário abre a tela', 'A tela pede a lista'], 3.9, 4.4)).toBe(12)
  })

  it('goes smaller for a long scene, and never below 8', () => {
    const long = Array.from({ length: 14 }, () => 'O assistente de vendas pergunta de novo ao modelo de IA, com o resultado da ferramenta')
    const size = stepFontSize(long, 3.9, 4.4)
    expect(size).toBeLessThan(12)
    expect(size).toBeGreaterThanOrEqual(8)
    expect(stepFontSize(Array.from({ length: 60 }, () => long[0]), 3.9, 4.4)).toBe(8)
  })
})
