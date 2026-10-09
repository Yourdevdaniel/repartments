/**
 * The outside services a repo talks to: databases, caches, queues, language models, e-mail, payments,
 * messaging, file storage and sign-in. Found from the packages the code imports and from the images
 * of its docker-compose files. A package is matched by name (and by its folder or submodules), so
 * `@langchain/openai` and `langchain_openai` both count as OpenAI.
 */
import type { External, ExternalKind } from '../shared/studio'
import { slug } from './text'

/** One known service: what it is called, what kind it is, and the package names that point to it. */
export type PackageEntry = {
  kind: ExternalKind
  name: string
  keys: string[]
  /** An LLM framework rather than a model provider (LangChain, LangGraph…). */
  framework?: boolean
  /** A database library whose engine isn't in its name (Prisma, Sequelize): named from the config. */
  generic?: boolean
}

/** Order matters: the first entry whose key matches a package wins. */
export const PACKAGES: PackageEntry[] = [
  // Databases
  { kind: 'database', name: 'PostgreSQL', keys: ['pg', 'postgres', 'psycopg', 'psycopg2', 'psycopg2-binary', 'asyncpg', '@vercel/postgres', '@neondatabase/serverless'] },
  { kind: 'database', name: 'MySQL', keys: ['mysql', 'mysql2', 'pymysql', 'mysqlclient', 'mysql-connector-python'] },
  { kind: 'database', name: 'MongoDB', keys: ['mongoose', 'mongodb', 'pymongo', 'motor'] },
  { kind: 'database', name: 'SQLite', keys: ['better-sqlite3', 'sqlite3'] },
  { kind: 'database', name: 'Banco de dados', keys: ['prisma', '@prisma/client', 'sequelize', 'typeorm', 'knex', 'sqlalchemy', 'drizzle-orm', 'peewee', 'tortoise'], generic: true },
  // Caches
  { kind: 'cache', name: 'Redis', keys: ['redis', 'ioredis', 'django-redis', '@upstash/redis'] },
  { kind: 'cache', name: 'Memcached', keys: ['memcache', 'pymemcache', 'memjs'] },
  // Queues
  { kind: 'queue', name: 'Celery', keys: ['celery'] },
  { kind: 'queue', name: 'RQ', keys: ['rq'] },
  { kind: 'queue', name: 'BullMQ', keys: ['bullmq'] },
  { kind: 'queue', name: 'Bull', keys: ['bull'] },
  { kind: 'queue', name: 'RabbitMQ', keys: ['amqplib', 'pika', 'aio_pika'] },
  { kind: 'queue', name: 'Kafka', keys: ['kafkajs', 'confluent_kafka', 'kafka-python'] },
  { kind: 'queue', name: 'Sidekiq', keys: ['sidekiq'] },
  // Language models: providers first, so that `@langchain/openai` is OpenAI rather than LangChain
  { kind: 'llm', name: 'OpenAI', keys: ['openai', '@langchain/openai', 'langchain_openai', '@ai-sdk/openai'] },
  { kind: 'llm', name: 'Anthropic', keys: ['@anthropic-ai/sdk', 'anthropic', '@langchain/anthropic', 'langchain_anthropic', '@ai-sdk/anthropic'] },
  { kind: 'llm', name: 'Google', keys: ['@google/generative-ai', '@google/genai', 'google-generativeai', 'google.generativeai', 'google-genai', 'google.genai', '@ai-sdk/google', 'langchain_google_genai', '@langchain/google-genai'] },
  { kind: 'llm', name: 'Cohere', keys: ['cohere', '@langchain/cohere', 'langchain_cohere', '@ai-sdk/cohere'] },
  { kind: 'llm', name: 'Mistral', keys: ['mistralai', '@mistralai/mistralai', '@langchain/mistralai', 'langchain_mistralai', '@ai-sdk/mistral'] },
  { kind: 'llm', name: 'Groq', keys: ['groq', 'groq-sdk', '@langchain/groq', 'langchain_groq', '@ai-sdk/groq'] },
  { kind: 'llm', name: 'Ollama', keys: ['ollama', '@langchain/ollama', 'langchain_ollama'] },
  // LLM frameworks
  { kind: 'llm', name: 'LangGraph', keys: ['langgraph', '@langchain/langgraph'], framework: true },
  { kind: 'llm', name: 'LangChain', keys: ['langchain', 'langchain_core', 'langchain_community', '@langchain/*'], framework: true },
  { kind: 'llm', name: 'LlamaIndex', keys: ['llama_index', 'llama-index'], framework: true },
  { kind: 'llm', name: 'Vercel AI SDK', keys: ['ai', '@ai-sdk/*'], framework: true },
  { kind: 'llm', name: 'CrewAI', keys: ['crewai'], framework: true },
  { kind: 'llm', name: 'AutoGen', keys: ['autogen', 'pyautogen', 'autogen_agentchat'], framework: true },
  // E-mail
  { kind: 'email', name: 'Nodemailer', keys: ['nodemailer'] },
  { kind: 'email', name: 'SendGrid', keys: ['@sendgrid/mail', 'sendgrid'] },
  { kind: 'email', name: 'Resend', keys: ['resend'] },
  { kind: 'email', name: 'Postmark', keys: ['postmark', 'postmarker'] },
  { kind: 'email', name: 'SMTP', keys: ['django.core.mail'] },
  // Payments
  { kind: 'payment', name: 'Stripe', keys: ['stripe', '@stripe/*'] },
  { kind: 'payment', name: 'Mercado Pago', keys: ['mercadopago'] },
  { kind: 'payment', name: 'Pagar.me', keys: ['pagarme'] },
  { kind: 'payment', name: 'Asaas', keys: ['asaas'] },
  { kind: 'payment', name: 'PayPal', keys: ['@paypal/*', 'paypal-rest-sdk', 'paypalrestsdk'] },
  // Messaging
  { kind: 'messaging', name: 'Twilio', keys: ['twilio'] },
  { kind: 'messaging', name: 'WhatsApp', keys: ['whatsapp-web.js', '@whiskeysockets/baileys'] },
  { kind: 'messaging', name: 'Telegram', keys: ['telegraf', 'node-telegram-bot-api', 'python-telegram-bot', 'telegram'] },
  { kind: 'messaging', name: 'Discord', keys: ['discord.js', 'discord.py'] },
  { kind: 'messaging', name: 'Slack', keys: ['@slack/*', 'slack_sdk', 'slack-sdk', 'slack_bolt'] },
  // File storage
  { kind: 'storage', name: 'AWS S3', keys: ['@aws-sdk/client-s3', 'boto3', 'aws-sdk'] },
  { kind: 'storage', name: 'Cloudinary', keys: ['cloudinary'] },
  { kind: 'storage', name: 'Google Cloud Storage', keys: ['@google-cloud/storage', 'google.cloud.storage', 'google-cloud-storage'] },
  // Sign-in
  { kind: 'auth', name: 'Auth.js', keys: ['next-auth', '@auth/*'] },
  { kind: 'auth', name: 'Clerk', keys: ['@clerk/*'] },
  { kind: 'auth', name: 'Firebase', keys: ['firebase-admin', 'firebase_admin'] },
  { kind: 'auth', name: 'Passport', keys: ['passport'] },
  { kind: 'auth', name: 'Auth0', keys: ['auth0', '@auth0/*'] },
]

