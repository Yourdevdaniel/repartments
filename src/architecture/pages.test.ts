import { describe, expect, it } from 'vitest'
import { filePageOf, importedNames, pageNameOf, pageRootsOf, pageRoutesOf } from './pages'

describe('pageRoutesOf: routers in the code', () => {
  it('reads React Router <Route> elements, taking the innermost component of a wrapped element', () => {
    const app = [
      "import { Navigate, Route, Routes } from 'react-router-dom'",
      'export default function App() {',
      '  return (',
      '    <Routes>',
      '      <Route path="/" element={<BuscaEstudios />} />',
      '      <Route path="/estudios/:id" element={<EstudioDetalhe />} />',
      '      <Route path="/minhas-reservas" element={<Protegida><MinhasReservas /></Protegida>} />',
      '      <Route path="*" element={<Navigate to="/" replace />} />',
      '    </Routes>',
      '  )',
      '}',
    ].join('\n')
    expect(pageRoutesOf('frontend/src/App.jsx', app)).toEqual([
      { path: '/', line: 5, component: 'BuscaEstudios', spec: null },
      { path: '/estudios/:id', line: 6, component: 'EstudioDetalhe', spec: null },
      { path: '/minhas-reservas', line: 7, component: 'MinhasReservas', spec: null },
    ])
  })

  it('reads route objects of createBrowserRouter and Vue Router, with lazy imports', () => {
    const react = [
      "import { createBrowserRouter } from 'react-router-dom'",
      'export const router = createBrowserRouter([',
      "  { path: '/leads', element: <LeadsPage /> },",
      "  { path: '/deals/:id', Component: DealPage },",
      '])',
    ].join('\n')
    expect(pageRoutesOf('src/router.tsx', react).map((r) => [r.path, r.component])).toEqual([
      ['/leads', 'LeadsPage'],
      ['/deals/:id', 'DealPage'],
    ])
    const vue = [
      "import { createRouter } from 'vue-router'",
      "import Home from '../views/Home.vue'",
      'const routes = [',
      "  { path: '/', name: 'home', component: Home },",
      "  { path: '/settings', component: () => import('../views/Settings.vue') },",
      ']',
    ].join('\n')
    expect(pageRoutesOf('src/router/index.js', vue)).toEqual([
      { path: '/', line: 4, component: 'Home', spec: null },
      { path: '/settings', line: 5, component: null, spec: '../views/Settings.vue' },
    ])
  })

  it('reads nothing from a file that does not use a router', () => {
    expect(pageRoutesOf('src/config.ts', "export const api = { path: '/leads', component: X }")).toEqual([])
  })
})

describe('importedNames', () => {
  it('maps each imported name to its module, lazy imports included', () => {
    const text = [
      "import BuscaEstudios from './pages/BuscaEstudios'",
      "import { Login, Registro as Cadastro } from './pages/auth'",
      "const MinhasReservas = lazy(() => import('./pages/MinhasReservas'))",
    ].join('\n')
    expect(Object.fromEntries(importedNames(text))).toEqual({
      BuscaEstudios: './pages/BuscaEstudios',
      Login: './pages/auth',
      Cadastro: './pages/auth',
      MinhasReservas: './pages/MinhasReservas',
    })
  })
})

describe('filePageOf: pages by where the file sits', () => {
  const roots = pageRootsOf(
    new Map([
      ['web/package.json', '{"dependencies":{"next":"14.0.0"}}'],
      ['app/package.json', '{"dependencies":{"expo-router":"3.0.0"}}'],
      ['package.json', '{"dependencies":{"react":"18"}}'],
    ]),
  )

  it('finds the frameworks that route by files, at the folder of their package.json', () => {
    expect(roots).toEqual([
      { kind: 'next', dir: 'web' },
      { kind: 'expo', dir: 'app' },
    ])
  })

  it('reads Next.js pages/ and app/ routes, leaving out API routes and special files', () => {
    expect(filePageOf('web/pages/index.tsx', roots)).toBe('/')
    expect(filePageOf('web/pages/articles/[slug].tsx', roots)).toBe('/articles/:slug')
    expect(filePageOf('web/src/app/(shop)/cart/page.tsx', roots)).toBe('/cart')
    expect(filePageOf('web/pages/api/login.ts', roots)).toBeNull()
    expect(filePageOf('web/pages/_app.tsx', roots)).toBeNull()
    expect(filePageOf('web/app/layout.tsx', roots)).toBeNull()
  })

  it('reads Expo Router screens, without route groups, layouts and special files', () => {
    expect(filePageOf('app/app/(aluno)/treinos.tsx', roots)).toBe('/treinos')
    expect(filePageOf('app/app/(auth)/index.tsx', roots)).toBe('/')
    expect(filePageOf('app/app/(aluno)/_layout.tsx', roots)).toBeNull()
    expect(filePageOf('app/app/+not-found.tsx', roots)).toBeNull()
  })

  it('reads nothing outside those folders, nor anywhere in a repo without such a framework', () => {
    expect(filePageOf('frontend/src/pages/MinhasReservas.jsx', roots)).toBeNull()
    expect(filePageOf('web/components/Button.tsx', roots)).toBeNull()
  })
})

describe('pageNameOf', () => {
  it('prefers the screen title, then the component, then the path, and calls the root page the home page', () => {
    expect(pageNameOf({ path: '/minhas-reservas', title: 'Minhas reservas', component: 'MinhasReservas' })).toBe('Minhas reservas')
    expect(pageNameOf({ path: '/estudio/agenda', title: null, component: 'AgendaEstudio' })).toBe('Agenda estudio')
    expect(pageNameOf({ path: '/estudio/minhas-salas', title: null, component: null })).toBe('Minhas salas')
    expect(pageNameOf({ path: '/', title: null, component: null })).toBe('Início')
    expect(pageNameOf({ path: '/articles/:slug', title: null, component: null })).toBe('Articles')
  })

  it('leaves out the emoji that opens a title', () => {
    expect(pageNameOf({ path: '/', title: '🛒 Seu pedido', component: 'Cardapio' })).toBe('Seu pedido')
  })

  it('takes the component name over a title too long to be a page name, like a slogan', () => {
    expect(pageNameOf({ path: '/', title: 'Seu próximo ensaio começa aqui', component: 'BuscaEstudios' })).toBe('Busca estudios')
  })
})
