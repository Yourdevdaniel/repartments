import { describe, expect, it } from 'vitest'
import { mountsOf, prefixesOf, pythonImportedNames } from './mounts'

describe('mountsOf', () => {
  it('reads FastAPI include_router with its prefix, by module or by router name', () => {
    const text = [
      'from fastapi import APIRouter',
      'from app.api.routes import authentication, comments',
      'from app.api.routes.articles import api as articles',
      'from app.api.routes.tags import router as tags_router',
      'router = APIRouter()',
      'router.include_router(authentication.router, tags=["auth"], prefix="/users")',
      'router.include_router(articles.router)',
      'router.include_router(comments.router, prefix="/articles/{slug}/comments")',
      'router.include_router(tags_router, prefix="/tags")',
    ].join('\n')
    expect(mountsOf('app/api/routes/api.py', text)).toEqual([
      { prefix: '/users', line: 6, name: 'authentication.router', spec: null },
      { prefix: '', line: 7, name: 'articles.router', spec: null },
      { prefix: '/articles/{slug}/comments', line: 8, name: 'comments.router', spec: null },
      { prefix: '/tags', line: 9, name: 'tags_router', spec: null },
    ])
  })

  it("reads Flask's register_blueprint, Express's use and Django's include", () => {
    expect(mountsOf('app.py', "app.register_blueprint(user.views.blueprint, url_prefix='/api')")).toEqual([{ prefix: '/api', line: 1, name: 'user.views.blueprint', spec: null }])
    expect(mountsOf('src/app.ts', "app.use('/api/articles', articlesRouter)\nrouter.use(express.json())")).toEqual([{ prefix: '/api/articles', line: 1, name: 'articlesRouter', spec: null }])
    expect(mountsOf('conduit/urls.py', "urlpatterns = [\n  url(r'^api/', include('conduit.apps.articles.urls', namespace='articles')),\n  path('contas/', include('accounts.urls')),\n]")).toEqual([
      { prefix: '/api', line: 2, name: null, spec: 'conduit.apps.articles.urls' },
      { prefix: '/contas', line: 3, name: null, spec: 'accounts.urls' },
    ])
  })
})

describe('mountsOf: Go', () => {
  it('reads a group passed to a register function in another package, with the prefixes of its groups', () => {
    const text = [
      'package main',
      'import (',
      '  "github.com/gin-gonic/gin"',
      '  "github.com/x/conduit/users"',
      '  arts "github.com/x/conduit/articles"',
      ')',
      'func main() {',
      '  r := gin.Default()',
      '  v1 := r.Group("/api")',
      '  users.UsersRegister(v1.Group("/users"))',
      '  arts.ArticlesRegister(v1.Group("/articles"))',
      '}',
    ].join('\n')
    expect(mountsOf('hello.go', text)).toEqual([
      { prefix: '/api/users', line: 10, name: null, spec: 'github.com/x/conduit/users', func: 'UsersRegister' },
      { prefix: '/api/articles', line: 11, name: null, spec: 'github.com/x/conduit/articles', func: 'ArticlesRegister' },
    ])
  })
})

describe('pythonImportedNames', () => {
  it('maps each name to the modules it may be: a module itself, or a name inside one', () => {
    const text = 'from app.api.routes import users, tags as t\nfrom .articles import api as articles\nimport conduit.apps.profiles as profiles'
    expect(Object.fromEntries(pythonImportedNames(text))).toEqual({
      users: ['app.api.routes.users', 'app.api.routes'],
      t: ['app.api.routes.tags', 'app.api.routes'],
      articles: ['.articles.api', '.articles'],
      profiles: ['conduit.apps.profiles'],
    })
  })
})

describe('prefixesOf', () => {
  it('joins the prefixes along a chain of mounts, and leaves a file mounted nowhere without one', () => {
    const targets = new Map([
      ['main.py', [{ prefix: '/api', file: 'routes/api.py' }]],
      ['routes/api.py', [{ prefix: '/articles', file: 'routes/articles.py' }, { prefix: '', file: 'routes/tags.py' }]],
    ])
    expect(Object.fromEntries(prefixesOf(targets))).toEqual({
      'routes/api.py': '/api',
      'routes/articles.py': '/api/articles',
      'routes/tags.py': '/api',
    })
  })

  it('stops at a cycle', () => {
    const targets = new Map([
      ['a.py', [{ prefix: '/x', file: 'b.py' }]],
      ['b.py', [{ prefix: '/y', file: 'a.py' }]],
    ])
    expect(prefixesOf(targets).size).toBeLessThanOrEqual(2)
  })
})
