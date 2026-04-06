import type { CSSProperties } from 'react'
import type { BookingJobType } from '../lib/assistant/types'
import type { BrainIntakeTone, BrainServiceIntakeFlow } from '../lib/brainServiceIntakeFlows'
import { HomeServiceTypeIllustration } from './icons/HomeServiceTypeIllustrations'

const TONE_RING: Record<BrainIntakeTone, string> = {
  green: 'ring-emerald-400/50',
  teal: 'ring-teal-400/50',
  blue: 'ring-sky-400/50',
  orange: 'ring-orange-400/50',
  purple: 'ring-violet-400/50',
  slate: 'ring-slate-400/45',
  rose: 'ring-rose-400/50',
}

const FLOW_ID_TO_JOB: Partial<Record<string, BookingJobType>> = {
  'junk-removal': 'junkRemoval',
  'home-moving': 'homeMoving',
  'delivery-pickup': 'deliveryPickup',
  'cleaning': 'cleaning',
  'helper': 'helper',
  'heavy-item': 'heavyItem',
}

export type FetchBrainServiceCarouselProps = {
  theme: 'light' | 'dark'
  glowRgb: { r: number; g: number; b: number }
  flows: readonly BrainServiceIntakeFlow[]
  onPickFlow: (flowId: string) => void
}

function CarouselCardArt({
  flow,
  isLight,
}: {
  flow: BrainServiceIntakeFlow
  isLight: boolean
}) {
  const job = FLOW_ID_TO_JOB[flow.id]
  if (job) {
    return (
      <HomeServiceTypeIllustration
        jobType={job}
        className="fetch-brain-service-carousel__illu mx-auto mb-1.5 h-10 w-10"
      />
    )
  }
  const letter = flow.carouselLabel.trim().charAt(0).toUpperCase() || '?'
  return (
    <div
      className={[
        'fetch-brain-service-carousel__letter-badge mx-auto mb-1.5 flex h-10 w-10 items-center justify-center rounded-xl text-[15px] font-bold tracking-tight',
        isLight ? 'bg-black/[0.06] text-neutral-800' : 'bg-white/[0.1] text-white/90',
      ].join(' ')}
      aria-hidden
    >
      {letter}
    </div>
  )
}

export function FetchBrainServiceCarousel({
  theme,
  glowRgb,
  flows,
  onPickFlow,
}: FetchBrainServiceCarouselProps) {
  const isLight = theme === 'light'
  return (
    <div
      className="fetch-brain-service-carousel pointer-events-auto w-full px-2 pt-1 pb-2"
      style={{ '--brain-glow': `${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}` } as CSSProperties}
    >
      <p
        className={[
          'mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em]',
          isLight ? 'text-neutral-500' : 'text-white/45',
        ].join(' ')}
      >
        Services
      </p>
      <div
        className="fetch-brain-service-carousel__track flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="list"
      >
        {flows.map((f) => (
          <button
            key={f.id}
            type="button"
            role="listitem"
            onClick={() => onPickFlow(f.id)}
            className={[
              'fetch-brain-service-carousel__card flex min-w-[6.5rem] max-w-[7.25rem] shrink-0 snap-start snap-always flex-col rounded-2xl border px-2.5 py-2 text-left ring-2 ring-transparent motion-safe:transition-transform motion-safe:active:scale-[0.97]',
              TONE_RING[f.tone],
              isLight
                ? 'border-black/[0.08] bg-white/[0.55] shadow-sm'
                : 'border-white/[0.1] bg-white/[0.07] shadow-[0_4px_20px_rgba(0,0,0,0.25)]',
            ].join(' ')}
          >
            <CarouselCardArt flow={f} isLight={isLight} />
            <span
              className={[
                'text-[12px] font-semibold leading-tight tracking-[-0.02em]',
                isLight ? 'text-neutral-900' : 'text-white/[0.94]',
              ].join(' ')}
            >
              {f.carouselLabel}
            </span>
            <span
              className={[
                'mt-0.5 line-clamp-2 text-[10px] font-medium leading-snug',
                isLight ? 'text-neutral-500' : 'text-white/48',
              ].join(' ')}
            >
              {f.carouselHint}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
