import { describe, expect, it } from 'vitest'
import { callsOf, endpointsOf, matchCall, routeKey } from './endpoints'

/** The routes of a file as "METHOD path" strings, in order. */
const routes = (path: string, text: string) => endpointsOf(path, text).map((r) => `${r.method} ${r.path}`)

describe('endpointsOf', () => {
  it('reads Express, Fastify and Hono style routers', () => {
    const text = [
      "import express from 'express'",
      "const app = express()",
      "app.get('/leads', list)",
      'router.post("/leads/:id", save)',
      "leadsRouter.delete('/leads/:id', remove)",
      "app.all('/health', ping)",
    ].join('\n')
    expect(routes('server.ts', text)).toEqual(['GET /leads', 'POST /leads/:id', 'DELETE /leads/:id', 'ANY /health'])
    expect(endpointsOf('server.ts', text)[1].line).toBe(4)
  })

  it('reads NestJS controllers with their prefix', () => {
    const text = [
      "@Controller('leads')",
      'export class LeadsController {',
      "  @Get(':id')",
      '  show() {}',
      '  @Post()',
      '  create() {}',
      '}',
    ].join('\n')
    expect(routes('leads.controller.ts', text)).toEqual(['GET /leads/:id', 'POST /leads'])
  })

  it('reads FastAPI and Flask decorators, including methods lists', () => {
    const text = [
      '@app.get("/leads/{lead_id}")',
      'def show(lead_id): ...',
      '@router.post("/leads", status_code=201)',
      'def create(): ...',
      '@bp.route("/export", methods=["GET", "POST"])',
      'def export(): ...',
    ].join('\n')
    expect(routes('api/leads.py', text)).toEqual(['GET /leads/{lead_id}', 'POST /leads', 'GET /export', 'POST /export'])
  })

  it('reads a decorator whose arguments run over several lines', () => {
    const text = [
      '@router.get(',
      '    "/{username}",',
      '    response_model=ProfileInResponse,',
      '    name="profiles:get-profile",',
      ')',
      'async def retrieve_profile(): ...',
      '@router.post(',
      '    "/{username}/follow",',
      '    status_code=status.HTTP_200_OK,',
      ')',
      '@other.decorator',
      'async def follow(): ...',
    ].join('\n')
    expect(routes('app/api/routes/profiles.py', text)).toEqual(['GET /{username}', 'POST /{username}/follow'])
  })

  it('reads Django urls.py paths and DRF router registrations', () => {
    const text = [
      'from django.urls import path, re_path',
      "urlpatterns = [",
      "  path('leads/', views.leads),",
      "  re_path(r'^ping/$', views.ping),",
      ']',
      "router.register(r'users', UserViewSet)",
    ].join('\n')
    expect(routes('crm/urls.py', text)).toEqual(['ANY /leads/', 'ANY /ping/', 'ANY /users/'])
  })

  it('leaves out a Django path that only mounts another urls.py, since it is not a route of its own', () => {
    const text = [
      'urlpatterns = [',
      "  path('admin/', admin.site.urls),",
      "  path('api/', include('contracts.urls')),",
      "  re_path(r'^v2/', include(router.urls)),",
      "  path('health/', views.health),",
      ']',
    ].join('\n')
    expect(routes('config/urls.py', text)).toEqual(['ANY /admin/', 'ANY /health/'])
  })

  it('reads Spring controllers, joining the class-level mapping', () => {
    const text = [
      '@RestController',
      '@RequestMapping("/api")',
      'public class LeadController {',
      '  @GetMapping("/leads")',
      '  public List<Lead> list() { return null; }',
      '  @RequestMapping(value = "/x", method = RequestMethod.POST)',
      '  public void x() {}',
      '}',
    ].join('\n')
    expect(routes('src/LeadController.java', text)).toEqual(['GET /api/leads', 'POST /api/x'])
  })

  it('reads Laravel and Rails routes', () => {
    expect(routes('routes/web.php', "Route::post('leads', [LeadController::class, 'store']);")).toEqual(['POST /leads'])
    expect(routes('config/routes.rb', "resources :leads, only: [:index]\nget 'health', to: 'h#x'")).toEqual(['GET /leads', 'GET /health'])
  })

  it('reads Next.js pages/api and app-router route files from their paths', () => {
    expect(routes('pages/api/hello.ts', 'export default function handler() {}')).toEqual(['ANY /api/hello'])
    expect(routes('app/api/leads/[id]/route.ts', 'export async function GET() {}\nexport async function DELETE() {}')).toEqual([
      'GET /api/leads/[id]',
      'DELETE /api/leads/[id]',
    ])
    expect(routes('app/(site)/route.ts', 'export function POST() {}')).toEqual(['POST /'])
  })

  it('reads Vercel api functions at the repo root', () => {
    expect(routes('api/users.ts', 'export async function GET() {}')).toEqual(['GET /api/users'])
    expect(routes('api/leads/index.ts', 'export default function handler() {}')).toEqual(['ANY /api/leads'])
  })

  it('ignores front-end component files and unknown languages', () => {
    expect(routes('src/App.tsx', "app.get('/x', f)")).toEqual([])
    expect(routes('README.md', "app.get('/x', f)")).toEqual([])
  })

  it('reads Flask routes with a methods tuple, and a route without methods as GET', () => {
    const text = [
      "@blueprint.route('/api/users', methods=('POST',))",
      'def add(): ...',
      "@bp.route('/x', methods=['GET', 'POST'])",
      'def x(): ...',
      "@bp.route('/y')",
      'def y(): ...',
    ].join('\n')
    expect(routes('api/views.py', text)).toEqual(['POST /api/users', 'GET /x', 'POST /x', 'GET /y'])
  })

  it('reads Spring method mappings with a method name, or a list of methods', () => {
    const text = [
      '@RestController',
      'public class UserController {',
      '  @RequestMapping(path = "/users", method = POST)',
      '  public void add() {}',
      '  @RequestMapping(value = "/users/login", method = RequestMethod.POST)',
      '  public void login() {}',
      '  @RequestMapping(value="/x", method = {RequestMethod.GET, RequestMethod.POST})',
      '  public void x() {}',
      '  @RequestMapping("/any")',
      '  public void any() {}',
      '}',
    ].join('\n')
    expect(routes('src/UserController.java', text)).toEqual(['POST /users', 'POST /users/login', 'GET /x', 'POST /x', 'ANY /any'])
  })

  it('cleans Django regex paths: anchors, optional slashes and named groups', () => {
    const text = [
      'urlpatterns = [',
      "  url(r'^user/?$', v),",
      "  url(r'^profiles/(?P<username>[\\w-]+)/follow/?$', v),",
      "  re_path(r'^item/(?P<id>\\d+)/$', v),",
      "  url(r'^', include('x.urls')),",
      "  url(r'^api/', include('y.urls')),",
      ']',
    ].join('\n')
    expect(routes('crm/urls.py', text)).toEqual(['ANY /user/', 'ANY /profiles/<username>/follow/', 'ANY /item/<id>/'])
  })

  it('reads no routes from a test file', () => {
    expect(routes('tests/test_api/test_errors/test_422_error.py', '@router.get("/wrong_path/{param}")\ndef f(): ...')).toEqual([])
  })

  it('treats a pages/api file as answering every method', () => {
    expect(routes('pages/api/x.ts', 'export async function GET() {}')).toEqual(['ANY /api/x'])
  })

  it('expands a Laravel resource with except into its routes, in Laravel order', () => {
    expect(routes('routes/api.php', "Route::resource('articles', 'ArticleController', ['except' => ['create', 'edit']]);")).toEqual([
      'GET /articles',
      'POST /articles',
      'GET /articles/{article}',
      'PUT /articles/{article}',
      'PATCH /articles/{article}',
      'DELETE /articles/{article}',
    ])
  })

  it('includes create and edit in a plain Laravel resource', () => {
    expect(routes('routes/api.php', "Route::resource('articles', 'C');")).toEqual([
      'GET /articles',
      'GET /articles/create',
      'POST /articles',
      'GET /articles/{article}',
      'GET /articles/{article}/edit',
      'PUT /articles/{article}',
      'PATCH /articles/{article}',
      'DELETE /articles/{article}',
    ])
  })

  it('never has create or edit in an apiResource', () => {
    expect(routes('routes/api.php', "Route::apiResource('articles', 'C');")).toEqual([
      'GET /articles',
      'POST /articles',
      'GET /articles/{article}',
      'PUT /articles/{article}',
      'PATCH /articles/{article}',
      'DELETE /articles/{article}',
    ])
  })

  it('filters a Laravel resource by only and except, given as an option or chained', () => {
    expect(routes('routes/api.php', "Route::resource('tags', 'T', ['only' => ['index', 'show']]);")).toEqual(['GET /tags', 'GET /tags/{tag}'])
    expect(routes('routes/api.php', "Route::resource('tags', 'T')->only(['index', 'store']);")).toEqual(['GET /tags', 'POST /tags'])
    expect(routes('routes/api.php', "Route::resource('tags', 'T')->except(['destroy']);")).toEqual([
      'GET /tags',
      'GET /tags/create',
      'POST /tags',
      'GET /tags/{tag}',
      'GET /tags/{tag}/edit',
      'PUT /tags/{tag}',
      'PATCH /tags/{tag}',
    ])
  })

  it('names the parameter of a nested resource after the singular of its last segment', () => {
    expect(routes('routes/api.php', "Route::resource('articles/{article}/comments', 'C', ['only' => ['index', 'store', 'destroy']]);")).toEqual([
      'GET /articles/{article}/comments',
      'POST /articles/{article}/comments',
      'DELETE /articles/{article}/comments/{comment}',
    ])
    expect(routes('routes/api.php', "Route::apiResource('categories', 'C', ['only' => ['show']]);\nRoute::apiResource('tags', 'C', ['only' => ['show']]);")).toEqual([
      'GET /categories/{category}',
      'GET /tags/{tag}',
    ])
  })

  it('reads resource options written over several lines', () => {
    const text = ["Route::resource('articles', 'C', [", "    'except' => [", "        'create', 'edit'", '    ]', ']);'].join('\n')
    expect(routes('routes/api.php', text)).toEqual([
      'GET /articles',
      'POST /articles',
      'GET /articles/{article}',
      'PUT /articles/{article}',
      'PATCH /articles/{article}',
      'DELETE /articles/{article}',
    ])
  })

  it('expands Route::match into one route per listed method, in any case', () => {
    expect(routes('routes/api.php', "Route::match(['put', 'patch'], 'user', 'X@y');")).toEqual(['PUT /user', 'PATCH /user'])
    expect(routes('routes/api.php', "Route::match(['PUT', 'Patch'], 'user', 'X@y');")).toEqual(['PUT /user', 'PATCH /user'])
  })

  it('prefixes the routes inside a Laravel group array, and only those', () => {
    const text = ["Route::group(['prefix' => 'admin'], function () {", "  Route::get('stats', 'X');", '});', "Route::get('public', 'Y');"].join('\n')
    expect(routes('routes/api.php', text)).toEqual(['GET /admin/stats', 'GET /public'])
  })

  it('reads Route::prefix(...)->group, stacks nested prefixes, and prefixes resources and match too', () => {
    const text = [
      "Route::prefix('admin')->group(function () {",
      "  Route::get('stats', 'X');",
      "  Route::prefix('v1')->group(function () {",
      "    Route::post('x', 'Y');",
      "    Route::resource('tags', 'T', ['only' => ['index']]);",
      '  });',
      "  Route::match(['put'], 'me', 'Z');",
      '});',
    ].join('\n')
    expect(routes('routes/api.php', text)).toEqual(['GET /admin/stats', 'POST /admin/v1/x', 'GET /admin/v1/tags', 'PUT /admin/me'])
  })

  it('prefixes every kind of route inside a group', () => {
    const text = [
      "Route::group(['prefix' => 'admin'], function () {",
      "  Route::put('a', 'X');",
      "  Route::patch('b', 'X');",
      "  Route::delete('c', 'X');",
      "  Route::any('d', 'X');",
      "  Route::match(['get'], 'e', 'X');",
      "  Route::apiResource('files', 'X', ['only' => ['show']]);",
      '});',
    ].join('\n')
    expect(routes('routes/api.php', text)).toEqual([
      'PUT /admin/a',
      'PATCH /admin/b',
      'DELETE /admin/c',
      'ANY /admin/d',
      'GET /admin/e',
      'GET /admin/files/{file}',
    ])
  })
})

