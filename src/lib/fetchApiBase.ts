/**
 * Base URL for the Fetch Node server (scan, chat, TTS, marketplace).
 *
 * - **Explicit** `VITE_FETCH_API_BASE_URL` — always wins (e.g. separate API host in prod, or LAN IP).
 * - **Dev** (no override) — `http://127.0.0.1:8787` (local Express).
 * - **Production build** (no override) — empty string so paths like `/api/voice/tts` are same-origin
 *   (deploy API on the same host as the SPA, or set `VITE_FETCH_API_BASE_URL`).
 */
export function getFetchApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_FETCH_API_BASE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  if (import.meta.env.DEV) return 'http://127.0.0.1:8787'
  return ''
}

export function fetchApiAbsoluteUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${getFetchApiBaseUrl()}${p}`
}
