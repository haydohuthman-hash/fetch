/**
 * Premium minimal expression system for the Fetch assistant orb.
 * All values are normalized; the canvas layer maps them to pixels via R (orb radius).
 */

export type FetchOrbExpression =
  | 'idle'
  | 'awake'
  | 'curious'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'happy'
  | 'excited'
  | 'focused'
  | 'searching'
  | 'surprised'
  | 'concerned'
  | 'proud'
  | 'sleepy'
  | 'intense'
  /** Bouncy, slightly asymmetric — autonomous idle. */
  | 'playful'
  /** Greeting: bright + wave hand drawn in canvas when autonomous. */
  | 'waving'
  /** Calm, warm presence. */
  | 'content'

export type OrbMouthKind = 'none' | 'hint_arc' | 'speak_line' | 'flat' | 'soft_o'

/** Fully resolved targets for one animation frame (after preset merge). */
export type OrbFaceTargets = {
  /** Overall eye / face light strength 0..1.2 */
  faceGlow: number
  /** Multipliers on base pill half-width / half-height (base ~0.092 / 0.184 of R). */
  eyeScaleW: number
  eyeScaleH: number
  /** Multiplier on horizontal spread between eye centers. */
  eyeSpreadMul: number
  /** Vertical offset of eye row in units of R (negative = higher). */
  eyeYMul: number
  /** Base vertical openness before blink 0..1. */
  eyeOpen: number
  /** Fraction of eye height covered from top (eyelid). */
  upperLid: number
  /** Fraction covered from bottom. */
  lowerLid: number
  /** Left eye width scale = 1 - asym, right = 1 + asym. */
  asymmetry: number
  /** Horizontal offset factor for “tilt” (left eye up, right down) in R. */
  tiltY: number
  /** Subtle darkening at top of eye form (brow tension) 0..1. */
  browTension: number
  mouthKind: OrbMouthKind
  /** Speaking / modulation amount for mouth. */
  mouthEnergy: number
  /** Micro gaze shift, multiplied by small R in renderer. */
  pupilShiftX: number
  pupilShiftY: number
  /** Pupil dot visibility 0..1 (premium: keep low). */
  pupilAlpha: number
  /** Internal shimmer strength 0..1. */
  shimmer: number
  /** Shimmer sweep speed scale. */
  shimmerSpeed: number
  /** Horizontal scan amplitude for searching (renderer uses sin); 0 = off. */
  searchScan: number
  /** Inner warm / red wash strength. */
  innerWarm: number
  /** Extra red accent for “intense” states. */
  redAccent: number
  /** Underglow opacity scale. */
  glowOpacity: number
  /** Added to base blur px in renderer. */
  glowBlurAdd: number
  /** Underglow vertical nudge px. */
  glowLiftPx: number
  /** Whole orb translate Y (px). */
  liftPx: number
  /** Breath scale amplitude. */
  breathAmp: number
  /** Blink interval scale (>1 = less frequent). */
  blinkSlow: number
}

export const ORB_FACE_DEFAULTS: OrbFaceTargets = {
  faceGlow: 1,
  eyeScaleW: 1,
  eyeScaleH: 1,
  eyeSpreadMul: 1.04,
  eyeYMul: -0.1,
  eyeOpen: 0.92,
  upperLid: 0.06,
  lowerLid: 0.04,
  asymmetry: 0,
  tiltY: 0,
  browTension: 0,
  mouthKind: 'none',
  mouthEnergy: 0,
  pupilShiftX: 0,
  pupilShiftY: 0,
  pupilAlpha: 0,
  searchScan: 0,
  shimmer: 0.15,
  shimmerSpeed: 1,
  innerWarm: 1,
  redAccent: 1,
  glowOpacity: 1,
  glowBlurAdd: 0,
  glowLiftPx: 0,
  liftPx: 0,
  breathAmp: 0.006,
  blinkSlow: 1,
}

function merge(base: OrbFaceTargets, patch: Partial<OrbFaceTargets>): OrbFaceTargets {
  return { ...base, ...patch }
}

