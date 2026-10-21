/**
 * Plain names for the presentation. A resident of the 3D flat is named for what the part does in the
 * system ("Recepção de leads", "Regras do negócio"), never for the folder, the tool's code name or the
 * brand of a service, because the people watching it don't code. The technical names stay in the
 * analysis and on the 2D map; this file only decides what a person reads in the show.
 *
 * Everything here is pure: the same names in, the same plain names out.
 */
import type { ExternalKind, Layer, Text } from '../shared/studio'
import { humanField, type Lang } from './details'
import { accentuate, readableWord } from './words'

type Pair = { pt: string; en: string }
type Named = { name: string; path: string; layer: Layer }

/** Folder names that say nothing about the subject of a part: a part named "src/lib" is not about "lib". */
const GENERIC = new Set([
  'routes', 'route', 'router', 'routers', 'controllers', 'controller', 'api', 'apis', 'handlers', 'handler',
  'endpoints', 'urls', 'views', 'services', 'service', 'domain', 'core', 'logic', 'usecases', 'use_cases',
  'middleware', 'middlewares', 'auth', 'guards', 'security', 'pages', 'page', 'screens', 'components',
  'component', 'ui', 'app', 'src', 'frontend', 'backend', 'client', 'server', 'web', 'models', 'model',
  'entities', 'db', 'database', 'data', 'repositories', 'repository', 'schemas', 'prisma', 'jobs', 'job',
  'workers', 'worker', 'tasks', 'queues', 'agent', 'agents', 'ai', 'llm', 'lib', 'libs', 'utils', 'util',
  'helpers', 'helper', 'shared', 'common', 'config', 'infra', 'tests', 'test', 'spec', 'specs', 'packages',
  'apps', 'modules', 'features', 'direct', 'hooks', 'types', 'constants', 'styles', 'assets', 'public',
  'static', 'scripts', 'docs', 'migrations', 'fixtures', 'mocks', 'stories', 'internal', 'cmd', 'pkg',
  'source', 'main', 'index', 'dist', 'build', 'lang', 'i18n', 'management', 'commands',
])

