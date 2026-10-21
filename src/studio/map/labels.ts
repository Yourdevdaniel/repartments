import type { ExternalKind, Layer } from '../../shared/studio'
import type { L, Lang } from '../../ui/roles'

/** A band of the map: one layer of the system, or the outside services at the bottom. */
export type BandKey = Layer | 'external'

/** The names the bands wear on the map. Plain words, so a client can read them without the jargon. */
export const BAND_NAME: Record<BandKey, L> = {
  interface: { en: 'Screens', pt: 'Telas' },
  api: { en: 'API', pt: 'API' },
  security: { en: 'Security', pt: 'Segurança' },
  logic: { en: 'Business logic', pt: 'Regras de negócio' },
  ai: { en: 'Artificial intelligence', pt: 'Inteligência artificial' },
  jobs: { en: 'Background jobs', pt: 'Tarefas em segundo plano' },
  data: { en: 'Data', pt: 'Dados' },
  shared: { en: 'Shared', pt: 'Compartilhado' },
  infra: { en: 'Infrastructure', pt: 'Infraestrutura' },
  tests: { en: 'Tests', pt: 'Testes' },
  external: { en: 'External services', pt: 'Serviços externos' },
}

/** Pastel backgrounds for the bands, close to the product's own palette. */
export const BAND_TINT: Record<BandKey, string> = {
  interface: '#fdebe3',
  api: '#e6f0fc',
  security: '#ffe9ec',
  logic: '#ece8fb',
  ai: '#f3e6fb',
  jobs: '#fff4d6',
  data: '#e3f3ea',
  shared: '#eef0f5',
  infra: '#e9eef2',
  tests: '#f3f3f1',
  external: '#e4f2f7',
}

/** The icon and name of each kind of outside service. */
export const EXTERNAL_KIND: Record<ExternalKind, { icon: string; name: L }> = {
  database: { icon: '🗄️', name: { en: 'Database', pt: 'Banco de dados' } },
  cache: { icon: '⚡', name: { en: 'Cache', pt: 'Cache' } },
  queue: { icon: '📬', name: { en: 'Queue', pt: 'Fila' } },
  llm: { icon: '🤖', name: { en: 'AI model', pt: 'Modelo de IA' } },
  email: { icon: '✉️', name: { en: 'E-mail', pt: 'E-mail' } },
  payment: { icon: '💳', name: { en: 'Payments', pt: 'Pagamentos' } },
  messaging: { icon: '💬', name: { en: 'Messaging', pt: 'Mensagens' } },
  storage: { icon: '📦', name: { en: 'Files', pt: 'Arquivos' } },
  auth: { icon: '🔐', name: { en: 'Sign-in', pt: 'Login' } },
  http: { icon: '🌐', name: { en: 'Web service', pt: 'Serviço web' } },
}

/** The little icon in front of each box of an agent's decision graph. */
export const AGENT_KIND_ICON: Record<string, string> = {
  start: '▶',
  end: '■',
  decision: '',
  tool: '🛠️',
  llm: '🤖',
  instructions: '📜',
  human: '🙋',
  node: '',
}

/**
 * Splits a label into at most two lines of about `max` characters, breaking at a space. A word that
 * is too long for a line is cut with an ellipsis, so nothing spills out of its box.
 */
export function wrapLabel(text: string, max: number): string[] {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (clean.length <= max) return [clean]
  const words = clean.split(' ')
  let first = ''
  let i = 0
  while (i < words.length) {
    const next = first ? `${first} ${words[i]}` : words[i]
    if (next.length > max) break
    first = next
    i++
  }
  if (!first) {
    first = fitText(words[0], max)
    i = 1
  }
  const rest = words.slice(i).join(' ')
  return rest ? [first, fitText(rest, max)] : [first]
}

/** Cuts a text to `max` characters, ending with an ellipsis when it had to be shortened. */
export function fitText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

/** "1 arquivo" / "12 arquivos", "1 file" / "12 files". */
export function filesLabel(n: number, lang: Lang): string {
  if (lang === 'en') return `${n} ${n === 1 ? 'file' : 'files'}`
  return `${n} ${n === 1 ? 'arquivo' : 'arquivos'}`
}

/** Thousands separated the way the reader's language writes them: 1.240 or 1,240. */
export function numberText(n: number, lang: Lang): string {
  return n.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US')
}
