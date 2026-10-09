import { describe, expect, it } from 'vitest'
import type { Layer } from '../shared/studio'
import { indefiniteArticle, nameWith, plainAgentName, plainExternalName, plainPartName, plainToolName, screenPartName, subjectOf, subjectText, withArticle } from './plain'

const part = (path: string, layer: Layer, name = path) => ({ name, path, layer })

describe('subjectOf', () => {
  it('skips generic folder words and keeps the deepest subject', () => {
    expect(subjectOf('backend/apps/leads')).toBe('leads')
    expect(subjectOf('frontend/src/components')).toBeNull()
    expect(subjectOf('api/v2/orders')).toBe('orders')
  })

  it('reads a route group of Expo Router or Next.js as its subject', () => {
    expect(subjectOf('app/app/(aluno)')).toBe('aluno')
    expect(subjectOf('app/app/(auth)')).toBe('auth')
  })

  it('ignores the #direct marker, short names, file-like names and brackets', () => {
    expect(subjectOf('src/a')).toBeNull()
    expect(subjectOf('app/[id]')).toBeNull()
    expect(subjectOf('app/page.tsx')).toBeNull()
  })
})

describe('subjectText', () => {
  it('translates the known domain words in both languages', () => {
    expect(subjectText('apps/customers')).toEqual({ pt: 'clientes', en: 'customers' })
    expect(subjectText('apps/billing')).toEqual({ pt: 'cobrança', en: 'billing' })
  })

  it('keeps unknown subjects as they are, lower-cased and spaced', () => {
    expect(subjectText('apps/lead_scoring')).toEqual({ pt: 'lead scoring', en: 'lead scoring' })
    expect(subjectText('apps/customerOrders')).toEqual({ pt: 'cliente pedidos', en: 'customer orders' })
  })

  it('is null when the folder names nothing', () => {
    expect(subjectText('backend/services')).toBeNull()
  })
})

describe('plainPartName', () => {
  it('names a generic folder by its own noun', () => {
    expect(plainPartName(part('frontend/pages', 'interface'), [])).toEqual({ pt: 'Páginas', en: 'Pages' })
    expect(plainPartName(part('frontend/components', 'interface'), [])).toEqual({ pt: 'Peças da tela', en: 'Screen pieces' })
    expect(plainPartName(part('backend/routes', 'api'), [])).toEqual({ pt: 'Recepção', en: 'Front desk' })
    expect(plainPartName(part('backend/middleware', 'security'), [])).toEqual({ pt: 'Porteiro', en: 'Doorman' })
    expect(plainPartName(part('backend/services', 'logic'), [])).toEqual({ pt: 'Regras do negócio', en: 'Business rules' })
    expect(plainPartName(part('backend/models', 'data'), [])).toEqual({ pt: 'Fichas de dados', en: 'Data cards' })
    expect(plainPartName(part('backend/db', 'data'), [])).toEqual({ pt: 'Arquivo', en: 'Records' })
    expect(plainPartName(part('backend/jobs', 'jobs'), [])).toEqual({ pt: 'Bastidores', en: 'Back office' })
    expect(plainPartName(part('backend/ai', 'ai'), [])).toEqual({ pt: 'Assistente de IA', en: 'AI assistant' })
    expect(plainPartName(part('src/hooks', 'shared'), [])).toEqual({ pt: 'Ajudantes da tela', en: 'Screen helpers' })
    expect(plainPartName(part('src/lib', 'shared'), [])).toEqual({ pt: 'Ajudantes', en: 'Helpers' })
    expect(plainPartName(part('config', 'infra'), [])).toEqual({ pt: 'Configuração', en: 'Setup' })
    expect(plainPartName(part('tests', 'tests'), [])).toEqual({ pt: 'Inspetor', en: 'Inspector' })
  })

  it('names an app root as the app, the website or the server', () => {
    expect(plainPartName(part('frontend/src', 'interface'), [])).toEqual({ pt: 'Site', en: 'Website' })
    expect(plainPartName(part('backend', 'api'), [])).toEqual({ pt: 'Servidor', en: 'Server' })
    expect(plainPartName(part('app', 'shared'), [])).toEqual({ pt: 'Aplicativo', en: 'App' })
  })

  it('names loose setup files at the root as the setup, and an app folder as the app', () => {
    expect(plainPartName(part('', 'infra'), [])).toEqual({ pt: 'Configuração', en: 'Setup' })
    expect(plainPartName(part('app', 'infra'), [])).toEqual({ pt: 'Aplicativo', en: 'App' })
  })

  it('adds the subject of the folder, when there is one', () => {
    expect(plainPartName(part('apps/leads/routes', 'api'), [])).toEqual({ pt: 'Recepção de leads', en: 'Leads desk' })
    expect(plainPartName(part('apps/orders', 'logic'), [])).toEqual({ pt: 'Regras de pedidos', en: 'Orders rules' })
    expect(plainPartName(part('apps/leads/pages', 'interface'), [])).toEqual({ pt: 'Tela de leads', en: 'Leads screen' })
  })

  it('tells apart two parts with the same name: the parent folder first, then a number', () => {
    const a = part('pages', 'interface')
    const b = part('dashboard/pages', 'interface')
    const c = part('painel/leads/pages', 'interface')
    const d = part('painel/leads/screens', 'interface')
    expect(plainPartName(a, [a, b])).toEqual({ pt: 'Páginas', en: 'Pages' })
    expect(plainPartName(c, [c, d])).toEqual({ pt: 'Tela de leads', en: 'Leads screen' })
    expect(plainPartName(d, [c, d])).toEqual({ pt: 'Telas do painel', en: 'Painel screens' })
    const twins = [part('frontend/pages', 'interface'), part('frontend/pages', 'interface')]
    expect(plainPartName(twins[1], twins)).toEqual({ pt: 'Páginas 2', en: 'Pages 2' })
  })

  it('names the screens of a route group after it, with "auth" as the sign-in screens', () => {
    expect(plainPartName(part('app/app/(aluno)', 'interface'), [])).toEqual({ pt: 'Tela de aluno', en: 'Aluno screen' })
    expect(plainPartName(part('app/app/(auth)', 'interface'), [])).toEqual({ pt: 'Tela de acesso', en: 'Sign-in screen' })
  })

  it('lets the screens keep the name of the app, and names the other parts at its root by their role in it', () => {
    const setup = part('frontend', 'infra')
    const site = part('frontend/src', 'interface')
    expect(plainPartName(setup, [setup, site])).toEqual({ pt: 'Configuração do site', en: 'Website setup' })
    expect(plainPartName(site, [setup, site])).toEqual({ pt: 'Site', en: 'Website' })
    const rules = part('app/src', 'logic')
    const screens = part('app/app', 'interface')
    expect(plainPartName(rules, [rules, screens])).toEqual({ pt: 'Regras do aplicativo', en: 'App rules' })
    expect(plainPartName(screens, [rules, screens])).toEqual({ pt: 'Aplicativo', en: 'App' })
  })

  it('names Django commands and script folders by what they are', () => {
    expect(plainPartName(part('backend/core/management', 'logic'), [])).toEqual({ pt: 'Comandos', en: 'Commands' })
    expect(plainPartName(part('scripts', 'infra'), [])).toEqual({ pt: 'Rotinas', en: 'Scripts' })
    expect(plainPartName(part('backend/contracts/management', 'logic'), [])).toEqual({ pt: 'Comandos de contracts', en: 'Contracts commands' })
  })

  it('keeps every name within 28 characters', () => {
    const name = plainPartName(part('backend/apps/a_very_long_subject_name_for_the_folder/services', 'logic'), [])
    expect(name.pt.length).toBeLessThanOrEqual(28)
    expect(name.en.length).toBeLessThanOrEqual(28)
  })
})

