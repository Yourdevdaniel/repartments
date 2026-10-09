import { describe, expect, it } from 'vitest'
import {
  dataModelsOf,
  emailSubjectsOf,
  fieldList,
  humanField,
  mergeScreenDetails,
  modelForResource,
  plainLabel,
  screenDetailsOf,
  sentFieldsOf,
  singularOf,
  taskPhraseOf,
  tasksOf,
} from './details'

describe('dataModelsOf: Prisma', () => {
  it('reads the scalar fields of each model, with its line, and leaves out ids, timestamps, relations and secrets', () => {
    const schema = [
      'datasource db {',
      '  provider = "postgresql"',
      '}',
      '',
      'model Lead {',
      '  id           String    @id @default(uuid())',
      '  name         String',
      '  company      String?',
      '  email        String',
      '  passwordHash String',
      '  createdAt    DateTime  @default(now())',
      '  followedUpAt DateTime?',
      '  owner        User      @relation(fields: [ownerId], references: [id])',
      '  @@index([email])',
      '}',
    ].join('\n')
    const [lead] = dataModelsOf('backend/prisma/schema.prisma', schema)
    expect(lead).toEqual({ name: 'Lead', fields: ['name', 'company', 'email', 'followedUpAt'], line: 5 })
  })

  it('reads every model in the file', () => {
    const models = dataModelsOf('schema.prisma', 'model Lead {\n  name String\n}\nmodel Deal {\n  title String\n}\n')
    expect(models.map((m) => m.name)).toEqual(['Lead', 'Deal'])
  })
})

describe('dataModelsOf: Python ORMs', () => {
  it('reads a Django model, skipping foreign keys and the automatic id and timestamps', () => {
    const text = [
      'from django.db import models',
      '',
      'class Lead(models.Model):',
      '    name = models.CharField(max_length=120)',
      '    owner = models.ForeignKey(User, on_delete=models.CASCADE)',
      '    created_at = models.DateTimeField(auto_now_add=True)',
      '    api_token = models.CharField(max_length=40)',
      '',
      '    class Meta:',
      '        ordering = ["name"]',
      '',
      'def helper():',
      '    return 1',
    ].join('\n')
    expect(dataModelsOf('crm/models.py', text)).toEqual([{ name: 'Lead', fields: ['name'], line: 3 }])
  })

  it('reads a SQLAlchemy model with Column and with mapped_column', () => {
    const text = [
      'from sqlalchemy import Column, String',
      'from sqlalchemy.orm import Mapped, mapped_column',
      '',
      'class Lead(Base):',
      '    __tablename__ = "leads"',
      '    id = Column(Integer, primary_key=True)',
      '    name = Column(String(120))',
      '    email: Mapped[str] = mapped_column(String(200))',
      '    secret = Column(String)',
    ].join('\n')
    const [lead] = dataModelsOf('app/models.py', text)
    expect(lead).toEqual({ name: 'Lead', fields: ['name', 'email'], line: 4 })
  })

  it('ignores Python code that is not a model', () => {
    expect(dataModelsOf('app/main.py', 'class Service:\n    name = "x"\n')).toEqual([])
  })
})

