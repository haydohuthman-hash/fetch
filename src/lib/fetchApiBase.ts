/**
 * Base URL for the Fetch Node server (scan, chat, TTS, marketplace).
 *
 * - **Explicit** `VITE_FETCH_API_BASE_URL` — always wins (e.g. separate API host in prod, or LAN IP).
 * - **Dev** (no override) — empty string so `/api/*` hits the Vite dev server and is **proxied** to Express
 *   (see `vite.config.ts`). Avoids CORS and fixes phone/LAN access (direct `127.0.0.1:8787` would target the wrong host).
 * - **Production build** (no override) — empty string for same-origin `/api/*`.
 */
let agentLogFetchApiBaseOnce = false

export function getFetchApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_FETCH_API_BASE_URL?.trim()
  let result: string
  if (explicit) result = explicit.replace(/\/$/, '')
  else if (import.meta.env.DEV) result = ''
  else result = ''

  if (typeof window !== 'undefined' && !agentLogFetchApiBaseOnce) {
    agentLogFetchApiBaseOnce = true
    // #region agent log
    fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '217219' },
      body: JSON.stringify({
        sessionId: '217219',
        hypothesisId: 'H1',
        location: 'fetchApiBase.ts:getFetchApiBaseUrl',
        message: 'resolved API base (prod empty = same-origin /api)',
        data: {
          apiBaseLen: result.length,
          apiBaseIsEmpty: result === '',
          viteDev: import.meta.env.DEV,
          hasViteFetchApiBaseUrl: Boolean(explicit),
          origin: window.location.origin,
          pageProtocol: window.location.protocol,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  }

  return result
}

export function fetchApiAbsoluteUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${getFetchApiBaseUrl()}${p}`
}
