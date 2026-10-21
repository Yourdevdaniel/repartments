import { describe, expect, it } from 'vitest'
import { createResolver } from './resolve'

/** A resolver over a list of paths, with optional file texts (for tsconfig and go.mod). */
function repo(paths: string[], texts: Record<string, string> = {}) {
  return createResolver(paths, new Map(Object.entries(texts)))
}

describe('JavaScript and TypeScript resolution', () => {
  const r = repo(['src/app/leads.ts', 'src/app/index.ts', 'src/lib/util.tsx', 'src/esm.ts', 'src/main.ts', 'src/styles.css', 'frontend/src/lib/format.ts', 'frontend/src/pages/A.tsx'])

  it('resolves relative paths: exact, extensions, index files, and ESM .js to .ts', () => {
    expect(r('src/main.ts', './app/leads')).toEqual({ file: 'src/app/leads.ts' })
    expect(r('src/main.ts', './app')).toEqual({ file: 'src/app/index.ts' })
    expect(r('src/app/leads.ts', '../lib/util')).toEqual({ file: 'src/lib/util.tsx' })
    expect(r('src/main.ts', './esm.js')).toEqual({ file: 'src/esm.ts' })
    expect(r('src/main.ts', './styles.css')).toEqual({ file: 'src/styles.css' })
  })

  it('returns null for a relative import of a file that is not in the repo', () => {
    expect(r('src/main.ts', './missing')).toBeNull()
  })

  it('falls back to the nearest src folder for @/ and ~/ without a tsconfig', () => {
    expect(r('frontend/src/pages/A.tsx', '@/lib/format')).toEqual({ file: 'frontend/src/lib/format.ts' })
    expect(r('frontend/src/pages/A.tsx', '@/missing')).toBeNull()
  })

  it('maps bare specifiers to packages and scopes, and skips Node built-ins', () => {
    expect(r('src/main.ts', '@nestjs/core/x')).toEqual({ package: '@nestjs/core' })
    expect(r('src/main.ts', 'lodash/fp')).toEqual({ package: 'lodash' })
    expect(r('src/main.ts', 'react')).toEqual({ package: 'react' })
    expect(r('src/main.ts', 'node:fs')).toBeNull()
    expect(r('src/main.ts', 'fs/promises')).toBeNull()
    expect(r('src/main.ts', 'https://cdn.example.com/x.js')).toBeNull()
  })

  it('reads tsconfig paths with comments and trailing commas, and never throws on a broken one', () => {
    const tsconfig = `{
      // the aliases
      "compilerOptions": {
        /* base */
        "baseUrl": ".",
        "paths": { "@/*": ["./src/*"], },
      },
    }`
    const withAlias = repo(['src/main.ts', 'src/lib/util.tsx', 'tsconfig.json'], { 'tsconfig.json': tsconfig })
    expect(withAlias('src/main.ts', '@/lib/util')).toEqual({ file: 'src/lib/util.tsx' })
    const broken = repo(['src/main.ts', 'tsconfig.json'], { 'tsconfig.json': '{ not json' })
    expect(broken('src/main.ts', '@/lib/util')).toBeNull()
  })

  it('uses the tsconfig closest to the importer', () => {
    const r2 = repo(
      ['web/pages/x.ts', 'web/app/lib/util.ts', 'src/lib/util.ts', 'web/tsconfig.json', 'tsconfig.json'],
      {
        'web/tsconfig.json': '{"compilerOptions":{"paths":{"~/*":["./app/*"]}}}',
        'tsconfig.json': '{"compilerOptions":{"paths":{"~/*":["./src/*"]}}}',
      },
    )
    expect(r2('web/pages/x.ts', '~/lib/util')).toEqual({ file: 'web/app/lib/util.ts' })
  })
})

