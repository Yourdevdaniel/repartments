/** Vercel function: GET /api/auth/callback, GitHub sends the person back here. The work happens in `server/auth.ts`. */
import { handleAuth } from '../../server/auth.js'

export const GET = (request: Request) => handleAuth(request, { env: process.env })
