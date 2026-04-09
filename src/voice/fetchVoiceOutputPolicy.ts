/**
 * Assistant / system voice (TTS) is limited to the Fetch brain chat overlay.
 * `playUiEvent` chimes stay available app-wide.
 */
let chatVoiceOutputActive = false

export function isFetchVoiceChatOutputActive(): boolean {
  return chatVoiceOutputActive
}

export function setFetchVoiceChatOutputActive(next: boolean): void {
  chatVoiceOutputActive = next
}
