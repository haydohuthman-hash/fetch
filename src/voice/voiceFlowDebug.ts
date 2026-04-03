/**
 * Voice pipeline diagnostics: console + CustomEvents (optional listeners) + debug ingest.
 */

const INGEST = 'http://127.0.0.1:7246/ingest/130c5824-fd41-46de-a33e-be771fe2ae27'
const DEBUG_SESSION = 'afe72a'

/** Console + DOM event + optional debug ingest (session afe72a). */
export function voiceFlowDebug(stage: string, data?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(`[Fetch voice flow] ${stage}`, data ?? '')
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('fetch-voice-flow-debug', {
        detail: { stage, ...data, t: Date.now() },
      }),
    )
  }
  // #region agent log
  fetch(INGEST, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': DEBUG_SESSION,
    },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION,
      hypothesisId: 'voice_flow',
      location: 'voiceFlowDebug.ts:voiceFlowDebug',
      message: stage,
      data: { stage, ...data },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
}

export function voiceFlowFallbackText(text: string, reason?: string): void {
  // eslint-disable-next-line no-console
  console.warn('[Fetch voice flow] Fallback text (playback failed)', reason, text)
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
