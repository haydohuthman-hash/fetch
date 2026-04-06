/// <reference types="vite/client" />

/**
 * TTS: the Node server route `POST /api/voice/tts` uses Google Cloud Text-to-Speech when
 * `GOOGLE_TEXT_TO_SPEECH_API_KEY`, `GOOGLE_CLOUD_API_KEY`, or `GOOGLE_TTS_API_KEY` is set in server `.env`.
 * Optional server env: `GOOGLE_TTS_VOICE` (default `en-AU-Neural2-B`).
 */
interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  /** Vector Map ID from Google Cloud Console — enables 3D tilt + buildings. */
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string
  /**
   * Node API origin when it differs from the SPA (dev LAN, split deploy).
   * If unset in production, `/api/*` is called same-origin — deploy the Express app behind the same host or use this.
   */
  readonly VITE_FETCH_API_BASE_URL?: string
  /**
   * Optional TTS-only API origin; defaults to same resolution as `VITE_FETCH_API_BASE_URL` / same-origin.
   */
  readonly VITE_VOICE_API_BASE?: string
  /**
   * `1` = allow OS `speechSynthesis` when Google Cloud TTS proxy fails (e.g. iOS Safari dev).
   * Omit on touch devices to keep assistant voice on Google Cloud TTS only.
   */
  readonly VITE_VOICE_BROWSER_FALLBACK?: string
  /** Set to `1` to log `[FetchPerf]` timings (see `fetchPerf.ts`). Or use localStorage `fetchPerfLogs=1`. */
  readonly VITE_FETCH_PERF_LOGS?: string
  /**
   * When `1`, Account screen uses `POST /api/auth/register` and `/login` (requires server `FETCH_AUTH_USERS_DB=1` + Postgres).
   */
  readonly VITE_FETCH_AUTH_USERS_DB?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
