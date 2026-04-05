import { useEffect, useRef } from 'react'

export type FetchStreetViewOverlayProps = {
  position: google.maps.LatLngLiteral
  onClose: () => void
}

/**
 * In-app Street View with Fetch chrome. Map / panorama attribution is visually minimized;
 * imagery remains Google Street View under the hood.
 */
export function FetchStreetViewOverlay({
  position,
  onClose,
}: FetchStreetViewOverlayProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const panoRef = useRef<google.maps.StreetViewPanorama | null>(null)

  useEffect(() => {
    if (!hostRef.current || typeof google === 'undefined') return
    let cancelled = false
    const el = hostRef.current
    const pano = new google.maps.StreetViewPanorama(el, {
      position,
      pov: { heading: 0, pitch: 0 },
      visible: true,
      disableDefaultUI: true,
      panControl: false,
      zoomControl: true,
      addressControl: false,
      fullscreenControl: false,
      motionTracking: false,
      motionTrackingControl: false,
      linksControl: true,
      scrollwheel: true,
      showRoadLabels: true,
    })
    panoRef.current = pano

    const svc = new google.maps.StreetViewService()
    svc.getPanorama(
      {
        location: position,
        radius: 120,
        preference: google.maps.StreetViewPreference.NEAREST,
      },
      (data, status) => {
        if (
          cancelled ||
          status !== google.maps.StreetViewStatus.OK ||
          !data ||
          !panoRef.current
        )
          return
        const loc = data.location?.latLng
        if (loc) panoRef.current.setPosition(loc)
      },
    )

    return () => {
      cancelled = true
      panoRef.current = null
      google.maps.event.clearInstanceListeners(pano)
      pano.setVisible(false)
    }
  }, [position.lat, position.lng])

  return (
    <div
      className="fetch-street-view-overlay fixed inset-0 z-[65] flex flex-col bg-[#0a0a0c]"
      role="dialog"
      aria-modal
      aria-label="Street View"
    >
      <header className="fetch-street-view-overlay__bar flex shrink-0 items-center gap-2 border-b border-white/[0.08] bg-[#0f1114]/95 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
        <button
          type="button"
          onClick={onClose}
          className="fetch-street-view-overlay__back flex min-h-11 min-w-11 items-center justify-center rounded-full text-[15px] font-semibold transition-transform active:scale-[0.96]"
          aria-label="Back to map"
        >
          <span className="sr-only">Back</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold tracking-tight text-white">
            Fetch Street View
          </p>
          <p className="truncate text-[11px] font-medium text-white/45">
            Look around, then go back to your map
          </p>
        </div>
      </header>
      <div
        ref={hostRef}
        className="fetch-street-view-host relative min-h-0 w-full flex-1"
        aria-hidden
      />
    </div>
  )
}
