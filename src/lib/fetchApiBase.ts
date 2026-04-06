/**
 * Base URL for the Fetch Node server (scan, chat, TTS, marketplace).
 *
 * - **Explicit** `VITE_FETCH_API_BASE_URL` — always wins (e.g. separate API host in prod, or LAN IP).
 * - **Dev** (no override) — empty string so `/api/*` hits the Vite dev server and is **proxied** to Express
 *   (see `vite.config.ts`). Avoids CORS and fixes phone/LAN access (direct `127.0.0.1:8787` would target the wrong host).
 * - **Production build** (no override) — empty string for same-origin `/api/*`.
 */
export function getFetchApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_FETCH_API_BASE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  if (import.meta.env.DEV) return ''
  return ''
}

export function fetchApiAbsoluteUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${getFetchApiBaseUrl()}${p}`
}
