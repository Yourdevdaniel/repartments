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
    expect(routes('config/routes.rb', "resources :leads\nget 'health', to: 'h#x'")).toEqual(['ANY /leads', 'GET /health'])
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

  it('treats a pages/api file as answering every method', () => {
    expect(routes('pages/api/x.ts', 'export async function GET() {}')).toEqual(['ANY /api/x'])
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
