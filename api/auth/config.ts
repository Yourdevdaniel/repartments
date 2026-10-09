/** Vercel function: GET /api/auth/config, studio sign-in with GitHub's device flow. The work happens in `server/auth.ts`. */
import { handleAuth } from '../../server/auth.js'

export const GET = (request: Request) => handleAuth(request, { env: process.env })
