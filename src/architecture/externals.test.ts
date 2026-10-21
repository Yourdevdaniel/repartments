import { describe, expect, it } from 'vitest'
import { databaseLabelOf, externalsFrom, findEntry, imagesOf, llmProviderOf, matchPackage } from './externals'

describe('matchPackage and findEntry', () => {
  it('matches a package, its submodules and its scope, but not a longer name', () => {
    expect(matchPackage('stripe', 'stripe')).toBe(true)
    expect(matchPackage('stripe/lib', 'stripe')).toBe(true)
    expect(matchPackage('@stripe/stripe-js', '@stripe/*')).toBe(true)
    expect(matchPackage('pg-promise', 'pg')).toBe(false)
    expect(matchPackage('google.genai.types', 'google.genai')).toBe(true)
  })

  it('finds the known service of common packages, including scoped and Python names', () => {
    expect(findEntry('@prisma/client')?.name).toBe('Banco de dados')
    expect(findEntry('psycopg2')?.name).toBe('PostgreSQL')
    expect(findEntry('ioredis')?.name).toBe('Redis')
    expect(findEntry('celery')?.kind).toBe('queue')
    expect(findEntry('@sendgrid/mail')?.name).toBe('SendGrid')
    expect(findEntry('google-generativeai')?.name).toBe('Google')
    expect(findEntry('express')).toBeNull()
  })
})

describe('llmProviderOf', () => {
  it('names the provider and the framework separately', () => {
    expect(llmProviderOf(['@langchain/openai', 'langgraph'])).toEqual({ provider: 'OpenAI', framework: 'LangGraph' })
    expect(llmProviderOf(['anthropic'])).toEqual({ provider: 'Anthropic', framework: null })
    expect(llmProviderOf(['llama_index.core'])).toEqual({ provider: 'LlamaIndex', framework: 'LlamaIndex' })
    expect(llmProviderOf(['react'])).toBeNull()
  })
})

describe('databaseLabelOf and imagesOf', () => {
  it('reads the database from the Prisma schema, the Django engine, a compose image or a connection string', () => {
    expect(databaseLabelOf([{ path: 'backend/prisma/schema.prisma', text: 'datasource db {\n  provider = "postgresql"\n}' }])).toBe('PostgreSQL')
    expect(databaseLabelOf([{ path: 'crm/settings.py', text: "'ENGINE': 'django.db.backends.mysql'," }])).toBe('MySQL')
    expect(databaseLabelOf([{ path: 'docker-compose.yml', text: 'services:\n  db:\n    image: mongo:7\n' }])).toBe('MongoDB')
    expect(databaseLabelOf([{ path: 'x.ts', text: "const url = 'postgres://u:p@h/db'" }])).toBe('PostgreSQL')
    expect(databaseLabelOf([{ path: 'x.ts', text: 'nothing here' }])).toBeNull()
  })

  it('lists compose images', () => {
    expect(imagesOf('services:\n  cache:\n    image: "redis:7-alpine"\n  app:\n    image: node:20')).toEqual(['redis:7-alpine', 'node:20'])
  })
})

describe('externalsFrom', () => {
  it('merges the same service across files, listing every component that uses it', () => {
    const externals = externalsFrom({
      usages: [
        { component: 'backend/db', packages: ['@prisma/client'], text: '' },
        { component: 'backend/services', packages: ['@prisma/client', 'resend'], text: '' },
        { component: 'frontend/app', packages: ['react'], text: '' },
      ],
      images: [],
      serviceIds: [],
      databaseLabel: 'PostgreSQL',
    })
    expect(externals).toEqual([
      { id: 'ext:postgresql', name: 'PostgreSQL', kind: 'database', usedBy: ['backend/db', 'backend/services'] },
      { id: 'ext:resend', name: 'Resend', kind: 'email', usedBy: ['backend/services'] },
    ])
  })

  it('names a generic database library "Banco de dados" when no engine is known', () => {
    const [db] = externalsFrom({
      usages: [{ component: 'backend/data', packages: ['sqlalchemy'], text: '' }],
      images: [],
      serviceIds: [],
      databaseLabel: null,
    })
    expect(db).toEqual({ id: 'ext:banco-de-dados', name: 'Banco de dados', kind: 'database', usedBy: ['backend/data'] })
  })

  it('finds a Django database from its models without any driver import', () => {
    const [db] = externalsFrom({
      usages: [{ component: 'shop/models', packages: [], text: 'class Lead(models.Model):\n    pass' }],
      images: [],
      serviceIds: [],
      databaseLabel: 'MySQL',
    })
    expect(db.name).toBe('MySQL')
    expect(db.usedBy).toEqual(['shop/models'])
  })

  it('attaches compose services to the backend components', () => {
    const externals = externalsFrom({
      usages: [],
      images: ['postgres:16', 'redis:7'],
      serviceIds: ['api', 'worker'],
      databaseLabel: null,
    })
    expect(externals.map((e) => [e.name, e.kind, e.usedBy])).toEqual([
      ['PostgreSQL', 'database', ['api', 'worker']],
      ['Redis', 'cache', ['api', 'worker']],
    ])
  })

  it('lists language model providers as llm services', () => {
    expect(
      externalsFrom({
        usages: [{ component: 'ai', packages: ['openai'], text: '' }],
        images: [],
        serviceIds: [],
        databaseLabel: null,
      }),
    ).toEqual([{ id: 'ext:openai', name: 'OpenAI', kind: 'llm', usedBy: ['ai'] }])
  })
})