/** Words a part's folder can name, as a reader would say them. Singular and plural forms both appear. */
const DOMAIN = new Map<string, Pair>([
  ['user', { pt: 'usuário', en: 'user' }],
  ['users', { pt: 'usuários', en: 'users' }],
  ['customer', { pt: 'cliente', en: 'customer' }],
  ['customers', { pt: 'clientes', en: 'customers' }],
  ['client', { pt: 'cliente', en: 'client' }],
  ['clients', { pt: 'clientes', en: 'clients' }],
  ['order', { pt: 'pedido', en: 'order' }],
  ['orders', { pt: 'pedidos', en: 'orders' }],
  ['product', { pt: 'produto', en: 'product' }],
  ['products', { pt: 'produtos', en: 'products' }],
  ['payment', { pt: 'pagamento', en: 'payment' }],
  ['payments', { pt: 'pagamentos', en: 'payments' }],
  ['billing', { pt: 'cobrança', en: 'billing' }],
  ['invoice', { pt: 'fatura', en: 'invoice' }],
  ['invoices', { pt: 'faturas', en: 'invoices' }],
  ['account', { pt: 'conta', en: 'account' }],
  ['accounts', { pt: 'contas', en: 'accounts' }],
  ['message', { pt: 'mensagem', en: 'message' }],
  ['messages', { pt: 'mensagens', en: 'messages' }],
  ['notification', { pt: 'aviso', en: 'notification' }],
  ['notifications', { pt: 'avisos', en: 'notifications' }],
  ['report', { pt: 'relatório', en: 'report' }],
  ['reports', { pt: 'relatórios', en: 'reports' }],
  ['deal', { pt: 'negócio', en: 'deal' }],
  ['deals', { pt: 'negócios', en: 'deals' }],
  ['contact', { pt: 'contato', en: 'contact' }],
  ['contacts', { pt: 'contatos', en: 'contacts' }],
  ['sales', { pt: 'vendas', en: 'sales' }],
  ['inventory', { pt: 'estoque', en: 'inventory' }],
  ['stock', { pt: 'estoque', en: 'stock' }],
  ['shipping', { pt: 'entregas', en: 'shipping' }],
  ['cart', { pt: 'carrinho', en: 'cart' }],
  ['catalog', { pt: 'catálogo', en: 'catalog' }],
  ['dashboard', { pt: 'painel', en: 'dashboard' }],
  ['chat', { pt: 'conversa', en: 'chat' }],
  ['calendar', { pt: 'agenda', en: 'calendar' }],
  ['schedule', { pt: 'agenda', en: 'schedule' }],
  ['file', { pt: 'arquivo', en: 'file' }],
  ['files', { pt: 'arquivos', en: 'files' }],
  ['settings', { pt: 'configurações', en: 'settings' }],
  ['lead', { pt: 'lead', en: 'lead' }],
  ['leads', { pt: 'leads', en: 'leads' }],
  ['ticket', { pt: 'chamado', en: 'ticket' }],
  ['tickets', { pt: 'chamados', en: 'tickets' }],
  ['support', { pt: 'atendimento', en: 'support' }],
  ['team', { pt: 'equipe', en: 'team' }],
  ['project', { pt: 'projeto', en: 'project' }],
  ['projects', { pt: 'projetos', en: 'projects' }],
  ['task', { pt: 'tarefa', en: 'task' }],
  ['tasks', { pt: 'tarefas', en: 'tasks' }],
  ['item', { pt: 'item', en: 'item' }],
  ['items', { pt: 'itens', en: 'items' }],
  ['note', { pt: 'nota', en: 'note' }],
  ['notes', { pt: 'notas', en: 'notes' }],
  ['call', { pt: 'ligação', en: 'call' }],
  ['calls', { pt: 'ligações', en: 'calls' }],
  ['email', { pt: 'e-mail', en: 'e-mail' }],
  ['emails', { pt: 'e-mails', en: 'e-mails' }],
  ['meeting', { pt: 'reunião', en: 'meeting' }],
  ['meetings', { pt: 'reuniões', en: 'meetings' }],
  ['appointment', { pt: 'consulta', en: 'appointment' }],
  ['appointments', { pt: 'consultas', en: 'appointments' }],
  ['weather', { pt: 'clima', en: 'weather' }],
  ['tool', { pt: 'ferramenta', en: 'tool' }],
  ['text', { pt: 'texto', en: 'text' }],
  ['tools', { pt: 'ferramentas', en: 'tools' }],
  ['end', { pt: 'fim', en: 'end' }],
  ['auth', { pt: 'acesso', en: 'sign-in' }],
  ['store', { pt: 'loja', en: 'store' }],
  ['stores', { pt: 'lojas', en: 'stores' }],
  ['seller', { pt: 'vendedor', en: 'seller' }],
  ['sellers', { pt: 'vendedores', en: 'sellers' }],
  ['community', { pt: 'comunidade', en: 'community' }],
  ['section', { pt: 'seção', en: 'section' }],
  ['sections', { pt: 'seções', en: 'sections' }],
  ['exporters', { pt: 'exportação', en: 'exporters' }],
  ['org', { pt: 'organização', en: 'organization' }],
  ['profile', { pt: 'perfil', en: 'profile' }],
  ['profiles', { pt: 'perfis', en: 'profiles' }],
  ['booking', { pt: 'reserva', en: 'booking' }],
  ['bookings', { pt: 'reservas', en: 'bookings' }],
  ['review', { pt: 'avaliação', en: 'review' }],
  ['reviews', { pt: 'avaliações', en: 'reviews' }],
])