/** Authoring presets — subtle, logistics-premium. */
export const ORB_EXPRESSION_PRESETS: Record<FetchOrbExpression, Partial<OrbFaceTargets>> = {
  idle: {
    faceGlow: 0.44,
    eyeOpen: 0.34,
    upperLid: 0.16,
    lowerLid: 0.1,
    eyeScaleH: 0.84,
    eyeScaleW: 0.92,
    mouthKind: 'none',
    mouthEnergy: 0,
    shimmer: 0.06,
    innerWarm: 0.55,
    redAccent: 0.85,
    glowOpacity: 0.42,
    breathAmp: 0.004,
    blinkSlow: 1.35,
  },
  awake: {
    faceGlow: 0.96,
    eyeOpen: 0.94,
    upperLid: 0.02,
    lowerLid: 0.02,
    eyeScaleH: 1,
    eyeScaleW: 1,
    eyeSpreadMul: 1.07,
    eyeYMul: -0.115,
    mouthKind: 'none',
    mouthEnergy: 0,
    shimmer: 0.14,
    innerWarm: 0.88,
    liftPx: -7,
    glowOpacity: 0.78,
  },
  curious: {
    faceGlow: 0.98,
    eyeOpen: 0.96,
    eyeScaleH: 1.14,
    eyeScaleW: 1.08,
    upperLid: 0.03,
    lowerLid: 0.025,
    browTension: 0.14,
    asymmetry: 0.09,
    tiltY: 0.016,
    eyeYMul: -0.112,
    mouthKind: 'hint_arc',
    mouthEnergy: 0.22,
    shimmer: 0.26,
    pupilShiftX: 0.11,
    liftPx: -6,
    glowOpacity: 0.88,
    breathAmp: 0.007,
  },
  listening: {
    faceGlow: 1.04,
    eyeOpen: 1,
    eyeScaleH: 1.1,
    eyeScaleW: 1.04,
    eyeSpreadMul: 1.09,
    upperLid: 0.018,
    lowerLid: 0.018,
    browTension: 0.08,
    mouthKind: 'hint_arc',
    mouthEnergy: 0.18,
    shimmer: 0.16,
    innerWarm: 0.96,
    liftPx: -10,
    glowOpacity: 0.94,
    redAccent: 1.06,
    pupilShiftX: 0.09,
    breathAmp: 0.006,
  },
  thinking: {
    faceGlow: 0.88,
    eyeOpen: 0.82,
    eyeScaleH: 0.8,
    eyeScaleW: 0.96,
    upperLid: 0.14,
    lowerLid: 0.06,
    browTension: 0.35,
    mouthKind: 'none',
    mouthEnergy: 0,
    shimmer: 0.62,
    shimmerSpeed: 1.35,
    innerWarm: 0.75,
    liftPx: -4,
    glowOpacity: 0.7,
  },
  speaking: {
    faceGlow: 0.96,
    eyeOpen: 0.9,
    eyeScaleH: 0.98,
    eyeSpreadMul: 1.1,
    upperLid: 0.03,
    lowerLid: 0.03,
    mouthKind: 'speak_line',
    mouthEnergy: 0.96,
    shimmer: 0.22,
    innerWarm: 1,
    liftPx: 0,
    glowOpacity: 1.02,
    glowBlurAdd: 6,
    glowLiftPx: 0,
    redAccent: 1.08,
  },
  happy: {
    faceGlow: 0.96,
    eyeOpen: 0.88,
    eyeScaleH: 0.92,
    eyeSpreadMul: 1.04,
    upperLid: 0.06,
    lowerLid: 0.05,
    mouthKind: 'hint_arc',
    mouthEnergy: 0.55,
    shimmer: 0.32,
    innerWarm: 0.94,
    glowOpacity: 0.9,
    liftPx: -7,
    breathAmp: 0.009,
    redAccent: 1.04,
  },
  excited: {
    faceGlow: 1.12,
    eyeOpen: 1,
    eyeScaleH: 1.14,
    eyeScaleW: 1.08,
    eyeSpreadMul: 1.08,
    upperLid: 0.02,
    lowerLid: 0.02,
    mouthKind: 'none',
    mouthEnergy: 0,
    shimmer: 0.35,
    innerWarm: 1.08,
    redAccent: 1.18,
    glowOpacity: 1.15,
    glowBlurAdd: 10,
    glowLiftPx: -10,
    liftPx: -13,
    breathAmp: 0.009,
  },
  focused: {
    faceGlow: 0.88,
    eyeOpen: 0.76,
    eyeScaleH: 0.7,
    eyeScaleW: 0.9,
    upperLid: 0.14,
    lowerLid: 0.09,
    browTension: 0.52,
    mouthKind: 'none',
    mouthEnergy: 0,
    pupilAlpha: 0.28,
    pupilShiftX: -0.05,
    shimmer: 0.08,
    innerWarm: 0.8,
    liftPx: -5,
    glowOpacity: 0.7,
  },
  searching: {
    faceGlow: 0.93,
    eyeOpen: 0.92,
    eyeScaleH: 0.96,
    searchScan: 1,
    mouthKind: 'none',
    mouthEnergy: 0,
    shimmer: 0.55,
    shimmerSpeed: 1.6,
    innerWarm: 0.88,
    liftPx: -6,
    glowOpacity: 0.82,
    pupilShiftX: 0.15,
  },
  surprised: {
    faceGlow: 1.08,
    eyeOpen: 1,
    eyeScaleH: 1.28,
    eyeScaleW: 1.12,
    eyeSpreadMul: 1.09,
    upperLid: 0,
    lowerLid: 0.04,
    mouthKind: 'none',
    mouthEnergy: 0,
    shimmer: 0.25,
    liftPx: -14,
    glowOpacity: 1.05,
    glowBlurAdd: 8,
  },
  concerned: {
    faceGlow: 0.55,
    eyeOpen: 0.72,
    eyeScaleH: 0.78,
    eyeScaleW: 0.94,
    upperLid: 0.18,
    lowerLid: 0.1,
    browTension: 0.55,
    asymmetry: -0.04,
    mouthKind: 'none',
    mouthEnergy: 0,
    innerWarm: 0.48,
    redAccent: 0.75,
    glowOpacity: 0.48,
    shimmer: 0.08,
    liftPx: -2,
  },
  proud: {
    faceGlow: 0.92,
    eyeOpen: 0.86,
    eyeScaleH: 0.9,
    eyeSpreadMul: 1.03,
    upperLid: 0.055,
    lowerLid: 0.04,
    mouthKind: 'flat',
    mouthEnergy: 0.5,
    shimmer: 0.24,
    innerWarm: 0.92,
    glowOpacity: 0.88,
    breathAmp: 0.0075,
    liftPx: -6,
    redAccent: 1.02,
  },
  sleepy: {
    faceGlow: 0.46,
    eyeOpen: 0.24,
    upperLid: 0.44,
    lowerLid: 0.34,
    eyeScaleH: 0.72,
    mouthKind: 'soft_o',
    mouthEnergy: 0.42,
    shimmer: 0.14,
    shimmerSpeed: 0.75,
    innerWarm: 0.58,
    redAccent: 0.84,
    glowOpacity: 0.48,
    breathAmp: 0.007,
    blinkSlow: 1.45,
    liftPx: 0,
  },
  intense: {
    faceGlow: 0.82,
    eyeOpen: 0.76,
    eyeScaleH: 0.7,
    eyeScaleW: 0.9,
    upperLid: 0.1,
    lowerLid: 0.08,
    browTension: 0.5,
    mouthKind: 'none',
    mouthEnergy: 0,
    pupilAlpha: 0.18,
    innerWarm: 1.15,
    redAccent: 1.45,
    shimmer: 0.12,
    glowOpacity: 1.05,
    glowBlurAdd: 4,
    liftPx: -8,
  },
  playful: {
    faceGlow: 1.02,
    eyeOpen: 0.96,
    eyeScaleH: 1.08,
    eyeScaleW: 1.04,
    upperLid: 0.03,
    lowerLid: 0.03,
    asymmetry: 0.1,
    tiltY: 0.018,
    mouthKind: 'hint_arc',
    mouthEnergy: 0.55,
    shimmer: 0.32,
    shimmerSpeed: 1.25,
    innerWarm: 0.95,
    pupilShiftX: 0.08,
    liftPx: -8,
    glowOpacity: 0.92,
    breathAmp: 0.009,
  },
  waving: {
    faceGlow: 1.08,
    eyeOpen: 1,
    eyeScaleH: 1.1,
    eyeScaleW: 1.05,
    eyeSpreadMul: 1.09,
    upperLid: 0.02,
    lowerLid: 0.02,
    mouthKind: 'hint_arc',
    mouthEnergy: 0.72,
    shimmer: 0.38,
    innerWarm: 1.02,
    redAccent: 1.1,
    glowOpacity: 1,
    glowBlurAdd: 8,
    liftPx: -12,
    breathAmp: 0.008,
  },
  content: {
    faceGlow: 0.8,
    eyeOpen: 0.82,
    eyeScaleH: 0.9,
    eyeScaleW: 0.98,
    upperLid: 0.08,
    lowerLid: 0.055,
    mouthKind: 'hint_arc',
    mouthEnergy: 0.42,
    shimmer: 0.2,
    innerWarm: 0.9,
    glowOpacity: 0.74,
    breathAmp: 0.0072,
    liftPx: -5,
    blinkSlow: 1.15,
  },
}

