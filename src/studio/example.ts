/**
 * A ready-made example for showing the studio without signing in: a small, made-up CRM (a leads
 * screen, an API with a login check, lead rules over PostgreSQL, an e-mail service, a background
 * worker and a sales assistant on OpenAI with three tools), read by the same analyser real repos go
 * through, with friendlier names in the script and a few weeks of made-up commits.
 */
import { buildModel } from '../architecture'
import { crmFixture } from '../architecture/fixtures'
import type { CommitDetail, CommitFile, Text } from '../shared/studio'
import { NO_EDITS, type ScriptEdits } from '../scene/tour'
import { presentationFile, type PresentationFile } from './store'

/** The names a presenter would use with a client instead of folder names. */
const NAMES: Record<string, Text> = {
  'frontend/src/pages': { en: 'Leads screen', pt: 'Tela de leads' },
  'frontend/src/components': { en: 'Screen pieces', pt: 'Peças da tela' },
  'frontend/src#direct': { en: 'Browser app', pt: 'App no navegador' },
  'frontend/src/lib#direct': { en: 'Helpers', pt: 'Ajudantes' },
  'backend/src/routes': { en: 'Front desk', pt: 'Recepção' },
  'backend/src/middleware': { en: 'Doorman', pt: 'Porteiro' },
  'backend/src/services': { en: 'Lead rules', pt: 'Regras de leads' },
  'backend/src/agent': { en: 'Sales assistant', pt: 'Assistente de vendas' },
  'backend/src/db': { en: 'Customer records', pt: 'Arquivo de clientes' },
  'backend/src/jobs': { en: 'Mail clerk', pt: 'Carteiro' },
  'backend/src#direct': { en: 'Server', pt: 'Servidor' },
  'backend/tests': { en: 'Inspector', pt: 'Inspetor' },
}

const file = (path: string, additions: number, deletions: number, status: CommitFile['status'] = 'modified'): CommitFile => ({
  path,
  previousPath: null,
  status,
  additions,
  deletions,
  patch: null,
  truncated: false,
})

const DAY = 86_400_000

/** Made-up history (a Brazilian team, so the messages are in Portuguese), newest first, dated relative to now. */
function commits(now: number): CommitDetail[] {
  const people = {
    ana: { name: 'Ana Souza', login: 'ana-souza', avatarUrl: null },
    bruno: { name: 'Bruno Lima', login: 'brunolima', avatarUrl: null },
    carla: { name: 'Carla Dias', login: 'carla-dias', avatarUrl: null },
  }
  const list: [string, keyof typeof people, number, CommitFile[]][] = [
    ['feat: assistente agora agenda ligações', 'ana', 0.4, [file('backend/src/agent/support.ts', 64, 12), file('backend/src/services/leads.ts', 22, 3)]],
    ['fix: login expirava cedo demais', 'bruno', 1.2, [file('backend/src/middleware/auth.ts', 6, 4)]],
    ['feat: e-mail de boas-vindas para novos leads', 'carla', 3.5, [file('backend/src/services/leads.ts', 38, 6), file('backend/src/jobs/worker.ts', 25, 2)]],
    ['style: formulário de leads mais claro', 'carla', 5, [file('frontend/src/components/LeadForm.tsx', 41, 30), file('frontend/src/pages/LeadsPage.tsx', 12, 9)]],
    ['test: testes da criação de leads', 'bruno', 8, [file('backend/tests/leads.test.ts', 58, 0, 'added')]],
    ['perf: busca de leads mais rápida', 'ana', 11, [file('backend/src/services/leads.ts', 18, 25), file('backend/src/db/client.ts', 4, 1), file('backend/prisma/schema.prisma', 3, 0)]],
    ['feat: página de leads', 'carla', 15, [file('frontend/src/pages/LeadsPage.tsx', 120, 0, 'added'), file('frontend/src/components/LeadForm.tsx', 86, 0, 'added'), file('backend/src/routes/leads.ts', 30, 0, 'added')]],
  ]
  return list.map(([headline, who, daysAgo, files], i) => {
    const additions = files.reduce((n, f) => n + f.additions, 0)
    const deletions = files.reduce((n, f) => n + f.deletions, 0)
    const sha = (0xabc0000 + i * 7919).toString(16).padEnd(40, '0')
    return {
      sha,
      headline,
      body: '',
      author: people[who],
      date: new Date(now - daysAgo * DAY).toISOString(),
      parents: 1,
      url: 'https://github.com',
      stats: { additions, deletions, total: additions + deletions },
      files,
      filesTruncated: false,
    }
  })
}

export function examplePresentation(now = Date.now()): PresentationFile {
  const model = buildModel({ ...crmFixture, repo: { ...crmFixture.repo, owner: 'exemplo', name: 'crm' }, generatedAt: new Date(now).toISOString() })
  const edits: ScriptEdits = { ...NO_EDITS, actors: { ...NAMES } }
  // The assistant also appears under its own name from the code ("Support"), so rename that too.
  for (const a of model.agents) edits.actors[`agent:${a.name}`] = NAMES['backend/src/agent']
  return presentationFile(model, edits, commits(now))
}