const norm = (s: string) => s.toLowerCase().replace(/-/g, '_')

/**
 * Whether a package name is `key` itself, or one of its submodules (`key/x` in npm, `key.x` in Python),
 * or any name under a `scope/*` key.
 */
export function matchPackage(pkg: string, key: string): boolean {
  const p = norm(pkg)
  const k = norm(key)
  if (k.endsWith('/*')) return p.startsWith(k.slice(0, -1))
  return p === k || p.startsWith(k + '/') || p.startsWith(k + '.')
}

/** The known service a package belongs to, or null. */
export function findEntry(pkg: string): PackageEntry | null {
  return PACKAGES.find((e) => e.keys.some((k) => matchPackage(pkg, k))) ?? null
}

/** Which model provider (and framework) a file's imports point to; null when it calls no model. */
export function llmProviderOf(packages: string[]): { provider: string; framework: string | null } | null {
  let provider: string | null = null
  let framework: string | null = null
  for (const pkg of packages) {
    const e = findEntry(pkg)
    if (!e || e.kind !== 'llm') continue
    if (e.framework) {
      // LangGraph is the more specific answer when LangChain is also imported.
      if (!framework || e.name === 'LangGraph') framework = e.name
    } else provider ??= e.name
  }
  if (!provider && !framework) return null
  return { provider: provider ?? framework ?? '', framework }
}

/** A file that imports a model SDK or framework. */
export function callsModel(packages: string[]): boolean {
  return llmProviderOf(packages) !== null
}

/** What one file uses: its component, the packages it imports, and its text (for models that need no package). */
export type Usage = { component: string; packages: string[]; text: string }

