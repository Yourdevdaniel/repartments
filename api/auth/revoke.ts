/** Vercel function: POST /api/auth/revoke, signing out ends the token at GitHub too. The work happens in `server/auth.ts`. */
import { handleAuth } from '../../server/auth.js'

export const POST = (request: Request) => handleAuth(request, { env: process.env })
