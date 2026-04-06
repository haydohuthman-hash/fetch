/**
 * Touch-first phones and tablets: prioritize instant UI feedback and Google Cloud TTS
 * (avoid Apple/Samsung browser speechSynthesis unless explicitly allowed).
 */
export function isCoarsePointerDevice(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

/**
 * When true, assistant TTS skips `speechSynthesis` fallback if Google proxy audio fails.
 * Opt back in for local dev on iOS: `VITE_VOICE_BROWSER_FALLBACK=1`.
 */
export function shouldSkipBrowserTtsFallback(): boolean {
  if (import.meta.env.VITE_VOICE_BROWSER_FALLBACK === '1') return false
  if (import.meta.env.VITE_VOICE_BROWSER_FALLBACK === '0') return true
  return isCoarsePointerDevice()
}
