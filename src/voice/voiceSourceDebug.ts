/**
 * Internal state updates for voice routing (e.g. ElevenLabs vs browser).
 * Console diagnostics use `[FetchVoice]` in fetchVoice.ts.
 */

export type VoiceActiveSource =
  | { kind: 'idle' }
  | { kind: 'elevenlabs' }
  | { kind: 'browser_fallback'; reason: string }

export type VoiceSourceDebugState = {
  active: VoiceActiveSource
  lastElevenLabsError: string | null
}

let state: VoiceSourceDebugState = {
  active: { kind: 'idle' },
  lastElevenLabsError: null,
}

export function patchVoiceSourceDebug(
  patch: Partial<Pick<VoiceSourceDebugState, 'active' | 'lastElevenLabsError'>>,
): void {
  state = { ...state, ...patch }
}
