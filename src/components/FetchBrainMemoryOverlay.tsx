import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { FetchBrainMindState } from '../lib/fetchBrainParticles'
import type { BrainAccountSnapshot, BrainChatCatalogLine } from '../lib/fetchBrainAccountSnapshot'
import type { BrainFieldPlaceCard } from '../lib/mapsExplorePlaces'
import { FetchBrainCortexDirectory } from './FetchBrainCortexDirectory'
import { FetchBrainChoiceSheet, type FetchBrainChoiceSheetModel } from './FetchBrainChoiceSheet'
import { FetchBrainFieldPanel } from './FetchBrainFieldPanel'
import { FetchBrainOrbDock } from './FetchBrainOrbDock'
import { FetchSplashEyes, type FetchSplashEyesMode } from './FetchSplashEyes'
import { useFetchVoice } from '../voice/FetchVoiceContext'
import { primeVoicePlaybackFromUserGesture } from '../voice/fetchVoice'
import { voiceFlowSttError } from '../voice/voiceFlowDebug'
import { BRAIN_SERVICE_INTAKE_FLOWS, getBrainIntakeFlow } from '../lib/brainServiceIntakeFlows'
import { FetchBrainServiceCarousel } from './FetchBrainServiceCarousel'
import {
  clearBrainIntakeDraft,
  FetchBrainServiceIntakeSheet,
} from './FetchBrainServiceIntakeSheet'

export type FetchBrainMemoryOverlayProps = {
  flowPhase: 'clarity' | 'brain'
  onClose: () => void
  theme: 'light' | 'dark'
  mind: FetchBrainMindState
  glowRgb: { r: number; g: number; b: number }
  instantReveal?: boolean
  onBrainUtterance: (text: string) => void
  onBrainListeningChange: (active: boolean) => void
  lastAssistantLine?: string | null
  /** Object URL or remote URL — enables split layout (visual above particles). */
  visualSrc?: string | null
  /** Shown under the image when set; also used for `aria-describedby`. */
  visualCaption?: string | null
  onBrainPhotoSelected?: (file: File) => void
  onClearVisual?: () => void
  snapshot: BrainAccountSnapshot | null
  focusedMemoryId: string | null
  onFocusedMemoryIdChange?: (id: string | null) => void
  /** Nearby search / structured results sheet over the field. */
  fieldPlaces?: {
    title: string
    introLine?: string
    items: BrainFieldPlaceCard[]
  } | null
  onDismissFieldPlaces?: () => void
  onFieldPlaceOpenMaps?: (card: BrainFieldPlaceCard) => void
  onFieldPlaceLiked?: (card: BrainFieldPlaceCard) => void
  onFieldPlacePass?: (card: BrainFieldPlaceCard) => void
  /** Voice-opened account memory browser. */
  memoriesSheetOpen?: boolean
  onMemoriesSheetClose?: () => void
  /** Claude-style four-tap choices + free text (Neural Field). */
  choiceSheet?: FetchBrainChoiceSheetModel | null
  onChoiceSheetSubmit?: (text: string) => void
  onChoiceSheetDismiss?: () => void
  /** Jarvis orb day/night skin — match home vision theme. */
  orbAppearance?: 'night' | 'day'
  /** Waiting on brain AI reply — disables dock mic. */
  brainReplyPending?: boolean
  /** Thumbs on assistant lines — stored in local brain learning context. */
  onAssistantChatFeedback?: (args: { turnId: string; rating: 1 | -1; text: string }) => void
  /** Service carousel + branching sheet compiles a first message and sends it here. */
  onServiceIntakeComplete?: (compiledMessage: string) => void
  /** Clear thread + storage; overlay clears composer and intake sheet when invoked. */
  onNewBrainChat?: () => void
  /** Home mic/orb: start STT once the brain surface is active (voice-first booking). */
  autoVoiceEpoch?: number
  /** Booking voice: after assistant TTS, open mic again (no bump when a choice sheet is shown). */
  voiceRelistenEpoch?: number
  /** Increment (e.g. from map search tap) to move focus into the chat composer. */
  focusComposerNonce?: number
  /** Neural-field exact quote: opens Stripe / demo checkout from the booking sheet. */
  onBrainPricePay?: () => void
  /** Apply courtesy discount and refresh the quote bubble. */
  onBrainPriceCourtesy?: () => void
}

const BRAIN_LISTEN_MS = 8000
const PREVIEW_ASSISTANT_TURN_ID = 'preview-assistant'

type BrainEyesPhase = 'hidden' | 'thinking' | 'settle' | 'open'

