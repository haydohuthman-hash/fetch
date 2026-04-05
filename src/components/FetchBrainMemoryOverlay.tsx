import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ChangeEvent,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import type { FetchBrainMindState } from '../lib/fetchBrainParticles'
import type { BrainAccountSnapshot } from '../lib/fetchBrainAccountSnapshot'
import type { BrainNode } from '../lib/fetchBrainGraph'
import type { BrainFieldPlaceCard } from '../lib/mapsExplorePlaces'
import { FetchBrainCortexDirectory } from './FetchBrainCortexDirectory'
import { FetchBrainFieldPanel } from './FetchBrainFieldPanel'
import { FetchBrainParticleCanvas } from './FetchBrainParticleCanvas'
import { FetchBrainSplineBackdrop } from './FetchBrainSplineBackdrop'
import { FetchBrainThinkingChrome } from './FetchBrainThinkingChrome'
import { useFetchVoice } from '../voice/FetchVoiceContext'
import { primeVoicePlaybackFromUserGesture } from '../voice/fetchVoice'
import { voiceFlowSttError } from '../voice/voiceFlowDebug'

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
  brainGraphNodes: BrainNode[]
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
  /** Task-style “thinking” headline, feedback bubble, and stepper (e.g. AI pending). */
  thinkingUi?: {
    show: boolean
    title?: string
    subtitle?: string
    feedback?: string
    stepIndex?: number
    autoAdvanceSteps?: boolean
  } | null
}

