import { describe, expect, it } from 'vitest'
import type { ArchitectureModel } from '../shared/studio'
import { analyzeRepository, buildModel, type Progress, type SourceInput } from './index'
import { crmFixture } from './fixtures'
import { MAX_FLOWS, MAX_ACTORS, MAX_STEPS } from './flows'
import type { GitHubClient } from '../github/client'

const crm = (): ArchitectureModel => buildModel(crmFixture)

describe('buildModel on the CRM fixture', () => {
  const model = crm()

  it('finds the parts of the system, with their names and layers', () => {
    const byName = Object.fromEntries(model.components.map((c) => [c.name, c.layer]))
    expect(byName['Frontend Pages']).toBe('interface')
    expect(byName['Backend Routes']).toBe('api')
    expect(byName['Backend Middleware']).toBe('security')
    expect(byName['Backend Services']).toBe('logic')
    expect(byName['Backend Db']).toBe('data')
    expect(byName['Backend Jobs']).toBe('jobs')
    expect(byName['Backend Agent']).toBe('ai')
    expect(byName['Backend Tests']).toBe('tests')
    expect(model.components.length).toBeGreaterThanOrEqual(8)
    expect(model.components.length).toBeLessThanOrEqual(16)
  })

  it('draws the dependencies between parts, the front-end call to the API, and nothing from tests', () => {
    const name = (id: string) => model.components.find((c) => c.id === id)?.name
    const edges = model.dependencies.map((d) => `${name(d.from)} -> ${name(d.to)}`)
    expect(edges).toContain('Frontend Pages -> Backend Routes')
    expect(edges).toContain('Backend Routes -> Backend Services')
    expect(edges).toContain('Backend Services -> Backend Db')
    expect(edges).toContain('Backend Routes -> Backend Agent')
    expect(model.dependencies.some((d) => name(d.from) === 'Backend Tests' || name(d.to) === 'Backend Tests')).toBe(false)
    expect(model.dependencies.every((d) => d.from !== d.to && d.weight > 0)).toBe(true)
  })

  it('lists the routes with their file and line', () => {
    const post = model.endpoints.find((e) => e.method === 'POST' && e.path === '/leads')
    expect(post?.file).toBe('backend/src/routes/leads.ts')
    expect(post?.line).toBe(11)
    expect(model.endpoints.map((e) => `${e.method} ${e.path}`).sort()).toEqual(['GET /leads', 'POST /assistant', 'POST /leads'])
  })

  it('finds the outside services: the database named in the Prisma schema, the e-mail, the queue and the model', () => {
    expect(model.externals.map((e) => [e.name, e.kind]).sort()).toEqual([
      ['BullMQ', 'queue'],
      ['OpenAI', 'llm'],
      ['PostgreSQL', 'database'],
      ['Resend', 'email'],
    ])
  })

  it('reads the agent: its provider, model, instructions and three tools', () => {
    expect(model.agents).toHaveLength(1)
    const [agent] = model.agents
    expect(agent.provider).toBe('OpenAI')
    expect(agent.model).toBe('gpt-4o-mini')
    expect(agent.instructions).toContain('Você ajuda a equipe comercial')
    expect(agent.tools.map((t) => t.name)).toEqual(['search_leads', 'add_note', 'schedule_call'])
    expect(agent.loop).toBe(true)
  })

  it('tells the story: the assistant first, then creating and listing leads, then the background job', () => {
    expect(model.flows.map((f) => f.id)).toEqual(['agent:backend/src/agent/support.ts', 'request:POST /leads', 'request:GET /leads', 'job'])
    expect(model.flows[1].title).toEqual({ pt: 'Criar leads', en: 'Create leads' })
    expect(model.flows[2].title.pt).toBe('Listar leads')
  })

  it('names a part after its only screen or its only agent when the folder says nothing', () => {
    const label = (id: string) => model.components.find((c) => c.id === id)?.label
    expect(label('frontend/src/pages')).toEqual({ pt: 'Tela de leads', en: 'Leads screen' })
    expect(label('backend/src/agent')).toEqual({ pt: 'Assistente de atendimento', en: 'Support assistant' })
    expect(model.components.find((c) => c.id === 'frontend/src/pages')?.name).toBe('Frontend Pages')
  })

  it('leaves the e-mail out of the list scene: reading the leads sends nothing', () => {
    expect(model.flows[2].actors.some((a) => a.name.pt === 'Serviço de e-mail')).toBe(false)
  })

  it('tells the Criar leads scene with what the form asks for, what the service saves, and the e-mail it sends', () => {
    const create = model.flows[1]
    const pt = create.steps.map((s) => s.text.pt)
    expect(pt[0]).toBe('O usuário abre a tela de leads, preenche nome, empresa, e-mail e telefone e clica em “Salvar lead”')
    expect(pt[1]).toBe('A tela de leads envia o novo lead (nome, empresa, e-mail e telefone) para a recepção')
    expect(pt).toContain('As regras do negócio guardam o novo lead no banco de dados: nome, empresa, e-mail e telefone')
    expect(pt).toContain('O banco de dados confirma para as regras do negócio: o lead foi guardado')
    expect(pt).toContain('As regras do negócio enviam o e-mail “Olá!” usando o serviço de e-mail')
    expect(pt[pt.length - 1]).toBe('A tela de leads mostra que o lead foi salvo')
    expect(create.steps[0].text.en).toBe('The user opens the leads screen, fills in nome, empresa, e-mail and telefone and clicks “Salvar lead”')
  })

  it('keeps every scene within the limits, with every step pointing at its own actors', () => {
    expect(model.flows.length).toBeLessThanOrEqual(MAX_FLOWS)
    for (const flow of model.flows) {
      const ids = new Set(flow.actors.map((a) => a.id))
      expect(flow.actors.length).toBeLessThanOrEqual(MAX_ACTORS)
      expect(flow.steps.length).toBeLessThanOrEqual(MAX_STEPS)
      for (const s of flow.steps) {
        expect(ids.has(s.from)).toBe(true)
        expect(ids.has(s.to)).toBe(true)
        expect(s.text.pt.trim().length).toBeGreaterThan(0)
        expect(s.text.en.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('writes a summary in both languages within 400 characters, with the parts and the services in it', () => {
    expect(model.summary.pt.length).toBeLessThanOrEqual(400)
    expect(model.summary.pt).toMatch(/^O crm tem \d+ partes: /)
    expect(model.summary.pt).toContain('Usa um banco de dados')
    expect(model.summary.pt).not.toMatch(/TypeScript|PostgreSQL/)
    expect(model.summary.en).toContain('It uses')
  })

  it('reports the stats: files in the tree, files read, their lines and the languages', () => {
    expect(model.stats.files).toBe(crmFixture.tree.length)
    expect(model.stats.analyzed).toBe(crmFixture.files.size)
    expect(model.stats.lines).toBeGreaterThan(100)
    expect(model.stats.languages[0]).toEqual({ name: 'TypeScript', files: expect.any(Number) })
    expect(model.stats.truncated).toBe(false)
  })

  it('is deterministic for the same input', () => {
    const a = JSON.stringify(buildModel(crmFixture))
    const b = JSON.stringify(buildModel(crmFixture))
    expect(a).toBe(b)
  })

  it('takes the generation time from the input, so tests can pin it', () => {
    expect(model.generatedAt).toBe('2026-10-07T12:00:00.000Z')
    expect(model.version).toBe(1)
    expect(model.repo).toEqual(crmFixture.repo)
  })
})

describe('buildModel on other inputs', () => {
  it('handles an empty repo without throwing', () => {
    const model = buildModel({ repo: { owner: 'a', name: 'empty', branch: 'main', sha: 's', private: false }, tree: [], files: new Map(), truncated: false })
    expect(model.components).toEqual([])
    expect(model.flows).toEqual([])
    expect(model.summary.pt).toBe('O empty é um sistema.')
  })

  it('skips broken tree entries and unreadable texts', () => {
    const input: SourceInput = {
      repo: { owner: 'a', name: 'odd', branch: 'main', sha: 's', private: false },
      tree: [null as unknown as { path: string; type: 'blob' }, { path: 'src/a.ts', type: 'blob' }, { path: 'src/b.ts', type: 'tree' }],
      files: new Map<string, string>([
        ['src/a.ts', "import { x } from './nope'\n"],
        ['src/bin.ts', '\u0000\u0001 binary'],
      ]),
      truncated: true,
    }
    const model = buildModel(input)
    expect(model.stats.truncated).toBe(true)
    // Only the blob entry counts as a file of the tree; the folder and the broken entry don't.
    expect(model.stats.files).toBe(1)
    expect(model.stats.analyzed).toBe(2)
  })

  it('reads a Python FastAPI service and a SQLAlchemy database without a manifest', () => {
    const model = buildModel({
      repo: { owner: 'acme', name: 'api', branch: 'main', sha: 's', private: true },
      tree: [{ path: 'app/main.py', type: 'blob' }, { path: 'app/db.py', type: 'blob' }],
      files: new Map([
        [
          'app/main.py',
          'from fastapi import FastAPI\nfrom .db import engine\n\napp = FastAPI()\n\n@app.get("/leads")\ndef leads():\n    return []\n\nif __name__ == "__main__":\n    pass\n',
        ],
        ['app/db.py', 'from sqlalchemy import create_engine\n\nengine = create_engine("sqlite://")\n'],
      ]),
      truncated: false,
    })
    expect(model.endpoints).toEqual([{ method: 'GET', path: '/leads', file: 'app/main.py', line: 6, component: model.components[0].id }])
    expect(model.components[0].tech).toContain('FastAPI')
    expect(model.components[0].entry).toBe(true)
    expect(model.externals.map((e) => [e.name, e.kind])).toEqual([['Banco de dados', 'database']])
  })

  it('does not name a screens part after a heading in one of its test files', () => {
    const model = buildModel({
      repo: { owner: 'acme', name: 'contratos', branch: 'main', sha: 's', private: false },
      tree: [{ path: 'frontend/src/App.tsx', type: 'blob' }, { path: 'frontend/src/App.test.tsx', type: 'blob' }],
      files: new Map([
        ['frontend/src/App.tsx', 'export function App() {\n  return <main><button onClick={go}>Novo contrato</button></main>\n}\n'],
        ['frontend/src/App.test.tsx', "it('renders', () => {\n  render(<section><h2>DO OBJETO</h2></section>)\n})\n"],
      ]),
      truncated: false,
    })
    expect(model.components.map((c) => c.label?.pt).join(' | ')).not.toContain('OBJETO')
  })

  it('reads the pages of a React Router site and tells the journey of a button that cancels', () => {
    const page = [
      "import { useMutation, useQuery } from '@tanstack/react-query'",
      "import { api } from '../api/client'",
      'export default function MinhasReservas() {',
      "  const { data } = useQuery({ queryFn: () => api('/reservas/minhas') })",
      '  const cancelar = useMutation({',
      '    mutationFn: (id) => api(`/reservas/${id}/cancelar`, { method: "POST" }),',
      '  })',
      '  return (<main><h1>Minhas reservas</h1>',
      '    {data?.map((r) => <button key={r.id} onClick={() => cancelar.mutate(r.id)}>Cancelar</button>)}',
      '  </main>)',
      '}',
    ].join('\n')
    const app = [
      "import { Route, Routes } from 'react-router-dom'",
      "import MinhasReservas from './pages/MinhasReservas'",
      "import Busca from './pages/Busca'",
      'export default function App() {',
      '  return <Routes>',
      '    <Route path="/" element={<Busca />} />',
      '    <Route path="/minhas-reservas" element={<Protegida><MinhasReservas /></Protegida>} />',
      '  </Routes>',
      '}',
    ].join('\n')
    const files = new Map([
      ['frontend/package.json', '{"dependencies":{"react":"18.3.1","react-router-dom":"6.26.0"}}'],
      ['frontend/src/App.jsx', app],
      ['frontend/src/pages/MinhasReservas.jsx', page],
      ['frontend/src/pages/Busca.jsx', 'export default function Busca() {\n  return <main><h1>Encontre um estúdio</h1></main>\n}\n'],
      ['frontend/src/api/client.js', 'export function api(path, options) {\n  return fetch(`/api${path}`, options).then((r) => r.json())\n}\n'],
      ['backend/requirements.txt', 'Django==5.1\n'],
      ['backend/core/urls.py', "from django.urls import path\nfrom . import views\n\nurlpatterns = [\n  path('reservas/minhas', views.minhas),\n  path('reservas/<int:pk>/cancelar', views.cancelar),\n]\n"],
      ['backend/core/views.py', 'from .models import Reserva\n\ndef minhas(request):\n    pass\n\ndef cancelar(request, pk):\n    pass\n'],
      ['backend/core/models.py', 'from django.db import models\n\nclass Reserva(models.Model):\n    status = models.CharField(max_length=20)\n'],
    ])
    const model = buildModel({
      repo: { owner: 'acme', name: 'studio', branch: 'main', sha: 's', private: false },
      tree: [...files.keys()].map((path) => ({ path, type: 'blob' as const })),
      files,
      truncated: false,
    })
    expect(model.pages).toEqual([
      { path: '/', name: 'Encontre um estúdio', file: 'frontend/src/pages/Busca.jsx', source: { file: 'frontend/src/App.jsx', line: 6 } },
      { path: '/minhas-reservas', name: 'Minhas reservas', file: 'frontend/src/pages/MinhasReservas.jsx', source: { file: 'frontend/src/App.jsx', line: 7 } },
    ])
    const journey = model.flows.find((f) => f.kind === 'journey')
    expect(journey?.title.pt).toBe('O usuário cancela uma reserva')
    expect(journey?.steps[0].text.pt).toContain('“Minhas reservas”')
    expect(journey?.steps[1].text.pt).toBe('O usuário clica em “Cancelar” numa reserva')
    // The summary names the pages a person goes through, leaving out the home page.
    expect(model.summary.pt).toContain('Quem usa passa por 2 páginas, como “Minhas reservas”.')
    expect(model.summary.en).toContain('People go through 2 pages, such as “Minhas reservas”.')
  })

  it('joins the prefix of a Go group passed to a register function in another package', () => {
    const files = new Map([
      ['go.mod', 'module github.com/x/conduit\n\ngo 1.21\n'],
      ['hello.go', 'package main\n\nimport (\n\t"github.com/gin-gonic/gin"\n\t"github.com/x/conduit/users"\n)\n\nfunc main() {\n\tr := gin.Default()\n\tv1 := r.Group("/api")\n\tusers.UsersRegister(v1.Group("/users"))\n\tusers.UserRegister(v1.Group("/user"))\n}\n'],
      ['users/routers.go', 'package users\n\nimport "github.com/gin-gonic/gin"\n\nfunc UsersRegister(router *gin.RouterGroup) {\n\trouter.POST("/", UsersRegistration)\n\trouter.POST("/login", UsersLogin)\n}\n\nfunc UserRegister(router *gin.RouterGroup) {\n\trouter.GET("/", UserRetrieve)\n}\n'],
    ])
    const model = buildModel({
      repo: { owner: 'acme', name: 'conduit', branch: 'main', sha: 's', private: false },
      tree: [...files.keys()].map((path) => ({ path, type: 'blob' as const })),
      files,
      truncated: false,
    })
    expect(model.endpoints.map((e) => `${e.method} ${e.path}`).sort()).toEqual(['GET /api/user', 'POST /api/users', 'POST /api/users/login'])
  })

  it('joins the prefixes of FastAPI routers mounted in other files', () => {
    const files = new Map([
      ['app/main.py', 'from fastapi import FastAPI\nfrom app.api.routes.api import router as api_router\n\napp = FastAPI()\napp.include_router(api_router, prefix="/api")\n'],
      ['app/api/routes/api.py', 'from fastapi import APIRouter\nfrom app.api.routes import articles\n\nrouter = APIRouter()\nrouter.include_router(articles.router, prefix="/articles")\n'],
      ['app/api/routes/articles.py', 'from fastapi import APIRouter\n\nrouter = APIRouter()\n\n@router.get("")\nasync def list_articles():\n    pass\n\n@router.get("/{slug}")\nasync def get_article(slug: str):\n    pass\n'],
    ])
    const model = buildModel({
      repo: { owner: 'acme', name: 'conduit', branch: 'main', sha: 's', private: false },
      tree: [...files.keys()].map((path) => ({ path, type: 'blob' as const })),
      files,
      truncated: false,
    })
    expect(model.endpoints.map((e) => `${e.method} ${e.path}`)).toEqual(['GET /api/articles', 'GET /api/articles/{slug}'])
  })

  it('finds the file of a page whose component is declared in the router file itself', () => {
    const app = [
      "import { Route, Routes } from 'react-router-dom'",
      'function Home() {',
      '  return <h1>Seu trabalho merece mais que um print.</h1>',
      '}',
      'export default function App() {',
      '  return <Routes><Route path="/" element={<Home />} /></Routes>',
      '}',
    ].join('\n')
    const files = new Map([['web/src/App.tsx', app]])
    const model = buildModel({ repo: { owner: 'acme', name: 'c', branch: 'main', sha: 's', private: false }, tree: [{ path: 'web/src/App.tsx', type: 'blob' as const }], files, truncated: false })
    expect(model.pages).toEqual([{ path: '/', name: 'Home', file: 'web/src/App.tsx', source: { file: 'web/src/App.tsx', line: 6 } }])
  })

  it('tells a Django route by the method the front-end calls it with', () => {
    const model = buildModel({
      repo: { owner: 'acme', name: 'contratos', branch: 'main', sha: 's', private: false },
      tree: [
        { path: 'backend/contracts/urls.py', type: 'blob' },
        { path: 'backend/contracts/views.py', type: 'blob' },
        { path: 'frontend/src/pages/NewContract.tsx', type: 'blob' },
      ],
      files: new Map([
        ['backend/contracts/urls.py', "from django.urls import path\nfrom . import views\n\nurlpatterns = [\n  path('contracts/', views.contracts),\n  path('health/', views.health),\n]\n"],
        ['backend/contracts/views.py', 'def contracts(request):\n    pass\n\ndef health(request):\n    pass\n'],
        ['frontend/src/pages/NewContract.tsx', "export function NewContract() {\n  const save = () => fetch('/api/contracts/', { method: 'POST', body: JSON.stringify({ title }) })\n  return <button onClick={save}>Salvar</button>\n}\n"],
      ]),
      truncated: false,
    })
    // The "Salvar" button makes the creation a journey, which takes the place of its request scene.
    const scenes = model.flows.filter((f) => f.kind === 'request' || f.kind === 'journey')
    expect(scenes.map((f) => f.id)).toEqual(['journey:POST /contracts/'])
    expect(scenes[0].title.pt).toBe('O usuário cria um contrato')
  })
})

describe('analyzeRepository', () => {
  /** A fake GitHub: the CRM repo, served the way the REST and GraphQL endpoints would. */
  function fakeClient(log: string[]): GitHubClient {
    const tree = crmFixture.tree
    return {
      get: async <T,>(path: string) => {
        log.push(`GET ${path}`)
        if (path === '/repos/acme/crm') return { data: { default_branch: 'main', private: true } as unknown as T, next: false }
        if (path.startsWith('/repos/acme/crm/commits/')) return { data: { sha: 'abc123' } as unknown as T, next: false }
        if (path === '/repos/acme/crm/git/trees/abc123') return { data: { tree, truncated: false } as unknown as T, next: false }
        throw new Error('unexpected ' + path)
      },
      graphql: async <T,>(query: string) => {
        log.push('GRAPHQL')
        const repository: Record<string, unknown> = {}
        for (const m of query.matchAll(/f(\d+): object\(expression: "abc123:([^"]+)"\)/g)) {
          const text = crmFixture.files.get(m[2])
          repository[`f${m[1]}`] = text === undefined ? null : { text, isBinary: false }
        }
        return { repository } as T
      },
    }
  }

  it('reads the default branch, the tree and the files, reporting progress in order', async () => {
    const log: string[] = []
    const stages: string[] = []
    const onProgress: Progress = (e) => stages.push(e.stage)
    const model = await analyzeRepository(fakeClient(log), 'acme', 'crm', undefined, onProgress)
    expect(model.repo).toEqual({ owner: 'acme', name: 'crm', branch: 'main', sha: 'abc123', private: true, description: null })
    expect(model.components.length).toBeGreaterThanOrEqual(8)
    expect(model.flows.length).toBeGreaterThan(0)
    expect(stages[0]).toBe('tree')
    expect(stages).toContain('files')
    expect(stages.indexOf('graph')).toBeGreaterThan(stages.indexOf('files'))
    expect(stages[stages.length - 1]).toBe('flows')
    expect(log).toContain('GET /repos/acme/crm/git/trees/abc123')
  })

  it('reads the branch that was asked for, and encodes it', async () => {
    const log: string[] = []
    const client: GitHubClient = fakeClient(log)
    await analyzeRepository(client, 'acme', 'crm', 'feat/studio', () => {}).catch(() => undefined)
    expect(log.some((l) => l === 'GET /repos/acme/crm/commits/feat%2Fstudio')).toBe(true)
  })

  it('keeps the repo description from GitHub in the model', async () => {
    const base = fakeClient([])
    const client: GitHubClient = {
      ...base,
      get: async <T,>(path: string) => {
        if (path === '/repos/acme/crm') return { data: { default_branch: 'main', private: true, description: 'CRM de leads.' } as unknown as T, next: false }
        return base.get<T>(path)
      },
    }
    const model = await analyzeRepository(client, 'acme', 'crm', undefined, () => {})
    expect(model.repo.description).toBe('CRM de leads.')
  })
})

describe('buildModel: README and database', () => {
  it('does not count a database named only in the README as a database service', () => {
    const model = buildModel({
      repo: { owner: 'acme', name: 'leads', branch: 'main', sha: 's', private: false },
      tree: [{ path: 'README.md', type: 'blob' }, { path: 'app/main.py', type: 'blob' }],
      files: new Map([
        ['README.md', '# Leads\n\nGuarda tudo no PostgreSQL.\n'],
        ['app/main.py', 'from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get("/leads")\ndef leads():\n    return []\n'],
      ]),
      truncated: false,
    })
    expect(model.externals.some((e) => e.kind === 'database')).toBe(false)
    expect(model.externals.some((e) => e.name === 'PostgreSQL')).toBe(false)
  })

  it('opens the summary with the first sentence of the README', () => {
    const model = buildModel({
      repo: { owner: 'acme', name: 'leads', branch: 'main', sha: 's', private: false },
      tree: [{ path: 'README.md', type: 'blob' }, { path: 'app/main.py', type: 'blob' }],
      files: new Map([
        ['README.md', '# Leads\n\nGestor de leads para equipes comerciais.\n\n## Funcionalidades\n\n- Cadastro de leads\n'],
        ['app/main.py', 'from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get("/leads")\ndef leads():\n    return []\n'],
      ]),
      truncated: false,
    })
    expect(model.summary.pt.startsWith('Gestor de leads para equipes comerciais. ')).toBe(true)
    expect(model.summary.en.startsWith('Gestor de leads para equipes comerciais. ')).toBe(true)
  })
})

describe('buildModel: repartments.json (the author\'s script)', () => {
  /** The CRM fixture with a `repartments.json` at the root that says what the system is. */
  const withRootScript = (): SourceInput => ({
    ...crmFixture,
    tree: [...crmFixture.tree, { path: 'repartments.json', type: 'blob', size: 100 }],
    files: new Map([...crmFixture.files, ['repartments.json', JSON.stringify({ version: 1, about: 'Frase do autor.' })]]),
  })

  it('takes the root script as the author\'s words, and says where it came from', () => {
    const model = buildModel(withRootScript())
    expect(model.authored?.source).toBe('repo')
    expect(model.summary.pt).toBe('Frase do autor.')
  })

  it('prefers an imported script over the one at the root', () => {
    const model = buildModel({ ...withRootScript(), authored: JSON.stringify({ version: 1, about: 'Frase importada.' }) })
    expect(model.authored?.source).toBe('import')
    expect(model.summary.pt).toBe('Frase importada.')
  })

  it('does not analyse the script as code: the parts are the same as without it, and it appears in no part or file', () => {
    const withScript = buildModel(withRootScript())
    const without = buildModel(crmFixture)
    const names = (m: ArchitectureModel) => m.components.map((c) => c.name).sort()
    expect(names(withScript)).toEqual(names(without))
    expect(JSON.stringify(withScript.components)).not.toContain('repartments.json')
  })

  it('has no authored part when there is no script', () => {
    expect(buildModel(crmFixture).authored).toBeUndefined()
  })
})