describe('plainToolName', () => {
  it('translates the leading verb and the known nouns', () => {
    expect(plainToolName('search_leads')).toEqual({ pt: 'Buscar leads', en: 'Search leads' })
    expect(plainToolName('add_note')).toEqual({ pt: 'Adicionar nota', en: 'Add note' })
    expect(plainToolName('schedule_call')).toEqual({ pt: 'Agendar ligação', en: 'Schedule call' })
  })

  it('reads camel case the same way', () => {
    expect(plainToolName('searchLeads')).toEqual({ pt: 'Buscar leads', en: 'Search leads' })
    expect(plainToolName('sendEmail')).toEqual({ pt: 'Enviar e-mail', en: 'Send e-mail' })
  })

  it('translates the verbs of each group', () => {
    expect(plainToolName('list_tickets').pt).toBe('Listar chamados')
    expect(plainToolName('update_order').pt).toBe('Atualizar pedido')
    expect(plainToolName('delete_file').pt).toBe('Apagar arquivo')
    expect(plainToolName('cancel_appointment').pt).toBe('Cancelar consulta')
    expect(plainToolName('check_stock').pt).toBe('Conferir estoque')
    expect(plainToolName('calculate_total').pt).toBe('Calcular total')
    expect(plainToolName('notify_team').pt).toBe('Avisar equipe')
    expect(plainToolName('summarize_report').pt).toBe('Resumir relatório')
    expect(plainToolName('translate_text').pt).toBe('Traduzir texto')
    expect(plainToolName('generate_invoice').pt).toBe('Gerar fatura')
    expect(plainToolName('download_file').pt).toBe('Baixar arquivo')
  })

  it('keeps the words it does not know and capitalises the first letter', () => {
    expect(plainToolName('weather_report')).toEqual({ pt: 'Clima relatório', en: 'Weather report' })
    expect(plainToolName('lookup_zipcode').pt).toBe('Buscar zipcode')
  })
})

