/**
 * The words of routes and file names as a person reads them in each language. Code is written in
 * English or in Portuguese without accents ("contracts", "analises", "estudio"); the captions are
 * read by someone who doesn't code, in Portuguese or in English, so a known word is translated or
 * gets its accents back ("contratos", "análises", "estúdio"). Unknown words are left as written.
 */
import type { Text } from '../shared/studio'

/** Each concept: Portuguese singular and plural, English singular and plural. */
const CONCEPTS: [string, string, string, string][] = [
  ['análise', 'análises', 'analysis', 'analyses'],
  ['artigo', 'artigos', 'article', 'articles'],
  ['assessoria', 'assessorias', 'coaching group', 'coaching groups'],
  ['assinatura', 'assinaturas', 'subscription', 'subscriptions'],
  ['aluno', 'alunos', 'student', 'students'],
  ['avaliação', 'avaliações', 'review', 'reviews'],
  ['aviso', 'avisos', 'notice', 'notices'],
  ['banda', 'bandas', 'band', 'bands'],
  ['barraca', 'barracas', 'stall', 'stalls'],
  ['candidatura', 'candidaturas', 'application', 'applications'],
  ['cardápio', 'cardápios', 'menu', 'menus'],
  ['categoria', 'categorias', 'category', 'categories'],
  ['cliente', 'clientes', 'customer', 'customers'],
  ['código', 'códigos', 'code', 'codes'],
  ['comentário', 'comentários', 'comment', 'comments'],
  ['configuração', 'configurações', 'setting', 'settings'],
  ['conta', 'contas', 'account', 'accounts'],
  ['contrato', 'contratos', 'contract', 'contracts'],
  ['dado', 'dados', 'data', 'data'],
  ['denúncia', 'denúncias', 'complaint', 'complaints'],
  ['relatório', 'relatórios', 'report', 'reports'],
  ['dependente', 'dependentes', 'dependent', 'dependents'],
  ['empresa', 'empresas', 'company', 'companies'],
  ['episódio', 'episódios', 'episode', 'episodes'],
  ['equipamento', 'equipamentos', 'equipment', 'equipment'],
  ['estúdio', 'estúdios', 'studio', 'studios'],
  ['evento', 'eventos', 'event', 'events'],
  ['favorito', 'favoritos', 'favorite', 'favorites'],
  ['festival', 'festivais', 'festival', 'festivals'],
  ['foto', 'fotos', 'photo', 'photos'],
  ['histórico', 'históricos', 'history', 'histories'],
  ['informação', 'informações', 'information', 'information'],
  ['manutenção', 'manutenções', 'maintenance', 'maintenance'],
  ['mensagem', 'mensagens', 'message', 'messages'],
  ['mídia', 'mídias', 'media', 'media'],
  ['modelo', 'modelos', 'template', 'templates'],
  ['notificação', 'notificações', 'notification', 'notifications'],
  ['pagamento', 'pagamentos', 'payment', 'payments'],
  ['página', 'páginas', 'page', 'pages'],
  ['pedido', 'pedidos', 'order', 'orders'],
  ['perfil', 'perfis', 'profile', 'profiles'],
  ['planilha', 'planilhas', 'spreadsheet', 'spreadsheets'],
  ['postagem', 'postagens', 'post', 'posts'],
  ['prato', 'pratos', 'dish', 'dishes'],
  ['prévia', 'prévias', 'preview', 'previews'],
  ['produto', 'produtos', 'product', 'products'],
  ['professor', 'professores', 'teacher', 'teachers'],
  ['projeto', 'projetos', 'project', 'projects'],
  ['reserva', 'reservas', 'booking', 'bookings'],
  ['responsável', 'responsáveis', 'guardian', 'guardians'],
  ['sala', 'salas', 'room', 'rooms'],
  ['seguidor', 'seguidores', 'follower', 'followers'],
  ['sessão', 'sessões', 'session', 'sessions'],
  ['tarefa', 'tarefas', 'task', 'tasks'],
  ['treino', 'treinos', 'workout', 'workouts'],
  ['turma', 'turmas', 'class', 'classes'],
  ['usuário', 'usuários', 'user', 'users'],
  ['vaga', 'vagas', 'opening', 'openings'],
  ['gestão', 'gestões', 'management', 'management'],
  ['vídeo', 'vídeos', 'video', 'videos'],
  ['área', 'áreas', 'area', 'areas'],
]

/** A word without accents, as code writes it: "análises" → "analises", "configuração" → "configuracao". */
function ascii(word: string): string {
  return word.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

type Entry = { pt: string; en: string; ptSingular: string }
const BY_WORD = new Map<string, Entry>()
/** Portuguese plurals, with and without accents, and their singular. */
const PT_SINGULAR = new Map<string, string>()
for (const [ps, pp, es, ep] of CONCEPTS) {
  PT_SINGULAR.set(pp, ps)
  PT_SINGULAR.set(ascii(pp), ps)
  const singular: Entry = { pt: ps, en: es, ptSingular: ps }
  const plural: Entry = { pt: pp, en: ep, ptSingular: ps }
  for (const [key, entry] of [[ps, singular], [ascii(ps), singular], [pp, plural], [ascii(pp), plural]] as [string, Entry][]) if (!BY_WORD.has(key)) BY_WORD.set(key, entry)
  // English words only name the concept when they aren't also the Portuguese word ("festival").
  if (!BY_WORD.has(es)) BY_WORD.set(es, singular)
  if (!BY_WORD.has(ep)) BY_WORD.set(ep, plural)
}

/** Keeps the first letter's case: "Estudio" → "Estúdio". */
function sameCase(model: string, word: string): string {
  return model.charAt(0) === model.charAt(0).toUpperCase() && model.charAt(0) !== model.charAt(0).toLowerCase()
    ? word.charAt(0).toUpperCase() + word.slice(1)
    : word
}

/**
 * A route or file word as people read it in each language: translated when it is a known English or
 * Portuguese word, with its accents back in Portuguese. A phrase is translated only when every word
 * is known; accents are restored word by word.
 */
export function readableWord(raw: string): Text {
  const words = raw.split(/\s+/).filter(Boolean)
  const entries = words.map((w) => BY_WORD.get(w.toLowerCase()) ?? null)
  const pt = words.map((w, i) => (entries[i] ? sameCase(w, entries[i]!.pt) : w)).join(' ')
  const en = entries.every(Boolean) ? words.map((w, i) => sameCase(w, entries[i]!.en)).join(' ') : raw
  return { pt, en }
}

/** The singular of a known Portuguese plural ("perfis" → "perfil"), or null for any other word. */
export function singularWord(word: string): string | null {
  return PT_SINGULAR.get(word.toLowerCase()) ?? null
}

/** Only the accents of known Portuguese words, word by word: "Minha banda gestao" → "Minha banda gestão". */
export function accentuate(text: string): string {
  return text.replace(/\p{L}+/gu, (w) => {
    const e = BY_WORD.get(w.toLowerCase())
    return e && ascii(e.pt) === ascii(w.toLowerCase()) ? sameCase(w, e.pt) : w
  })
}
