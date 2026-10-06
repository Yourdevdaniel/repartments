/**
 * Turns one repo's public manifests into residents: which technologies live there and what role each
 * plays. Pure and table-driven, so every rule can be tested with a fake repo.
 *
 * Only names of dependencies, compose images and top-level files are looked at. Nothing about what
 * the code does, and nothing from here but the resulting tags leaves the server.
 */
import type { Apartment, RepoStatus, Resident, Role } from '../src/shared/types'
import { alias, MANIFESTS, type RawBlob, type RawRepo } from './github'

/** Brand-ish colours for the name tags. */
const COLOR: Record<string, string> = {
  React: '#61dafb',
  'Next.js': '#111111',
  Vue: '#42b883',
  Nuxt: '#00dc82',
  Svelte: '#ff3e00',
  Angular: '#dd0031',
  Astro: '#ff5d01',
  Solid: '#446b9e',
  'HTML & CSS': '#e34c26',
  Expo: '#4630eb',
  'React Native': '#61dafb',
  Flutter: '#02569b',
  Django: '#0c4b33',
  Flask: '#3b3b3b',
  FastAPI: '#009688',
  Express: '#444444',
  NestJS: '#e0234e',
  Fastify: '#202020',
  Koa: '#33333d',
  Hono: '#ff5b11',
  'Spring Boot': '#6db33f',
  Rails: '#cc0000',
  Laravel: '#ff2d20',
  Gin: '#00add8',
  Echo: '#00add8',
  Fiber: '#00add8',
  Axum: '#dea584',
  'Actix Web': '#dea584',
  SimpleJWT: '#7c5cff',
  JWT: '#7c5cff',
  allauth: '#7c5cff',
  Passport: '#34e27a',
  'Auth.js': '#7c5cff',
  Clerk: '#6c47ff',
  Devise: '#7c5cff',
  'Spring Security': '#6db33f',
  Nginx: '#009639',
  Caddy: '#1f88c0',
  Helmet: '#7c5cff',
  PostgreSQL: '#4169e1',
  MySQL: '#00758f',
  MongoDB: '#47a248',
  SQLite: '#0f80cc',
  Prisma: '#2d3748',
  Redis: '#dc382d',
  Memcached: '#2b6a9a',
  Celery: '#37814a',
  RQ: '#c83232',
  Dramatiq: '#8b5cf6',
  BullMQ: '#e0234e',
  Sidekiq: '#b1003e',
  RabbitMQ: '#ff6600',
  pytest: '#0a9edc',
  Jest: '#c21325',
  Vitest: '#6e9f18',
  Playwright: '#2ead33',
  Cypress: '#17202c',
  Mocha: '#8d6748',
  JUnit: '#25a162',
  RSpec: '#cc342d',
  Docker: '#2f8fe6',
  'GitHub Actions': '#2088ff',
}

type Rule = { role: Role; tech: string; npm?: string[]; py?: string[]; images?: string[]; text?: RegExp[] }