const BRAIN_LISTEN_MS = 8000

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
  brainGraphNodes,
  focusedMemoryId,
  onFocusedMemoryIdChange,
  fieldPlaces = null,
  onDismissFieldPlaces,
  onFieldPlaceOpenMaps,
  onFieldPlaceLiked,
  onFieldPlacePass,
  memoriesSheetOpen = false,
  onMemoriesSheetClose,
  thinkingUi = null,
}: FetchBrainMemoryOverlayProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const photoInputId = useId()
  const recognitionRef = useRef<{ abort: () => void } | null>(null)
  const listenTimerRef = useRef<number | null>(null)
  const { speakLine, playUiEvent, muted } = useFetchVoice()

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
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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

  const splitActive = Boolean(visualSrc)

  const onBrainPhotoInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f?.type.startsWith('image/')) onBrainPhotoSelected?.(f)
      e.target.value = ''
    },
    [onBrainPhotoSelected],
  )

  const onTapField = useCallback(() => {
    if (recognitionRef.current) {
      stopListening()
      return
    }
    startListening()
  }, [startListening, stopListening])

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

  const hudLine = useMemo(() => {
    if (flowPhase === 'clarity') return 'Field calibrating'
    switch (mind) {
      case 'speaking':
        return 'Speaking'
      case 'thinking':
        return 'Processing'
      case 'listening':
        return 'Listening · up to 8s'
      default:
        return fieldPanelOpen ? 'Tap above the list to speak' : 'Tap anywhere to speak'
    }
  }, [flowPhase, mind, fieldPanelOpen])

  const shellStyle = {
    '--brain-glow': `${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}`,
  } as CSSProperties

  const visualDescId = 'fetch-brain-visual-caption'
  const thinkingOn = Boolean(thinkingUi?.show)

  return (
    <div
      className={[
        'fetch-brain-immersion fetch-brain-shell fetch-brain-shell--particle fixed inset-0 z-[70] flex min-h-0 flex-col',
        isLight ? 'fetch-brain-shell--light' : 'fetch-brain-shell--dark',
        instantReveal ? 'fetch-brain-immersion--no-enter' : '',
        flowPhase === 'clarity' ? 'fetch-brain-immersion--phase-clarity' : '',
        `fetch-brain-immersion--mind-${mind}`,
        splitActive ? 'fetch-brain-immersion--split' : '',
      ].join(' ')}
      data-fetch-theme={theme}
      data-flow-phase={flowPhase}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fetch-brain-title"
      style={shellStyle}
    >
      <span id="fetch-brain-title" className="sr-only">
        {thinkingOn ? thinkingUi?.title ?? 'Fetch is thinking' : 'Neural field'}
      </span>

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

      <div className="fetch-brain-split-stage relative z-0 min-h-0 flex-1 overflow-hidden">
        <div className="fetch-brain-field-bg pointer-events-none absolute inset-0 z-0" aria-hidden />
        <FetchBrainSplineBackdrop active={flowPhase === 'brain'} />
        <div className="fetch-brain-field-vignette pointer-events-none absolute inset-0 z-0" aria-hidden />

        <div className="fetch-brain-shell__canvas pointer-events-none absolute inset-0 z-[1] min-h-0">
          <FetchBrainParticleCanvas
            theme={theme}
            mind={mind}
            glowRgb={glowRgb}
            graphNodes={brainGraphNodes}
            running
            skipEntryDissolve={instantReveal}
            cortexCalm={false}
            cortexSpread01={0}
            className="h-full w-full"
          />
        </div>

        <div className="fetch-brain-shell__grain pointer-events-none absolute inset-0 z-[2]" aria-hidden />

        {thinkingUi?.show ? (
          <FetchBrainThinkingChrome
            active
            theme={theme}
            glowRgb={glowRgb}
            title={thinkingUi.title}
            subtitle={thinkingUi.subtitle}
            feedback={thinkingUi.feedback}
            stepIndex={thinkingUi.stepIndex}
            autoAdvanceSteps={thinkingUi.autoAdvanceSteps}
          />
        ) : null}

        <button
          type="button"
          className={[
            'fetch-brain-immersion-tap absolute inset-x-0 top-0 z-[3] cursor-default border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--brain-glow),0.5)] focus-visible:ring-offset-0',
            fieldPanelOpen ? 'bottom-[min(58vh,420px)]' : 'bottom-0',
          ].join(' ')}
          aria-label={mind === 'listening' ? 'Stop listening' : 'Talk to Fetch'}
          onClick={onTapField}
        />

        {!thinkingOn ? (
          <div
            className={[
              'fetch-brain-immersion-hud pointer-events-none absolute inset-x-0 z-[4] flex flex-col items-center px-6 pt-8',
              fieldPanelOpen
                ? 'bottom-[min(58vh,420px)] max-h-[min(32vh,240px)] justify-end pb-3'
                : 'bottom-0 pb-[max(1.5rem,env(safe-area-inset-bottom))]',
            ].join(' ')}
          >
            <p
              className={[
                'fetch-brain-immersion-hud__state text-center text-[10px] font-semibold uppercase tracking-[0.22em] opacity-55 transition-[opacity,letter-spacing] duration-300',
                mind === 'speaking' ? 'fetch-brain-immersion-hud__state--speaking' : '',
                mind === 'listening' ? 'fetch-brain-immersion-hud__state--listening' : '',
                isLight ? 'text-neutral-800' : 'text-white',
              ].join(' ')}
            >
              {hudLine}
            </p>
            {mind === 'idle' && flowPhase === 'brain' ? (
              <span
                className={[
                  'mt-3 flex h-9 w-9 items-center justify-center rounded-full opacity-40',
                  isLight ? 'bg-black/[0.06] text-neutral-700' : 'bg-white/[0.08] text-white/85',
                ].join(' ')}
                aria-hidden
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
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
              </span>
            ) : null}
            {lastAssistantLine && !fieldPanelOpen ? (
              <p
                key={lastAssistantLine.slice(0, 48)}
                className={[
                  'fetch-brain-immersion-reply mt-4 max-h-[22vh] max-w-md overflow-y-auto text-center text-[13px] font-medium leading-relaxed [text-wrap:pretty]',
                  isLight ? 'text-neutral-800/88' : 'text-white/88',
                ].join(' ')}
              >
                {lastAssistantLine}
              </p>
            ) : null}
          </div>
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
      </div>

      <div className="pointer-events-none fixed left-[max(1rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-[6] flex flex-wrap items-center gap-2">
        {onBrainPhotoSelected ? (
          <>
            <label
              htmlFor={photoInputId}
              className={[
                'fetch-brain-photo-toolbar-btn pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[22px] font-light leading-none transition-[opacity,transform] active:scale-[0.94]',
                isLight
                  ? 'bg-black/[0.08] text-neutral-700/85 opacity-80 hover:opacity-100'
                  : 'bg-white/[0.1] text-white/85 opacity-80 hover:opacity-100',
              ].join(' ')}
              aria-label="Add photo"
            >
              <span aria-hidden>+</span>
            </label>
            {splitActive && onClearVisual ? (
              <button
                type="button"
                onClick={onClearVisual}
                className={[
                  'fetch-brain-photo-toolbar-btn pointer-events-auto flex h-11 min-w-[2.75rem] items-center justify-center rounded-full px-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-[opacity,transform] active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--brain-glow),0.55)]',
                  isLight
                    ? 'bg-black/[0.08] text-neutral-700/85 opacity-80 hover:opacity-100'
                    : 'bg-white/[0.1] text-white/85 opacity-80 hover:opacity-100',
                ].join(' ')}
                aria-label="Clear photo"
              >
                Clear
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        className={[
          'fetch-brain-immersion-dismiss pointer-events-auto fixed right-4 top-[max(0.75rem,env(safe-area-inset-top))] z-[6] flex h-11 w-11 items-center justify-center rounded-full text-[20px] font-light leading-none transition-[opacity,transform] active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--brain-glow),0.55)]',
          isLight
            ? 'bg-black/[0.06] text-neutral-700/75 opacity-60 hover:opacity-95'
            : 'bg-white/[0.08] text-white/75 opacity-55 hover:opacity-95',
        ].join(' ')}
        aria-label="Close and return home"
      >
        ×
      </button>

      {typeof document !== 'undefined' &&
      memoriesSheetOpen &&
      snapshot &&
      onMemoriesSheetClose
        ? createPortal(
            <div className="fixed inset-0 z-[80]">
              <button
                type="button"
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                aria-label="Close memories"
                onClick={onMemoriesSheetClose}
              />
              <div
                className={[
                  'absolute inset-x-0 bottom-0 top-[16%] flex flex-col overflow-hidden rounded-t-[24px] border shadow-[0_-20px_60px_rgba(0,0,0,0.35)]',
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
