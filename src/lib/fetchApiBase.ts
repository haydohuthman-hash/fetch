/**
 * Base URL for the Fetch API (chat, TTS, scan, marketplace).
 *
 * - **Explicit** `VITE_FETCH_API_BASE_URL` — wins when the API is on another origin (rare).
 * - **Dev** (no override) — empty string so `/api/*` is proxied by Vite to the local Express server.
 * - **Production (Vercel)** (no override) — empty string → same-origin `/api/*` via `api/[[...slug]].js`.
 */
export function getFetchApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_FETCH_API_BASE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  return ''
}

export function fetchApiAbsoluteUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${getFetchApiBaseUrl()}${p}`
}
