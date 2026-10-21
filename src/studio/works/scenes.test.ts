import { describe, expect, it } from 'vitest'
import { buildTour } from '../../scene/tour'
import type { CommitDetail } from '../../shared/studio'
import { sampleCommit, sampleModel } from '../map/sample'
import { activityFlow, authorColor, authorName, commitFlow, readMessage, sizeOf } from './scenes'

const commit = (over: Partial<CommitDetail>): CommitDetail => ({ ...sampleCommit, ...over })

describe('commitFlow', () => {
  it('has the author visit every part the commit changed, busiest first', () => {
    const { flow, heat } = commitFlow(sampleCommit, sampleModel, 'pt')
    expect(flow.kind).toBe('commit')
    expect(flow.actors[0]).toMatchObject({ id: 'author', kind: 'person', name: { pt: '@ana' } })
    const visits = flow.steps.filter((s) => s.action === 'save')
    expect(visits).toHaveLength(3)
    // The assistant's file changed the most (+20 −4), so it comes first and is the hottest room.
    const first = flow.actors.find((a) => a.id === visits[0].to)!
    expect(first.component).toBe('backend/agents/assistente')
    expect(heat[first.id]).toBe(1)
    expect(visits[0].text.pt).toBe(`@ana mexe em ${first.name.pt}: mudança média (1 arquivo)`)
    expect(visits[0].say?.pt).toBe('mudança média')
    expect(flow.steps[0].text.pt).toBe('@ana traz uma mudança: “Acrescenta retorno automático ao assistente”')
    expect(flow.steps.at(-1)!.text.pt).toBe('Pronto! 3 arquivos mudaram em 3 partes do sistema')
    // No line counts anywhere a lay audience reads them.
    for (const st of flow.steps) expect(st.text.pt).not.toMatch(/[+−]\d/)
  })

  it('tells new and deleted files apart, and names files outside every part', () => {
    const { flow } = commitFlow(
      commit({
        files: [
          { path: 'backend/agents/assistente/novo.py', previousPath: null, status: 'added', additions: 10, deletions: 0, patch: null, truncated: false },
          { path: 'README.md', previousPath: null, status: 'modified', additions: 1, deletions: 1, patch: null, truncated: false },
        ],
      }),
      sampleModel,
    )
    expect(flow.steps[1].text.pt).toMatch(/^@ana cria 1 arquivo em /)
    expect(flow.steps[1].say?.pt).toBe('novo!')
    expect(flow.actors.some((a) => a.name.pt === 'Outros arquivos')).toBe(true)
  })

  it('makes a scene the renderer can play, with warmer walls where more changed', () => {
    const { flow, heat } = commitFlow(sampleCommit, sampleModel, 'en')
    const flat = buildTour(flow, 'en', { heat, label: { name: '@ana', color: authorColor('ana') } })
    expect(flat.stories.main.captions).toHaveLength(flow.steps.length)
    expect(flat.language.name).toBe('@ana')
    const hottest = flat.layout.rooms.find((r) => heat[r.id] === 1)!
    const coolest = flat.layout.rooms.find((r) => heat[r.id] !== undefined && heat[r.id] < 0.5)!
    expect(hottest.wall).not.toBe(coolest.wall)
  })

  it('names a merge as bringing a branch in, and an author without an account by name', () => {
    const { flow } = commitFlow(commit({ parents: 2, author: { name: 'Bia', login: null, avatarUrl: null } }), sampleModel, 'pt')
    expect(flow.steps[0].text.pt).toMatch(/^Bia junta o trabalho de outro ramo/)
    expect(authorName(commit({ author: { name: 'Bia', login: null, avatarUrl: null } }))).toBe('Bia')
  })
})

describe('readMessage', () => {
  it('turns the usual commit prefixes into what they mean', () => {
    expect(readMessage('fix(api): handle empty carts')).toEqual({ kind: { en: 'a fix', pt: 'uma correção' }, text: 'Handle empty carts' })
    expect(readMessage('feat!: dark mode').kind.pt).toBe('uma novidade')
    expect(readMessage('Atualiza o README')).toEqual({ kind: { en: 'a change', pt: 'uma mudança' }, text: 'Atualiza o README' })
    expect(readMessage('wip: thing').kind.pt).toBe('uma mudança')
  })

  it('says how big a change is in words', () => {
    expect(sizeOf(5).pt).toBe('mudança pequena')
    expect(sizeOf(80).pt).toBe('mudança média')
    expect(sizeOf(900).pt).toBe('mudança grande')
  })
})

describe('activityFlow', () => {
  it('adds up several commits and visits the parts that changed the most', () => {
    const other = commit({
      sha: 'ffff000011112222',
      files: [{ path: 'backend/services/clientes/servico.py', previousPath: null, status: 'modified', additions: 50, deletions: 10, patch: null, truncated: false }],
    })
    const result = activityFlow([sampleCommit, other], sampleModel)!
    expect(result.flow.kind).toBe('activity')
    const first = result.flow.actors.find((a) => a.id === result.flow.steps[1].to)!
    expect(first.component).toBe('backend/services/clientes')
    expect(result.flow.steps[1].text.pt).toBe(`A mais movimentada: ${first.name.pt}, mexida em 2 commits`)
    expect(result.flow.steps[0].text.pt).toBe('Nos últimos 2 commits, estas foram as partes que mais mudaram')
  })

  it('is empty without changes', () => {
    expect(activityFlow([], sampleModel)).toBeNull()
  })
})
