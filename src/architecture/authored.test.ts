import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyAuthored, exportAuthored, parseAuthored } from './authored'
import { buildModel } from './index'
import { crmFixture } from './fixtures'

const paths = new Set(crmFixture.tree.map((e) => e.path))
const roteiro = (o: Record<string, unknown>) => JSON.stringify({ version: 1, ...o })

describe('parseAuthored', () => {
  it('aceita JSON puro', () => {
    const r = parseAuthored(roteiro({ about: 'Um CRM.' }), paths)
    expect(r.script).not.toBeNull()
    expect(r.script?.version).toBe(1)
  })

  it('aceita um bloco ```json com texto em volta', () => {
    const texto = 'Aqui está o roteiro:\n```json\n' + roteiro({ about: 'Um CRM.' }) + '\n```\nQualquer dúvida, avise.'
    const r = parseAuthored(texto, paths)
    expect(r.script).not.toBeNull()
    expect(r.script?.about).toEqual({ pt: 'Um CRM.', en: 'Um CRM.' })
  })

  it('recusa JSON inválido com problema de nível error', () => {
    const r = parseAuthored('{ isto não é json', paths)
    expect(r.script).toBeNull()
    expect(r.problems[0].level).toBe('error')
  })

  it('recusa um JSON que não é objeto', () => {
    const r = parseAuthored('[1]', paths)
    expect(r.script).toBeNull()
    expect(r.problems[0].level).toBe('error')
  })

  it('recusa uma versão mais nova que a lida (version 2)', () => {
    const r = parseAuthored('{"version":2}', paths)
    expect(r.script).toBeNull()
    expect(r.problems[0].level).toBe('error')
  })

  it('recusa um texto maior que 200 KB', () => {
    const texto = '{"version":1,"about":"' + 'a'.repeat(200 * 1024) + '"}'
    const r = parseAuthored(texto, paths)
    expect(r.script).toBeNull()
    expect(r.problems[0].level).toBe('error')
  })

  it('vira {pt, en} iguais quando o texto é uma string', () => {
    const r = parseAuthored(roteiro({ parts: [{ id: 'tela', name: 'Tela de leads' }] }), paths)
    expect(r.script?.parts[0].name).toEqual({ pt: 'Tela de leads', en: 'Tela de leads' })
  })

  it('preenche o en com o pt quando o objeto só tem pt', () => {
    const r = parseAuthored(roteiro({ parts: [{ id: 'tela', name: { pt: 'Tela de leads' } }] }), paths)
    expect(r.script?.parts[0].name).toEqual({ pt: 'Tela de leads', en: 'Tela de leads' })
  })

  it('corta o nome de parte de 100 caracteres para no máximo 28', () => {
    const r = parseAuthored(roteiro({ parts: [{ id: 'tela', name: 'x'.repeat(100) }] }), paths)
    expect(r.script?.parts[0].name.pt.length).toBeLessThanOrEqual(28)
    expect(r.script?.parts[0].name.en.length).toBeLessThanOrEqual(28)
  })

  it('deixa de fora parte sem id ou sem name, com aviso', () => {
    const r = parseAuthored(roteiro({ parts: [{ name: 'Sem id' }, { id: 'semnome' }] }), paths)
    expect(r.script?.parts).toHaveLength(0)
    expect(r.problems.filter((p) => p.level === 'warning')).toHaveLength(2)
  })

  it('troca papel de parte desconhecido por null, com aviso', () => {
    const r = parseAuthored(roteiro({ parts: [{ id: 'p', name: 'P', role: 'wizard' }] }), paths)
    expect(r.script?.parts[0].role).toBeNull()
    expect(r.problems.some((p) => p.level === 'warning' && p.where === 'parts[0].role')).toBe(true)
  })

  it('troca papel de personagem desconhecido por service, com aviso, e ação desconhecida por call', () => {
    const r = parseAuthored(
      roteiro({
        scenes: [
          {
            title: 'Cena',
            cast: [
              { id: 'u', name: 'U', role: 'wizard' },
              { id: 'v', name: 'V', role: 'person' },
            ],
            steps: [{ from: 'u', to: 'v', action: 'teleport', text: 'Oi' }],
          },
        ],
      }),
      paths,
    )
    const scene = r.script?.scenes[0]
    expect(scene?.actors[0].kind).toBe('service')
    expect(scene?.steps[0].action).toBe('call')
    expect(r.problems.some((p) => p.level === 'warning' && p.where === 'scenes[0].cast[0].role')).toBe(true)
    expect(r.problems.some((p) => p.level === 'warning' && p.where === 'scenes[0].steps[0].action')).toBe(true)
  })

  it('deixa de fora passo com from ou to fora do elenco', () => {
    const r = parseAuthored(
      roteiro({
        scenes: [
          {
            title: 'Cena',
            cast: [
              { id: 'u', name: 'U' },
              { id: 'v', name: 'V' },
            ],
            steps: [
              { from: 'u', to: 'v', text: 'Válido' },
              { from: 'u', to: 'zz', text: 'Fora do elenco' },
            ],
          },
        ],
      }),
      paths,
    )
    expect(r.script?.scenes[0].steps).toHaveLength(1)
    expect(r.script?.scenes[0].steps[0].text.pt).toBe('Válido')
  })

  it('deixa de fora cena sem passos', () => {
    const r = parseAuthored(
      roteiro({
        scenes: [{ title: 'Vazia', cast: [{ id: 'u', name: 'U' }], steps: [] }],
      }),
      paths,
    )
    expect(r.script?.scenes).toHaveLength(0)
    expect(r.problems.some((p) => p.level === 'warning' && p.where === 'scenes[0]')).toBe(true)
  })

  it('ignora caminho com .. ou absoluto (/etc/x, C:/x), com aviso', () => {
    const r = parseAuthored(roteiro({ parts: [{ id: 'p', name: 'P', paths: ['../etc/x', '/etc/x', 'C:/x'] }] }), paths)
    expect(r.script?.parts[0].paths).toEqual([])
    expect(r.problems.filter((p) => p.level === 'warning' && p.message.pt.includes('fora do repositório'))).toHaveLength(3)
  })

  it('conta arquivo inexistente em unverified e tira o ref do passo', () => {
    const r = parseAuthored(
      roteiro({
        scenes: [
          {
            title: 'Cena',
            cast: [
              { id: 'u', name: 'U' },
              { id: 'v', name: 'V' },
            ],
            steps: [{ from: 'u', to: 'v', text: 'Oi', file: 'nao/existe.ts', line: 3 }],
          },
        ],
      }),
      paths,
    )
    expect(r.unverified).toBe(1)
    expect(r.verified).toBe(0)
    expect(r.script?.scenes[0].steps[0].ref).toBeUndefined()
  })

  it('conta arquivo existente em verified e mantém o ref do passo', () => {
    const r = parseAuthored(
      roteiro({
        scenes: [
          {
            title: 'Cena',
            cast: [
              { id: 'u', name: 'U' },
              { id: 'v', name: 'V' },
            ],
            steps: [{ from: 'u', to: 'v', text: 'Oi', file: 'backend/src/routes/leads.ts', line: 11 }],
          },
        ],
      }),
      paths,
    )
    expect(r.verified).toBe(1)
    expect(r.unverified).toBe(0)
    expect(r.script?.scenes[0].steps[0].ref).toEqual({ file: 'backend/src/routes/leads.ts', line: 11 })
  })

  it('sem lista de caminhos (null) conta tudo como unverified e mantém o ref', () => {
    const r = parseAuthored(
      roteiro({
        parts: [{ id: 'p', name: 'P', paths: ['backend/src/routes'] }],
        scenes: [
          {
            title: 'Cena',
            cast: [
              { id: 'u', name: 'U' },
              { id: 'v', name: 'V' },
            ],
            steps: [{ from: 'u', to: 'v', text: 'Oi', file: 'qualquer/coisa.ts', line: 4 }],
          },
        ],
      }),
      null,
    )
    expect(r.verified).toBe(0)
    expect(r.unverified).toBe(2)
    expect(r.script?.scenes[0].steps[0].ref).toEqual({ file: 'qualquer/coisa.ts', line: 4 })
  })

  it('lê o exemplo docs/exemplos/repartments.json sem problemas', () => {
    const texto = readFileSync('docs/exemplos/repartments.json', 'utf8')
    const r = parseAuthored(texto, paths)
    expect(r.problems).toEqual([])
    expect(r.unverified).toBe(0)
    expect(r.script?.scenes.length).toBe(2)
  })
})

