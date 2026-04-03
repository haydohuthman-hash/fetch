/**
 * Voice pipeline diagnostics: console + CustomEvents (optional listeners).
 */

export function voiceFlowDebug(stage: string, data?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log(`[Fetch voice flow] ${stage}`, data ?? '')
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('fetch-voice-flow-debug', {
        detail: { stage, ...data, t: Date.now() },
      }),
    )
  }
}

export function voiceFlowFallbackText(text: string, reason?: string): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn('[Fetch voice flow] Fallback text (playback failed)', reason, text)
  }
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('fetch-voice-fallback-text', {
      detail: { text, reason: reason ?? 'playback_failed' },
    }),
  )
}

export function voiceFlowSttError(message: string, detail?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.error('[Fetch voice flow] STT error', message, detail)
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('fetch-voice-stt-error', {
      detail: { message, ...detail, t: Date.now() },
    }),
  )
}