describe('endpointsOf, Rails config/routes.rb', () => {
  const rails = (text: string) => routes('config/routes.rb', text)

  it('expands resources into the seven REST routes, with :param or :id', () => {
    expect(rails('resources :articles, param: :slug')).toEqual([
      'GET /articles',
      'POST /articles',
      'GET /articles/new',
      'GET /articles/:slug',
      'GET /articles/:slug/edit',
      'PATCH /articles/:slug',
      'PUT /articles/:slug',
      'DELETE /articles/:slug',
    ])
    expect(rails('resources :tags')).toEqual([
      'GET /tags',
      'POST /tags',
      'GET /tags/new',
      'GET /tags/:id',
      'GET /tags/:id/edit',
      'PATCH /tags/:id',
      'PUT /tags/:id',
      'DELETE /tags/:id',
    ])
  })

  it('filters resources by only and except, as a list, a %i list or a single symbol', () => {
    expect(rails('resources :tags, only: [:index]')).toEqual(['GET /tags'])
    expect(rails('resources :tags, only: %i[index show]')).toEqual(['GET /tags', 'GET /tags/:id'])
    expect(rails('resources :tags, only: [:index, :show]')).toEqual(['GET /tags', 'GET /tags/:id'])
    expect(rails('resources :tags, only: :index')).toEqual(['GET /tags'])
    expect(rails('resources :tags, except: %i[new create edit update destroy]')).toEqual(['GET /tags', 'GET /tags/:id'])
  })

  it('expands a singular resource without an id, and filters it too', () => {
    expect(rails('resource :user')).toEqual(['POST /user', 'GET /user/new', 'GET /user/edit', 'GET /user', 'PATCH /user', 'PUT /user', 'DELETE /user'])
    expect(rails('resource :user, only: [:show, :update]')).toEqual(['GET /user', 'PATCH /user', 'PUT /user'])
  })

  it('nests a resources block under the parent member path, naming the parent param after the singular', () => {
    const text = [
      'resources :articles, param: :slug, only: [:index] do',
      '  resources :comments, only: [:create, :index, :destroy]',
      '  resource :favorite, only: [:create, :destroy]',
      'end',
    ].join('\n')
    expect(rails(text)).toEqual([
      'GET /articles',
      'GET /articles/:article_slug/comments',
      'POST /articles/:article_slug/comments',
      'DELETE /articles/:article_slug/comments/:id',
      'POST /articles/:article_slug/favorite',
      'DELETE /articles/:article_slug/favorite',
    ])
    expect(rails("resources :articles, only: [] do\n  resources :comments, only: [:index]\nend")).toEqual(['GET /articles/:article_id/comments'])
    expect(rails("resources :categories, only: [] do\n  resources :items, only: [:index]\nend")).toEqual(['GET /categories/:category_id/items'])
  })

  it('adds collection and member routes, with on: or inside collection and member blocks', () => {
    const text = [
      'resources :articles, param: :slug, only: [] do',
      '  get :feed, on: :collection',
      '  post :publish, on: :member',
      '  collection do',
      '    get :trending',
      '  end',
      '  member do',
      '    put :pin',
      '  end',
      'end',
    ].join('\n')
    expect(rails(text)).toEqual(['GET /articles/feed', 'POST /articles/:slug/publish', 'GET /articles/trending', 'PUT /articles/:slug/pin'])
  })

  it('ignores a symbol route with no on: and no collection or member block', () => {
    expect(rails('resources :x, only: [] do\n  get :hidden\nend')).toEqual([])
  })

  it('prefixes the routes inside scope and namespace blocks, and ignores devise_for', () => {
    expect(rails('scope :api do\n  resources :tags, only: [:index]\nend')).toEqual(['GET /api/tags'])
    expect(rails("scope '/api' do\n  get 'ping', to: 'h#x'\nend")).toEqual(['GET /api/ping'])
    expect(rails("scope path: '/api' do\n  get 'ping', to: 'h#x'\nend")).toEqual(['GET /api/ping'])
    expect(rails("scope module: 'v1' do\n  get 'x', to: 'a#b'\nend")).toEqual(['GET /x'])
    expect(rails("namespace :admin do\n  resources :users, only: [:index]\nend")).toEqual(['GET /admin/users'])
    expect(rails("devise_for :users\nget 'health', to: 'h#x'")).toEqual(['GET /health'])
  })

  it('keeps unknown do blocks in the stack, so their end does not close the outer block', () => {
    expect(rails("constraints(subdomain: 'api') do\n  get 'a', to: 'h#x'\nend\nget 'b', to: 'h#y'")).toEqual(['GET /a', 'GET /b'])
    expect(rails("scope :api do\n  defaults format: :json do\n    get 'a', to: 'h#x'\n  end\n  get 'b', to: 'h#y'\nend")).toEqual(['GET /api/a', 'GET /api/b'])
  })

  it('reads the routes inside the Rails.application.routes.draw block', () => {
    expect(rails("Rails.application.routes.draw do\n  resources :articles, only: [:index]\n  get 'health', to: 'h#x'\nend")).toEqual([
      'GET /articles',
      'GET /health',
    ])
  })

  it('reports the line of each route, even inside a block', () => {
    expect(endpointsOf('config/routes.rb', "get 'a', to: 'x'\nscope :api do\n  resources :tags, only: [:index]\nend")[1].line).toBe(3)
  })
})

