import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  BRAIN_INTAKE_DONE,
  compileIntakeMessage,
  type BrainServiceIntakeFlow,
} from '../lib/brainServiceIntakeFlows'

type PathSeg = { stepId: string; answer: string }

export const BRAIN_INTAKE_DRAFT_STORAGE_KEY = 'fetch.brainIntakeDraft.v1'

const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

type DraftPayload = {
  flowId: string
  stack: string[]
  path: PathSeg[]
  updatedAt: number
}

export function clearBrainIntakeDraft(): void {
  try {
    sessionStorage.removeItem(BRAIN_INTAKE_DRAFT_STORAGE_KEY)
  } catch {
    /* */
  }
}

function readDraft(): DraftPayload | null {
  try {
    const raw = sessionStorage.getItem(BRAIN_INTAKE_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as DraftPayload
    if (
      typeof d.flowId !== 'string' ||
      !Array.isArray(d.stack) ||
      !Array.isArray(d.path) ||
      typeof d.updatedAt !== 'number'
    ) {
      return null
    }
    if (Date.now() - d.updatedAt > DRAFT_MAX_AGE_MS) return null
    return d
  } catch {
    return null
  }
}

function writeDraft(flowId: string, stack: string[], path: PathSeg[]): void {
  try {
    const payload: DraftPayload = {
      flowId,
      stack,
      path,
      updatedAt: Date.now(),
    }
    sessionStorage.setItem(BRAIN_INTAKE_DRAFT_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* */
  }
}

function isValidRestored(
  flow: BrainServiceIntakeFlow,
  stack: string[],
  path: PathSeg[],
): boolean {
  if (stack.length < 1) return false
  if (stack[0] !== flow.startStepId) return false
  if (path.length !== stack.length - 1) return false
  for (const id of stack) {
    if (!flow.steps[id]) return false
  }
  for (let i = 0; i < path.length; i++) {
    const seg = path[i]
    if (!seg || seg.stepId !== stack[i]) return false
    const stepDef = flow.steps[seg.stepId]
    if (!stepDef?.options.some((o) => o.label === seg.answer)) return false
  }
  return true
}

function tryRestoreDraft(flow: BrainServiceIntakeFlow): { stack: string[]; path: PathSeg[] } | null {
  const d = readDraft()
  if (!d || d.flowId !== flow.id) return null
  if (!isValidRestored(flow, d.stack, d.path)) return null
  return { stack: d.stack, path: d.path }
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      mq.addEventListener('change', onStoreChange)
      return () => mq.removeEventListener('change', onStoreChange)
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function listFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

export type FetchBrainServiceIntakeSheetProps = {
  theme: 'light' | 'dark'
  glowRgb: { r: number; g: number; b: number }
  flow: BrainServiceIntakeFlow
  onClose: () => void
  onComplete: (compiledUserMessage: string) => void
  /** Optional short feedback when an option is chosen (e.g. haptic / UI chime). */
  onOptionPicked?: () => void
}

const SLIDE_MS = 300

export function FetchBrainServiceIntakeSheet({
  theme,
  glowRgb,
  flow,
  onClose,
  onComplete,
  onOptionPicked,
}: FetchBrainServiceIntakeSheetProps) {
  const isLight = theme === 'light'
  const sheetRef = useRef<HTMLDivElement>(null)
  const optionsRef = useRef<HTMLUListElement>(null)
  const prefersReducedMotion = usePrefersReducedMotion()

  const [stack, setStack] = useState<string[]>(() => [flow.startStepId])
  const [path, setPath] = useState<PathSeg[]>([])
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle')
  const [showResumeBanner, setShowResumeBanner] = useState(false)

  const currentStepId = stack[stack.length - 1] ?? flow.startStepId
  const step = flow.steps[currentStepId]

  useEffect(() => {
    const restored = tryRestoreDraft(flow)
    if (restored) {
      setStack(restored.stack)
      setPath(restored.path)
      setShowResumeBanner(restored.stack.length > 1 || restored.path.length > 0)
    } else {
      setStack([flow.startStepId])
      setPath([])
      setShowResumeBanner(false)
    }
    setPhase('idle')
  }, [flow.id, flow.startStepId])

  const runTransition = useCallback(
    (body: () => void) => {
      if (prefersReducedMotion) {
        body()
        setPhase('idle')
        return
      }
      setPhase('out')
      window.setTimeout(() => {
        body()
        setPhase('in')
        window.requestAnimationFrame(() => {
          window.setTimeout(() => setPhase('idle'), 320)
        })
      }, SLIDE_MS)
    },
    [prefersReducedMotion],
  )

  const busy = phase !== 'idle'

  useEffect(() => {
    if (phase !== 'idle' || !step) return
    writeDraft(flow.id, stack, path)
  }, [flow.id, stack, path, phase, step])

  useLayoutEffect(() => {
    if (phase !== 'idle') return
    const opt = optionsRef.current?.querySelector<HTMLButtonElement>('button')
    opt?.focus()
  }, [flow.id, currentStepId, phase])

  const onSheetKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Tab' || !sheetRef.current) return
      const focusables = listFocusables(sheetRef.current)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [],
  )

  const onOptionsKeyDown = useCallback((e: ReactKeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const ul = optionsRef.current
    if (!ul) return
    const buttons = Array.from(ul.querySelectorAll<HTMLButtonElement>('button'))
    if (buttons.length === 0) return
    e.preventDefault()
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === 'ArrowDown'
        ? i < 0
          ? 0
          : Math.min(buttons.length - 1, i + 1)
        : i <= 0
          ? 0
          : i - 1
    buttons[next]?.focus()
  }, [])

  const startOver = useCallback(() => {
    clearBrainIntakeDraft()
    setStack([flow.startStepId])
    setPath([])
    setShowResumeBanner(false)
    setPhase('idle')
  }, [flow.startStepId])

  const pickOption = useCallback(
    (answer: string, next: string) => {
      if (busy || !step) return
      onOptionPicked?.()
      const seg: PathSeg = { stepId: currentStepId, answer }
      const nextPath = [...path, seg]

      if (next === BRAIN_INTAKE_DONE) {
        clearBrainIntakeDraft()
        const msg = compileIntakeMessage(
          flow,
          nextPath.map((s) => ({
            question: flow.steps[s.stepId]?.question ?? '',
            answer: s.answer,
          })),
        )
        onComplete(msg)
        onClose()
        return
      }

      runTransition(() => {
        setPath(nextPath)
        setStack((s) => [...s, next])
      })
    },
    [busy, currentStepId, flow, onClose, onComplete, onOptionPicked, path, runTransition, step],
  )

  const goBack = useCallback(() => {
    if (busy || stack.length <= 1) return
    runTransition(() => {
      setStack((s) => s.slice(0, -1))
      setPath((p) => p.slice(0, -1))
    })
  }, [busy, runTransition, stack.length])

  const glassTint = isLight
    ? 'border-white/[0.35] bg-white/[0.92]'
    : 'border-white/[0.14] bg-[rgba(28,30,40,0.82)]'

  if (!step) return null

  return (
    <div
      ref={sheetRef}
      className={[
        'fetch-brain-service-intake-sheet fetch-brain-glass-sheet pointer-events-auto absolute inset-x-0 bottom-0 z-[22] flex max-h-[min(72vh,560px)] flex-col rounded-t-[22px]',
        glassTint,
      ].join(' ')}
      style={{ '--brain-glow': `${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}` } as CSSProperties}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fetch-brain-intake-title"
      onKeyDown={onSheetKeyDown}
    >
      <div
        className={[
          'flex shrink-0 items-center gap-2 border-b px-3 py-2.5',
          isLight ? 'border-black/[0.06]' : 'border-white/[0.08]',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={stack.length > 1 ? goBack : onClose}
          className={[
            'rounded-full px-2.5 py-1.5 text-[12px] font-semibold',
            isLight ? 'text-neutral-700 hover:bg-black/[0.06]' : 'text-white/85 hover:bg-white/[0.08]',
          ].join(' ')}
        >
          {stack.length > 1 ? 'Back' : 'Close'}
        </button>
        <h2
          id="fetch-brain-intake-title"
          className={[
            'min-w-0 flex-1 truncate text-center text-[13px] font-semibold tracking-[-0.02em]',
            isLight ? 'text-neutral-900' : 'text-white/[0.94]',
          ].join(' ')}
        >
          {flow.carouselLabel}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className={[
            'rounded-full px-2.5 py-1.5 text-[12px] font-semibold',
            isLight ? 'text-neutral-700 hover:bg-black/[0.06]' : 'text-white/85 hover:bg-white/[0.08]',
          ].join(' ')}
        >
          Cancel
        </button>
      </div>

      {showResumeBanner ? (
        <div
          className={[
            'flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2',
            isLight ? 'border-black/[0.06] bg-black/[0.03]' : 'border-white/[0.08] bg-white/[0.05]',
          ].join(' ')}
        >
          <p
            className={[
              'min-w-0 text-[11px] font-medium leading-snug',
              isLight ? 'text-neutral-600' : 'text-white/65',
            ].join(' ')}
          >
            Resumed where you left off.
          </p>
          <button
            type="button"
            onClick={startOver}
            className={[
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
              isLight ? 'text-neutral-800 hover:bg-black/[0.08]' : 'text-white/90 hover:bg-white/[0.1]',
            ].join(' ')}
          >
            Start over
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden px-3 py-3">
        <div
          key={`${flow.id}-${currentStepId}`}
          className={[
            'fetch-brain-intake-step flex h-full min-h-[12rem] flex-col',
            phase === 'out' ? 'fetch-brain-intake-step--out' : '',
            phase === 'in' ? 'fetch-brain-intake-step--in' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <p
            id="fetch-brain-intake-question"
            className={[
              'mb-3 text-[15px] font-semibold leading-snug tracking-[-0.02em] [text-wrap:pretty]',
              isLight ? 'text-neutral-900' : 'text-white/[0.94]',
            ].join(' ')}
            aria-live="polite"
            aria-atomic="true"
          >
            {step.question}
          </p>
          <ul
            ref={optionsRef}
            className="fetch-brain-intake-options fetch-brain-intake-options--snap-sm flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            onKeyDown={onOptionsKeyDown}
          >
            {step.options.map((opt) => (
              <li key={opt.id}>
                <button
                  type="button"
                  onClick={() => pickOption(opt.label, opt.next)}
                  className={[
                    'w-full rounded-xl border px-3.5 py-3 text-left text-[13px] font-semibold leading-snug transition-colors',
                    isLight
                      ? 'border-black/[0.08] bg-black/[0.03] text-neutral-900 hover:bg-black/[0.07]'
                      : 'border-white/[0.1] bg-white/[0.06] text-white/90 hover:bg-white/[0.11]',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
