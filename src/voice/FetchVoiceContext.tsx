/**
 * Voice output shares the same booking pipeline as typed text: UI calls `playEvent`
 * with short summaries (e.g. after scan / lock). No separate “voice-only” logic.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  playVoice,
  primeVoicePlaybackFromUserGesture,
  speakFetch,
  speakLine,
  stopFetchAssistantPlayback,
  subscribeVoiceSpeechPlaying,
} from './fetchVoice'
import { playUiFeedback, type UiFeedbackEvent } from './fetchFeedback'
import type { SpeakLineOptions, VoiceEventOptions, VoiceEventType } from './fetchVoice'
import { pickVoiceInstantAck } from './voiceAckPhrases'
import { isFetchVoiceChatOutputActive } from './fetchVoiceOutputPolicy'

const STORAGE_KEY = 'fetch_voice_muted'

/** Opt-in UI bridge only — forwarded `speakLine` calls never receive `withVoiceHold`. */
export type FetchSpeakLineOptions = SpeakLineOptions & { withVoiceHold?: boolean }

type FetchVoiceContextValue = {
  muted: boolean
  /** True while cloud TTS speech audio is playing (not chimes). */
  isSpeechPlaying: boolean
  /** Instant ack line + pulse while a `withVoiceHold` clip is fetching / starting. */
  voiceHoldCaption: string | null
  voiceHoldPulseNonce: number
  setMuted: (next: boolean) => void
  toggleMute: () => void
  playEvent: (type: VoiceEventType, options?: VoiceEventOptions) => void
  speakLine: (text: string, options?: FetchSpeakLineOptions) => Promise<void>
  /** Same premium voice as `speakLine`, but uses `POST /api/voice` and always interrupts current speech. */
  speakFetch: (text: string) => Promise<void>
  playUiEvent: (event: UiFeedbackEvent) => void
  /** Stop assistant TTS and clear voice-hold UI (e.g. exit brain). */
  stopAssistantPlayback: () => void
}

const FetchVoiceContext = createContext<FetchVoiceContextValue | null>(null)

function readInitialMuted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function FetchVoiceProvider({ children }: { children: React.ReactNode }) {
  const [muted, setMutedState] = useState(false)
  const [isSpeechPlaying, setIsSpeechPlaying] = useState(false)
  const [voiceHoldCaption, setVoiceHoldCaption] = useState<string | null>(null)
  const [voiceHoldPulseNonce, setVoiceHoldPulseNonce] = useState(0)

  useEffect(() => {
    queueMicrotask(() => setMutedState(readInitialMuted()))
  }, [])

  useEffect(() => {
    return subscribeVoiceSpeechPlaying(setIsSpeechPlaying)
  }, [])

  /** Unlock AudioContext on first interaction so the first TTS clip isn’t blocked resuming the graph. */
  useEffect(() => {
    const warm = () => {
      primeVoicePlaybackFromUserGesture()
    }
    document.addEventListener('pointerdown', warm, {
      capture: true,
      passive: true,
      once: true,
    })
    return () => {
      document.removeEventListener('pointerdown', warm, { capture: true })
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [muted])

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next)
  }, [])

  const toggleMute = useCallback(() => {
    setMutedState((m) => !m)
  }, [])

  const playEvent = useCallback(
    (type: VoiceEventType, options?: VoiceEventOptions) => {
      if (!isFetchVoiceChatOutputActive()) return
      if (muted) {
        return
      }
      void playVoice(type, options)
    },
    [muted],
  )

  const speakFetchAssistant = useCallback(
    async (text: string) => {
      if (!isFetchVoiceChatOutputActive()) return
      if (muted) return
      await speakFetch(text)
    },
    [muted],
  )

  const speakAssistantLine = useCallback(
    async (text: string, options?: FetchSpeakLineOptions) => {
      const { withVoiceHold, ...rest } = options ?? {}
      if (!isFetchVoiceChatOutputActive()) {
        if (withVoiceHold) setVoiceHoldCaption(null)
        return
      }
      if (withVoiceHold && !muted) {
        setVoiceHoldCaption(pickVoiceInstantAck())
        setVoiceHoldPulseNonce((n) => n + 1)
      }
      if (muted) {
        if (withVoiceHold) setVoiceHoldCaption(null)
        return
      }
      try {
        await speakLine(text, rest)
      } finally {
        if (withVoiceHold) setVoiceHoldCaption(null)
      }
    },
    [muted],
  )

  const playUiEvent = useCallback(
    (event: UiFeedbackEvent) => {
      if (muted) {
        return
      }
      playUiFeedback(event)
    },
    [muted],
  )

  const stopAssistantPlayback = useCallback(() => {
    stopFetchAssistantPlayback()
    setVoiceHoldCaption(null)
  }, [])

  const value = useMemo(
    () => ({
      muted,
      isSpeechPlaying,
      voiceHoldCaption,
      voiceHoldPulseNonce,
      setMuted,
      toggleMute,
      playEvent,
      speakLine: speakAssistantLine,
      speakFetch: speakFetchAssistant,
      playUiEvent,
      stopAssistantPlayback,
    }),
    [
      muted,
      isSpeechPlaying,
      voiceHoldCaption,
      voiceHoldPulseNonce,
      setMuted,
      toggleMute,
      playEvent,
      speakAssistantLine,
      speakFetchAssistant,
      playUiEvent,
      stopAssistantPlayback,
    ],
  )

  return (
    <FetchVoiceContext.Provider value={value}>
      {children}
    </FetchVoiceContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with provider
export function useFetchVoice(): FetchVoiceContextValue {
  const ctx = useContext(FetchVoiceContext)
  if (!ctx) {
    throw new Error('useFetchVoice must be used within FetchVoiceProvider')
  }
  return ctx
}
