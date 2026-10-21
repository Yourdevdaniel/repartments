/** Vercel function: POST /api/auth/token, studio sign-in with GitHub's device flow. The work happens in `server/auth.ts`. */
import { handleAuth } from '../../server/auth.js'

export const POST = (request: Request) => handleAuth(request, { env: process.env })
