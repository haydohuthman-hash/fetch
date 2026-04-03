/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  /** Vector Map ID from Google Cloud Console — enables 3D tilt + buildings. */
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string
  /** ElevenLabs API key for short system TTS (keep out of public repos). */
  readonly VITE_ELEVENLABS_API_KEY?: string
  /** Optional override; default premade is Daniel (measured assistant-style). */
  readonly VITE_ELEVENLABS_VOICE_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