export function resolveOrbExpressionTargets(expression: FetchOrbExpression): OrbFaceTargets {
  return merge(ORB_FACE_DEFAULTS, ORB_EXPRESSION_PRESETS[expression] ?? {})
}

type OrbNumericKey = Exclude<keyof OrbFaceTargets, 'mouthKind'>

const NUMERIC_KEYS: readonly OrbNumericKey[] = [
  'faceGlow',
  'eyeScaleW',
  'eyeScaleH',
  'eyeSpreadMul',
  'eyeYMul',
  'eyeOpen',
  'upperLid',
  'lowerLid',
  'asymmetry',
  'tiltY',
  'browTension',
  'mouthEnergy',
  'pupilShiftX',
  'pupilShiftY',
  'pupilAlpha',
  'searchScan',
  'shimmer',
  'shimmerSpeed',
  'innerWarm',
  'redAccent',
  'glowOpacity',
  'glowBlurAdd',
  'glowLiftPx',
  'liftPx',
  'breathAmp',
  'blinkSlow',
]

/** Step toward `target` (per-frame smoothing). */
export function stepOrbFaceTargets(
  current: OrbFaceTargets,
  target: OrbFaceTargets,
  rate: number,
): OrbFaceTargets {
  const u = Math.max(0, Math.min(1, rate))
  const next: OrbFaceTargets = { ...current }
  for (const key of NUMERIC_KEYS) {
    const a = current[key]
    const b = target[key]
    next[key] = a + (b - a) * u
  }
  /* Must always follow target: render uses rate≈0.11 so `rate >= 0.18` never ran — mouth stuck on `none`. */
  next.mouthKind = target.mouthKind
  return next
}