describe('plainExternalName', () => {
  it('names each kind of outside service without its brand', () => {
    expect(plainExternalName('database')).toEqual({ pt: 'Banco de dados', en: 'Database' })
    expect(plainExternalName('cache')).toEqual({ pt: 'Memória rápida', en: 'Quick memory' })
    expect(plainExternalName('queue')).toEqual({ pt: 'Fila de tarefas', en: 'Task queue' })
    expect(plainExternalName('llm')).toEqual({ pt: 'Modelo de IA', en: 'AI model' })
    expect(plainExternalName('email')).toEqual({ pt: 'Serviço de e-mail', en: 'E-mail service' })
    expect(plainExternalName('payment')).toEqual({ pt: 'Pagamentos', en: 'Payments' })
    expect(plainExternalName('messaging')).toEqual({ pt: 'Mensagens', en: 'Messaging' })
    expect(plainExternalName('storage')).toEqual({ pt: 'Arquivos', en: 'File storage' })
    expect(plainExternalName('auth')).toEqual({ pt: 'Login', en: 'Sign-in' })
    expect(plainExternalName('http')).toEqual({ pt: 'Serviço externo', en: 'Outside service' })
  })
})

describe('plainAgentName', () => {
  it('uses the component name when its folder names a subject', () => {
    expect(plainAgentName({ path: 'apps/sales', label: { pt: 'Assistente de vendas', en: 'Sales assistant' } })).toEqual({ pt: 'Assistente de vendas', en: 'Sales assistant' })
  })

  it('falls back to the AI assistant when the folder is generic', () => {
    expect(plainAgentName({ path: 'backend/agent' })).toEqual({ pt: 'Assistente de IA', en: 'AI assistant' })
    expect(plainAgentName(null)).toEqual({ pt: 'Assistente de IA', en: 'AI assistant' })
  })

  it('takes the subject of the agent’s code name when the folder names nothing', () => {
    expect(plainAgentName({ path: 'backend/agent' }, 'support')).toEqual({ pt: 'Assistente de atendimento', en: 'Support assistant' })
    expect(plainAgentName(null, 'SalesAgent')).toEqual({ pt: 'Assistente de vendas', en: 'Sales assistant' })
    expect(plainAgentName(null, 'agent')).toEqual({ pt: 'Assistente de IA', en: 'AI assistant' })
    expect(plainAgentName(null, 'my_ai_bot')).toEqual({ pt: 'Assistente de IA', en: 'AI assistant' })
  })

  it('keeps the folder’s subject over the code name', () => {
    expect(plainAgentName({ path: 'apps/sales', label: { pt: 'Assistente de vendas', en: 'Sales assistant' } }, 'support').pt).toBe('Assistente de vendas')
  })
})

describe('screenPartName', () => {
  it('names a screens part after its one screen', () => {
    expect(screenPartName('Leads')).toEqual({ pt: 'Tela de leads', en: 'Leads screen' })
    expect(screenPartName('  Novo   pedido ')).toEqual({ pt: 'Tela de novo pedido', en: 'Novo pedido screen' })
  })

  it('keeps acronyms and leaves long titles out', () => {
    expect(screenPartName('CRM')?.pt).toBe('Tela de CRM')
    expect(screenPartName('Acompanhamento de todos os pedidos')).toBeNull()
    expect(screenPartName('')).toBeNull()
  })
})

describe('articles', () => {
  it('gives the Portuguese article that agrees with the part', () => {
    expect(withArticle('Recepção', 'pt')).toBe('a recepção')
    expect(withArticle('Porteiro', 'pt')).toBe('o porteiro')
    expect(withArticle('Telas', 'pt')).toBe('as telas')
    expect(withArticle('Modelo de IA', 'pt', true)).toBe('O modelo de IA')
  })

  it('gives the English article', () => {
    expect(withArticle('Front desk', 'en')).toBe('the front desk')
    expect(withArticle('AI model', 'en')).toBe('the AI model')
    expect(withArticle('Front desk', 'en', true)).toBe('The front desk')
  })

  it('joins a preposition with its article', () => {
    expect(nameWith('a', 'Modelo de IA', 'pt')).toBe('ao modelo de IA')
    expect(nameWith('em', 'Banco de dados', 'pt')).toBe('no banco de dados')
    expect(nameWith('de', 'Telas', 'pt')).toBe('das telas')
    expect(nameWith('para', 'Recepção', 'pt')).toBe('para a recepção')
    expect(nameWith('em', 'Task queue', 'en')).toBe('in the task queue')
    expect(nameWith('a', 'AI model', 'en')).toBe('the AI model')
  })

  it('gives the indefinite article', () => {
    expect(indefiniteArticle('Banco de dados', 'pt')).toBe('um banco de dados')
    expect(indefiniteArticle('Fila de tarefas', 'pt')).toBe('uma fila de tarefas')
    expect(indefiniteArticle('AI model', 'en')).toBe('an AI model')
    expect(indefiniteArticle('Database', 'en')).toBe('a database')
  })
})
