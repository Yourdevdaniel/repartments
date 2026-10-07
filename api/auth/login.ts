/** Vercel function: GET /api/auth/login, "Continue with GitHub" starts here. The work happens in `server/auth.ts`. */
import { handleAuth } from '../../server/auth.js'

export const GET = (request: Request) => handleAuth(request, { env: process.env })
