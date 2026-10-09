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

  it('tells the story: the assistant first, then the request to create a lead, then the background job', () => {
    expect(model.flows.map((f) => f.id)).toEqual(['agent:backend/src/agent/support.ts', 'request:POST /leads', 'job'])
    expect(model.flows[1].title).toEqual({ pt: 'Criar leads', en: 'Create leads' })
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
    expect(model.summary.pt).toContain('crm é um sistema escrito em TypeScript')
    expect(model.summary.pt).toContain('PostgreSQL')
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
    expect(model.summary.pt).toBe('empty é um sistema.')
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
    expect(model.repo).toEqual({ owner: 'acme', name: 'crm', branch: 'main', sha: 'abc123', private: true })
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
})
