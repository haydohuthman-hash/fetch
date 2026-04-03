export type UiFeedbackEvent =
  | 'activated'
  | 'card_reveal'
  | 'pin_drop'
  | 'orb_tap'
  | 'listening_start'
  | 'listening_end'
  | 'processing_start'
  | 'success'
  | 'driver_found'
  | 'payment_success'
  | 'error'

type CueConfig = {
  debounceMs: number
  haptic: number[] | null
  strongerHaptic?: boolean
}

const EVENT_CONFIG: Record<UiFeedbackEvent, CueConfig> = {
  activated: { debounceMs: 3000, haptic: [12] },
  card_reveal: { debounceMs: 1500, haptic: [10] },
  pin_drop: { debounceMs: 520, haptic: [12, 38, 18, 28, 14] },
  orb_tap: { debounceMs: 120, haptic: [8] },
  listening_start: { debounceMs: 240, haptic: [10] },
  listening_end: { debounceMs: 240, haptic: [8] },
  processing_start: { debounceMs: 450, haptic: [6] },
  success: { debounceMs: 320, haptic: [10] },
  driver_found: { debounceMs: 500, haptic: [14] },
  payment_success: { debounceMs: 700, haptic: [14, 24, 18], strongerHaptic: true },
  error: { debounceMs: 450, haptic: [12, 18, 12] },
}

let lastPlayByEvent = new Map<UiFeedbackEvent, number>()
let sharedCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  try {
    const AC =
      window.AudioContext ||
      (
        window as unknown as {
          webkitAudioContext: typeof AudioContext
        }
      ).webkitAudioContext
    if (!sharedCtx || sharedCtx.state === 'closed') {
      sharedCtx = new AC()
    }
    if (sharedCtx.state === 'suspended') {
      void sharedCtx.resume()
    }
    return sharedCtx
  } catch {
    return null
  }
}

function tone(
  ctx: AudioContext,
  {
    type = 'sine',
    at,
    duration,
    from,
    to,
    gain = 0.04,
  }: {
    type?: OscillatorType
    at: number
    duration: number
    from: number
    to?: number
    gain?: number
  },
) {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(6800, at)
  osc.type = type
  osc.frequency.setValueAtTime(from, at)
  if (to && to !== from) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration)
  }
  env.gain.setValueAtTime(0.0001, at)
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.012)
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  osc.connect(filter)
  filter.connect(env)
  env.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + duration + 0.01)
}

function playEventCue(ctx: AudioContext, event: UiFeedbackEvent) {
  const t0 = ctx.currentTime + 0.003
  switch (event) {
    case 'activated':
      tone(ctx, { type: 'sine', at: t0, duration: 0.22, from: 320, to: 620, gain: 0.04 })
      tone(ctx, { type: 'triangle', at: t0 + 0.06, duration: 0.24, from: 480, to: 880, gain: 0.025 })
      tone(ctx, { type: 'sine', at: t0 + 0.15, duration: 0.2, from: 720, to: 1040, gain: 0.015 })
      break
    case 'card_reveal':
      tone(ctx, { type: 'sine', at: t0, duration: 0.18, from: 580, to: 840, gain: 0.032 })
      tone(ctx, { type: 'triangle', at: t0 + 0.04, duration: 0.16, from: 740, to: 1020, gain: 0.02 })
      tone(ctx, { type: 'sine', at: t0 + 0.1, duration: 0.22, from: 920, to: 1180, gain: 0.012 })
      break
    case 'pin_drop': {
      tone(ctx, { type: 'sine', at: t0, duration: 0.09, from: 165, to: 78, gain: 0.062 })
      tone(ctx, { type: 'triangle', at: t0 + 0.045, duration: 0.11, from: 320, to: 210, gain: 0.04 })
      tone(ctx, { type: 'sine', at: t0 + 0.1, duration: 0.14, from: 520, to: 380, gain: 0.032 })
      tone(ctx, { type: 'triangle', at: t0 + 0.16, duration: 0.2, from: 980, to: 1320, gain: 0.022 })
      tone(ctx, { type: 'sine', at: t0 + 0.28, duration: 0.26, from: 1440, to: 2100, gain: 0.012 })
      break
    }
    case 'orb_tap':
      tone(ctx, { type: 'sine', at: t0, duration: 0.14, from: 420, to: 520, gain: 0.035 })
      break
    case 'listening_start':
      tone(ctx, { type: 'triangle', at: t0, duration: 0.16, from: 540, to: 760, gain: 0.03 })
      tone(ctx, { type: 'sine', at: t0 + 0.01, duration: 0.12, from: 860, to: 980, gain: 0.012 })
      break
    case 'listening_end':
      tone(ctx, { type: 'triangle', at: t0, duration: 0.16, from: 760, to: 520, gain: 0.028 })
      break
    case 'processing_start':
      tone(ctx, { type: 'sine', at: t0, duration: 0.11, from: 300, to: 320, gain: 0.01 })
      break
    case 'success':
      tone(ctx, { type: 'triangle', at: t0, duration: 0.12, from: 680, to: 920, gain: 0.034 })
      break
    case 'driver_found':
      tone(ctx, { type: 'triangle', at: t0, duration: 0.17, from: 620, to: 980, gain: 0.038 })
      tone(ctx, { type: 'sine', at: t0 + 0.045, duration: 0.12, from: 980, to: 1180, gain: 0.016 })
      break
    case 'payment_success':
      tone(ctx, { type: 'triangle', at: t0, duration: 0.21, from: 520, to: 800, gain: 0.043 })
      tone(ctx, { type: 'sine', at: t0 + 0.08, duration: 0.2, from: 860, to: 1260, gain: 0.018 })
      break
    case 'error':
      tone(ctx, { type: 'sine', at: t0, duration: 0.16, from: 380, to: 260, gain: 0.026 })
      break
  }
}

function playHaptic(event: UiFeedbackEvent) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  const pattern = EVENT_CONFIG[event].haptic
  if (!pattern || pattern.length === 0) return
  try {
    navigator.vibrate(pattern)
  } catch {
    /* ignore unsupported environments */
  }
}

export function playUiFeedback(event: UiFeedbackEvent): void {
  const now = Date.now()
  const cfg = EVENT_CONFIG[event]
  const last = lastPlayByEvent.get(event) ?? 0
  if (now - last < cfg.debounceMs) return
  lastPlayByEvent.set(event, now)
  playHaptic(event)
  const ctx = getAudioContext()
  if (!ctx) return
  playEventCue(ctx, event)
}