describe('dataModelsOf: JavaScript ORMs', () => {
  it('reads a Mongoose model from model() and from a Schema constant', () => {
    const text = [
      "import { Schema, model } from 'mongoose'",
      "export const Lead = model('Lead', new Schema({ name: String, company: { type: String }, _id: String, createdAt: Date }))",
      'const TaskSchema = new Schema({',
      '  title: String, // the task',
      '  apiKey: String,',
      '  done: Boolean,',
      '})',
    ].join('\n')
    const models = dataModelsOf('src/models.ts', text)
    expect(models).toEqual([
      { name: 'Lead', fields: ['name', 'company'], line: 2 },
      { name: 'Task', fields: ['title', 'done'], line: 3 },
    ])
  })

  it('reads a TypeORM entity from its decorators', () => {
    const text = [
      "import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm'",
      '',
      '@Entity()',
      'export class Lead {',
      '  @PrimaryGeneratedColumn()',
      '  id: number',
      '',
      '  @Column({ type: "varchar" })',
      '  name: string',
      '',
      '  @Column()',
      '  phone?: string',
      '',
      '  @CreateDateColumn()',
      '  createdAt: Date',
      '}',
    ].join('\n')
    expect(dataModelsOf('src/entities/lead.ts', text)).toEqual([{ name: 'Lead', fields: ['name', 'phone'], line: 3 }])
  })

  it('reads a Sequelize model from sequelize.define', () => {
    const text = "const Lead = sequelize.define('Lead', {\n  name: DataTypes.STRING,\n  email: DataTypes.STRING,\n  password: DataTypes.STRING,\n})\n"
    expect(dataModelsOf('db/lead.js', text)).toEqual([{ name: 'Lead', fields: ['name', 'email'], line: 1 }])
  })

  it('finds no models in a file that has none', () => {
    expect(dataModelsOf('src/app.ts', "export const x = { name: 'a' }\n")).toEqual([])
  })
})

describe('screenDetailsOf', () => {
  it('reads the heading, the buttons and the labelled fields of a React page', () => {
    const page = [
      'export function LeadForm() {',
      '  return (',
      '    <main>',
      '      <h1>Leads</h1>',
      '      <form onSubmit={() => save()}>',
      '        <label>Nome<input value={name} onChange={(e) => setName(e.target.value)} /></label>',
      '        <label>E-mail<input type="email" /></label>',
      '        <input placeholder="Buscar pelo nome" value={q} />',
      '        <label><span>Telefone</span><input name="phone" /></label>',
      '        <button type="submit">Salvar lead</button>',
      '        <button type="button" onClick={() => close()}>Cancelar</button>',
      '      </form>',
      '    </main>',
      '  )',
      '}',
    ].join('\n')
    expect(screenDetailsOf('frontend/src/pages/LeadsPage.tsx', page)).toEqual({
      title: 'Leads',
      buttons: ['Salvar lead', 'Cancelar'],
      fields: ['Nome', 'E-mail', 'Telefone', 'Buscar pelo nome'],
    })
  })

  it('leaves out expressions, takes the document title when there is no heading, and keeps the text short', () => {
    const page = [
      'useEffect(() => { document.title = "Painel de vendas" })',
      '<h2>{title}</h2>',
      '<p>{user.name}</p>',
      '<label>{labelText}</label>',
      '<label>Este texto é longo demais para ser uma etiqueta de campo de formulário</label>',
      '<label>Responsável</label>',
    ].join('\n')
    const details = screenDetailsOf('frontend/src/Painel.jsx', page)
    expect(details.title).toBe('Painel de vendas')
    expect(details.fields).toEqual(['Responsável'])
  })

  it('takes as title the first heading that names a screen, not a sentence, a numbered clause or an expression', () => {
    const page = [
      'const doc = `<h2>${escape(section.title)}</h2>`',
      '<h1>Seu trabalho merece mais que um print.</h1>',
      '<div className="document-body"><h2>1. DO OBJETO</h2><h2>2. DO PAGAMENTO</h2></div>',
      '<h1>Que acordo você quer colocar no papel?</h1>',
      '<h2>Meus contratos</h2>',
    ].join('\n')
    expect(screenDetailsOf('frontend/src/App.tsx', page).title).toBe('Meus contratos')
    expect(screenDetailsOf('frontend/src/Landing.tsx', '<h1>Seu trabalho merece mais que um print.</h1><h2>1. DO OBJETO</h2>').title).toBeNull()
  })

  it('reads the value of a submit input as a button, and a name attribute when there is no other label', () => {
    const page = '<form><input name="company_name" /><input type="submit" value="Enviar" /><input type="hidden" name="token" /></form>'
    expect(screenDetailsOf('site/index.html', page)).toEqual({ title: null, buttons: ['Enviar'], fields: ['nome da empresa'] })
  })

  it('keeps at most six buttons and six fields', () => {
    const inputs = Array.from({ length: 9 }, (_, i) => `<label>Campo ${i + 1}</label>`).join('')
    const details = screenDetailsOf('a/Page.tsx', inputs)
    expect(details.fields).toHaveLength(6)
    expect(details.fields[0]).toBe('Campo 1')
  })

  it('gives nothing for a file that is not a screen', () => {
    expect(screenDetailsOf('backend/src/routes/leads.ts', '<h1>Leads</h1>')).toEqual({ title: null, buttons: [], fields: [] })
  })
})

