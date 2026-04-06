/**
 * Internal state updates for voice routing (cloud TTS vs browser).
 * Console diagnostics use `[FetchVoice]` in fetchVoice.ts.
 */

export type VoiceActiveSource =
  | { kind: 'idle' }
  | { kind: 'cloud_tts' }
  | { kind: 'browser_fallback'; reason: string }

export type VoiceSourceDebugState = {
  active: VoiceActiveSource
  lastTtsError: string | null
}

let state: VoiceSourceDebugState = {
  active: { kind: 'idle' },
  lastTtsError: null,
}

export function patchVoiceSourceDebug(
  patch: Partial<Pick<VoiceSourceDebugState, 'active' | 'lastTtsError'>>,
): void {
  state = { ...state, ...patch }
}
