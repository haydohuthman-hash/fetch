import { useEffect, useRef, useState } from 'react'
import {
  JarvisNeuralOrb,
  type FetchOrbExpression,
  type JarvisOrbState,
  type MapAttentionCue,
} from './JarvisNeuralOrb'
import { useFetchVoice } from '../voice/FetchVoiceContext'
import { primeVoicePlaybackFromUserGesture } from '../voice/fetchVoice'

export function FetchVoiceCommandFab({
  onOpen,
  id = 'fetch-voice-command-button',
  onboardingPulse = false,
  compact = false,
  /** Smaller dock + `homeDock` orb — home booking / sheet layout */
  homeSheetDock = false,
  /** Maps tab: compact orb over the map (uses `homeDockCompact`) */
  homeSheetDockCompact = false,
  orbState,
  pulseNonce = 0,
  typingActive = false,
  awakened = false,
  confirmationNonce = 0,
  mapAttention = 'none',
  lookAtCard = false,
  lookDown = false,
  glowColor,
  voiceLevel,
  expression,
  orbAppearance,
  autonomous = false,
  suspendAutonomous = false,
  /** Intent dock: drag up on the orb starts a sheet expand (tap still opens assistant). */
  onSheetPullExpand,
  /** While HomeView plays the 1m idle reminder line — black dog ears above the orb during that TTS only. */
  dogEars = false,
  /** Booking / payment dock: neutral face, no speaking pulse or listening ring. */
  minimalDockPresentation = false,
}: {
  onOpen: () => void
  id?: string
  onboardingPulse?: boolean
  compact?: boolean
  homeSheetDock?: boolean
  homeSheetDockCompact?: boolean
  orbState?: JarvisOrbState
  pulseNonce?: number
  typingActive?: boolean
  awakened?: boolean
  confirmationNonce?: number
  mapAttention?: MapAttentionCue
  lookAtCard?: boolean
  lookDown?: boolean
  glowColor?: { r: number; g: number; b: number }
  voiceLevel?: number
  expression?: FetchOrbExpression
  orbAppearance?: 'night' | 'day' | 'brand'
  autonomous?: boolean
  suspendAutonomous?: boolean
  onSheetPullExpand?: () => void
  dogEars?: boolean
  minimalDockPresentation?: boolean
}) {
  const { isSpeechPlaying, muted, playUiEvent } = useFetchVoice()
  const [pulseActive, setPulseActive] = useState(false)
  const sheetPullRef = useRef<{
    id: number
    x: number
    y: number
    fired: boolean
  } | null>(null)
  const skipNextClickRef = useRef(false)
  const speaking = isSpeechPlaying && !muted
  const dim = compact
    ? 'h-[3.25rem] w-[3.25rem]'
    : homeSheetDock && homeSheetDockCompact
      ? 'h-[4rem] w-[4rem]'
      : homeSheetDock
        ? 'h-[6.5rem] w-[6.5rem]'
        : 'h-[9rem] w-[9rem]'

  const resolvedState: JarvisOrbState | undefined = (() => {
    if (orbState != null) return orbState
    if (speaking) return 'speaking'
    if (onboardingPulse) return 'listening'
    return undefined
  })()

  const resolvedActivityCore =
    orbState === 'listening'
      ? 0.72
      : orbState === 'processing'
        ? 0.86
        : orbState === 'responding'
          ? 0.94
          : orbState === 'thinking'
            ? 0.86
            : orbState === 'speaking'
              ? 0.94
              : speaking
                ? 0.82
                : onboardingPulse
                  ? 0.34
                  : 0.12

  const resolvedActivity =
    expression === 'listening' ? Math.max(resolvedActivityCore, 0.56) : resolvedActivityCore

  const speakingVisual = minimalDockPresentation
    ? false
    : expression === 'speaking' ||
        expression === 'excited' ||
        expression === 'surprised' ||
        orbState === 'responding' ||
        orbState === 'speaking' ||
        orbState === 'processing' ||
        orbState === 'thinking' ||
        (!orbState && !expression && speaking)

  const listeningVisual =
    !minimalDockPresentation && expression === 'listening' && !speakingVisual

  const looksDormant =
    !speaking &&
    !onboardingPulse &&
    (expression === 'idle' ||
      expression === 'sleepy' ||
      (expression === undefined &&
        (orbState === undefined || orbState === 'idle')))

  useEffect(() => {
    if (pulseNonce <= 0) return
    queueMicrotask(() => setPulseActive(true))
    const t = window.setTimeout(() => setPulseActive(false), 280)
    return () => window.clearTimeout(t)
  }, [pulseNonce])

  return (
    <button
      id={id}
      type="button"
      onPointerDown={(e) => {
        primeVoicePlaybackFromUserGesture()
        if (homeSheetDock && onSheetPullExpand && !homeSheetDockCompact) {
          sheetPullRef.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            fired: false,
          }
        }
      }}
      onPointerMove={(e) => {
        const p = sheetPullRef.current
        if (!p || p.id !== e.pointerId || p.fired || !onSheetPullExpand) return
        const dy = e.clientY - p.y
        const dx = e.clientX - p.x
        if (dy < -36 && Math.abs(dy) > Math.abs(dx) * 1.05) {
          p.fired = true
          skipNextClickRef.current = true
          onSheetPullExpand()
        }
      }}
      onPointerUp={(e) => {
        if (sheetPullRef.current?.id === e.pointerId) {
          sheetPullRef.current = null
        }
      }}
      onPointerCancel={(e) => {
        if (sheetPullRef.current?.id === e.pointerId) {
          sheetPullRef.current = null
        }
      }}
      onClick={() => {
        if (skipNextClickRef.current) {
          skipNextClickRef.current = false
          return
        }
        primeVoicePlaybackFromUserGesture()
        playUiEvent('orb_tap')
        onOpen()
      }}
      aria-label="Fetch assistant"
      className={[
        'fetch-voice-fab fetch-voice-fab--jarvis-solo pointer-events-auto relative z-0 flex shrink-0 items-center justify-center rounded-full bg-transparent text-white transition-transform duration-300 hover:scale-[1.02] active:scale-[0.97]',
        dogEars ? 'fetch-voice-fab--dog-ears-wrap overflow-visible' : '',
        dim,
        looksDormant ? 'fetch-voice-fab--ambient' : '',
        onboardingPulse ? 'fetch-voice-fab--onboarding' : '',
        speakingVisual ? 'fetch-voice-fab--speaking' : '',
        listeningVisual ? 'fetch-voice-fab--listening' : '',
        pulseActive ? 'fetch-voice-fab--pulse' : '',
        typingActive ? 'fetch-voice-fab--typing' : '',
      ].join(' ')}
    >
      {dogEars ? (
        <span
          className="fetch-voice-fab__dog-ears pointer-events-none"
          aria-hidden
        >
          <span className="fetch-voice-fab__dog-ears-inner">
            <span className="fetch-voice-fab__dog-ear fetch-voice-fab__dog-ear--L" />
            <span className="fetch-voice-fab__dog-ear fetch-voice-fab__dog-ear--R" />
          </span>
        </span>
      ) : null}
      <span className="relative z-[2] flex h-full w-full items-center justify-center">
        <JarvisNeuralOrb
          expression={expression}
          state={resolvedState}
          speaking={minimalDockPresentation ? false : speaking}
          activity={minimalDockPresentation ? 0.08 : resolvedActivity}
          voiceLevel={minimalDockPresentation ? 0 : voiceLevel}
          awakened={awakened}
          confirmationNonce={confirmationNonce}
          mapAttention={mapAttention}
          lookAtCard={lookAtCard && !lookDown}
          lookDown={lookDown}
          glowColor={
            minimalDockPresentation ? { r: 120, g: 122, b: 130 } : glowColor
          }
          orbAppearance={orbAppearance}
          autonomous={autonomous}
          suspendAutonomous={suspendAutonomous}
          suppressHomeDockSparkles={homeSheetDock}
          size={
            compact
              ? 'sm'
              : homeSheetDock && homeSheetDockCompact
                ? 'homeDockCompact'
                : homeSheetDock
                  ? 'homeDock'
                  : 'dock'
          }
          ariaLive={false}
        />
      </span>
    </button>
  )
}