/** The verb that opens a tool's name, as a sentence starts with it. */
const VERBS = new Map<string, Pair>([
  ['search', { pt: 'buscar', en: 'search' }],
  ['find', { pt: 'buscar', en: 'find' }],
  ['lookup', { pt: 'buscar', en: 'look up' }],
  ['get', { pt: 'buscar', en: 'get' }],
  ['fetch', { pt: 'buscar', en: 'fetch' }],
  ['query', { pt: 'buscar', en: 'search' }],
  ['read', { pt: 'buscar', en: 'read' }],
  ['list', { pt: 'listar', en: 'list' }],
  ['add', { pt: 'adicionar', en: 'add' }],
  ['create', { pt: 'criar', en: 'create' }],
  ['insert', { pt: 'criar', en: 'create' }],
  ['new', { pt: 'criar', en: 'create' }],
  ['update', { pt: 'atualizar', en: 'update' }],
  ['edit', { pt: 'atualizar', en: 'edit' }],
  ['set', { pt: 'atualizar', en: 'set' }],
  ['delete', { pt: 'apagar', en: 'delete' }],
  ['remove', { pt: 'apagar', en: 'remove' }],
  ['send', { pt: 'enviar', en: 'send' }],
  ['schedule', { pt: 'agendar', en: 'schedule' }],
  ['book', { pt: 'agendar', en: 'book' }],
  ['cancel', { pt: 'cancelar', en: 'cancel' }],
  ['check', { pt: 'conferir', en: 'check' }],
  ['verify', { pt: 'conferir', en: 'verify' }],
  ['validate', { pt: 'conferir', en: 'validate' }],
  ['calculate', { pt: 'calcular', en: 'calculate' }],
  ['compute', { pt: 'calcular', en: 'compute' }],
  ['notify', { pt: 'avisar', en: 'notify' }],
  ['summarize', { pt: 'resumir', en: 'summarize' }],
  ['translate', { pt: 'traduzir', en: 'translate' }],
  ['generate', { pt: 'gerar', en: 'generate' }],
  ['upload', { pt: 'enviar', en: 'upload' }],
  ['download', { pt: 'baixar', en: 'download' }],
])

/** The plain name of each layer, and how it reads with a subject ("Tela de leads", "Leads screen"). */
const LAYER_NAMES: Record<Layer, { pt: string; en: string; ptWith: string; enWith: string }> = {
  interface: { pt: 'Telas', en: 'Screens', ptWith: 'Tela de {s}', enWith: '{S} screen' },
  api: { pt: 'Recepção', en: 'Front desk', ptWith: 'Recepção de {s}', enWith: '{S} desk' },
  security: { pt: 'Porteiro', en: 'Doorman', ptWith: 'Porteiro de {s}', enWith: '{S} doorman' },
  logic: { pt: 'Regras do negócio', en: 'Business rules', ptWith: 'Regras de {s}', enWith: '{S} rules' },
  ai: { pt: 'Assistente de IA', en: 'AI assistant', ptWith: 'Assistente de {s}', enWith: '{S} assistant' },
  jobs: { pt: 'Bastidores', en: 'Back office', ptWith: 'Bastidores de {s}', enWith: '{S} back office' },
  data: { pt: 'Arquivo', en: 'Records', ptWith: 'Arquivo de {s}', enWith: '{S} records' },
  shared: { pt: 'Ajudantes', en: 'Helpers', ptWith: 'Ajudantes de {s}', enWith: '{S} helpers' },
  infra: { pt: 'Configuração', en: 'Setup', ptWith: 'Configuração de {s}', enWith: '{S} setup' },
  tests: { pt: 'Inspetor', en: 'Inspector', ptWith: 'Inspetor de {s}', enWith: '{S} inspector' },
}

/** Names of outside services as people know the kind of service, not the brand. */
const EXTERNAL_NAMES: Record<ExternalKind, Pair> = {
  database: { pt: 'Banco de dados', en: 'Database' },
  cache: { pt: 'Memória rápida', en: 'Quick memory' },
  queue: { pt: 'Fila de tarefas', en: 'Task queue' },
  llm: { pt: 'Modelo de IA', en: 'AI model' },
  email: { pt: 'Serviço de e-mail', en: 'E-mail service' },
  payment: { pt: 'Pagamentos', en: 'Payments' },
  messaging: { pt: 'Mensagens', en: 'Messaging' },
  storage: { pt: 'Arquivos', en: 'File storage' },
  auth: { pt: 'Login', en: 'Sign-in' },
  http: { pt: 'Serviço externo', en: 'Outside service' },
}

