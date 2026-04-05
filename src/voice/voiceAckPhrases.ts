/** Short copy shown while TTS/network catches up — no change to playback pipeline. */
const VOICE_INSTANT_ACK_PHRASES = [
  'Got it…',
  'One sec…',
  'Thinking…',
  'On it…',
] as const

export function pickVoiceInstantAck(): string {
  const i = Math.floor(Math.random() * VOICE_INSTANT_ACK_PHRASES.length)
  return VOICE_INSTANT_ACK_PHRASES[i]!
}
