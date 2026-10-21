import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseAuthored } from '../architecture/authored'
import { buildModel } from '../architecture'
import { crmFixture } from '../architecture/fixtures'
import { AUTHOR_PROMPT, authorPrompt, fixPrompt } from './authorPrompt'

const paths = new Set(crmFixture.tree.map((e) => e.path))

/** The draft inside the prompt: the text between the last "```json" line and the closing "```". */
function draftOf(prompt: string): string {
  const open = prompt.lastIndexOf('```json')
  const rest = prompt.slice(open + '```json'.length)
  return rest.slice(0, rest.lastIndexOf('```')).trim()
}

describe('authorPrompt', () => {
  it('fills repo, branch and commit, and leaves no placeholder behind', () => {
    const prompt = authorPrompt(buildModel(crmFixture))
    expect(prompt).toContain('acme/crm')
    expect(prompt).toContain('main')
    expect(prompt).toContain('a1b2c3d')
    expect(prompt).not.toContain('{{')
  })

  it('writes a draft that parseAuthored accepts without errors', () => {
    const prompt = authorPrompt(buildModel(crmFixture))
    const result = parseAuthored(draftOf(prompt), paths)
    expect(result.script).not.toBeNull()
    expect(result.problems.filter((p) => p.level === 'error')).toEqual([])
  })

  it('is written into docs/roteiro.md in full', () => {
    const doc = fs.readFileSync(path.resolve(process.cwd(), 'docs/roteiro.md'), 'utf8')
    expect(doc).toContain(AUTHOR_PROMPT)
  })
})

describe('fixPrompt', () => {
  const problems = [
    { where: 'parts[0]', level: 'warning' as const, message: { pt: 'Parte ignorada', en: 'Part left out' } },
    { where: '', level: 'error' as const, message: { pt: 'Erro X', en: 'Error X' } },
  ]

  it('lists every problem in Portuguese', () => {
    const text = fixPrompt(problems, 'pt')
    expect(text).toContain('parts[0]: Parte ignorada')
    expect(text).toContain('Erro X')
  })

  it('lists every problem in English', () => {
    const text = fixPrompt(problems, 'en')
    expect(text).toContain('Part left out')
    expect(text).toContain('Error X')
  })
})
