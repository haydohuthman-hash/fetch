import { useCallback, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BookingJobType } from '../lib/assistant'
import {
  HOME_SERVICE_HERO_PATHS,
  HOME_SERVICE_INFO_BY_LANDING_ID,
  LANDING_ID_TO_JOB_TYPE,
  type HomeServiceLandingId,
} from '../lib/homeServiceInfoContent'

type HomeServiceInfoSheetProps = {
  open: boolean
  landingId: HomeServiceLandingId | null
  onClose: () => void
  onConfirmBooking: (jobType: BookingJobType) => void
}

export function HomeServiceInfoSheet({
  open,
  landingId,
  onClose,
  onConfirmBooking,
}: HomeServiceInfoSheetProps) {
  const titleId = useId()
  const [heroBroken, setHeroBroken] = useState(false)

  const jobType = landingId ? LANDING_ID_TO_JOB_TYPE[landingId] : null
  const copy = landingId ? HOME_SERVICE_INFO_BY_LANDING_ID[landingId] : null
  const heroSrc = jobType ? HOME_SERVICE_HERO_PATHS[jobType] : undefined

  useEffect(() => {
    queueMicrotask(() => setHeroBroken(false))
  }, [landingId, open])

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', onKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [open, onKeyDown])

  const handleCta = useCallback(() => {
    if (!jobType) return
    onConfirmBooking(jobType)
    onClose()
  }, [jobType, onConfirmBooking, onClose])

  if (!open || !landingId || !copy || !jobType) return null

  return createPortal(
    <div
      className="fetch-home-service-info-root"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <button
        type="button"
        className="fetch-home-service-info-backdrop"
        aria-label="Close service details"
        onClick={onClose}
      />
      <div
        className="fetch-home-service-info-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="fetch-home-service-info-panel__chrome">
          <button
            type="button"
            className="fetch-home-service-info-close"
            aria-label="Close"
            onClick={onClose}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="fetch-home-service-info-hero">
          {heroSrc && !heroBroken ? (
            <img
              src={heroSrc}
              alt=""
              className={[
                'fetch-home-service-info-hero__img',
                jobType === 'homeMoving' ? 'fetch-home-service-info-hero__img--banner-right' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onError={() => setHeroBroken(true)}
            />
          ) : (
            <div className="fetch-home-service-info-hero__fallback" aria-hidden />
          )}
        </div>

        <div className="fetch-home-service-info-body">
          <h2 id={titleId} className="fetch-home-service-info-title">
            {copy.title}
          </h2>
          <p className="fetch-home-service-info-subtitle">{copy.subtitle}</p>
          <p className="fetch-home-service-info-copy">{copy.body}</p>
        </div>

        <div className="fetch-home-service-info-footer">
          <button
            type="button"
            className="fetch-home-service-info-cta fetch-stage-primary-btn w-full rounded-2xl px-4 py-3.5 text-center text-[15px] font-semibold tracking-[-0.02em] transition-transform active:scale-[0.98]"
            onClick={handleCta}
          >
            {copy.ctaLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
