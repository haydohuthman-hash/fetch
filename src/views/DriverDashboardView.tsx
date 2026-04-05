import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { DriverJobsSheet } from '../components/DriverJobsSheet'
import { FetchHomeStepOne } from '../components/FetchHomeStepOne'
import type { LiveTrackingMapFit } from '../components/FetchHomeStepOne/BookingMapReflection'
import type { HomeBookingSheetSnap } from '../components/FetchHomeBookingSheet'
import type { MapNavStatusStrip } from '../components/FetchHomeStepOne/MapTimeWeatherOverlay'
import {
  isWireStatusActiveForDriverGps,
  resolveLiveTrackingEndpoints,
  shouldHideJobRouteDuringLiveTracking,
  useLiveTripDirections,
} from '../lib/booking'
import {
  fetchBookingDetail,
  fetchBookings,
  fetchOffers,
  patchBookingDriverLocation,
  patchBookingStatus,
  postDriverPresence,
} from '../lib/booking/api'
import type { BookingRecord } from '../lib/booking/types'
import {
  acceptDispatchOffer,
  bookingLifecycleToMapStage,
  declineDispatchOffer,
  driverPhaseFromBookingStatus,
  driverPhaseLabel,
  filterAvailableJobs,
  filterMyActiveJobs,
  formatDashboardPeekLine,
  getDriverId,
  getDriverOnline,
  nextDriverAdvanceLabel,
  nextDriverStatus,
  offerExpiryDeadlineMs,
  resolveDashboardHeadlinePhase,
  routePathFromBookingRoute,
  secondsRemaining,
  setDriverIdForDemo,
  setDriverOnline,
  summarizeDriverEarnings,
  toDriverJobViewModel,
} from '../lib/driver'
import { formatArrivalClockFromEtaSeconds } from '../lib/homeDirections'
import { useFetchTheme } from '../theme/FetchThemeContext'

export type DriverDashboardViewProps = {
  onBack: () => void
}

const DRIVER_GPS_FRESH_MS = 45_000
const POLL_MS = 12_000
const OFFER_WINDOW_MS = 120_000
const OFFER_WINDOW_SEC = Math.round(OFFER_WINDOW_MS / 1000)

function OfferCountdownRing({ secondsLeft, totalSeconds }: { secondsLeft: number; totalSeconds: number }) {
  const uid = useId().replace(/:/g, '')
  const gradId = `fetch-offer-ring-${uid}`
  const r = 22
  const c = 2 * Math.PI * r
  const ratio = totalSeconds > 0 ? Math.min(1, Math.max(0, secondsLeft / totalSeconds)) : 0
  const dash = c * ratio
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="shrink-0" aria-hidden>
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 28 28)"
      />
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgb(167, 139, 250)" />
          <stop offset="100%" stopColor="rgb(109, 40, 217)" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const btnPrimary =
  'rounded-2xl bg-gradient-to-b from-violet-500 to-violet-700 px-4 py-3 text-[14px] font-semibold text-white shadow-lg shadow-violet-950/40 transition-opacity hover:opacity-95 active:opacity-90 disabled:cursor-not-allowed disabled:opacity-45'

const btnGhost =
  'rounded-full border border-white/15 px-3 py-2 text-[13px] font-semibold text-white/75 transition-colors hover:border-white/25 hover:bg-white/5 hover:text-white'

const cardClass =
  'rounded-2xl border border-white/[0.08] bg-black/20 p-3 shadow-[0_0_0_1px_rgba(139,92,246,0.06)]'

function statusPill(status: string) {
  return (
    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/80">
      {status.replace(/_/g, ' ')}
    </span>
  )
}