const IMAGE_RULES: { re: RegExp; name: string; kind: ExternalKind }[] = [
  { re: /^(postgres|postgis|timescale)/i, name: 'PostgreSQL', kind: 'database' },
  { re: /mysql|mariadb/i, name: 'MySQL', kind: 'database' },
  { re: /mongo/i, name: 'MongoDB', kind: 'database' },
  { re: /redis|valkey/i, name: 'Redis', kind: 'cache' },
  { re: /memcached/i, name: 'Memcached', kind: 'cache' },
  { re: /rabbitmq/i, name: 'RabbitMQ', kind: 'queue' },
  { re: /kafka/i, name: 'Kafka', kind: 'queue' },
]

/** The images named in a docker-compose file. */
export function imagesOf(text: string): string[] {
  return [...text.matchAll(/^\s*image:\s*['"]?([^\s'"#]+)/gm)].map((m) => m[1])
}

/**
 * The name of the database the repo uses, when the config says so (compose image, Prisma provider,
 * Django engine, a connection string). Null when nothing names one.
 */
export function databaseLabelOf(files: { path: string; text: string }[]): string | null {
  const byEngine: Record<string, string> = { postgresql: 'PostgreSQL', postgres: 'PostgreSQL', mysql: 'MySQL', sqlite: 'SQLite', sqlite3: 'SQLite', mongodb: 'MongoDB', sqlserver: 'SQL Server' }
  const images: string[] = []
  const prisma: string[] = []
  const django: string[] = []
  const urls: string[] = []
  for (const { path, text } of files) {
    if (/(^|\/)docker-compose|compose\.ya?ml$/.test(path)) for (const img of imagesOf(text)) images.push(img)
    if (/schema\.prisma$/.test(path)) for (const m of text.matchAll(/provider\s*=\s*"(\w+)"/g)) prisma.push(m[1])
    for (const m of text.matchAll(/ENGINE['"]?\s*[:=]\s*['"]django\.db\.backends\.(\w+)/g)) django.push(m[1])
    if (urls.length === 0) {
      if (/postgres(ql)?:\/\/[^\s'"`]/.test(text)) urls.push('PostgreSQL')
      else if (/mongodb(\+srv)?:\/\/[^\s'"`]/.test(text)) urls.push('MongoDB')
      else if (/mysql:\/\/[^\s'"`]/.test(text)) urls.push('MySQL')
    }
  }
  for (const img of images) for (const r of IMAGE_RULES) if (r.kind === 'database' && r.re.test(img)) return r.name
  for (const p of prisma) if (byEngine[p]) return byEngine[p]
  for (const d of django) if (byEngine[d]) return byEngine[d]
  return urls[0] ?? null
}

/**
 * The external services of the repo, merged by name. Each one lists the components that use it;
 * database libraries with no engine named take `databaseLabel`. Compose services are used by the
 * `serviceIds` (the backend components), since a compose file doesn't say which part uses them.
 */
export function externalsFrom(input: {
  usages: Usage[]
  images: string[]
  serviceIds: string[]
  databaseLabel: string | null
}): External[] {
  const found = new Map<string, { kind: ExternalKind; name: string; usedBy: Set<string> }>()
  const add = (kind: ExternalKind, name: string, usedBy: string[]) => {
    const key = `${kind}|${name}`
    const entry = found.get(key) ?? { kind, name, usedBy: new Set<string>() }
    for (const u of usedBy) if (u) entry.usedBy.add(u)
    found.set(key, entry)
  }
  const genericName = input.databaseLabel ?? 'Banco de dados'

  for (const u of input.usages) {
    let database = false
    for (const pkg of u.packages) {
      const e = findEntry(pkg)
      if (!e) continue
      if (e.kind === 'database') database = true
      add(e.kind, e.generic ? genericName : e.name, [u.component])
    }
    // Django models talk to the database through the framework, without importing a driver.
    if (!database && /\b(models\.Model|db\.Model)\b/.test(u.text)) add('database', genericName, [u.component])
  }

  for (const img of input.images) {
    for (const r of IMAGE_RULES) if (r.re.test(img)) add(r.kind, r.name, input.serviceIds)
  }

  const order: ExternalKind[] = ['database', 'cache', 'queue', 'llm', 'email', 'payment', 'messaging', 'storage', 'auth', 'http']
  return [...found.values()]
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name))
    .map((e) => ({ id: `ext:${slug(e.name)}`, name: e.name, kind: e.kind, usedBy: [...e.usedBy] }))
}
