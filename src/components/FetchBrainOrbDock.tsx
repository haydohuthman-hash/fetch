import type { CSSProperties } from 'react'
import {
  JarvisNeuralOrb,
  useFetchOrbVoiceLevel,
  type FetchOrbExpression,
  type JarvisOrbState,
} from './JarvisNeuralOrb'
import type { FetchBrainMindState } from '../lib/fetchBrainParticles'
import { useFetchVoice } from '../voice/FetchVoiceContext'

function mindToOrbState(mind: FetchBrainMindState): JarvisOrbState {
  if (mind === 'listening') return 'listening'
  if (mind === 'thinking') return 'thinking'
  if (mind === 'speaking') return 'speaking'
  return 'idle'
}

function mindToActivity(mind: FetchBrainMindState, speaking: boolean): number {
  if (mind === 'listening') return 0.72
  if (mind === 'thinking') return 0.86
  if (mind === 'speaking') return 0.94
  if (speaking) return 0.82
  return 0.14
}

export type FetchBrainOrbDockProps = {
  mind: FetchBrainMindState
  glowRgb: { r: number; g: number; b: number }
  orbAppearance: 'night' | 'day'
}

/**
 * Single header orb (`fab` size — no homeDock “magical” outer ring).
 * Gaze is biased down toward the transcript; sits on the header border line.
 */
export function FetchBrainOrbDock({ mind, glowRgb, orbAppearance }: FetchBrainOrbDockProps) {
  const { isSpeechPlaying, muted } = useFetchVoice()
  const speaking = isSpeechPlaying && !muted
  const orbState = mindToOrbState(mind)
  const activity = mindToActivity(mind, speaking)
  const micOpen = mind === 'listening'
  const voiceLevel = useFetchOrbVoiceLevel(micOpen)
  const expression: FetchOrbExpression =
    mind === 'speaking' || speaking
      ? 'speaking'
      : mind === 'listening'
        ? 'listening'
        : mind === 'thinking'
          ? 'focused'
          : 'awake'

  const shellStyle = {
    '--orb-glow': `${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}`,
  } as CSSProperties

  return (
    <div
      className="fetch-brain-orb-header pointer-events-none relative z-[2] flex min-w-0 flex-col items-center"
      style={shellStyle}
    >
      <div className="fetch-brain-orb-header__glass">
        <div className="fetch-brain-orb-header__art">
          <JarvisNeuralOrb
            expression={expression}
            state={orbState}
            speaking={speaking}
            activity={activity}
            voiceLevel={voiceLevel}
            awakened
            confirmationNonce={0}
            mapAttention="none"
            lookAtCard={false}
            lookDown
            lookDownDepth={1.58}
            glowColor={glowRgb}
            orbAppearance={orbAppearance}
            size="fab"
            autonomous={mind === 'idle' && !speaking}
            ariaLive={false}
          />
        </div>
      </div>
    </div>
  )
}
