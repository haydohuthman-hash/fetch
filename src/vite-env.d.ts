/// <reference types="vite/client" />

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
  /** ElevenLabs API key for browser-direct TTS fallback only — prefer server proxy + ELEVENLABS_API_KEY. */
  readonly VITE_ELEVENLABS_API_KEY?: string
  /** Optional override; default premade is Daniel (measured assistant-style). */
  readonly VITE_ELEVENLABS_VOICE_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