describe('endpointsOf, Go routers', () => {
  const goRoutes = (text: string) => routes('routers/api.go', text)

  it('reads gin, echo and fiber routes, whatever the receiver is called', () => {
    const text = ['r.GET("/x", h)', 'r.POST("/x", h)', 'e.PUT("/x", h)', 'app.PATCH("/x", h)', 'r.DELETE("/x", h)'].join('\n')
    expect(goRoutes(text)).toEqual(['GET /x', 'POST /x', 'PUT /x', 'PATCH /x', 'DELETE /x'])
  })

  it('reads chi routes written in title case', () => {
    const text = ['r.Get("/x", h)', 'r.Post("/x", h)', 'r.Put("/x", h)', 'r.Patch("/x", h)', 'r.Delete("/x", h)'].join('\n')
    expect(goRoutes(text)).toEqual(['GET /x', 'POST /x', 'PUT /x', 'PATCH /x', 'DELETE /x'])
  })

  it('reads gorilla/mux routes: the method from .Methods, or ANY without it', () => {
    expect(goRoutes('r.HandleFunc("/x", h).Methods("POST")')).toEqual(['POST /x'])
    expect(goRoutes('r.HandleFunc("/x", h)')).toEqual(['ANY /x'])
    expect(goRoutes('r.HandleFunc("/y", http.HandlerFunc(f)).Methods(http.MethodGet, "POST")')).toEqual(['GET /y', 'POST /y'])
  })

  it('joins group prefixes from the same file, and a route on the group is its prefix', () => {
    const text = ['v1 := r.Group("/api")', 'users := v1.Group("/users")', 'users.POST("", h)', 'users.GET("/:slug", h)', 'router := r.Group("/x")', 'router.GET("", h)'].join('\n')
    expect(goRoutes(text)).toEqual(['POST /api/users', 'GET /api/users/:slug', 'GET /x'])
  })

  it('takes a group assigned with = as well as :=, in the order of the file', () => {
    const text = ['g := r.Group("/g")', 'g.GET("/a", h)', 'g = r.Group("/h")', 'g.GET("/b", h)'].join('\n')
    expect(goRoutes(text)).toEqual(['GET /g/a', 'GET /h/b'])
  })

  it('gives no prefix to a route on a receiver the file does not group', () => {
    expect(goRoutes('r.GET("/a", h)\nv1 := r.Group("/api")\nm.GET(path, h)')).toEqual(['GET /a'])
  })

  it('leaves out routes registered in a function that takes the group as a parameter, and does not reuse a group name from outside', () => {
    expect(goRoutes('func Register(r *gin.RouterGroup) {\n  r.GET("/", h)\n}')).toEqual(['GET /'])
    expect(goRoutes('v1 := r.Group("/api")\nfunc Register(v1 *gin.RouterGroup) {\n  v1.GET("/x", h)\n}')).toEqual(['GET /x'])
  })

  it('ignores Go calls that only look like routes: a context or url value lookup has no handler', () => {
    expect(goRoutes('user := c.Get("user")\nid := params.Get("id")')).toEqual([])
  })
})