/** Map legacy `JarvisOrbState` + speaking when no explicit expression is set. */
export function expressionFromLegacyState(
  state: string | undefined,
  speaking: boolean,
): FetchOrbExpression {
  if (speaking && (state === 'idle' || state === undefined || state === 'aware'))
    return 'speaking'
  switch (state) {
    case 'listening':
      return 'listening'
    case 'processing':
    case 'thinking':
      return 'thinking'
    case 'responding':
    case 'speaking':
      return 'speaking'
    case 'confirmed':
    case 'completed':
      return 'happy'
    case 'aware':
      return 'awake'
    case 'idle':
      return speaking ? 'speaking' : 'idle'
    default:
      return speaking ? 'speaking' : 'idle'
  }
}

/**
 * Optional high-level booking / app moments → expression presets.
 * Override with your own `expression` prop when UX needs a different read.
 */
export type FetchOrbFlowMoment =
  | 'app_cold'
  | 'idle_long'
  | 'orb_listen'
  | 'job_picked'
  | 'address_loading'
  | 'route_ready'
  | 'matching'
  | 'driver_found'
  | 'payment_locked'
  | 'error_soft'
  | 'tts_active'

export function expressionForFlowMoment(moment: FetchOrbFlowMoment): FetchOrbExpression {
  switch (moment) {
    case 'app_cold':
      return 'idle'
    case 'idle_long':
      return 'sleepy'
    case 'orb_listen':
      return 'listening'
    case 'job_picked':
      return 'happy'
    case 'address_loading':
      return 'thinking'
    case 'route_ready':
      return 'focused'
    case 'matching':
      return 'searching'
    case 'driver_found':
      return 'excited'
    case 'payment_locked':
      return 'intense'
    case 'error_soft':
      return 'concerned'
    case 'tts_active':
      return 'speaking'
    default:
      return 'awake'
  }
}

/** CSS / layout hooks for legacy bottom nav. */
export function legacySphereClassFromExpression(e: FetchOrbExpression): string {
  switch (e) {
    case 'listening':
    case 'searching':
      return 'listening'
    case 'thinking':
      return 'processing'
    case 'speaking':
    case 'excited':
    case 'surprised':
      return 'speaking'
    case 'happy':
    case 'proud':
    case 'intense':
    case 'waving':
    case 'playful':
      return 'completed'
    case 'content':
      return 'engaged'
    case 'awake':
    case 'curious':
      /* Subtle “alive” motion; avoids `--idle` when the canvas face is alert */
      return 'engaged'
    case 'idle':
      /* Canvas face is friendly; legacy `--idle` reads “sad shell” in DevTools */
      return 'engaged'
    default:
      return 'idle'
  }
}
