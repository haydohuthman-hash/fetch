#!/usr/bin/env node
/**
 * Verifies the deployed (or local) API reports Drops Postgres as available.
 *
 * Usage:
 *   node scripts/verify-drops-deploy.mjs [baseUrl]
 *   FETCH_DEPLOY_VERIFY_URL=https://api.example.com node scripts/verify-drops-deploy.mjs
 *
 * Default baseUrl: http://127.0.0.1:8787
 *
 * Expects GET /api/drops/feed?limit=1 → 200 and JSON `database: true`.
 * Full upload+publish still needs a signed-in session cookie (manual check in the app).
 */

const base = (process.env.FETCH_DEPLOY_VERIFY_URL || process.argv[2] || 'http://127.0.0.1:8787').replace(
  /\/$/,
  '',
)

const url = `${base}/api/drops/feed?limit=1&rank=1`

async function main() {
  let res
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch (e) {
    console.error(`FAIL: could not reach ${url}`)
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }

  const text = await res.text()
  let json = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    console.error('FAIL: response is not JSON')
    console.error(text.slice(0, 500))
    process.exit(1)
  }

  if (!res.ok) {
    console.error(`FAIL: HTTP ${res.status}`, json.error || json)
    process.exit(1)
  }

  if (!json.database) {
    console.error('FAIL: `database` is not true — set DATABASE_URL on the API and restart.')
    console.error('Response:', JSON.stringify(json).slice(0, 400))
    process.exit(1)
  }

  console.log(`OK: ${url}`)
  console.log('OK: `database: true` — Postgres-backed Drops feed is enabled.')
  console.log('Next: sign in on the app, post a small image drop, confirm Supabase Storage URLs in DB.')
}

main()
