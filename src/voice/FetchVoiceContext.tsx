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
<<<<<<< HEAD
  speakLine: (text: string, options?: SpeakLineOptions) => Promise<void>
=======
  speakLine: (text: string, options?: SpeakLineOptions) => void
>>>>>>> 0a1a14a0c772938d5e08208a6af0758301c8fa69
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
<<<<<<< HEAD
      if (muted) {
        // eslint-disable-next-line no-console
        console.log('[Fetch voice flow] playEvent skipped (muted)', type)
        return
      }
=======
      if (muted) return
>>>>>>> 0a1a14a0c772938d5e08208a6af0758301c8fa69
      void playVoice(type, options)
    },
    [muted],
  )

  const speakAssistantLine = useCallback(
    (text: string, options?: SpeakLineOptions) => {
<<<<<<< HEAD
      if (muted) {
        // eslint-disable-next-line no-console
        console.log('[Fetch voice flow] speakLine skipped (muted)', text.slice(0, 120))
        return Promise.resolve()
      }
      return speakLine(text, options)
=======
      if (muted) return
      void speakLine(text, options)
>>>>>>> 0a1a14a0c772938d5e08208a6af0758301c8fa69
    },
    [muted],
  )

  const playUiEvent = useCallback(
    (event: UiFeedbackEvent) => {
<<<<<<< HEAD
      if (muted) {
        // eslint-disable-next-line no-console
        console.log('[Fetch voice flow] playUiEvent skipped (muted)', event)
        return
      }
=======
      if (muted) return
>>>>>>> 0a1a14a0c772938d5e08208a6af0758301c8fa69
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
