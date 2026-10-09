import { describe, expect, it } from 'vitest'
import { blobQuery, graphqlString, readFiles, BATCH } from './fetch'
import { isTestPath, MAX_FILES, MAX_FILE_BYTES, selectFiles, type TreeEntry } from './select'
import { GitHubClient, StudioFailure } from '../github/client'

const blob = (path: string, size = 100): TreeEntry => ({ path, type: 'blob', size })

describe('selectFiles', () => {
  it('keeps source, manifests and prompt files, and drops everything else', () => {
    const { paths, truncated } = selectFiles([
      blob('src/app.ts'),
      blob('src/style.css'),
      blob('package.json'),
      blob('backend/requirements-dev.txt'),
      blob('docker-compose.yml'),
      blob('docs/prompts/system.md'),
      blob('docs/guide.md'),
      blob('assets/logo.png'),
      blob('package-lock.json'),
      blob('dist/bundle.js'),
      blob('src/types.d.ts'),
      blob('src/vendor.min.js'),
    ])
    expect(paths.sort()).toEqual(['backend/requirements-dev.txt', 'docker-compose.yml', 'docs/prompts/system.md', 'package.json', 'src/app.ts'])
    expect(truncated).toBe(false)
  })

  it('never reads folders that hold generated or vendored code', () => {
    const excluded = [
      'node_modules/x/index.js',
      'frontend/node_modules/x.ts',
      '.next/server/a.js',
      'venv/lib/site.py',
      '.venv/x.py',
      'backend/__pycache__/x.py',
      'target/classes/A.java',
      'web/public/app.js',
      'static/vendor/lib.js',
      'bin/tool.go',
      'build/out.js',
      '.git/hooks/x.py',
    ]
    expect(selectFiles(excluded.map((p) => blob(p))).paths).toEqual([])
  })

  it('never reads secrets, keys or lockfiles', () => {
    const secrets = ['.env', '.env.local', 'config/server.pem', 'config/app.key', 'secrets.ts', 'src/credentials.ts', 'yarn.lock', 'poetry.lock']
    expect(selectFiles(secrets.map((p) => blob(p))).paths).toEqual([])
  })

  it('leaves out files over 200 KB and blobs that are not files', () => {
    const { paths } = selectFiles([blob('src/big.ts', 300 * 1024), blob('src/ok.ts', 10), { path: 'src', type: 'tree' }])
    expect(paths).toEqual(['src/ok.ts'])
  })

  it('puts manifests first, then shallow source, then tests last', () => {
    const { paths } = selectFiles([
      blob('src/deep/er/a.ts'),
      blob('tests/unit/a.test.ts'),
      blob('src/b.ts'),
      blob('package.json'),
      blob('src/prompts/p.md'),
    ])
    expect(paths.slice(0, 2).sort()).toEqual(['package.json', 'src/prompts/p.md'])
    expect(paths[2]).toBe('src/b.ts')
    expect(paths[paths.length - 1]).toBe('tests/unit/a.test.ts')
  })

  it('reports truncation when the file budget is spent', () => {
    const tree = Array.from({ length: MAX_FILES + 5 }, (_, i) => blob(`src/f${i}.ts`, 1))
    const { paths, truncated } = selectFiles(tree)
    expect(paths).toHaveLength(MAX_FILES)
    expect(truncated).toBe(true)
  })

  it('reports truncation when the byte budget is spent', () => {
    // 200 KB files: 35 of them fit in 7 MB, the 36th does not.
    const tree = Array.from({ length: 40 }, (_, i) => blob(`src/f${i}.ts`, MAX_FILE_BYTES))
    const { paths, truncated } = selectFiles(tree)
    expect(paths).toHaveLength(35)
    expect(truncated).toBe(true)
  })

  it('tolerates a tree that is not what it should be', () => {
    expect(selectFiles([{ path: 42 as unknown as string, type: 'blob' }, blob('src/x.ts', -5)]).paths).toEqual(['src/x.ts'])
  })
})

describe('isTestPath', () => {
  it('recognises test folders and test file names in each language', () => {
    expect(isTestPath('src/__tests__/a.ts')).toBe(true)
    expect(isTestPath('app/spec/a.rb')).toBe(true)
    expect(isTestPath('src/a.spec.tsx')).toBe(true)
    expect(isTestPath('pkg/test_x.py')).toBe(true)
    expect(isTestPath('pkg/x_test.go')).toBe(true)
    expect(isTestPath('src/testing.ts')).toBe(false)
  })
})

describe('graphqlString', () => {
  it('escapes backslashes, quotes and control characters so a path cannot end the literal', () => {
    expect(graphqlString('a"b')).toBe('"a\\"b"')
    expect(graphqlString('C:\\x\\y')).toBe('"C:\\\\x\\\\y"')
    expect(graphqlString('line\nbreak\u0001')).toBe('"line\\nbreak\\u0001"')
    expect(graphqlString('src/ação.ts')).toBe('"src/ação.ts"')
  })

  it('builds a query with one alias per path, and the expression as a literal', () => {
    const q = blobQuery('abc', ['src/a"b.ts', 'x.ts'])
    expect(q).toContain('f0: object(expression: "abc:src/a\\"b.ts")')
    expect(q).toContain('f1: object(expression: "abc:x.ts")')
  })
})

describe('readFiles', () => {
  it('reads texts in batches, skips binary and missing blobs, and reports progress', async () => {
    const paths = Array.from({ length: BATCH + 2 }, (_, i) => `src/f${i}.ts`)
    const calls: string[] = []
    const client: GitHubClient = {
      get: async () => {
        throw new Error('not used')
      },
      graphql: async <T,>(query: string) => {
        calls.push(query)
        const repository: Record<string, unknown> = {}
        const names = [...query.matchAll(/f(\d+): object/g)].map((m) => Number(m[1]))
        for (const i of names) {
          if (i === 1) repository[`f${i}`] = { text: null, isBinary: true }
          else if (i === 2) repository[`f${i}`] = null
          else repository[`f${i}`] = { text: `// ${i}`, isBinary: false }
        }
        return { repository } as T
      },
    }
    const progress: number[] = []
    const files = await readFiles(client, 'acme', 'crm', 'sha', paths, (done) => progress.push(done))
    expect(calls).toHaveLength(2)
    expect(files.has('src/f1.ts')).toBe(false)
    expect(files.has('src/f2.ts')).toBe(false)
    expect(files.get('src/f0.ts')).toBe('// 0')
    expect(progress[progress.length - 1]).toBe(paths.length)
  })

  it('keeps going past a GitHub hiccup but stops for the signed-in person\u2019s own failures', async () => {
    const client = (failure: StudioFailure): GitHubClient => ({
      get: async () => {
        throw failure
      },
      graphql: async () => {
        throw failure
      },
    })
    await expect(readFiles(client(new StudioFailure('unavailable')), 'a', 'b', 's', ['x.ts'], () => {})).resolves.toEqual(new Map())
    await expect(readFiles(client(new StudioFailure('signed-out')), 'a', 'b', 's', ['x.ts'], () => {})).rejects.toBeInstanceOf(StudioFailure)
  })
})
