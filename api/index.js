/**
 * Vercel serverless entry — forwards all /api/* traffic to the Express app.
 */
import serverless from 'serverless-http'
import { app } from '../server/index.js'

export default serverless(app)