describe('callsOf', () => {
  it('reads fetch with its method and a parameterised template URL', () => {
    const text = [
      "await fetch('/api/leads', { method: 'POST', body: '{}' })",
      'await fetch(`${API}/leads/${id}`)',
      "await fetch('https://api.example.com/v1/users')",
      "await fetch('relative')",
    ].join('\n')
    expect(callsOf('src/page.tsx', text)).toEqual([
      { method: 'POST', url: '/api/leads', line: 1 },
      { method: 'GET', url: '/leads/{param}', line: 2 },
      { method: 'GET', url: '/v1/users', line: 3 },
    ])
  })

  it('reads axios and client helper calls', () => {
    const text = ["axios.get('/api/leads')", "api.post('/api/leads', body)", "leadsApi.delete(`/leads/${id}`)"].join('\n')
    expect(callsOf('src/api.ts', text).map((c) => `${c.method} ${c.url}`)).toEqual(['GET /api/leads', 'POST /api/leads', 'DELETE /leads/{param}'])
  })

  it('reads calls through a wrapper called like fetch, and paths built by concatenation or without the leading slash', () => {
    const text = [
      'mutationFn: (id) => api(`/reservas/${id}/cancelar`, { method: "POST" }),',
      'queryFn: () => api("/reservas/minhas"),',
      "requests.get('/articles/' + slug)",
      'ApiService.post(`articles/${slug}/comments`, { comment })',
      "const id = params.get('id')",
      "cache.get('articles')",
    ].join('\n')
    expect(callsOf('src/pages/MinhasReservas.jsx', text).map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST /reservas/{param}/cancelar',
      'GET /reservas/minhas',
      'GET /articles/{param}',
      'POST /articles/{param}/comments',
    ])
  })

  it('reads nothing from a non-JavaScript file', () => {
    expect(callsOf('x.py', "requests.get('/x')")).toEqual([])
  })
})

describe('routeKey and matchCall', () => {
  it('normalises parameters, origins, queries, trailing slashes and a leading /api', () => {
    expect(routeKey('https://crm.example.com/api/leads/42/?x=1')).toBe('/leads/42')
    expect(routeKey('/leads/:id')).toBe('/leads/{}')
    expect(routeKey('/leads/{lead_id}')).toBe('/leads/{}')
    expect(routeKey('/leads/<int:id>')).toBe('/leads/{}')
    expect(routeKey('/api/leads/[id]')).toBe('/leads/{}')
    expect(routeKey('/')).toBe('/')
  })

  it('matches a call to its route, preferring the same method', () => {
    const endpoints = [
      { method: 'GET', path: '/api/leads', component: 'list' },
      { method: 'POST', path: '/leads', component: 'create' },
      { method: 'ANY', path: '/leads/:id', component: 'any' },
    ]
    expect(matchCall('/api/leads', endpoints, 'POST')?.component).toBe('create')
    expect(matchCall('/leads', endpoints, 'GET')?.component).toBe('list')
    expect(matchCall('/leads/{param}', endpoints, 'PUT')?.component).toBe('any')
    expect(matchCall('/nothing', endpoints, 'GET')).toBeNull()
  })
})