describe('Python resolution', () => {
  const paths = [
    'backend/crm/__init__.py',
    'backend/crm/leads/__init__.py',
    'backend/crm/leads/views.py',
    'backend/crm/leads/models.py',
    'backend/crm/leads/api.py',
    'backend/crm/core/utils.py',
    'app/utils.py',
    'lib/utils.py',
    'lib/a/b.py',
  ]
  const r = repo(paths)

  it('resolves absolute dotted names through the suffix index', () => {
    expect(r('backend/crm/leads/api.py', 'crm.leads.views')).toEqual({ file: 'backend/crm/leads/views.py' })
    expect(r('backend/crm/leads/api.py', 'leads.views')).toEqual({ file: 'backend/crm/leads/views.py' })
  })

  it('takes the longest module prefix, so a class name after a module resolves to the module', () => {
    expect(r('backend/crm/leads/api.py', 'crm.leads.models.Lead')).toEqual({ file: 'backend/crm/leads/models.py' })
  })

  it('resolves relative imports from the importer package', () => {
    expect(r('backend/crm/leads/api.py', '.models')).toEqual({ file: 'backend/crm/leads/models.py' })
    expect(r('backend/crm/leads/api.py', '.')).toEqual({ file: 'backend/crm/leads/__init__.py' })
    expect(r('backend/crm/leads/api.py', '..core.utils')).toEqual({ file: 'backend/crm/core/utils.py' })
  })

  it('breaks ties between same-named modules by the folder shared with the importer', () => {
    expect(r('lib/a/b.py', 'utils')).toEqual({ file: 'lib/utils.py' })
    expect(r('app/c.py', 'utils')).toEqual({ file: 'app/utils.py' })
  })

  it('treats the standard library as nothing and other unknown top names as packages', () => {
    expect(r('backend/crm/leads/api.py', 'os.path')).toBeNull()
    expect(r('backend/crm/leads/api.py', 'json')).toBeNull()
    expect(r('backend/crm/leads/api.py', 'django.db')).toEqual({ package: 'django' })
    expect(r('backend/crm/leads/api.py', 'requests')).toEqual({ package: 'requests' })
  })

  it('does not call a local package a third-party one when the module is missing', () => {
    expect(r('backend/crm/leads/api.py', 'crm.missing_module')).toEqual({ file: 'backend/crm/__init__.py' })
  })
})

describe('other languages', () => {
  it('resolves Go imports under the module path, and treats other paths as packages', () => {
    const r = repo(['main.go', 'internal/db/db.go', 'internal/db/db_test.go', 'go.mod'], { 'go.mod': 'module github.com/acme/app\n\ngo 1.22\n' })
    expect(r('main.go', 'github.com/acme/app/internal/db')).toEqual({ file: 'internal/db/db.go' })
    expect(r('main.go', 'fmt')).toBeNull()
    expect(r('main.go', 'github.com/gin-gonic/gin')).toEqual({ package: 'github.com/gin-gonic/gin' })
  })

  it('resolves Java and Kotlin classes by their dotted names', () => {
    const r = repo(['src/main/java/com/acme/lead/Lead.java', 'src/main/java/com/acme/Other.kt'])
    expect(r('src/x/Y.java', 'com.acme.lead.Lead')).toEqual({ file: 'src/main/java/com/acme/lead/Lead.java' })
    expect(r('src/x/Y.java', 'com.acme.Other')).toEqual({ file: 'src/main/java/com/acme/Other.kt' })
    expect(r('src/x/Y.java', 'org.springframework.web.bind.annotation.RestController')).toEqual({
      package: 'org.springframework.web.bind.annotation.RestController',
    })
    expect(r('src/x/Y.java', 'java.util.List')).toBeNull()
  })

  it('resolves Ruby require_relative and plain requires by file name', () => {
    const r = repo(['app.rb', 'lib/lead.rb'])
    expect(r('app.rb', './lib/lead')).toEqual({ file: 'lib/lead.rb' })
    expect(r('app.rb', 'lead')).toEqual({ file: 'lib/lead.rb' })
    expect(r('app.rb', 'json')).toBeNull()
  })

  it('returns null for an empty spec or a language it does not read', () => {
    const r = repo(['a.md'])
    expect(r('a.md', './x')).toBeNull()
    expect(r('a.ts', '')).toBeNull()
  })
})