describe('mergeScreenDetails', () => {
  it('keeps the first title and joins the buttons and fields once each', () => {
    const merged = mergeScreenDetails([
      { title: 'Leads', buttons: ['Salvar'], fields: ['Nome'] },
      { title: 'Outro', buttons: ['Salvar', 'Enviar'], fields: ['Nome', 'E-mail'] },
      { title: null, buttons: [], fields: [] },
    ])
    expect(merged).toEqual({ title: 'Leads', buttons: ['Salvar', 'Enviar'], fields: ['Nome', 'E-mail'] })
  })
})

describe('sentFieldsOf', () => {
  it('reads the keys of the object sent with JSON.stringify, shorthand included', () => {
    const text = [
      'async function send({ name, company, email, phone }) {',
      "  const res = await fetch('/api/leads', {",
      "    method: 'POST',",
      "    body: JSON.stringify({ name, company, email, phone, token: 'x' }),",
      '  })',
      '}',
    ].join('\n')
    expect(sentFieldsOf(text, 2)).toEqual(['name', 'company', 'email', 'phone'])
  })

  it('reads the object given to axios.post, with quoted and spread keys handled', () => {
    const text = "await axios.post('/api/leads', { 'name': n, email: e, ...rest, status: 'novo' })\n"
    expect(sentFieldsOf(text, 1)).toEqual(['name', 'email', 'status'])
  })

  it('finds nothing when the object starts more than fifteen lines after the call', () => {
    const filler = Array.from({ length: 20 }, () => '  // step').join('\n')
    const text = `fetch('/api/leads', { method: 'POST' })\n${filler}\nJSON.stringify({ name })\n`
    expect(sentFieldsOf(text, 1)).toEqual([])
  })
})

describe('emailSubjectsOf', () => {
  it('reads subjects written as literals, and skips the ones built from values', () => {
    const text = [
      "await mail.send({ subject: 'Olá!', text: 'Recebemos o seu contato.' })",
      'await mail.send({ subject: "Seu pedido" })',
      '<Mail subject="Bem-vindo" />',
      'await mail.send({ subject: `Pedido ${id}` })',
    ].join('\n')
    expect(emailSubjectsOf(text)).toEqual(['Olá!', 'Seu pedido', 'Bem-vindo'])
  })
})

describe('tasksOf and taskPhraseOf', () => {
  it('reads the queue a worker takes tasks from, and phrases the known ones', () => {
    expect(tasksOf("new Worker('followups', async (job) => {})")).toEqual(['followups'])
    expect(taskPhraseOf('followups')).toEqual({ pt: 'de retorno', en: 'for follow-up' })
    expect(taskPhraseOf('emails')).toEqual({ pt: 'de e-mail', en: 'for e-mail' })
  })

  it('gives no phrase for a queue name nobody taught the analyser', () => {
    expect(taskPhraseOf('zz-internal')).toBeNull()
    expect(taskPhraseOf(undefined)).toBeNull()
  })
})

