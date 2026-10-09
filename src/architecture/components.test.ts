import { describe, expect, it } from 'vitest'
import { buildComponents, layerOf, MAX_COMPONENTS, techOf, type ComponentFile } from './components'

/** A source file as the component builder sees it; the text is optional. */
function file(path: string, text = '', packages: string[] = [], routes: string[] = []): ComponentFile {
  return { path, lines: 10, text, packages, routes }
}

/** `n` files in a folder, named f0.ts, f1.ts… */
function many(folder: string, n: number): ComponentFile[] {
  return Array.from({ length: n }, (_, i) => file(`${folder}/f${i}.ts`))
}

const build = (files: ComponentFile[], repoName = 'demo') => buildComponents({ files, repoName, databaseLabel: null })

describe('buildComponents: splitting', () => {
  it('keeps a small top-level folder as one component named after it', () => {
    const comps = build([file('leads/a.ts'), file('leads/b.ts')])
    expect(comps.map((c) => [c.id, c.name, c.direct, c.files])).toEqual([['leads', 'Leads', false, 2]])
  })

  it('splits a large folder into its subfolders', () => {
    const files = [...many('backend/leads', 20), ...many('backend/billing', 15), ...many('backend/users', 15)]
    const ids = build(files).map((c) => c.id).sort()
    expect(ids).toEqual(['backend/billing', 'backend/leads', 'backend/users'])
  })

  it('looks through wrapper folders such as src', () => {
    const files = [...many('frontend/src/pages', 6), ...many('frontend/src/components', 6), ...many('frontend/src/hooks', 4)]
    const comps = build(files)
    expect(comps.map((c) => c.name).sort()).toEqual(['Frontend Components', 'Frontend Hooks', 'Frontend Pages'])
  })

  it('makes loose files of a folder a direct component of their own', () => {
    const files = [file('src/index.ts'), file('src/x.ts'), ...many('src/a', 25), ...many('src/b', 25)]
    const comps = build(files)
    const direct = comps.find((c) => c.direct)
    expect(direct?.id).toBe('src#direct')
    expect(direct?.files).toBe(2)
    expect(comps.map((c) => c.id).sort()).toEqual(['src#direct', 'src/a', 'src/b'])
  })

  it('names the repo for the loose files at the root', () => {
    const comps = build([file('index.ts'), file('lib.ts'), ...many('api', 3)], 'crm-api')
    const root = comps.find((c) => c.id === '#direct')
    expect(root?.name).toBe('Crm Api')
    expect(root?.direct).toBe(true)
  })

  it('never returns more than sixteen components', () => {
    const files = Array.from({ length: 20 }, (_, i) => many(`area${i}`, 2)).flat()
    expect(build(files).length).toBeLessThanOrEqual(MAX_COMPONENTS)
  })

  it('returns nothing for no files', () => {
    expect(build([])).toEqual([])
  })

  it('gives unique names when two parts would share one', () => {
    const files = [...many('app/leads', 20), ...many('web/leads', 20), ...many('api/users', 20)]
    const names = build(files).map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('buildComponents: names, entries and facts', () => {
  it('puts the parent in front of generic folder names', () => {
    const files = [...many('backend/src/routes', 12), ...many('backend/src/services', 12), ...many('backend/src/models', 12)]
    const names = build(files).map((c) => c.name).sort()
    expect(names).toEqual(['Backend Models', 'Backend Routes', 'Backend Services'])
  })

  it('marks files that start something as entries', () => {
    const comps = build([
      file('frontend/src/main.tsx', "createRoot(document.getElementById('root')!).render(<App />)"),
      file('frontend/src/pages/Home.tsx'),
      file('backend/server.ts', "app.listen(3000)"),
      file('backend/lib/helper.ts'),
    ])
    const entries = comps.filter((c) => c.entry).map((c) => c.path).sort()
    expect(entries).toEqual(['backend', 'frontend/src'])
  })

  it('treats a package.json main as an entry', () => {
    const comps = buildComponents({
      files: [file('bin/cli.js'), file('lib/tool.js')],
      repoName: 'tool',
      databaseLabel: null,
      entryFiles: ['bin/cli.js'],
    })
    expect(comps.find((c) => c.path === 'bin')?.entry).toBe(true)
  })

  it('lists frameworks seen inside, most used first, with model providers', () => {
    const comps = build([
      file('web/a.tsx', '', ['react', 'react-dom']),
      file('web/b.tsx', '', ['react']),
      file('web/c.ts', '', ['next']),
      file('ai/bot.py', '', ['openai']),
    ])
    expect(comps.find((c) => c.path === 'web')?.tech).toEqual(['React', 'Next.js'])
    expect(comps.find((c) => c.path === 'ai')?.tech).toEqual(['OpenAI'])
  })

  it('writes one plain sentence per layer, mentioning the routes it found', () => {
    const comps = build([
      file('api/leads.py', '@app.get("/leads")', [], ['GET /leads', 'POST /leads']),
      ...many('api/more', 1),
    ])
    const api = comps.find((c) => c.path === 'api')
    expect(api?.layer).toBe('api')
    expect(api?.summary.pt).toBe('Recebe os pedidos do sistema, como GET /leads e POST /leads.')
    expect(api?.summary.en).toBe("Takes the system's requests, such as GET /leads and POST /leads.")
    for (const c of comps) {
      expect(c.summary.pt.length).toBeLessThanOrEqual(140)
      expect(c.summary.en.length).toBeLessThanOrEqual(140)
    }
  })

  it('names the database in the data summary', () => {
    const comps = buildComponents({
      files: [file('db/models.py', 'class Lead(models.Model): pass')],
      repoName: 'x',
      databaseLabel: 'PostgreSQL',
    })
    expect(comps[0].summary.pt).toBe('Guarda e busca os dados (PostgreSQL).')
  })
})

describe('layerOf', () => {
  it('reads the layer from the folder, the file name and the content', () => {
    expect(layerOf('app/routes/leads.py', '@app.get("/leads")', [])).toBe('api')
    expect(layerOf('frontend/src/components/Button.tsx', '', [])).toBe('interface')
    expect(layerOf('backend/services/leads.ts', '', [])).toBe('logic')
    expect(layerOf('backend/middleware/auth.ts', '', [])).toBe('security')
    expect(layerOf('backend/tasks/send.py', '@shared_task\ndef send(): pass', [])).toBe('jobs')
    expect(layerOf('backend/config/settings.py', '', [])).toBe('infra')
    expect(layerOf('shop/models.py', 'class Lead(models.Model): pass', [])).toBe('data')
    expect(layerOf('bot/handler.py', '', ['openai'])).toBe('ai')
    expect(layerOf('src/utils/format.ts', '', [])).toBe('shared')
  })

  it('recognises tests by folder and by name', () => {
    expect(layerOf('tests/test_leads.py', '', [])).toBe('tests')
    expect(layerOf('src/leads.test.ts', '', [])).toBe('tests')
    expect(layerOf('pkg/leads_test.go', '', [])).toBe('tests')
  })

  it('reads Next.js route handlers as API code', () => {
    expect(layerOf('app/api/leads/route.ts', 'export async function POST(req: Request) {}', [])).toBe('api')
  })

  it('falls back to logic when nothing points anywhere', () => {
    expect(layerOf('misc/thing.ts', 'const x = 1', [])).toBe('logic')
  })
})

describe('techOf', () => {
  it('names frameworks and model providers from package names', () => {
    expect(techOf(['@nestjs/core', '@prisma/client', '@langchain/openai', 'langgraph'])).toEqual(['NestJS', 'Prisma', 'OpenAI', 'LangGraph'])
    expect(techOf(['left-pad'])).toEqual([])
  })
})