describe('parseAuthored: feature names', () => {
  it('drops the emoji and arrows in front of a feature name, as the features read from the code do', () => {
    const r = parseAuthored(JSON.stringify({ version: 1, features: [{ name: { pt: '▶ Passo a passo', en: '▶ Step by step' }, does: 'Roda.', how: 'button' }] }), null)
    expect(r.script?.features[0].text?.label).toEqual({ pt: 'Passo a passo', en: 'Step by step' })
  })
})

describe('applyAuthored', () => {
  const model = buildModel(crmFixture)
  const parts = [
    { id: 'tela', name: 'Tela de leads', role: 'screen', paths: ['frontend/src/pages'] },
    { id: 'api', name: 'API de leads', role: 'api', paths: ['backend/src/routes'] },
  ]
  const cena = {
    title: 'Criar lead',
    cast: [
      { id: 'tela', part: 'tela' },
      { id: 'api', part: 'api' },
    ],
    steps: [{ from: 'tela', to: 'api', action: 'send', text: 'Envia o lead', file: 'frontend/src/pages/LeadsPage.tsx', line: 20 }],
  }

  it('põe o about no summary do modelo', () => {
    const out = applyAuthored(model, parseAuthored(roteiro({ about: 'Um CRM de leads.' }), paths), 'repo')
    expect(out.summary).toEqual({ pt: 'Um CRM de leads.', en: 'Um CRM de leads.' })
  })

  it('renomeia o componente que cobre o caminho da parte', () => {
    const out = applyAuthored(model, parseAuthored(roteiro({ parts }), paths), 'repo')
    const routes = model.components.find((c) => c.name === 'Backend Routes')
    expect(routes).toBeDefined()
    const renamed = out.components.find((c) => c.id === routes?.id)
    expect(renamed?.label).toEqual({ pt: 'API de leads', en: 'API de leads' })
  })

  it('substitui as cenas e guarda as antigas em automatic', () => {
    const out = applyAuthored(model, parseAuthored(roteiro({ parts, scenes: [cena] }), paths), 'repo')
    expect(out.flows).toHaveLength(1)
    expect(out.flows[0].title.pt).toBe('Criar lead')
    expect(out.automatic).toEqual(model.flows)
  })

  it('arquivo só com parts mantém as cenas lidas do código', () => {
    const out = applyAuthored(model, parseAuthored(roteiro({ parts }), paths), 'repo')
    expect(out.flows).toEqual(model.flows)
    expect(out.automatic).toBeUndefined()
  })

  it('marca stale quando o commit do roteiro difere do commit do repo', () => {
    const out = applyAuthored(model, parseAuthored(roteiro({ commit: 'ffffff0', parts }), paths), 'repo')
    expect(out.authored?.stale).toBe(true)
  })

  it('não marca stale quando o commit do roteiro é prefixo do commit do repo', () => {
    const out = applyAuthored(model, parseAuthored(roteiro({ commit: 'a1b2c3d', parts }), paths), 'repo')
    expect(out.authored?.stale).toBe(false)
  })

  it('não põe dois personagens da mesma cena no mesmo componente', () => {
    const script = parseAuthored(
      roteiro({
        parts: [
          { id: 'leads-rota', name: 'Rota de leads', paths: ['backend/src/routes/leads.ts'] },
          { id: 'assist-rota', name: 'Rota do assistente', paths: ['backend/src/routes/assistant.ts'] },
        ],
        scenes: [
          {
            title: 'Duas rotas',
            cast: [
              { id: 'a', part: 'leads-rota' },
              { id: 'b', part: 'assist-rota' },
            ],
            steps: [{ from: 'a', to: 'b', text: 'Chama' }],
          },
        ],
      }),
      paths,
    )
    const out = applyAuthored(model, script, 'repo')
    const [a, b] = out.flows[0].actors
    expect(a.component).not.toBeNull()
    expect(a.component).not.toBe(b.component)
  })
})

describe('exportAuthored', () => {
  it('exporta um roteiro que lê de volta sem problemas', () => {
    const model = buildModel(crmFixture)
    const r = parseAuthored(exportAuthored(model, model.flows), paths)
    expect(r.problems).toHaveLength(0)
    expect(r.script).not.toBeNull()
  })
})
