/**
 * A ready-made example for showing the studio without signing in: a small, made-up market's online
 * shop (`market.ts`: products, cart, checkout with Mercado Pago and an e-mailed receipt), read by
 * the same analyser real repos go through, with friendlier names in the script and a few weeks of
 * made-up commits.
 */
import { buildModel } from '../architecture'
import { marketFixture } from './market'
import type { CommitDetail, CommitFile, Text } from '../shared/studio'
import { NO_EDITS } from '../scene/tour'
import { presentationFile, type PresentationFile } from './store'

/** The names a presenter would use with a client instead of folder names. */
const NAMES: Record<string, Text> = {
  'frontend/src/pages': { en: 'Shop screens', pt: 'Telas da loja' },
  'frontend/src/components': { en: 'Product shelf', pt: 'Prateleira de produtos' },
  'frontend/src#direct': { en: 'Shop app', pt: 'App da loja' },
  'frontend/src/lib#direct': { en: 'Calculator', pt: 'Calculadora' },
  'backend/src/routes': { en: 'Checkout counter', pt: 'Balcão' },
  'backend/src/middleware': { en: 'Doorman', pt: 'Porteiro' },
  'backend/src/services': { en: 'Shop rules', pt: 'Regras da loja' },
  'backend/src/db': { en: 'Stockroom', pt: 'Estoque' },
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
    ['feat: pagamento por Pix', 'ana', 0.4, [file('backend/src/services/orders.ts', 28, 6), file('backend/package.json', 1, 0)]],
    ['fix: estoque ficava negativo em compras simultâneas', 'bruno', 1.2, [file('backend/src/services/orders.ts', 9, 3)]],
    ['feat: e-mail de pedido confirmado', 'carla', 3.5, [file('backend/src/services/orders.ts', 14, 1)]],
    ['style: carrinho mais claro no celular', 'carla', 5, [file('frontend/src/pages/CartPage.tsx', 33, 21)]],
    ['test: testes de finalizar compra', 'bruno', 8, [file('backend/tests/orders.test.ts', 41, 0, 'added')]],
    ['perf: lista de produtos mais rápida', 'ana', 11, [file('backend/src/services/products.ts', 6, 9), file('backend/prisma/schema.prisma', 2, 0)]],
    ['feat: loja com produtos e carrinho', 'carla', 15, [file('frontend/src/pages/ProductsPage.tsx', 64, 0, 'added'), file('frontend/src/pages/CartPage.tsx', 48, 0, 'added'), file('backend/src/routes/orders.ts', 22, 0, 'added')]],
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
  const model = buildModel({ ...marketFixture, generatedAt: new Date(now).toISOString() })
  return presentationFile(model, { ...NO_EDITS, actors: { ...NAMES } }, commits(now))
}