export function DriverDashboardView({ onBack }: DriverDashboardViewProps) {
  const { resolved: theme } = useFetchTheme()
  const [driverIdInput, setDriverIdInput] = useState(() => getDriverId())
  const [bookings, setBookings] = useState<BookingRecord[]>([])
  const [offers, setOffers] = useState<Awaited<ReturnType<typeof fetchOffers>>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchBookingDetail>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [mapsJsReady, setMapsJsReady] = useState(false)
  const [sheetSnap, setSheetSnap] = useState<HomeBookingSheetSnap>('closed')
  const [liveGps, setLiveGps] = useState<google.maps.LatLngLiteral | null>(null)
  const [gpsUpdatedAt, setGpsUpdatedAt] = useState(0)
  const [mapFollowUser, setMapFollowUser] = useState(false)
  const [driverOnline, setDriverOnlineState] = useState(() => getDriverOnline())
  const [offerTick, setOfferTick] = useState(0)
  const liveGpsRef = useRef<google.maps.LatLngLiteral | null>(null)

  const myDriverId = getDriverId()

  useEffect(() => {
    liveGpsRef.current = liveGps
  }, [liveGps])

  useEffect(() => {
    setDriverOnlineState(getDriverOnline())
  }, [])

  const refresh = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const [b, o] = await Promise.all([fetchBookings(), fetchOffers()])
      setBookings(b)
      setOffers(o)
      if (getDriverOnline()) {
        void postDriverPresence({
          driverId: myDriverId,
          online: true,
          lat: liveGpsRef.current?.lat ?? null,
          lng: liveGpsRef.current?.lng ?? null,
          rating: 4.85,
          completedJobs: 24,
        }).catch(() => {})
      } else {
        void postDriverPresence({ driverId: myDriverId, online: false }).catch(() => {})
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load jobs')
    } finally {
      setLoading(false)
    }
  }, [myDriverId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(id)
    }
  }, [refresh])

  const available = useMemo(
    () => filterAvailableJobs(bookings, offers, myDriverId),
    [bookings, offers, myDriverId],
  )
  const availableWhenOnline = useMemo(
    () => (driverOnline ? available : []),
    [driverOnline, available],
  )
  const earnings = useMemo(
    () => summarizeDriverEarnings(bookings, myDriverId),
    [bookings, myDriverId],
  )
  const mine = useMemo(
    () => filterMyActiveJobs(bookings, offers, myDriverId),
    [bookings, offers, myDriverId],
  )
  const primaryOfferBooking = availableWhenOnline[0] ?? null
  const primaryOfferVm = useMemo(
    () => (primaryOfferBooking ? toDriverJobViewModel(primaryOfferBooking) : null),
    [primaryOfferBooking],
  )
  const dashboardHeadline = useMemo(
    () =>
      resolveDashboardHeadlinePhase({
        online: driverOnline,
        incomingOfferCount: availableWhenOnline.length,
        assignedActive: mine,
      }),
    [driverOnline, availableWhenOnline.length, mine],
  )
  const peekLine = useMemo(() => formatDashboardPeekLine(dashboardHeadline), [dashboardHeadline])

  const locationTrackingBookingId = useMemo(() => {
    const active = mine.find(
      (b) => b.assignedDriverId === myDriverId && isWireStatusActiveForDriverGps(b.status),
    )
    return active?.id ?? null
  }, [mine, myDriverId])

  useEffect(() => {
    if (!locationTrackingBookingId || typeof navigator === 'undefined' || !navigator.geolocation) {
      setLiveGps(null)
      return
    }
    let lastSent = 0
    const wid = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setLiveGps({ lat, lng })
        setGpsUpdatedAt(Date.now())
        const now = Date.now()
        if (now - lastSent < 8000) return
        lastSent = now
        void patchBookingDriverLocation(locationTrackingBookingId, {
          lat,
          lng,
          ...(typeof pos.coords.heading === 'number' && Number.isFinite(pos.coords.heading)
            ? { heading: pos.coords.heading }
            : {}),
          driverId: myDriverId,
        }).catch(() => {})
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(wid)
  }, [locationTrackingBookingId, myDriverId])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    let cancelled = false
    void fetchBookingDetail(selectedId)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch(() => {
        if (!cancelled) setDetail(null)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const mapBooking = useMemo((): BookingRecord | null => {
    if (detail?.booking) return detail.booking
    if (!selectedId) return null
    return bookings.find((b) => b.id === selectedId) ?? null
  }, [detail, bookings, selectedId])

  const routePath = useMemo(() => {
    if (shouldHideJobRouteDuringLiveTracking(mapBooking?.status, mapBooking?.id)) return null
    return routePathFromBookingRoute(mapBooking?.route, mapsJsReady)
  }, [mapBooking?.route, mapBooking?.status, mapBooking?.id, mapsJsReady])

  const mapStage = useMemo(
    () => bookingLifecycleToMapStage(mapBooking?.status),
    [mapBooking?.status],
  )

  const trackingThisJob =
    !!mapBooking &&
    mapBooking.id === locationTrackingBookingId &&
    isWireStatusActiveForDriverGps(mapBooking.status)

  const gpsFresh = Boolean(liveGps && Date.now() - gpsUpdatedAt < DRIVER_GPS_FRESH_MS)

  const liveDirectionsEnabled =
    mapsJsReady &&
    !!mapBooking &&
    mapBooking.assignedDriverId === myDriverId &&
    isWireStatusActiveForDriverGps(mapBooking.status)

  const liveTripDirections = useLiveTripDirections({
    mapsJsReady,
    enabled: liveDirectionsEnabled,
    bookingId: mapBooking?.id ?? null,
    status: mapBooking?.status ?? null,
    pickupCoords: mapBooking?.pickupCoords ?? null,
    dropoffCoords: mapBooking?.dropoffCoords ?? null,
    driverLocation: null,
    gpsFreshMs: DRIVER_GPS_FRESH_MS,
    liveDeviceGps: liveGps,
    liveDeviceGpsFresh: gpsFresh,
  })

  const driverLiveTrackingFit = useMemo((): LiveTrackingMapFit | null => {
    if (!mapBooking) return null
    const mergedLoc =
      gpsFresh && liveGps
        ? { lat: liveGps.lat, lng: liveGps.lng, updatedAt: Date.now() }
        : null
    const ep = resolveLiveTrackingEndpoints({
      status: mapBooking.status,
      bookingId: mapBooking.id,
      pickupCoords: mapBooking.pickupCoords,
      dropoffCoords: mapBooking.dropoffCoords,
      driverLocation: mergedLoc,
      gpsFreshMs: DRIVER_GPS_FRESH_MS,
    })
    if (!ep) return null
    const driver = gpsFresh && liveGps ? liveGps : ep.origin
    const pickup = mapBooking.pickupCoords
      ? { lat: mapBooking.pickupCoords.lat, lng: mapBooking.pickupCoords.lng }
      : null
    const dropoff = mapBooking.dropoffCoords
      ? { lat: mapBooking.dropoffCoords.lat, lng: mapBooking.dropoffCoords.lng }
      : null
    return { driver, pickup, dropoff, phase: ep.phase }
  }, [
    mapBooking?.id,
    mapBooking?.status,
    mapBooking?.pickupCoords?.lat,
    mapBooking?.pickupCoords?.lng,
    mapBooking?.dropoffCoords?.lat,
    mapBooking?.dropoffCoords?.lng,
    gpsFresh,
    liveGps?.lat,
    liveGps?.lng,
    gpsUpdatedAt,
  ])

  const mapNavStrip = useMemo((): MapNavStatusStrip | null => {
    const path = liveTripDirections.path
    const eta = liveTripDirections.etaSeconds
    if (!path || path.length < 2 || eta == null) return null
    const arrivalClock = formatArrivalClockFromEtaSeconds(eta)
    const toDropoff = liveTripDirections.phase === 'to_dropoff'
    return {
      layout: 'route',
      navChrome: 'default',
      nextTurn: liveTripDirections.nextStep,
      distanceToManeuverLabel: null,
      etaMinutes: Math.max(1, Math.round(eta / 60)),
      arrivalClock,
      trafficDelaySeconds: liveTripDirections.trafficDelaySeconds,
      liveRegionKey: `drv-dash-${mapBooking?.id ?? 'x'}-${eta}-${(liveTripDirections.nextStep ?? '').slice(0, 48)}`,
      secondaryLine: toDropoff ? 'Heading to drop-off' : 'Heading to pickup',
      tripDistanceMeters: liveTripDirections.distanceMeters,
    }
  }, [
    liveTripDirections.distanceMeters,
    liveTripDirections.etaSeconds,
    liveTripDirections.nextStep,
    liveTripDirections.path,
    liveTripDirections.phase,
    liveTripDirections.trafficDelaySeconds,
    mapBooking?.id,
  ])

  const showDriverDirections =
    mapNavStrip != null ||
    (liveTripDirections.path != null && liveTripDirections.path.length >= 2)

  useEffect(() => {
    if (!showDriverDirections) setMapFollowUser(false)
  }, [showDriverDirections])

  const selectedVm = detail ? toDriverJobViewModel(detail.booking) : null
  const selectedIsAvailable = selectedVm ? available.some((b) => b.id === selectedVm.id) : false

  const applyDriverId = () => {
    setDriverIdForDemo(driverIdInput.trim() || getDriverId())
    setDriverIdInput(getDriverId())
    void refresh()
  }

  const acceptBookingById = async (bookingId: string) => {
    if (!availableWhenOnline.some((b) => b.id === bookingId)) return
    setBusy(true)
    setError(null)
    try {
      const label = myDriverId.replace(/_/g, ' ')
      const pendingOffer = offers.find(
        (o) => o.bookingId === bookingId && o.driverId === myDriverId && o.status === 'pending',
      )
      await acceptDispatchOffer({
        bookingId,
        driverId: myDriverId,
        offerId: pendingOffer?.offerId ?? `${myDriverId}_${bookingId}`,
        matchedDriver: {
          name: label.slice(0, 1).toUpperCase() + label.slice(1),
          vehicle: 'Van',
          etaMinutes: 8,
          rating: 4.85,
        },
      })
      await refresh()
      setSelectedId(bookingId)
      const d = await fetchBookingDetail(bookingId)
      setDetail(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Accept failed')
    } finally {
      setBusy(false)
    }
  }

  const onAdvance = async () => {
    if (!selectedVm) return
    const next = nextDriverStatus(selectedVm.status)
    if (!next) return
    setBusy(true)
    setError(null)
    try {
      await patchBookingStatus(selectedVm.id, { status: next })
      await refresh()
      const d = await fetchBookingDetail(selectedVm.id)
      setDetail(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const nextLifecycleStatus = selectedVm ? nextDriverStatus(selectedVm.status) : null

  const primaryOfferDeadlineMs = useMemo(
    () => offerExpiryDeadlineMs(primaryOfferBooking, OFFER_WINDOW_MS),
    [primaryOfferBooking],
  )

  const offerDeadlineMs = useMemo(() => {
    if (!selectedVm || !selectedIsAvailable) return null
    const record =
      detail?.booking?.id === selectedVm.id ? detail.booking : bookings.find((b) => b.id === selectedVm.id)
    return offerExpiryDeadlineMs(record ?? null, OFFER_WINDOW_MS)
  }, [selectedVm, selectedIsAvailable, detail?.booking, bookings])

  useEffect(() => {
    if (offerDeadlineMs == null && primaryOfferDeadlineMs == null) return
    const id = window.setInterval(() => setOfferTick((x) => x + 1), 1000)
    return () => window.clearInterval(id)
  }, [offerDeadlineMs, primaryOfferDeadlineMs])

  const offerSecondsLeft = useMemo(() => {
    void offerTick
    return secondsRemaining(offerDeadlineMs, Date.now())
  }, [offerDeadlineMs, offerTick])

  const primaryOfferSecondsLeft = useMemo(() => {
    void offerTick
    return secondsRemaining(primaryOfferDeadlineMs, Date.now())
  }, [primaryOfferDeadlineMs, offerTick])

  const selectedLifecyclePhase =
    selectedVm != null
      ? driverPhaseFromBookingStatus(
          selectedVm.status,
          selectedIsAvailable ? 'incoming_offer' : 'assigned',
        )
      : null

  const advanceCTA = nextDriverAdvanceLabel(nextLifecycleStatus)

  const declineBookingById = async (bookingId: string) => {
    if (!availableWhenOnline.some((b) => b.id === bookingId)) return
    setBusy(true)
    setError(null)
    try {
      const pendingOffer = offers.find(
        (o) => o.bookingId === bookingId && o.driverId === myDriverId && o.status === 'pending',
      )
      await declineDispatchOffer({
        bookingId,
        driverId: myDriverId,
        offerId: pendingOffer?.offerId ?? `${myDriverId}_${bookingId}`,
      })
      await refresh()
      if (selectedId === bookingId) {
        setSelectedId(null)
        setDetail(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decline failed')
    } finally {
      setBusy(false)
    }
  }

  const userLocationForMap =
    trackingThisJob && liveGps ? liveGps : null

  return (
    <div
      className="fetch-driver-dashboard fetch-theme-chrome relative min-h-dvh w-full"
      data-theme={theme}
    >
      <div className="absolute inset-0 min-h-dvh">
        <FetchHomeStepOne
          onMapsJavaScriptReady={setMapsJsReady}
          pickup={mapBooking?.pickupAddressText ?? null}
          dropoff={mapBooking?.dropoffAddressText ?? null}
          pickupCoords={
            mapBooking?.pickupCoords
              ? { lat: mapBooking.pickupCoords.lat, lng: mapBooking.pickupCoords.lng }
              : null
          }
          dropoffCoords={
            mapBooking?.dropoffCoords
              ? { lat: mapBooking.dropoffCoords.lat, lng: mapBooking.dropoffCoords.lng }
              : null
          }
          routePath={routePath}
          mapStage={mapStage}
          userLocationCoords={userLocationForMap}
          mapNavStrip={mapNavStrip}
          driverToPickupPath={liveTripDirections.path}
          driverLivePosition={null}
          mapFollowUser={mapFollowUser}
          onMapFollowUserChange={setMapFollowUser}
          suppressTrafficLayer={!showDriverDirections}
          mapOverlayContext="driver"
          onDriverMapExit={onBack}
          liveTrackingFit={driverLiveTrackingFit}
        />
      </div>

      <DriverJobsSheet
        snap={sheetSnap}
        onSnapChange={setSheetSnap}
        onBack={onBack}
        peekLine={peekLine}
        footer={
          <div className={`${cardClass} mx-1 mb-1`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Demo driver id</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={driverIdInput}
                onChange={(e) => setDriverIdInput(e.target.value)}
                className="min-w-[10rem] flex-1 rounded-xl border border-white/12 bg-black/40 px-3 py-2 text-[13px] text-white outline-none focus:border-violet-400/45"
                aria-label="Driver id"
              />
              <button type="button" className={btnGhost} onClick={applyDriverId}>
                Apply
              </button>
            </div>
          </div>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 pt-1">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Driver</p>
            <h2 className="text-[1.15rem] font-semibold tracking-tight text-white">Jobs</h2>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !driverOnline
              setDriverOnline(next)
              setDriverOnlineState(next)
              void postDriverPresence({
                driverId: myDriverId,
                online: next,
                lat: liveGpsRef.current?.lat ?? null,
                lng: liveGpsRef.current?.lng ?? null,
                rating: 4.85,
                completedJobs: 24,
              }).catch(() => {})
            }}
            className={[
              'rounded-full border px-4 py-2 text-[12px] font-semibold transition-colors',
              driverOnline
                ? 'border-emerald-400/35 bg-emerald-950/40 text-emerald-100'
                : 'border-white/15 bg-white/[0.06] text-white/55',
            ].join(' ')}
            aria-pressed={driverOnline}
          >
            {driverOnline ? 'Online' : 'Offline'}
          </button>
        </div>

        {driverOnline && primaryOfferBooking ? (
          <div
            className={`${cardClass} mb-3 border-violet-400/25 bg-violet-950/20`}
            data-sheet-no-drag
          >
            <div className="flex items-start gap-3">
              <OfferCountdownRing
                secondsLeft={primaryOfferSecondsLeft ?? OFFER_WINDOW_SEC}
                totalSeconds={OFFER_WINDOW_SEC}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200/80">
                  Incoming offer
                </p>
                <p className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-white">
                  {primaryOfferVm?.jobTypeLabel ?? 'Job'} · {primaryOfferBooking.pickupAddressText || 'Pickup TBC'}
                </p>
                {primaryOfferVm?.pricingSummary ? (
                  <p className="mt-1 text-[12px] text-white/60">{primaryOfferVm.pricingSummary}</p>
                ) : null}
                <p
                  className={[
                    'mt-2 text-[12px] font-semibold tabular-nums',
                    primaryOfferSecondsLeft != null && primaryOfferSecondsLeft <= 0
                      ? 'text-amber-200/90'
                      : 'text-white/65',
                  ].join(' ')}
                >
                  {primaryOfferDeadlineMs == null
                    ? 'Accept or decline this dispatch.'
                    : primaryOfferSecondsLeft != null && primaryOfferSecondsLeft <= 0
                      ? 'Offer window ended — decline to clear or refresh.'
                      : `Respond in ${primaryOfferSecondsLeft ?? '—'}s`}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={btnPrimary}
                disabled={
                  busy ||
                  (primaryOfferDeadlineMs != null &&
                    primaryOfferSecondsLeft != null &&
                    primaryOfferSecondsLeft <= 0)
                }
                onClick={() => void acceptBookingById(primaryOfferBooking.id)}
              >
                Accept
              </button>
              <button
                type="button"
                className="rounded-2xl border border-white/20 px-4 py-3 text-[14px] font-semibold text-white/80 transition-colors hover:bg-white/[0.06] disabled:opacity-45"
                disabled={busy}
                onClick={() => void declineBookingById(primaryOfferBooking.id)}
              >
                Decline
              </button>
              <button type="button" className={btnGhost} onClick={() => setSelectedId(primaryOfferBooking.id)}>
                Details
              </button>
            </div>
          </div>
        ) : null}

        <div className={`${cardClass} mb-3`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Earnings (demo)</p>
          <p className="mt-1 text-[20px] font-semibold tabular-nums text-white">
            ${earnings.totalAud.toFixed(0)}{' '}
            <span className="text-[12px] font-medium text-white/50">AUD lifetime</span>
          </p>
          <p className="mt-0.5 text-[12px] text-white/55">{earnings.completedCount} completed jobs</p>
          {earnings.recent.length ? (
            <ul className="mt-3 space-y-1.5 border-t border-white/[0.08] pt-3">
              <li className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Recent</li>
              {earnings.recent.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 text-[12px] text-white/70">
                  <span className="min-w-0 truncate">{b.pickupAddressText || b.id}</span>
                  <span className="shrink-0 tabular-nums text-white/50">
                    {b.pricing?.maxPrice != null ? `$${b.pricing.maxPrice}` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {error ? (
          <div className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="text-[14px] text-white/55">Loading jobs…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-white/50">Available</h3>
              {!driverOnline ? (
                <p className="text-[13px] text-white/45">Go online to see incoming offers.</p>
              ) : availableWhenOnline.length === 0 ? (
                <p className="text-[13px] text-white/45">No dispatching jobs right now.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {availableWhenOnline.map((b) => {
                    const vm = toDriverJobViewModel(b)
                    return (
                      <li key={b.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(b.id)}
                          className={[
                            'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
                            selectedId === b.id
                              ? 'border-violet-400/45 bg-violet-500/15'
                              : 'border-white/10 bg-black/30 hover:border-white/18',
                          ].join(' ')}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="line-clamp-1 text-[14px] font-semibold text-white">
                              {vm.jobTypeLabel ?? 'Job'} · {vm.pickupAddressText || 'Pickup TBC'}
                            </span>
                            {statusPill(vm.status)}
                          </div>
                          {vm.pricingSummary ? (
                            <p className="mt-1 text-[12px] text-white/55">{vm.pricingSummary}</p>
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-white/50">My jobs</h3>
              {mine.length === 0 ? (
                <p className="text-[13px] text-white/45">No active assignments.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {mine.map((b) => {
                    const vm = toDriverJobViewModel(b)
                    return (
                      <li key={b.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(b.id)}
                          className={[
                            'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
                            selectedId === b.id
                              ? 'border-violet-400/45 bg-violet-500/15'
                              : 'border-white/10 bg-black/30 hover:border-white/18',
                          ].join(' ')}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="line-clamp-1 text-[14px] font-semibold text-white">
                              {vm.jobTypeLabel ?? 'Job'} · {vm.pickupAddressText || 'Pickup TBC'}
                            </span>
                            {statusPill(vm.status)}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className={cardClass}>
              {!selectedVm ? (
                <p className="text-[14px] text-white/50">Select a job for details.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-[16px] font-semibold text-white">
                        {selectedVm.jobTypeLabel ?? 'Job'}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {statusPill(selectedVm.status)}
                        {selectedLifecyclePhase ? (
                          <span className="rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100/90">
                            {driverPhaseLabel(selectedLifecyclePhase)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <dl className="mt-3 space-y-2 text-[13px]">
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Pickup</dt>
                      <dd className="text-white/85">{selectedVm.pickupAddressText || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Drop-off</dt>
                      <dd className="text-white/85">{selectedVm.dropoffAddressText || '—'}</dd>
                    </div>
                    {selectedVm.routeSummary ? (
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Route</dt>
                        <dd className="text-white/85">{selectedVm.routeSummary}</dd>
                      </div>
                    ) : null}
                    {selectedVm.pricingSummary ? (
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Quote</dt>
                        <dd className="text-white/85">{selectedVm.pricingSummary}</dd>
                      </div>
                    ) : null}
                    {selectedVm.matchedDriver ? (
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Matched</dt>
                        <dd className="text-white/85">
                          {selectedVm.matchedDriver.name}
                          {selectedVm.matchedDriver.vehicle ? ` · ${selectedVm.matchedDriver.vehicle}` : ''}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {detail?.booking.driverControlled ? (
                    <p className="mt-3 text-[11px] leading-snug text-emerald-200/80">
                      Driver-controlled lifecycle: demo dispatch timers are off for this booking.
                    </p>
                  ) : null}

                  {selectedIsAvailable && offerSecondsLeft != null ? (
                    <p
                      className={[
                        'mt-3 text-[12px] font-semibold tabular-nums',
                        offerSecondsLeft <= 0 ? 'text-amber-200/90' : 'text-white/70',
                      ].join(' ')}
                    >
                      {offerSecondsLeft <= 0
                        ? 'Offer window ended — refresh list or decline to clear.'
                        : `Accept within ${offerSecondsLeft}s`}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedIsAvailable ? (
                      <>
                        <button
                          type="button"
                          className={btnPrimary}
                          disabled={busy || (offerSecondsLeft != null && offerSecondsLeft <= 0)}
                          onClick={() => void acceptBookingById(selectedVm.id)}
                        >
                          Accept job
                        </button>
                        <button
                          type="button"
                          className="rounded-2xl border border-white/20 px-4 py-3 text-[14px] font-semibold text-white/80 transition-colors hover:bg-white/[0.06] disabled:opacity-45"
                          disabled={busy}
                          onClick={() => void declineBookingById(selectedVm.id)}
                        >
                          Decline
                        </button>
                      </>
                    ) : null}
                    {!selectedIsAvailable && nextLifecycleStatus ? (
                      <button type="button" className={btnPrimary} disabled={busy} onClick={() => void onAdvance()}>
                        {advanceCTA ?? 'Continue job'}
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </DriverJobsSheet>
    </div>
  )
}

export default DriverDashboardView