/** First match per role wins, so order rules from most to least specific. */
const RULES: Rule[] = [
  { role: 'mobile', tech: 'Expo', npm: ['expo'] },
  { role: 'mobile', tech: 'React Native', npm: ['react-native'] },
  { role: 'mobile', tech: 'Flutter', text: [/^\s*flutter:/m] },

  { role: 'frontend', tech: 'Next.js', npm: ['next'] },
  { role: 'frontend', tech: 'Nuxt', npm: ['nuxt'] },
  { role: 'frontend', tech: 'Astro', npm: ['astro'] },
  { role: 'frontend', tech: 'Svelte', npm: ['svelte', '@sveltejs/kit'] },
  { role: 'frontend', tech: 'Angular', npm: ['@angular/core'] },
  { role: 'frontend', tech: 'Vue', npm: ['vue'] },
  { role: 'frontend', tech: 'Solid', npm: ['solid-js'] },
  { role: 'frontend', tech: 'React', npm: ['react', 'react-dom'] },

  { role: 'backend', tech: 'Django', py: ['django', 'djangorestframework'] },
  { role: 'backend', tech: 'FastAPI', py: ['fastapi'] },
  { role: 'backend', tech: 'Flask', py: ['flask'] },
  { role: 'backend', tech: 'NestJS', npm: ['@nestjs/core'] },
  { role: 'backend', tech: 'Express', npm: ['express'] },
  { role: 'backend', tech: 'Fastify', npm: ['fastify'] },
  { role: 'backend', tech: 'Hono', npm: ['hono'] },
  { role: 'backend', tech: 'Koa', npm: ['koa'] },
  { role: 'backend', tech: 'Spring Boot', text: [/spring-boot/] },
  { role: 'backend', tech: 'Rails', text: [/^\s*gem ['"]rails['"]/m] },
  { role: 'backend', tech: 'Laravel', text: [/"laravel\/framework"/] },
  { role: 'backend', tech: 'Gin', text: [/github\.com\/gin-gonic\/gin/] },
  { role: 'backend', tech: 'Echo', text: [/github\.com\/labstack\/echo/] },
  { role: 'backend', tech: 'Fiber', text: [/github\.com\/gofiber\/fiber/] },
  { role: 'backend', tech: 'Axum', text: [/^\s*axum\s*=/m] },
  { role: 'backend', tech: 'Actix Web', text: [/^\s*actix-web\s*=/m] },

  { role: 'security', tech: 'SimpleJWT', py: ['djangorestframework-simplejwt'] },
  { role: 'security', tech: 'allauth', py: ['django-allauth'] },
  { role: 'security', tech: 'JWT', py: ['pyjwt', 'python-jose'], npm: ['jsonwebtoken', 'jose'] },
  { role: 'security', tech: 'Auth.js', npm: ['next-auth', '@auth/core'] },
  { role: 'security', tech: 'Clerk', npm: ['@clerk/nextjs', '@clerk/clerk-react', '@clerk/clerk-js'] },
  { role: 'security', tech: 'Passport', npm: ['passport'] },
  { role: 'security', tech: 'Devise', text: [/^\s*gem ['"]devise['"]/m] },
  { role: 'security', tech: 'Spring Security', text: [/spring-boot-starter-security/] },
  { role: 'security', tech: 'Nginx', images: ['nginx'] },
  { role: 'security', tech: 'Caddy', images: ['caddy'] },
  { role: 'security', tech: 'Helmet', npm: ['helmet'] },

  { role: 'database', tech: 'PostgreSQL', py: ['psycopg', 'psycopg2', 'psycopg2-binary', 'asyncpg'], npm: ['pg', 'postgres'], images: ['postgres', 'postgis/postgis'], text: [/<artifactId>postgresql<\/artifactId>/, /^\s*gem ['"]pg['"]/m] },
  { role: 'database', tech: 'MySQL', py: ['mysqlclient', 'pymysql'], npm: ['mysql', 'mysql2'], images: ['mysql', 'mariadb'], text: [/<artifactId>mysql-connector/] },
  { role: 'database', tech: 'MongoDB', py: ['pymongo', 'motor', 'mongoengine'], npm: ['mongodb', 'mongoose'], images: ['mongo'] },
  { role: 'database', tech: 'Prisma', npm: ['@prisma/client', 'prisma'] },
  { role: 'database', tech: 'SQLite', py: ['aiosqlite'], npm: ['sqlite3', 'better-sqlite3'] },

  { role: 'cache', tech: 'Redis', py: ['redis', 'django-redis'], npm: ['redis', 'ioredis'], images: ['redis', 'valkey/valkey'] },
  { role: 'cache', tech: 'Memcached', py: ['pymemcache', 'python-memcached'], images: ['memcached'] },

  { role: 'worker', tech: 'Celery', py: ['celery'] },
  { role: 'worker', tech: 'RQ', py: ['rq'] },
  { role: 'worker', tech: 'Dramatiq', py: ['dramatiq'] },
  { role: 'worker', tech: 'BullMQ', npm: ['bullmq', 'bull'] },
  { role: 'worker', tech: 'Sidekiq', text: [/^\s*gem ['"]sidekiq['"]/m] },
  { role: 'worker', tech: 'RabbitMQ', py: ['pika'], npm: ['amqplib'], images: ['rabbitmq'] },

  { role: 'tests', tech: 'pytest', py: ['pytest', 'pytest-django'] },
  { role: 'tests', tech: 'Vitest', npm: ['vitest'] },
  { role: 'tests', tech: 'Jest', npm: ['jest'] },
  { role: 'tests', tech: 'Playwright', npm: ['@playwright/test', 'playwright'] },
  { role: 'tests', tech: 'Cypress', npm: ['cypress'] },
  { role: 'tests', tech: 'Mocha', npm: ['mocha'] },
  { role: 'tests', tech: 'JUnit', text: [/junit/i] },
  { role: 'tests', tech: 'RSpec', text: [/^\s*gem ['"]rspec/m] },
]

/** What the manifests of one repo boil down to. */
export type Signals = {
  npm: Set<string>
  py: Set<string>
  images: Set<string>
  /** Other manifests (pom.xml, go.mod, Gemfile…), searched with patterns. */
  text: string
  docker: boolean
  workflows: boolean
  rootNames: Set<string>
}

const blob = (repo: RawRepo, path: string) => (repo[alias(path)] as RawBlob)?.text ?? null

function npmDeps(text: string, into: Set<string>) {
  try {
    const pkg = JSON.parse(text) as Record<string, Record<string, string> | undefined>
    for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
      for (const name of Object.keys(pkg[key] ?? {})) into.add(name.toLowerCase())
    }
  } catch {
    // Not valid JSON: ignore this manifest.
  }
}

/** Package names from requirements.txt lines or a pyproject.toml's dependency lists. */
function pyDeps(text: string, into: Set<string>) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^["']|["'],?$/g, '')
    if (!line || line.startsWith('#') || line.startsWith('-') || line.startsWith('[')) continue
    const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*(?:[<>=!~;@ ]|$)/)
    if (m) into.add(m[1].toLowerCase().replace(/_/g, '-'))
    // pyproject poetry style: name = "^1.0"
    const poetry = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*["{]/)
    if (poetry) into.add(poetry[1].toLowerCase().replace(/_/g, '-'))
  }
}

function composeImages(text: string, into: Set<string>) {
  for (const m of text.matchAll(/^\s*image:\s*["']?([^\s"':]+)/gm)) {
    const name = m[1].toLowerCase().replace(/^docker\.io\//, '').replace(/^library\//, '')
    into.add(name)
  }
  // Services named after what they run count too (`db: build: ./postgres` is rare; `redis:` is common).
  for (const m of text.matchAll(/^ {2}([a-z0-9_-]+):\s*$/gm)) into.add(m[1].toLowerCase())
}

export function signals(repo: RawRepo): Signals {
  const s: Signals = {
    npm: new Set(),
    py: new Set(),
    images: new Set(),
    text: '',
    docker: false,
    workflows: (repo.workflows?.entries.length ?? 0) > 0,
    rootNames: new Set((repo.root?.entries ?? []).map((e) => e.name)),
  }
  for (const p of MANIFESTS.packageJson) {
    const t = blob(repo, p)
    if (t) npmDeps(t, s.npm)
  }
  for (const p of MANIFESTS.python) {
    const t = blob(repo, p)
    if (t) pyDeps(t, s.py)
  }
  for (const p of MANIFESTS.compose) {
    const t = blob(repo, p)
    if (t) {
      composeImages(t, s.images)
      s.docker = true
    }
  }
  for (const p of MANIFESTS.docker) if (repo[alias(p)]) s.docker = true
  s.text = MANIFESTS.other.map((p) => blob(repo, p) ?? '').join('\n')
  return s
}

const MOBILE_LANGUAGES = new Set(['Kotlin', 'Swift', 'Dart', 'Objective-C'])
const WEB_LANGUAGES = new Set(['HTML', 'CSS', 'SCSS'])

export function residentsFrom(s: Signals, primary: string | null): Resident[] {
  const found = new Map<Role, string>()
  const imageMatch = (names: string[]) => names.some((n) => [...s.images].some((img) => img === n || img.endsWith('/' + n) || img === n.split('/').pop()))
  for (const rule of RULES) {
    if (found.has(rule.role)) continue
    const hit =
      rule.npm?.some((n) => s.npm.has(n)) ||
      rule.py?.some((n) => s.py.has(n)) ||
      (rule.images && imageMatch(rule.images)) ||
      rule.text?.some((r) => r.test(s.text))
    if (hit) found.set(rule.role, rule.tech)
  }
  // react-native also pulls in react; on a phone app it isn't a web front end.
  if (found.has('mobile') && found.get('frontend') === 'React') found.delete('frontend')
  // A Django project with no database driver runs on Django's default SQLite.
  if (found.get('backend') === 'Django' && !found.has('database')) found.set('database', 'SQLite')
  if (s.docker) found.set('devops', 'Docker')
  else if (s.workflows) found.set('devops', 'GitHub Actions')

  if (!found.has('frontend') && !found.has('backend') && !found.has('mobile')) {
    if (primary && MOBILE_LANGUAGES.has(primary)) found.set('mobile', primary)
    else if (primary && WEB_LANGUAGES.has(primary)) found.set('frontend', 'HTML & CSS')
    else found.set('coder', primary ?? 'Code')
  }

  return [...found].map(([role, tech]) => ({ role, tech, color: COLOR[tech] ?? colorFor(tech) }))
}

/** A stable pastel for technologies without a brand colour (plain languages, mostly). */
function colorFor(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 55% 52%)`
}

export function statusOf(repo: RawRepo): RepoStatus {
  const status: RepoStatus = {}
  const state = repo.defaultBranchRef?.target?.statusCheckRollup?.state
  if (state === 'SUCCESS') status.ci = 'passing'
  else if (state === 'FAILURE' || state === 'ERROR') status.ci = 'failing'
  const open = repo.openPrs.totalCount
  if (open > 0) status.prs = { open, conflict: repo.prs.nodes.some((p) => p.mergeable === 'CONFLICTING') }
  return status
}

export function analyze(repo: RawRepo): Apartment {
  const primary = repo.primaryLanguage?.name ?? null
  return {
    name: repo.name,
    description: repo.description,
    url: repo.url,
    stars: repo.stargazerCount,
    createdAt: repo.createdAt,
    pushedAt: repo.pushedAt,
    language: { name: primary ?? '—', color: repo.primaryLanguage?.color ?? '#9aa3b5' },
    residents: residentsFrom(signals(repo), primary),
    status: statusOf(repo),
  }
}