/** The gender of the Portuguese words that name a part, so articles agree ("a Recepção", "o Porteiro"). */
const PT_GENDER = new Map<string, 'o' | 'a' | 'os' | 'as'>([
  ['recepção', 'a'], ['sistema', 'o'], ['porteiro', 'o'], ['regras', 'as'], ['telas', 'as'], ['tela', 'a'],
  ['assistente', 'o'], ['bastidores', 'os'], ['arquivo', 'o'], ['arquivos', 'os'], ['banco', 'o'],
  ['fila', 'a'], ['serviço', 'o'], ['modelo', 'o'], ['memória', 'a'], ['configuração', 'a'],
  ['configurações', 'as'], ['ajudantes', 'os'], ['inspetor', 'o'], ['usuário', 'o'], ['conversa', 'a'],
  ['cobrança', 'a'], ['painel', 'o'], ['agenda', 'a'], ['ligação', 'a'], ['nota', 'a'], ['consulta', 'a'],
  ['reunião', 'a'], ['clima', 'o'], ['chamado', 'o'], ['tarefa', 'a'], ['ferramenta', 'a'],
  ['ferramentas', 'as'], ['mensagem', 'a'], ['pedido', 'o'], ['pedidos', 'os'], ['cliente', 'o'],
  ['produto', 'o'], ['pagamento', 'o'], ['fatura', 'a'], ['conta', 'a'], ['vendas', 'as'],
  ['estoque', 'o'], ['entrega', 'a'], ['carrinho', 'o'], ['catálogo', 'o'], ['aviso', 'o'],
  ['relatório', 'o'], ['negócio', 'o'], ['contato', 'o'], ['equipe', 'a'], ['projeto', 'o'],
  ['leads', 'os'], ['comandos', 'os'], ['rotinas', 'as'], ['loja', 'a'], ['comunidade', 'a'], ['organização', 'a'], ['bastidores', 'os'], ['páginas', 'as'], ['peças', 'as'], ['fichas', 'as'], ['ajudantes', 'os'], ['aplicativo', 'o'], ['site', 'o'], ['servidor', 'o'], ['lead', 'o'], ['usuários', 'os'], ['clientes', 'os'], ['tarefas', 'as'],
])

function pair(pt: string, en: string = pt): Pair {
  return { pt, en }
}

/** Upper-cases the first letter of a name. */
function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** Lower-cases the first letter unless the word is an acronym ("AI model" keeps its capitals). */
function lowerFirst(s: string): string {
  if (!s) return s
  const second = s.charAt(1)
  if (second && second === second.toUpperCase() && second !== second.toLowerCase()) return s
  return s.charAt(0).toLowerCase() + s.slice(1)
}

/** The Portuguese gender of a name, from its first word; unknown words are guessed from their ending. */
export function ptGender(name: string): 'o' | 'a' | 'os' | 'as' {
  const head = name.split(' ')[0].toLowerCase()
  const known = PT_GENDER.get(head)
  if (known) return known
  if (/as$/.test(head)) return 'as'
  if (/a$/.test(head)) return 'a'
  if (/s$/.test(head)) return 'os'
  return 'o'
}

/** The subject of a folder: its deepest segment that says something ("backend/apps/leads" → "leads"). */
export function subjectOf(path: string): string | null {
  const segments = path.split('/').filter(Boolean)
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]
    const lower = seg.toLowerCase()
    // A route group of Expo Router or Next.js, "(aluno)", is named for whose screens it holds.
    const group = /^\((\w[\w-]*)\)$/.exec(seg)
    if (group && group[1].length >= 3 && (!GENERIC.has(group[1].toLowerCase()) || group[1].toLowerCase() === 'auth')) return group[1]
    if (GENERIC.has(lower) || seg.length < 3) continue
    if (/^v\d+$/.test(lower)) continue
    if (/^[[(_.@$]/.test(seg) || seg.includes('.')) continue
    return seg
  }
  return null
}

