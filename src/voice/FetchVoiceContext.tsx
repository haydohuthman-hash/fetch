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
import { playVoice, speakLine, subscribeVoiceSpeechPlaying } from './fetchVoice'
import { playUiFeedback, type UiFeedbackEvent } from './fetchFeedback'
import type { SpeakLineOptions, VoiceEventOptions, VoiceEventType } from './fetchVoice'

const STORAGE_KEY = 'fetch_voice_muted'

type FetchVoiceContextValue = {
  muted: boolean
  /** True while ElevenLabs speech audio is playing (not chimes). */
  isSpeechPlaying: boolean
  setMuted: (next: boolean) => void
  toggleMute: () => void
  playEvent: (type: VoiceEventType, options?: VoiceEventOptions) => void
  speakLine: (text: string, options?: SpeakLineOptions) => Promise<void>
  playUiEvent: (event: UiFeedbackEvent) => void
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

  useEffect(() => {
    setMutedState(readInitialMuted())
  }, [])

  useEffect(() => {
    return subscribeVoiceSpeechPlaying(setIsSpeechPlaying)
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
      if (muted) {
        return
      }
      void playVoice(type, options)
    },
    [muted],
  )

  const speakAssistantLine = useCallback(
    (text: string, options?: SpeakLineOptions) => {
      if (muted) {
        return Promise.resolve()
      }
      return speakLine(text, options)
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

  const value = useMemo(
    () => ({
      muted,
      isSpeechPlaying,
      setMuted,
      toggleMute,
      playEvent,
      speakLine: speakAssistantLine,
      playUiEvent,
    }),
    [muted, isSpeechPlaying, setMuted, toggleMute, playEvent, speakAssistantLine, playUiEvent],
  )

  return (
    <FetchVoiceContext.Provider value={value}>
      {children}
    </FetchVoiceContext.Provider>
  )
}

export function useFetchVoice(): FetchVoiceContextValue {
  const ctx = useContext(FetchVoiceContext)
  if (!ctx) {
    throw new Error('useFetchVoice must be used within FetchVoiceProvider')
  }
  return ctx
}
