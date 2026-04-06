/// <reference types="vite/client" />

/**
 * TTS: `POST /api/tts` and `POST /api/voice/tts` use Google Cloud Text-to-Speech when
 * `GOOGLE_TEXT_TO_SPEECH_API_KEY`, `GOOGLE_CLOUD_API_KEY`, or `GOOGLE_TTS_API_KEY` is set in server `.env`.
 * Optional server env: `GOOGLE_TTS_VOICE` (default `en-US-Chirp-HD-D`; falls back to Neural2 if unavailable).
 */
interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  /** Vector Map ID from Google Cloud Console — enables 3D tilt + buildings. */
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string
  /** Mapbox public token (pk.*) — home `MapboxMapLayer` + optional `FetchMap` / Directions. */
  readonly VITE_MAPBOX_TOKEN?: string
  /** @deprecated Prefer `VITE_MAPBOX_TOKEN`. Same use as token above for home Mapbox. */
  readonly VITE_MAPBOX_ACCESS_TOKEN?: string
  /**
   * Home shell basemap: `google` (default) or `mapbox`.
   * Mapbox mode shows Mapbox GL only; route/pin overlays still need a Google port.
   */
  readonly VITE_HOME_MAP_ENGINE?: string
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
