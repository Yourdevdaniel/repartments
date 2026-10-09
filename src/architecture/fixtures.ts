/**
 * A small, realistic CRM repo for the tests (and for the studio's own tests later): a React front end,
 * an Express API with a Prisma/PostgreSQL service layer, an e-mail service, a BullMQ worker and an
 * OpenAI assistant with three tools. Everything here is plain text; nothing is run.
 */
import type { SourceInput, TreeEntry } from './index'

const FILES: Record<string, string> = {
  'tsconfig.json': `{
  // Aliases used by the front end.
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./frontend/src/*"],
    },
  },
}
`,
  'frontend/src/main.tsx': `import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App />)
`,
  'frontend/src/App.tsx': `import { LeadsPage } from './pages/LeadsPage'

export function App() {
  return <LeadsPage />
}
`,
  'frontend/src/pages/LeadsPage.tsx': `import { useState } from 'react'
import { LeadForm } from '../components/LeadForm'
import { formatDate } from '@/lib/format'

export function LeadsPage() {
  const [saved, setSaved] = useState<string[]>([])

  async function send(name: string) {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) setSaved([...saved, formatDate(new Date())])
  }

  return <LeadForm onSubmit={send} />
}
`,
  'frontend/src/components/LeadForm.tsx': `import { useState } from 'react'

export function LeadForm(props: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <form onSubmit={() => props.onSubmit(name)}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
    </form>
  )
}
`,
  'frontend/src/lib/format.ts': `export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
`,
  'backend/package.json': `{
  "name": "crm-api",
  "main": "dist/server.js",
  "dependencies": {
    "express": "^4.19.0",
    "@prisma/client": "^5.0.0",
    "resend": "^3.0.0",
    "bullmq": "^5.0.0",
    "openai": "^4.0.0",
    "jsonwebtoken": "^9.0.0"
  }
}
`,
  'backend/prisma/schema.prisma': `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Lead {
  id   String @id @default(uuid())
  name String
}
`,
  'backend/src/server.ts': `import express from 'express'
import { leadsRouter } from './routes/leads'
import { assistantRouter } from './routes/assistant'

const app = express()
app.use(express.json())
app.use(leadsRouter)
app.use(assistantRouter)
app.listen(3000)
`,
  'backend/src/routes/leads.ts': `import { Router } from 'express'
import { requireUser } from '../middleware/auth'
import { createLead, listLeads } from '../services/leads'

export const leadsRouter = Router()

leadsRouter.get('/leads', requireUser, async (req, res) => {
  res.json(await listLeads())
})

leadsRouter.post('/leads', requireUser, async (req, res) => {
  res.status(201).json(await createLead(req.body))
})
`,
  'backend/src/routes/assistant.ts': `import { Router } from 'express'
import { requireUser } from '../middleware/auth'
import { answer } from '../agent/support'

export const assistantRouter = Router()

assistantRouter.post('/assistant', requireUser, async (req, res) => {
  res.json({ reply: await answer(req.body.message) })
})
`,
  'backend/src/middleware/auth.ts': `import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'

export function requireUser(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token || !jwt.verify(token, process.env.JWT_SECRET ?? '')) return res.status(401).end()
  next()
}
`,
  'backend/src/services/leads.ts': `import { Resend } from 'resend'
import { prisma } from '../db/client'
import { followups } from '../jobs/queue'

const mail = new Resend(process.env.RESEND_KEY)

export async function listLeads() {
  return prisma.lead.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function createLead(data: { name: string; email: string }) {
  const lead = await prisma.lead.create({ data })
  await mail.emails.send({ from: 'crm@example.com', to: data.email, subject: 'Olá!', text: 'Recebemos o seu contato.' })
  await followups.add('followup', { leadId: lead.id })
  return lead
}
`,
  'backend/src/db/client.ts': `import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()
`,
  'backend/src/jobs/queue.ts': `import { Queue } from 'bullmq'

export const followups = new Queue('followups', { connection: { host: 'redis', port: 6379 } })
`,
  'backend/src/jobs/worker.ts': `import { Worker } from 'bullmq'
import { prisma } from '../db/client'

new Worker('followups', async (job) => {
  await prisma.lead.update({ where: { id: job.data.leadId }, data: { followedUpAt: new Date() } })
})
`,
  'backend/src/agent/support.ts': `import OpenAI from 'openai'
import { prisma } from '../db/client'

const client = new OpenAI()

const SYSTEM_PROMPT = 'Você ajuda a equipe comercial a organizar os leads. Responda sempre em português e nunca invente dados de clientes.'

const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'search_leads',
      description: 'Procura leads pelo nome da empresa.',
      parameters: { type: 'object', properties: { company: { type: 'string' } }, required: ['company'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_note',
      description: 'Anota um comentário no lead.',
      parameters: { type: 'object', properties: { leadId: { type: 'string' }, text: { type: 'string' } } },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'schedule_call',
      description: 'Marca uma ligação com o lead para uma data.',
      parameters: { type: 'object', properties: { leadId: { type: 'string' }, when: { type: 'string' } } },
    },
  },
]

export async function answer(message: string) {
  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: message },
  ]
  while (true) {
    const res = await client.chat.completions.create({ model: 'gpt-4o-mini', messages, tools })
    const msg = res.choices[0].message
    if (!msg.tool_calls?.length) return msg.content
    messages.push(msg)
    for (const call of msg.tool_calls) {
      const args = JSON.parse(call.function.arguments)
      let result: unknown
      if (call.function.name === 'search_leads') result = await prisma.lead.findMany({ where: { name: args.company } })
      else if (call.function.name === 'add_note') result = await prisma.lead.update({ where: { id: args.leadId }, data: {} })
      else result = { ok: true }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }
}
`,
  'backend/tests/leads.test.ts': `import { describe, expect, it } from 'vitest'
import { createLead } from '../src/services/leads'

describe('leads', () => {
  it('exports the service', () => {
    expect(createLead).toBeDefined()
  })
})
`,
}

/** The CRM repo as the analyser would see it after reading the tree and the files. */
export const crmFixture: SourceInput = {
  repo: { owner: 'acme', name: 'crm', branch: 'main', sha: 'a1b2c3d4', private: true },
  tree: Object.entries(FILES).map(([path, text]): TreeEntry => ({ path, type: 'blob', size: text.length })),
  files: new Map(Object.entries(FILES)),
  truncated: false,
  generatedAt: '2026-10-07T12:00:00.000Z',
}