describe('humanField', () => {
  it('translates single words with the dictionary', () => {
    expect(humanField('name', 'pt')).toBe('nome')
    expect(humanField('email', 'pt')).toBe('e-mail')
    expect(humanField('company', 'pt')).toBe('empresa')
    expect(humanField('status', 'pt')).toBe('situação')
    expect(humanField('owner', 'pt')).toBe('responsável')
  })

  it('translates whole phrases before single words', () => {
    expect(humanField('firstName', 'pt')).toBe('nome')
    expect(humanField('lastName', 'pt')).toBe('sobrenome')
    expect(humanField('phoneNumber', 'pt')).toBe('telefone')
    expect(humanField('zipCode', 'pt')).toBe('CEP')
    expect(humanField('birthDate', 'pt')).toBe('data de nascimento')
    expect(humanField('createdBy', 'pt')).toBe('criado por')
    expect(humanField('companyName', 'pt')).toBe('nome da empresa')
    expect(humanField('followedUpAt', 'pt')).toBe('data do retorno')
  })

  it('keeps the humanized English when the words are not known, instead of a word-by-word guess', () => {
    expect(humanField('shippingLabelUrl', 'pt')).toBe('shipping label url')
    expect(humanField('company_size', 'pt')).toBe('company size')
  })

  it('splits snake_case, kebab-case and camelCase the same way', () => {
    expect(humanField('company_name', 'pt')).toBe('nome da empresa')
    expect(humanField('company-name', 'pt')).toBe('nome da empresa')
  })

  it('gives the humanized English in English', () => {
    expect(humanField('companyName', 'en')).toBe('company name')
    expect(humanField('followedUpAt', 'en')).toBe('followed up at')
  })
})

describe('plainLabel', () => {
  it('lowers the first letter of a label, but keeps acronyms', () => {
    expect(plainLabel('Nome')).toBe('nome')
    expect(plainLabel('E-mail')).toBe('e-mail')
    expect(plainLabel('CPF')).toBe('CPF')
    expect(plainLabel('nome')).toBe('nome')
  })
})

describe('fieldList', () => {
  it('joins up to four items naturally, in both languages', () => {
    expect(fieldList(['nome'], 'pt')).toBe('nome')
    expect(fieldList(['nome', 'e-mail'], 'pt')).toBe('nome e e-mail')
    expect(fieldList(['nome', 'empresa', 'e-mail', 'telefone'], 'pt')).toBe('nome, empresa, e-mail e telefone')
    expect(fieldList(['name', 'company', 'email', 'phone'], 'en')).toBe('name, company, email and phone')
  })

  it('says how many more there are when the list is longer', () => {
    expect(fieldList(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'pt')).toBe('a, b, c, d e mais 3')
    expect(fieldList(['a', 'b', 'c', 'd', 'e'], 'en')).toBe('a, b, c, d and 1 more')
  })

  it('shortens the list when asked for fewer items, and is empty for none', () => {
    expect(fieldList(['nome', 'empresa', 'e-mail'], 'pt', 1)).toBe('nome e mais 2')
    expect(fieldList([], 'pt')).toBe('')
  })
})

describe('modelForResource and singularOf', () => {
  const models = [
    { name: 'Lead', fields: [], line: 1 },
    { name: 'Category', fields: [], line: 2 },
    { name: 'Person', fields: [], line: 3 },
    { name: 'Status', fields: [], line: 4 },
    { name: 'LeadNote', fields: [], line: 5 },
  ]

  it('matches a resource to its model by singular and plural, whatever the case', () => {
    expect(modelForResource('leads', models)?.name).toBe('Lead')
    expect(modelForResource('categories', models)?.name).toBe('Category')
    expect(modelForResource('people', models)?.name).toBe('Person')
    expect(modelForResource('statuses', models)?.name).toBe('Status')
    expect(modelForResource('lead-notes', models)?.name).toBe('LeadNote')
  })

  it('finds no model for a resource that has none', () => {
    expect(modelForResource('invoices', models)).toBeNull()
  })

  it('turns plural route words into singular ones and leaves the rest alone', () => {
    expect(singularOf('leads')).toBe('lead')
    expect(singularOf('categories')).toBe('category')
    expect(singularOf('statuses')).toBe('status')
    expect(singularOf('addresses')).toBe('address')
    expect(singularOf('status')).toBe('status')
    expect(singularOf('people')).toBe('person')
    expect(singularOf('api')).toBe('api')
  })
})
