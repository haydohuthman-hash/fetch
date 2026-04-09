/// <reference types="vite/client" />

/**
 * **Server-only (Vercel / Node)** — never `VITE_*`:
 * - `OPENAI_API_KEY`, optional `ANTHROPIC_API_KEY` → `POST /api/chat`, `/api/chat/stream`
 * - `GOOGLE_TEXT_TO_SPEECH_API_KEY` | `GOOGLE_CLOUD_API_KEY` | `GOOGLE_TTS_API_KEY` → `POST /api/voice` (aliases: `/api/tts`, `/api/voice/tts`)
 * - Optional: `GOOGLE_TTS_VOICE` (default `en-US-Chirp-HD-D`)
 *
 * **Client** calls same-origin `/api/*` only. Speech-to-text uses the browser Web Speech API after mic permission (no server STT).
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
  /** Override photo scan URL; default is same-origin `POST /api/scan`. */
  readonly VITE_SCAN_API_URL?: string
  /** Supabase project URL (browser client). */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase anon / public key (browser only — not service_role). */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