/** A folder segment as people say it, in both languages, in lower case; null when it names nothing. */
function segmentText(raw: string): Text | null {
  const words = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
  if (words.length === 0) return null
  return {
    pt: words.map((w) => DOMAIN.get(w)?.pt ?? (readableWord(w).pt !== w ? readableWord(w).pt : accentuate(humanField(w, 'pt')))).join(' '),
    en: words.map((w) => DOMAIN.get(w)?.en ?? readableWord(w).en).join(' '),
  }
}

/** The subject as people say it, in both languages, in lower case; null when the folder names none. */
export function subjectText(path: string): Text | null {
  const raw = subjectOf(path)
  return raw ? segmentText(raw) : null
}

/**
 * The nearest non-generic folder above the subject, as people say it ("painel" in "painel/leads/pages").
 * Used to tell apart two parts that would otherwise share a name.
 */
function parentText(path: string): Text | null {
  const segments = path.split('/').filter(Boolean)
  const subject = subjectOf(path)
  const at = subject ? segments.lastIndexOf(subject) : -1
  for (let i = at - 1; i >= 0; i--) {
    const seg = segments[i]
    if (GENERIC.has(seg.toLowerCase()) || seg.length < 3) continue
    return segmentText(seg)
  }
  return null
}

/** Folder words that name a kind of part, so a part is "Páginas" rather than a plain "Telas" when its folder is "pages". */
const FOLDER_NOUNS = new Map<string, Pair>([
  ['pages', pair('Páginas', 'Pages')],
  ['page', pair('Páginas', 'Pages')],
  ['components', pair('Peças da tela', 'Screen pieces')],
  ['component', pair('Peças da tela', 'Screen pieces')],
  ['ui', pair('Peças da tela', 'Screen pieces')],
  ['screens', pair('Telas', 'Screens')],
  ['screen', pair('Telas', 'Screens')],
  ['views', pair('Telas', 'Screens')],
  ['view', pair('Telas', 'Screens')],
  ['routes', pair('Recepção', 'Front desk')],
  ['route', pair('Recepção', 'Front desk')],
  ['router', pair('Recepção', 'Front desk')],
  ['routers', pair('Recepção', 'Front desk')],
  ['controllers', pair('Recepção', 'Front desk')],
  ['controller', pair('Recepção', 'Front desk')],
  ['handlers', pair('Recepção', 'Front desk')],
  ['handler', pair('Recepção', 'Front desk')],
  ['endpoints', pair('Recepção', 'Front desk')],
  ['endpoint', pair('Recepção', 'Front desk')],
  ['api', pair('Recepção', 'Front desk')],
  ['apis', pair('Recepção', 'Front desk')],
  ['urls', pair('Recepção', 'Front desk')],
  ['middleware', pair('Porteiro', 'Doorman')],
  ['middlewares', pair('Porteiro', 'Doorman')],
  ['guards', pair('Porteiro', 'Doorman')],
  ['services', pair('Regras do negócio', 'Business rules')],
  ['service', pair('Regras do negócio', 'Business rules')],
  ['domain', pair('Regras do negócio', 'Business rules')],
  ['usecases', pair('Regras do negócio', 'Business rules')],
  ['use_cases', pair('Regras do negócio', 'Business rules')],
  ['models', pair('Fichas de dados', 'Data cards')],
  ['model', pair('Fichas de dados', 'Data cards')],
  ['entities', pair('Fichas de dados', 'Data cards')],
  ['schemas', pair('Fichas de dados', 'Data cards')],
  ['schema', pair('Fichas de dados', 'Data cards')],
  ['repositories', pair('Arquivo', 'Records')],
  ['repository', pair('Arquivo', 'Records')],
  ['db', pair('Arquivo', 'Records')],
  ['database', pair('Arquivo', 'Records')],
  ['jobs', pair('Bastidores', 'Back office')],
  ['job', pair('Bastidores', 'Back office')],
  ['workers', pair('Bastidores', 'Back office')],
  ['worker', pair('Bastidores', 'Back office')],
  ['tasks', pair('Bastidores', 'Back office')],
  ['queues', pair('Bastidores', 'Back office')],
  ['agent', pair('Assistente de IA', 'AI assistant')],
  ['agents', pair('Assistente de IA', 'AI assistant')],
  ['ai', pair('Assistente de IA', 'AI assistant')],
  ['llm', pair('Assistente de IA', 'AI assistant')],
  ['hooks', pair('Ajudantes da tela', 'Screen helpers')],
  ['lib', pair('Ajudantes', 'Helpers')],
  ['libs', pair('Ajudantes', 'Helpers')],
  ['utils', pair('Ajudantes', 'Helpers')],
  ['helpers', pair('Ajudantes', 'Helpers')],
  ['helper', pair('Ajudantes', 'Helpers')],
  ['common', pair('Ajudantes', 'Helpers')],
  ['shared', pair('Ajudantes', 'Helpers')],
  ['management', pair('Comandos', 'Commands')],
  ['commands', pair('Comandos', 'Commands')],
  ['scripts', pair('Rotinas', 'Scripts')],
  ['config', pair('Configuração', 'Setup')],
  ['settings', pair('Configuração', 'Setup')],
  ['tests', pair('Inspetor', 'Inspector')],
  ['test', pair('Inspetor', 'Inspector')],
  ['spec', pair('Inspetor', 'Inspector')],
])

