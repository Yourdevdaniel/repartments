/** Vercel function: POST /api/auth/claim, the vault picks the token up. The work happens in `server/auth.ts`. */
import { handleAuth } from '../../server/auth.js'

export const POST = (request: Request) => handleAuth(request, { env: process.env })
