/**
 * A small, made-up market's online shop, for the studio's example: a products screen and a cart, an
 * API with a login check, order rules over PostgreSQL that check the stock, take the payment on
 * Mercado Pago and e-mail the receipt. Read by the same analyser real repos go through. Everything
 * here is plain text; nothing is run.
 */
import type { SourceInput, TreeEntry } from '../architecture'

const FILES: Record<string, string> = {
  'frontend/src/main.tsx': `import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App />)
`,
  'frontend/src/App.tsx': `import { ProductsPage } from './pages/ProductsPage'
import { CartPage } from './pages/CartPage'

export function App() {
  return (
    <>
      <ProductsPage />
      <CartPage />
    </>
  )
}
`,
  'frontend/src/pages/ProductsPage.tsx': `import { useEffect, useState } from 'react'
import { ProductCard } from '../components/ProductCard'

type Product = { id: string; name: string; price: number }

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    fetch('/api/products').then((r) => r.json()).then(setProducts)
  }, [])

  async function addToCart(productId: string) {
    await fetch('/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, quantity: 1 }),
    })
  }

  return (
    <main>
      <h1>Produtos</h1>
      {products.map((p) => (
        <div key={p.id}>
          <ProductCard product={p} />
          <button onClick={() => addToCart(p.id)}>Adicionar ao carrinho</button>
        </div>
      ))}
    </main>
  )
}
`,
  'frontend/src/pages/CartPage.tsx': `import { useState } from 'react'
import { formatMoney } from '../lib/money'

export function CartPage() {
  const [total] = useState(0)
  const [address, setAddress] = useState('')

  async function checkout() {
    await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    })
  }

  return (
    <section>
      <h1>Carrinho</h1>
      <p>Total: {formatMoney(total)}</p>
      <label>Endereço de entrega<input value={address} onChange={(e) => setAddress(e.target.value)} /></label>
      <button onClick={checkout}>Finalizar compra</button>
    </section>
  )
}
`,
  'frontend/src/components/ProductCard.tsx': `import { formatMoney } from '../lib/money'

export function ProductCard(props: { product: { name: string; price: number } }) {
  return (
    <article>
      <h2>{props.product.name}</h2>
      <p>{formatMoney(props.product.price)}</p>
    </article>
  )
}
`,
  'frontend/src/lib/money.ts': `export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
`,
  'backend/package.json': `{
  "name": "mercado-api",
  "main": "dist/server.js",
  "dependencies": {
    "express": "^4.19.0",
    "@prisma/client": "^5.0.0",
    "mercadopago": "^2.0.0",
    "resend": "^3.0.0",
    "jsonwebtoken": "^9.0.0"
  }
}
`,
  'backend/prisma/schema.prisma': `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Product {
  id    String @id @default(uuid())
  name  String
  price Int
  stock Int
}

model CartItem {
  id        String @id @default(uuid())
  userId    String
  productId String
  quantity  Int
}

model Order {
  id        String   @id @default(uuid())
  userId    String
  address   String
  total     Int
  status    String   @default("pago")
  createdAt DateTime @default(now())
}
`,
  'backend/src/server.ts': `import express from 'express'
import { productsRouter } from './routes/products'
import { cartRouter } from './routes/cart'
import { ordersRouter } from './routes/orders'

const app = express()
app.use(express.json())
app.use(productsRouter)
app.use(cartRouter)
app.use(ordersRouter)
app.listen(3000)
`,
  'backend/src/routes/products.ts': `import { Router } from 'express'
import { listProducts } from '../services/products'

export const productsRouter = Router()

productsRouter.get('/products', async (req, res) => {
  res.json(await listProducts())
})
`,
  'backend/src/routes/cart.ts': `import { Router } from 'express'
import { requireUser } from '../middleware/auth'
import { addToCart } from '../services/cart'

export const cartRouter = Router()

cartRouter.post('/cart', requireUser, async (req, res) => {
  res.status(201).json(await addToCart(req.user.id, req.body.productId, req.body.quantity))
})
`,
  'backend/src/routes/orders.ts': `import { Router } from 'express'
import { requireUser } from '../middleware/auth'
import { placeOrder } from '../services/orders'

export const ordersRouter = Router()

ordersRouter.post('/orders', requireUser, async (req, res) => {
  res.status(201).json(await placeOrder(req.user.id, req.body.address))
})
`,
  'backend/src/middleware/auth.ts': `import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'

export function requireUser(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token || !jwt.verify(token, process.env.JWT_SECRET ?? '')) return res.status(401).end()
  next()
}
`,
  'backend/src/services/products.ts': `import { prisma } from '../db/client'

export async function listProducts() {
  return prisma.product.findMany({ where: { stock: { gt: 0 } }, orderBy: { name: 'asc' } })
}
`,
  'backend/src/services/cart.ts': `import { prisma } from '../db/client'

export async function addToCart(userId: string, productId: string, quantity: number) {
  return prisma.cartItem.create({ data: { userId, productId, quantity } })
}
`,
  'backend/src/services/orders.ts': `import { MercadoPagoConfig, Payment } from 'mercadopago'
import { Resend } from 'resend'
import { prisma } from '../db/client'

const payments = new Payment(new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN ?? '' }))
const mail = new Resend(process.env.RESEND_KEY)

export async function placeOrder(userId: string, address: string) {
  const items = await prisma.cartItem.findMany({ where: { userId } })
  for (const item of items) {
    await prisma.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } })
  }
  const total = items.length
  await payments.create({ body: { transaction_amount: total, payment_method_id: 'pix', payer: { email: userId } } })
  const order = await prisma.order.create({ data: { userId, address, total } })
  await prisma.cartItem.deleteMany({ where: { userId } })
  await mail.emails.send({ from: 'mercado@example.com', to: userId, subject: 'Pedido confirmado', text: 'Seu pedido está a caminho.' })
  return order
}
`,
  'backend/src/db/client.ts': `import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()
`,
  'backend/tests/orders.test.ts': `import { describe, expect, it } from 'vitest'
import { placeOrder } from '../src/services/orders'

describe('orders', () => {
  it('exports the service', () => {
    expect(placeOrder).toBeDefined()
  })
})
`,
}

/** The market's repo as the analyser would see it after reading the tree and the files. */
export const marketFixture: SourceInput = {
  repo: { owner: 'exemplo', name: 'mercado', branch: 'main', sha: 'm1e2r3c4', private: false },
  tree: Object.entries(FILES).map(([path, text]): TreeEntry => ({ path, type: 'blob', size: text.length })),
  files: new Map(Object.entries(FILES)),
  truncated: false,
  generatedAt: '2026-10-22T12:00:00.000Z',
}