/** The names of a whole app, a website or a server, which only one part at a time wears. */
const APP_NOUNS = new Set(['Site', 'Aplicativo', 'Servidor'])

/** Top-level folders of an app: their parts are the whole app, a website or a server. */
const APP_ROOTS = new Set(['', 'src', 'app', 'source', 'backend', 'frontend', 'server', 'web', 'client'])

/** The plain noun of a part's own folder: its generic word's noun, the app itself at a root, else its layer. */
function nounOf(c: Named): Text {
  const segments = c.path.split('/').filter(Boolean)
  for (let i = segments.length - 1; i >= 0; i--) {
    const noun = FOLDER_NOUNS.get(segments[i].toLowerCase())
    if (noun) return { pt: noun.pt, en: noun.en }
  }
  const last = (segments[segments.length - 1] ?? '').toLowerCase()
  // Loose files at the repo's root that only set the project up (vite.config.js) are its setup, not the app.
  if (APP_ROOTS.has(last) && !(segments.length === 0 && c.layer === 'infra')) {
    const head = (segments[0] ?? '').toLowerCase()
    if (/front|web|client/.test(head) || last === 'web' || last === 'client') return { pt: 'Site', en: 'Website' }
    if (/back|server/.test(head) || last === 'server' || last === 'backend') return { pt: 'Servidor', en: 'Server' }
    return { pt: 'Aplicativo', en: 'App' }
  }
  return { pt: LAYER_NAMES[c.layer].pt, en: LAYER_NAMES[c.layer].en }
}

/** The part's plain name with its subject, when that fits in 28 characters; else the folder's own noun. */
function candidateOf(c: Named): Text {
  const base = nounOf(c)
  const subject = subjectText(c.path)
  if (!subject) return base
  // Django's management commands are commands of their app, whatever layer their code looks like.
  const commands = /(^|\/)(management|commands)$/i.test(c.path)
  const layer = commands ? { ptWith: 'Comandos de {s}', enWith: '{S} commands' } : LAYER_NAMES[c.layer]
  const withSubject = {
    pt: layer.ptWith.replace('{s}', subject.pt).replace('{S}', capitalise(subject.pt)),
    en: layer.enWith.replace('{s}', subject.en).replace('{S}', capitalise(subject.en)),
  }
  return withSubject.pt.length <= 28 && withSubject.en.length <= 28 ? withSubject : base
}