export function FetchBrainMemoryOverlay({
  flowPhase,
  onClose,
  theme,
  mind,
  glowRgb,
  instantReveal = false,
  onBrainUtterance,
  onBrainListeningChange,
  lastAssistantLine,
  visualSrc = null,
  visualCaption = null,
  onBrainPhotoSelected,
  onClearVisual,
  snapshot,
  focusedMemoryId,
  onFocusedMemoryIdChange,
  fieldPlaces = null,
  onDismissFieldPlaces,
  onFieldPlaceOpenMaps,
  onFieldPlaceLiked,
  onFieldPlacePass,
  memoriesSheetOpen = false,
  onMemoriesSheetClose,
  orbAppearance = 'night',
  brainReplyPending = false,
  choiceSheet = null,
  onChoiceSheetSubmit,
  onChoiceSheetDismiss,
  onAssistantChatFeedback,
  onServiceIntakeComplete,
  onNewBrainChat,
  autoVoiceEpoch = 0,
  voiceRelistenEpoch = 0,
  focusComposerNonce = 0,
  onBrainPricePay,
  onBrainPriceCourtesy,
}: FetchBrainMemoryOverlayProps) {
  const [brainDraft, setBrainDraft] = useState('')
  const [intakeFlowId, setIntakeFlowId] = useState<string | null>(null)
  const dismissIntake = useCallback(() => {
    clearBrainIntakeDraft()
    setIntakeFlowId(null)
  }, [])

  const handleNewBrainChat = useCallback(() => {
    dismissIntake()
    setBrainDraft('')
    onNewBrainChat?.()
  }, [dismissIntake, onNewBrainChat])
  const [assistantReaction, setAssistantReaction] = useState<Record<string, 'up' | 'down'>>({})
  const closeRef = useRef<HTMLButtonElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const intakeReturnFocusRef = useRef<HTMLElement | null>(null)
  const prevIntakeOpenRef = useRef(false)
  const photoInputId = useId()
  const recognitionRef = useRef<{ abort: () => void } | null>(null)
  const listenTimerRef = useRef<number | null>(null)
  const { speakLine, playUiEvent, muted, toggleMute, isSpeechPlaying } = useFetchVoice()

  const renderAssistantBubbleBody = useCallback(
    (turn: Pick<BrainChatCatalogLine, 'text' | 'ui'>) => {
      const ui = turn.ui
      if (!ui) {
        return <p className="fetch-brain-msg__text">{turn.text}</p>
      }
      if (ui.kind === 'scanning') {
        return (
          <div className="fetch-brain-msg__scanning">
            <p className="fetch-brain-msg__text">{turn.text}</p>
            <div className="fetch-brain-scan-dots" aria-hidden>
              <span />
              <span />
              <span />
            </div>
          </div>
        )
      }
      if (ui.kind === 'address_confirm') {
        return (
          <div className="fetch-brain-msg__structured">
            <p className="fetch-brain-msg__text fetch-brain-msg__kicker">{turn.text}</p>
            {ui.pickup ? (
              <div className="fetch-brain-msg__addr">
                <span className="fetch-brain-msg__addr-label">Pickup</span>
                <span className="fetch-brain-msg__addr-line">{ui.pickup}</span>
              </div>
            ) : null}
            {ui.dropoff ? (
              <div className="fetch-brain-msg__addr">
                <span className="fetch-brain-msg__addr-label">Drop-off</span>
                <span className="fetch-brain-msg__addr-line">{ui.dropoff}</span>
              </div>
            ) : null}
          </div>
        )
      }
      if (ui.kind === 'price_preview') {
        const legacy = typeof ui.rangeLabel === 'string' && ui.rangeLabel.length > 0
        if (!legacy && ui.totalAud != null && ui.depositAud != null && ui.summaryLines && ui.payCtaLabel) {
          return (
            <div className="fetch-brain-msg__structured fetch-brain-msg__price-card">
              {ui.headline ? (
                <p className="fetch-brain-msg__text fetch-brain-msg__kicker">{ui.headline}</p>
              ) : (
                <p className="fetch-brain-msg__text">{turn.text}</p>
              )}
              <ul className="fetch-brain-msg__summary-list">
                {ui.summaryLines.map((line, i) => (
                  <li key={`${i}-${line.slice(0, 24)}`} className="fetch-brain-msg__summary-line">
                    {line}
                  </li>
                ))}
              </ul>
              <div className="fetch-brain-msg__price-amounts">
                <p className="fetch-brain-msg__price-total">
                  Total <span className="fetch-brain-msg__price-num">${ui.totalAud} AUD</span>
                </p>
                <p className="fetch-brain-msg__price-deposit">
                  Due now (deposit){' '}
                  <span className="fetch-brain-msg__price-num">${ui.depositAud} AUD</span>
                </p>
              </div>
              {ui.showAsapPreview ? (
                <div className="fetch-brain-msg__asap-preview">
                  {ui.mapPreviewUrl ? (
                    <img
                      src={ui.mapPreviewUrl}
                      alt=""
                      className="fetch-brain-msg__asap-map"
                    />
                  ) : (
                    <div className="fetch-brain-msg__asap-map fetch-brain-msg__asap-map--placeholder" />
                  )}
                  <div className="fetch-brain-msg__asap-meta">
                    <span className="fetch-brain-msg__asap-driver">
                      {ui.asapDriverLabel ?? 'Nearest crew'}
                    </span>
                    <span className="fetch-brain-msg__asap-eta">
                      Est. arrival ~{ui.asapEtaMinutes ?? 12} min
                    </span>
                  </div>
                </div>
              ) : null}
              <div className="fetch-brain-msg__price-actions">
                {onBrainPricePay ? (
                  <button
                    type="button"
                    className="fetch-brain-msg__price-pay-btn"
                    onClick={() => onBrainPricePay()}
                  >
                    {ui.payCtaLabel}
                  </button>
                ) : null}
                {ui.courtesyLabel && onBrainPriceCourtesy ? (
                  <button
                    type="button"
                    className="fetch-brain-msg__price-secondary-btn"
                    onClick={() => onBrainPriceCourtesy()}
                  >
                    {ui.courtesyLabel}
                  </button>
                ) : null}
              </div>
            </div>
          )
        }
        return (
          <div className="fetch-brain-msg__structured">
            <p className="fetch-brain-msg__text">{turn.text}</p>
            {ui.rangeLabel ? <p className="fetch-brain-msg__price-range">{ui.rangeLabel}</p> : null}
            {ui.note ? <p className="fetch-brain-msg__price-note">{ui.note}</p> : null}
          </div>
        )
      }
      return <p className="fetch-brain-msg__text">{turn.text}</p>
    },
    [onBrainPriceCourtesy, onBrainPricePay],
  )

  const copyAssistantLine = useCallback(
    async (text: string) => {
      const t = text.trim()
      if (!t) return
      try {
        await navigator.clipboard.writeText(t)
        playUiEvent('success')
      } catch {
        try {
          const ta = document.createElement('textarea')
          ta.value = t
          ta.setAttribute('readonly', '')
          ta.style.position = 'fixed'
          ta.style.left = '-9999px'
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          document.body.removeChild(ta)
          playUiEvent('success')
        } catch {
          /* */
        }
      }
    },
    [playUiEvent],
  )

  const onAssistantThumb = useCallback(
    (turnId: string, rating: 1 | -1, text: string) => {
      setAssistantReaction((prev) => ({ ...prev, [turnId]: rating === 1 ? 'up' : 'down' }))
      onAssistantChatFeedback?.({ turnId, rating, text })
    },
    [onAssistantChatFeedback],
  )

  const clearListenTimer = useCallback(() => {
    if (listenTimerRef.current != null) {
      window.clearTimeout(listenTimerRef.current)
      listenTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (intakeFlowId != null) {
        e.preventDefault()
        dismissIntake()
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, intakeFlowId, dismissIntake])

  useEffect(() => {
    const nowOpen = intakeFlowId != null
    if (prevIntakeOpenRef.current && !nowOpen) {
      const el = intakeReturnFocusRef.current
      intakeReturnFocusRef.current = null
      if (el && document.contains(el)) {
        el.focus()
      } else {
        textareaRef.current?.focus()
      }
    }
    prevIntakeOpenRef.current = nowOpen
  }, [intakeFlowId])

  useEffect(() => {
    return () => {
      clearListenTimer()
      try {
        recognitionRef.current?.abort()
      } catch {
        /* */
      }
      recognitionRef.current = null
      onBrainListeningChange(false)
    }
  }, [clearListenTimer, onBrainListeningChange])

  const stopListening = useCallback(() => {
    clearListenTimer()
    try {
      recognitionRef.current?.abort()
    } catch {
      /* */
    }
    recognitionRef.current = null
    onBrainListeningChange(false)
    playUiEvent('listening_end')
  }, [clearListenTimer, onBrainListeningChange, playUiEvent])

  const startListening = useCallback(() => {
    primeVoicePlaybackFromUserGesture()
    if (muted) {
      void speakLine('Unmute Fetch to use voice here.', {
        debounceKey: 'brain_stt_muted',
        debounceMs: 4000,
      })
      return
    }

    if (recognitionRef.current) {
      stopListening()
      return
    }

    const w = window as unknown as Record<string, unknown>
    const SpeechRec = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => {
          lang: string
          interimResults: boolean
          maxAlternatives: number
          onstart: (() => void) | null
          onresult: ((e: {
            resultIndex: number
            results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
          }) => void) | null
          onerror: ((e: Event) => void) | null
          onend: (() => void) | null
          start: () => void
          abort: () => void
        })
      | undefined

    if (!SpeechRec) {
      voiceFlowSttError('SpeechRecognition API missing (brain)')
      void speakLine("Voice input isn't available in this browser.", {
        debounceKey: 'brain_no_stt',
        debounceMs: 4000,
      })
      return
    }

    const rec = new SpeechRec()
    rec.lang = 'en-AU'
    rec.interimResults = false
    rec.maxAlternatives = 1
    recognitionRef.current = rec

    rec.onstart = () => {
      onBrainListeningChange(true)
      playUiEvent('listening_start')
      clearListenTimer()
      listenTimerRef.current = window.setTimeout(() => {
        listenTimerRef.current = null
        try {
          recognitionRef.current?.abort()
        } catch {
          /* */
        }
        recognitionRef.current = null
        onBrainListeningChange(false)
        playUiEvent('listening_end')
      }, BRAIN_LISTEN_MS)
    }

    rec.onresult = (event) => {
      let text = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const row = event.results[i]
        if (row?.isFinal) text += row[0]?.transcript ?? ''
      }
      if (!text.trim() && event.results.length > 0) {
        const last = event.results[event.results.length - 1]
        text = last?.[0]?.transcript ?? ''
      }
      const trimmed = text.trim()
      clearListenTimer()
      playUiEvent('listening_end')
      recognitionRef.current = null
      onBrainListeningChange(false)
      if (trimmed) {
        onBrainUtterance(trimmed)
      }
    }

    rec.onerror = () => {
      clearListenTimer()
      recognitionRef.current = null
      onBrainListeningChange(false)
      playUiEvent('listening_end')
    }

    rec.onend = () => {
      clearListenTimer()
      const wasActive = recognitionRef.current === rec
      if (wasActive) recognitionRef.current = null
      onBrainListeningChange(false)
      if (wasActive) {
        playUiEvent('listening_end')
      }
    }

    try {
      rec.start()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      voiceFlowSttError(`brain rec.start: ${msg}`)
      clearListenTimer()
      recognitionRef.current = null
      onBrainListeningChange(false)
      playUiEvent('listening_end')
    }
  }, [
    clearListenTimer,
    muted,
    onBrainListeningChange,
    onBrainUtterance,
    playUiEvent,
    speakLine,
    stopListening,
  ])

  const startListeningRef = useRef(startListening)
  useEffect(() => {
    startListeningRef.current = startListening
  }, [startListening])

  useEffect(() => {
    if (flowPhase !== 'brain' || autoVoiceEpoch <= 0) return
    const t = window.setTimeout(() => {
      startListeningRef.current()
    }, 420)
    return () => window.clearTimeout(t)
  }, [flowPhase, autoVoiceEpoch])

  useEffect(() => {
    if (flowPhase !== 'brain' || voiceRelistenEpoch <= 0) return
    if (
      choiceSheet != null ||
      fieldPlaces != null ||
      intakeFlowId != null ||
      brainReplyPending
    ) {
      return
    }
    const t = window.setTimeout(() => {
      startListeningRef.current()
    }, 380)
    return () => window.clearTimeout(t)
  }, [
    flowPhase,
    voiceRelistenEpoch,
    choiceSheet,
    fieldPlaces,
    intakeFlowId,
    brainReplyPending,
  ])

  const splitActive = Boolean(visualSrc)

  const onBrainPhotoInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f?.type.startsWith('image/')) onBrainPhotoSelected?.(f)
      e.target.value = ''
    },
    [onBrainPhotoSelected],
  )

  const isLight = theme === 'light'

  useEffect(() => {
    if (!memoriesSheetOpen || !focusedMemoryId) return
    const id = focusedMemoryId.replace(/"/g, '')
    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        document.querySelector(`[data-brain-memory-id="${id}"]`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        })
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [memoriesSheetOpen, focusedMemoryId, snapshot?.generatedAt])

  const fieldPanelOpen = fieldPlaces != null
  const choicePanelOpen = choiceSheet != null

  const voiceHot = mind === 'speaking' || (isSpeechPlaying && !muted)

  const sortedBrainChat = useMemo(() => {
    const lines = snapshot?.brainChatLines ?? []
    return [...lines].sort((a, b) => a.sortAt - b.sortAt)
  }, [snapshot])

  const lastAssistantTurnIndex = useMemo(() => {
    for (let i = sortedBrainChat.length - 1; i >= 0; i--) {
      if (sortedBrainChat[i]!.role === 'assistant') return i
    }
    return -1
  }, [sortedBrainChat])

  const shellStyle = {
    '--brain-glow': `${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}`,
    '--brain-thinking-glow': `${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}`,
  } as CSSProperties

  const visualDescId = 'fetch-brain-visual-caption'

  const intakeFlow = useMemo(
    () => (intakeFlowId ? getBrainIntakeFlow(intakeFlowId) : undefined),
    [intakeFlowId],
  )
  const intakePanelOpen = intakeFlow != null
  const bottomPanelOpen = fieldPanelOpen || choicePanelOpen || intakePanelOpen

  const hasLastAssistantUi = useMemo(
    () =>
      (sortedBrainChat.length > 0 && lastAssistantTurnIndex >= 0) ||
      (sortedBrainChat.length === 0 && Boolean(lastAssistantLine) && !bottomPanelOpen),
    [sortedBrainChat.length, lastAssistantTurnIndex, lastAssistantLine, bottomPanelOpen],
  )

  const brainEyesEligible = useMemo(() => {
    if (brainReplyPending && sortedBrainChat.length > 0) return true
    return hasLastAssistantUi
  }, [brainReplyPending, sortedBrainChat.length, hasLastAssistantUi])

  const [brainEyesPhase, setBrainEyesPhase] = useState<BrainEyesPhase>('hidden')
  const thinkingActive = brainReplyPending || mind === 'thinking'

  useEffect(() => {
    if (thinkingActive) {
      setBrainEyesPhase('thinking')
      return
    }
    setBrainEyesPhase((p) => (p === 'thinking' ? 'settle' : p))
  }, [thinkingActive])

  const onBrainEyesSettle = useCallback(() => {
    setBrainEyesPhase('open')
  }, [])

  const showBrainEyes = brainEyesEligible && brainEyesPhase !== 'hidden'

  const brainEyesSplashMode = useMemo((): FetchSplashEyesMode => {
    if (brainReplyPending) return 'blinking'
    if (brainEyesPhase === 'thinking') return 'thinking'
    if (brainEyesPhase === 'settle') return 'settle'
    return 'open'
  }, [brainReplyPending, brainEyesPhase])

  const lastChatTurn = sortedBrainChat[sortedBrainChat.length - 1]
  const showPendingReplyEyes =
    brainReplyPending && sortedBrainChat.length > 0 && lastChatTurn?.role === 'user' && showBrainEyes

  const renderAssistantTurnChrome = useCallback(
    (turnId: string, text: string, withEyes = false) => {
      const r = assistantReaction[turnId]
      return (
        <div
          className={[
            'fetch-brain-assistant-chrome-stack',
            withEyes && showBrainEyes ? 'fetch-brain-assistant-chrome-stack--eyes' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="fetch-brain-assistant-chrome">
            <div className="fetch-brain-assistant-chrome__votes-block">
              <div className="fetch-brain-assistant-chrome__votes">
                <button
                  type="button"
                  className={[
                    'fetch-brain-assistant-action fetch-brain-assistant-action--ghost',
                    r === 'up' ? 'fetch-brain-assistant-action--active-up' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label="Thumbs up"
                  onClick={() => onAssistantThumb(turnId, 1, text)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M7 22V11M2 13v8a2 2 0 0 0 2 2h3M15 9l-2-5a2 2 0 0 0-2-1H9v11h8.5a2 2 0 0 0 1.93-1.48l1.27-6A2 2 0 0 0 18.7 7H15"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  className={[
                    'fetch-brain-assistant-action fetch-brain-assistant-action--ghost',
                    r === 'down' ? 'fetch-brain-assistant-action--active-down' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label="Thumbs down"
                  onClick={() => onAssistantThumb(turnId, -1, text)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M17 2v11M22 11V3a2 2 0 0 0-2-2h-3M9 15l2 5a2 2 0 0 0 2 1h2V10H6.5a2 2 0 0 0-1.93 1.48l-1.27 6A2 2 0 0 0 5.3 17H9"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
              {withEyes && showBrainEyes ? (
                <FetchSplashEyes
                  mode={brainEyesSplashMode}
                  onSettleComplete={brainEyesPhase === 'settle' ? onBrainEyesSettle : undefined}
                  className={[
                    'fetch-brain-chrome-eyes-anchor',
                    !brainReplyPending && brainEyesPhase === 'open'
                      ? 'fetch-brain-chrome-eyes-anchor--complete'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
              ) : null}
            </div>
            <button
              type="button"
              className="fetch-brain-assistant-action fetch-brain-assistant-action--ghost"
              aria-label="Copy reply"
              onClick={() => void copyAssistantLine(text)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )
    },
    [
      assistantReaction,
      brainEyesPhase,
      brainEyesSplashMode,
      brainReplyPending,
      copyAssistantLine,
      onAssistantThumb,
      onBrainEyesSettle,
      showBrainEyes,
    ],
  )

  const showServiceCarousel =
    Boolean(onServiceIntakeComplete) &&
    sortedBrainChat.length === 0 &&
    intakeFlowId == null &&
    !brainReplyPending
  const shrinkField = mind === 'thinking' || brainReplyPending
  const dockMicDisabled = brainReplyPending
  const composerLocked = dockMicDisabled

  const submitBrainDraft = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault()
      if (composerLocked) return
      setBrainDraft((prev) => {
        const t = prev.trim()
        if (t) onBrainUtterance(t)
        return ''
      })
    },
    [composerLocked, onBrainUtterance],
  )

  const onComposerMic = useCallback(() => {
    primeVoicePlaybackFromUserGesture()
    if (mind === 'listening' || recognitionRef.current) {
      stopListening()
      return
    }
    startListening()
  }, [mind, startListening, stopListening])

  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [sortedBrainChat, lastAssistantLine, brainReplyPending, brainEyesPhase])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = '0px'
    ta.style.height = `${Math.min(112, Math.max(40, ta.scrollHeight))}px`
  }, [brainDraft])

  useEffect(() => {
    if (focusComposerNonce < 1) return
    if (flowPhase !== 'brain') return
    const t = window.setTimeout(() => {
      textareaRef.current?.focus()
    }, 50)
    return () => window.clearTimeout(t)
  }, [focusComposerNonce, flowPhase])

  return (
    <div
      className={[
        'fetch-brain-immersion fetch-brain-shell fetch-brain-shell--particle fixed inset-0 z-[70] flex max-h-dvh min-h-0 flex-col overscroll-none',
        isLight ? 'fetch-brain-shell--light' : 'fetch-brain-shell--dark',
        instantReveal ? 'fetch-brain-immersion--no-enter' : '',
        flowPhase === 'clarity' ? 'fetch-brain-immersion--phase-clarity' : '',
        `fetch-brain-immersion--mind-${mind}`,
        splitActive ? 'fetch-brain-immersion--split' : '',
      ].join(' ')}
      data-fetch-theme={theme}
      data-flow-phase={flowPhase}
      data-brain-shrink={shrinkField ? '1' : '0'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fetch-brain-chat-heading"
      style={shellStyle}
    >
      <span className="sr-only">Neural field — chat with Fetch</span>

      {onBrainPhotoSelected ? (
        <input
          id={photoInputId}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={onBrainPhotoInputChange}
        />
      ) : null}

      {splitActive ? (
        <div className="fetch-brain-split-visual flex min-h-0 flex-col">
          <div className="fetch-brain-split-visual__frame min-h-0 flex-1">
            <img
              src={visualSrc!}
              alt="Photo you attached in the neural field"
              {...(visualCaption ? { 'aria-describedby': visualDescId } : {})}
              className="fetch-brain-split-visual__img"
            />
          </div>
          {visualCaption ? (
            <p
              id={visualDescId}
              className={[
                'fetch-brain-split-visual__caption mt-2 line-clamp-2 text-center text-[11px] font-medium leading-snug',
                isLight ? 'text-neutral-600/90' : 'text-white/72',
              ].join(' ')}
            >
              {visualCaption}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="fetch-brain-split-stage relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="fetch-brain-field-bg pointer-events-none absolute inset-0 z-0" aria-hidden />
        <div className="fetch-brain-field-vignette pointer-events-none absolute inset-0 z-0" aria-hidden />

        <div className="fetch-brain-shell__grain pointer-events-none absolute inset-0 z-[2]" aria-hidden />

        {voiceHot ? (
          <div
            className="fetch-brain-field-blue-glow-stack pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[min(48vh,360px)] overflow-hidden"
            aria-hidden
          >
            <div className="fetch-brain-field-blue-glow fetch-brain-field-blue-glow--deep" />
            <div className="fetch-brain-field-blue-glow fetch-brain-field-blue-glow--mid" />
            <div className="fetch-brain-field-blue-glow fetch-brain-field-blue-glow--accent" />
          </div>
        ) : null}

        <div
          className={[
            'fetch-brain-chat-shell relative z-[8] flex min-h-0 flex-1 flex-col',
            bottomPanelOpen ? 'fetch-brain-chat-shell--panel-open' : '',
            intakePanelOpen ? 'fetch-brain-chat-shell--panel-open--intake' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <header className="fetch-brain-chat-header">
            <div className="fetch-brain-chat-header__side-left">
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                className="fetch-brain-chat-header__icon-btn"
                aria-label="Back to service selection"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M15 18l-6-6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            <div className="fetch-brain-chat-header__center">
              <h2 id="fetch-brain-chat-heading" className="sr-only">
                Neural field
              </h2>
              <FetchBrainOrbDock mind={mind} glowRgb={glowRgb} orbAppearance={orbAppearance} />
            </div>
            <div className="fetch-brain-chat-header__side-right">
              <div className="fetch-brain-chat-header__actions">
                {splitActive && onClearVisual ? (
                  <button
                    type="button"
                    onClick={onClearVisual}
                    className="fetch-brain-chat-header__clear"
                    aria-label="Clear photo"
                  >
                    Clear
                  </button>
                ) : null}
                {onNewBrainChat ? (
                  <button
                    type="button"
                    onClick={handleNewBrainChat}
                    className="fetch-brain-chat-header__bubble-icon"
                    aria-label="Start new chat"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 8v5M9.5 10.5h5"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={toggleMute}
                  className={[
                    'fetch-brain-chat-header__icon-btn fetch-brain-chat-header__mute-btn',
                    muted ? 'fetch-brain-chat-header__mute-btn--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={muted ? 'Unmute Fetch voice' : 'Mute Fetch voice'}
                  aria-pressed={muted}
                >
                  {muted ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M11 5 6 9H2v6h4l5 4V5Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                      <path
                        d="m22 9-6 6M16 9l6 6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M11 5 6 9H2v6h4l5 4V5Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M15.54 8.46a5 5 0 0 1 0 7.08M18 12a8 8 0 0 1-.35 2.32"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </header>

          <div className="relative flex min-h-0 flex-1 flex-col">
            {mind === 'listening' || (mind === 'thinking' && !brainReplyPending) ? (
              <div
                className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center px-10"
                aria-live="polite"
              >
                <p
                  className={[
                    'fetch-brain-stage-label text-center text-2xl font-semibold tracking-tight motion-safe:transition-[opacity,transform] motion-safe:duration-500',
                    isLight ? 'text-neutral-800/92' : 'text-white/92',
                    mind === 'listening' ? 'motion-safe:animate-pulse' : '',
                  ].join(' ')}
                >
                  {mind === 'listening' ? 'Listening' : 'Thinking'}
                </p>
              </div>
            ) : null}

            <div
              ref={chatScrollRef}
              className={[
                'fetch-brain-chat-messages',
                brainReplyPending ? 'fetch-brain-chat-messages--thinking-dim' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="log"
              aria-live="polite"
              aria-relevant="additions"
            >
              <div className="fetch-brain-chat-messages__inner">
                {sortedBrainChat.length === 0 ? (
                  <div className="fetch-brain-chat-empty">
                    <p className="fetch-brain-chat-empty__title">Ask anything…</p>
                    <p className="fetch-brain-chat-empty__hint">
                      {showServiceCarousel
                        ? 'Pick a service above, or type below / use the mic.'
                        : 'Type a message or tap the mic to speak.'}
                    </p>
                    {lastAssistantLine && !bottomPanelOpen ? (
                      <div className="fetch-brain-msg-row fetch-brain-msg-row--assistant">
                        <div className="fetch-brain-assistant-bubble-slot">
                          <div
                            className={[
                              'fetch-brain-msg fetch-brain-msg--assistant',
                              isSpeechPlaying ? 'fetch-brain-msg--speaking' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            {renderAssistantBubbleBody({ text: lastAssistantLine, ui: undefined })}
                          </div>
                        </div>
                        {renderAssistantTurnChrome(
                          PREVIEW_ASSISTANT_TURN_ID,
                          lastAssistantLine,
                          showBrainEyes && !brainReplyPending,
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  sortedBrainChat.map((turn, index) => (
                    <div
                      key={turn.id}
                      className={[
                        'fetch-brain-msg-row',
                        turn.role === 'user' ? 'fetch-brain-msg-row--user' : 'fetch-brain-msg-row--assistant',
                      ].join(' ')}
                    >
                      {turn.role === 'assistant' ? (
                        <div className="fetch-brain-assistant-bubble-slot">
                          <div
                            className={[
                              'fetch-brain-msg fetch-brain-msg--assistant',
                              turn.ui?.kind === 'scanning' ? 'fetch-brain-msg--scanning' : '',
                              isSpeechPlaying && index === lastAssistantTurnIndex
                                ? 'fetch-brain-msg--speaking'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            {renderAssistantBubbleBody(turn)}
                          </div>
                        </div>
                      ) : (
                        <div
                          className={[
                            'fetch-brain-msg fetch-brain-msg--user',
                          ].join(' ')}
                        >
                          <p className="fetch-brain-msg__text">{turn.text}</p>
                          {turn.attachmentUrl ? (
                            <img
                              src={turn.attachmentUrl}
                              alt=""
                              className="fetch-brain-msg__attach"
                            />
                          ) : null}
                        </div>
                      )}
                      {turn.role === 'assistant'
                        ? renderAssistantTurnChrome(
                            turn.id,
                            turn.text,
                            showBrainEyes &&
                              index === lastAssistantTurnIndex &&
                              !brainReplyPending,
                          )
                        : null}
                    </div>
                  ))
                )}
                {showPendingReplyEyes ? (
                  <div className="fetch-brain-msg-row fetch-brain-msg-row--assistant fetch-brain-pending-eyes-row">
                    <div className="fetch-brain-pending-eyes-slot">
                      <FetchSplashEyes mode="blinking" className="fetch-brain-chrome-eyes-anchor" />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="fetch-brain-composer-anchor pb-[max(0.35rem,env(safe-area-inset-bottom))]">
            {showServiceCarousel ? (
              <>
                <FetchBrainServiceCarousel
                  theme={theme}
                  glowRgb={glowRgb}
                  flows={BRAIN_SERVICE_INTAKE_FLOWS}
                  onPickFlow={(id) => {
                    const ae = document.activeElement
                    if (ae instanceof HTMLElement) intakeReturnFocusRef.current = ae
                    setIntakeFlowId(id)
                  }}
                />
              </>
            ) : null}
            <div className="fetch-brain-composer">
              <form
                onSubmit={submitBrainDraft}
                className="fetch-brain-composer-pill"
                aria-label="Message Fetch"
              >
                <button
                  type="button"
                  className={[
                    'fetch-brain-composer-mic',
                    mind === 'listening' ? 'fetch-brain-composer-mic--listening' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={mind === 'listening' ? 'Stop listening' : 'Speak to Fetch'}
                  disabled={dockMicDisabled}
                  onClick={onComposerMic}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M12 14a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3Z"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M17 11v1a5 5 0 0 1-10 0v-1M12 18v3M8 22h8"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <div className="fetch-brain-composer-field">
                  {onBrainPhotoSelected ? (
                    <label
                      htmlFor={photoInputId}
                      className="fetch-brain-composer-attach cursor-pointer"
                      aria-label="Add photo"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M12 5v14M5 12h14"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </label>
                  ) : null}
                  <textarea
                    ref={textareaRef}
                    data-brain-draft-input
                    name="brain-draft"
                    rows={1}
                    value={brainDraft}
                    onChange={(e) => setBrainDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (composerLocked) return
                      if (e.key === 'Enter' && !e.shiftKey) {
                        if (e.repeat) return
                        if (e.nativeEvent.isComposing) return
                        e.preventDefault()
                        submitBrainDraft()
                      }
                    }}
                    placeholder="Message Fetch…"
                    className="fetch-brain-composer-input"
                    disabled={composerLocked}
                  />
                </div>
                <button
                  type="submit"
                  className="fetch-brain-composer-send fetch-brain-composer-send--neutral"
                  aria-label="Send message"
                  disabled={!brainDraft.trim() || composerLocked}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </form>
            </div>
          </div>

        {bottomPanelOpen ? (
          <div className="fetch-brain-sheet-backdrop absolute inset-0" aria-hidden />
        ) : null}

        {fieldPlaces ? (
          <FetchBrainFieldPanel
            theme={theme}
            glowRgb={glowRgb}
            title={fieldPlaces.title}
            introLine={fieldPlaces.introLine}
            items={fieldPlaces.items}
            assistantLine={fieldPanelOpen ? lastAssistantLine : null}
            onClose={() => onDismissFieldPlaces?.()}
            onOpenMaps={onFieldPlaceOpenMaps}
            onPlaceLiked={onFieldPlaceLiked}
            onPlaceDisliked={onFieldPlacePass}
          />
        ) : null}

        {choiceSheet && onChoiceSheetSubmit && onChoiceSheetDismiss ? (
          <FetchBrainChoiceSheet
            theme={theme}
            glowRgb={glowRgb}
            sheet={choiceSheet}
            onSubmit={onChoiceSheetSubmit}
            onDismiss={onChoiceSheetDismiss}
          />
        ) : null}

        {intakeFlow && onServiceIntakeComplete ? (
          <FetchBrainServiceIntakeSheet
            theme={theme}
            glowRgb={glowRgb}
            flow={intakeFlow}
            onClose={dismissIntake}
            onComplete={(msg) => {
              onServiceIntakeComplete(msg)
              setIntakeFlowId(null)
            }}
            onOptionPicked={() => playUiEvent('orb_tap')}
          />
        ) : null}
      </div>

      {typeof document !== 'undefined' &&
      memoriesSheetOpen &&
      snapshot &&
      onMemoriesSheetClose
        ? createPortal(
            <div className="fixed inset-0 z-[80]">
              <button
                type="button"
                className="absolute inset-0 bg-black/55"
                aria-label="Close memories"
                onClick={onMemoriesSheetClose}
              />
              <div
                className={[
                  'absolute inset-x-0 bottom-0 top-[16%] flex flex-col overflow-hidden rounded-t-[24px] border shadow-[0_-8px_28px_rgba(0,0,0,0.22)]',
                  isLight
                    ? 'border-black/10 bg-white/96 text-neutral-900'
                    : 'border-white/10 bg-[rgba(10,12,18,0.98)] text-white',
                ].join(' ')}
                role="dialog"
                aria-modal="true"
                aria-labelledby="fetch-brain-memories-title"
              >
                <div
                  className={[
                    'flex shrink-0 items-center justify-between border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]',
                    isLight ? 'border-black/10' : 'border-white/10',
                  ].join(' ')}
                >
                  <p id="fetch-brain-memories-title" className="text-[15px] font-semibold tracking-[-0.02em]">
                    Memories
                  </p>
                  <button
                    type="button"
                    onClick={onMemoriesSheetClose}
                    className={[
                      'rounded-full px-3 py-1.5 text-[13px] font-semibold',
                      isLight ? 'bg-black/[0.06] text-neutral-700' : 'bg-white/10 text-white/85',
                    ].join(' ')}
                  >
                    Close
                  </button>
                </div>
                <div className="relative min-h-0 flex-1">
                  <FetchBrainCortexDirectory
                    snapshot={snapshot}
                    theme={theme}
                    glowRgb={glowRgb}
                    focusedMemoryId={focusedMemoryId}
                    onFocusedMemoryIdChange={onFocusedMemoryIdChange}
                    onCortexSpreadChange={() => {}}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
