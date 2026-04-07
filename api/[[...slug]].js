/**
 * Vercel serverless — serves the full Express app for every `/api` path.
 * Native `export default app` (Vercel Express integration); avoids serverless-http
 * Lambda-shaped events and fixes sub-routes that were lost when rewrites sent `/api/*` → `/api`.
 */
import { app } from '../server/index.js'

export default app