function sameText(a: Text, b: Text): boolean {
  return a.pt === b.pt && a.en === b.en
}

/**
 * The name a resident wears for a part: its folder's noun ("Páginas", "Regras do negócio"), with the
 * subject of the folder when there is one ("Recepção de leads"). When two parts still share a name, the
 * later one takes its parent folder ("Telas do painel"); only when that fails does it get a number.
 * `siblings` is every part in the model, in order, and may include `c` itself.
 */
export function plainPartName(c: Named, siblings: Named[]): Text {
  const cand = candidateOf(c)
  const list: Named[] = siblings.includes(c) ? siblings : [...siblings, c]
  const group = list.filter((s) => sameText(candidateOf(s), cand))
  if (group.length <= 1) return cand
  if (APP_NOUNS.has(cand.pt)) {
    const owner = group.find((s) => s.layer === 'interface') ?? group.find((s) => s.layer !== 'infra') ?? group[0]
    if (owner === c) return cand
    // The layer's own word, without a subject: "Regras", "Configuração"; "rules", "setup".
    const layer = LAYER_NAMES[c.layer]
    const role = { pt: layer.ptWith.replace(' de {s}', ''), en: layer.enWith.replace('{S} ', '') }
    const named = { pt: `${role.pt} do ${cand.pt.toLowerCase()}`, en: `${cand.en} ${role.en}` }
    if (named.pt.length <= 28 && named.en.length <= 28 && !group.some((s) => s !== c && s.layer === c.layer)) return named
  }
  const k = group.indexOf(c)
  if (k <= 0) return cand
  const parent = parentText(c.path)
  if (parent) {
    const noun = nounOf(c)
    const named = { pt: `${noun.pt} do ${parent.pt}`, en: `${capitalise(parent.en)} ${noun.en.toLowerCase()}` }
    if (named.pt.length <= 28 && named.en.length <= 28) return named
  }
  return { pt: `${cand.pt} ${k + 1}`, en: `${cand.en} ${k + 1}` }
}

/** The plain name of a layer, without a subject: "Telas", "Front desk". */
export function plainLayerName(layer: Layer): Text {
  return { pt: LAYER_NAMES[layer].pt, en: LAYER_NAMES[layer].en }
}

/**
 * A tool's name as a sentence reads it: the verb is translated, then the nouns, and the first letter
 * is capitalised. "search_leads" → "Buscar leads"; "add_note" → "Adicionar nota".
 */
export function plainToolName(name: string): Text {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
  if (words.length === 0) return { pt: name, en: name }
  const verb = VERBS.get(words[0])
  const nouns = (verb ? words.slice(1) : words).map((w) => DOMAIN.get(w) ?? pair(w))
  const pt = [verb?.pt ?? '', ...nouns.map((n) => n.pt)].filter(Boolean).join(' ')
  const en = [verb?.en ?? '', ...nouns.map((n) => n.en)].filter(Boolean).join(' ')
  return { pt: capitalise(pt), en: capitalise(en) }
}

/** The plain name of an outside service's kind: "Banco de dados", "Fila de tarefas". Brands never appear. */
export function plainExternalName(kind: ExternalKind): Text {
  return { ...EXTERNAL_NAMES[kind] }
}

/** Words in an agent's code name that only say it is an agent ("SupportAgent" → "support"). */
const AGENT_WORDS = new Set(['agent', 'agents', 'assistant', 'bot', 'ai', 'llm', 'graph', 'chain', 'main', 'index', 'default', 'my'])

/**
 * The name of an agent in the scenes: its component's plain name when the folder names a subject;
 * otherwise the subject of the agent's own code name ("support" → "Assistente de atendimento");
 * otherwise "Assistente de IA", since a folder called "agent" says nothing to a reader.
 */
export function plainAgentName(part: { path: string; label?: Text } | null, codeName?: string): Text {
  const fallback = { pt: 'Assistente de IA', en: 'AI assistant' }
  if (part && subjectOf(part.path)) return part.label ?? fallback
  const words = (codeName ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !AGENT_WORDS.has(w.toLowerCase()))
  const subject = words.length ? segmentText(words.join(' ')) : null
  if (!subject) return fallback
  const named = { pt: `Assistente de ${subject.pt}`, en: `${capitalise(subject.en)} assistant` }
  return named.pt.length <= 28 && named.en.length <= 28 ? named : fallback
}

/**
 * The plain name of a screens part that holds a single screen, from that screen's title: "Leads" →
 * "Tela de leads" / "Leads screen". Null when the title is too long to wear on a name tag.
 */
export function screenPartName(title: string): Text | null {
  const t = title.replace(/\s+/g, ' ').trim()
  if (!t || t.length > 18) return null
  const named = { pt: `Tela de ${lowerFirst(t)}`, en: `${capitalise(t)} screen` }
  return named.pt.length <= 28 && named.en.length <= 28 ? named : null
}

/** A preposition a plain name can follow in a sentence; "none" leaves the name bare after its article. */
export type Prep = 'none' | 'a' | 'de' | 'em' | 'para' | 'por'

/** Portuguese contractions of a preposition with the article that agrees with the name. */
const PT_CONTRACTED: Record<Exclude<Prep, 'none' | 'para'>, Record<'o' | 'a' | 'os' | 'as', string>> = {
  a: { o: 'ao', a: 'à', os: 'aos', as: 'às' },
  de: { o: 'do', a: 'da', os: 'dos', as: 'das' },
  em: { o: 'no', a: 'na', os: 'nos', as: 'nas' },
  por: { o: 'pelo', a: 'pela', os: 'pelos', as: 'pelas' },
}

/** English prepositions; "a" has none because "asks the AI model" takes no preposition. */
const EN_PREP: Record<Prep, string> = { none: '', a: '', de: 'of', em: 'in', para: 'to', por: 'by' }

/**
 * A plain name in a sentence, with its article and preposition: "a recepção", "para a recepção",
 * "no banco de dados", "in the database". The name keeps its words and only its first letter changes
 * case, so acronyms ("AI model") stay as they are.
 */
export function nameWith(prep: Prep, name: string, lang: Lang, start = false): string {
  let text: string
  if (lang === 'en') {
    const lead = EN_PREP[prep] ? `${EN_PREP[prep]} ` : ''
    text = `${lead}the ${lowerFirst(name)}`
  } else {
    const g = ptGender(name)
    const n = lowerFirst(name)
    if (prep === 'none') text = `${g} ${n}`
    else if (prep === 'para') text = `para ${g} ${n}`
    else text = `${PT_CONTRACTED[prep][g]} ${n}`
  }
  return start ? capitalise(text) : text
}

/** A plain name with its article, in a sentence: "a recepção", "o modelo de IA", "the front desk". */
export function withArticle(name: string, lang: Lang, start = false): string {
  return nameWith('none', name, lang, start)
}

/** A plain name with "a"/"an" or "um"/"uma" ("um banco de dados", "a database"). */
export function indefiniteArticle(name: string, lang: Lang): string {
  if (lang === 'en') return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${lowerFirst(name)}`
  const article = { o: 'um', a: 'uma', os: 'uns', as: 'umas' }[ptGender(name)]
  return `${article} ${lowerFirst(name)}`
}

/**
 * Whether a plain name is plural, so the verb after it can agree: "as telas" and "Business rules" take
 * the plural form ("as telas mostram", "business rules show"), "a recepção" and "Front desk" don't.
 */
export function isPlural(name: string, lang: Lang): boolean {
  if (lang === 'pt') return ['os', 'as'].includes(ptGender(name))
  const last = name.trim().split(' ').pop() ?? ''
  return /s$/i.test(last) && !/ss$/i.test(last)
}
