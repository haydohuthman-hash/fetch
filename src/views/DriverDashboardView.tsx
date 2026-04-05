import { useCallback, useEffect, useMemo, useState } from 'react'
import { DriverJobsSheet } from '../components/DriverJobsSheet'
import { FetchHomeStepOne } from '../components/FetchHomeStepOne'
import type { HomeBookingSheetSnap } from '../components/FetchHomeBookingSheet'
import type { MapNavStatusStrip } from '../components/FetchHomeStepOne/MapTimeWeatherOverlay'
import {
  fetchBookingDetail,
  fetchBookings,
  fetchOffers,
  patchBookingDriverLocation,
  patchBookingStatus,
} from '../lib/booking/api'
import type { BookingRecord } from '../lib/booking/types'
import {
  acceptDispatchOffer,
  bookingLifecycleToMapStage,
  filterAvailableJobs,
  filterMyActiveJobs,
  getDriverId,
  nextDriverStatus,
  routePathFromBookingRoute,
  setDriverIdForDemo,
  toDriverJobViewModel,
} from '../lib/driver'
import {
  drivingTrafficDirectionsRequest,
  firstStepPlainInstruction,
  formatArrivalClockFromEtaSeconds,
  legDurationTrafficAndDistance,
  overviewPathFromRoute,
  stableDriverAnchorFromPickup,
} from '../lib/homeDirections'
import { useFetchTheme } from '../theme/FetchThemeContext'

export type DriverDashboardViewProps = {
  onBack: () => void
}

const DRIVER_GPS_FRESH_MS = 45_000
const POLL_MS = 12_000

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
  const [driverToPickupPath, setDriverToPickupPath] = useState<google.maps.LatLngLiteral[] | null>(null)
  const [driverLegEtaSeconds, setDriverLegEtaSeconds] = useState<number | null>(null)
  const [driverLegTrafficDelaySeconds, setDriverLegTrafficDelaySeconds] = useState<number | null>(null)
  const [driverLegNextStep, setDriverLegNextStep] = useState<string | null>(null)
  const [driverLegDistanceMeters, setDriverLegDistanceMeters] = useState<number | null>(null)

  const myDriverId = getDriverId()

  const refresh = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const [b, o] = await Promise.all([fetchBookings(), fetchOffers()])
      setBookings(b)
      setOffers(o)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load jobs')
    } finally {
      setLoading(false)
    }
  }, [])

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
  const mine = useMemo(
    () => filterMyActiveJobs(bookings, offers, myDriverId),
    [bookings, offers, myDriverId],
  )

  const locationTrackingBookingId = useMemo(() => {
    const active = mine.find(
      (b) =>
        b.assignedDriverId === myDriverId &&
        ['matched', 'en_route', 'arrived', 'in_progress'].includes(b.status),
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

  const routePath = useMemo(
    () => routePathFromBookingRoute(mapBooking?.route, mapsJsReady),
    [mapBooking?.route, mapsJsReady],
  )

  const mapStage = useMemo(
    () => bookingLifecycleToMapStage(mapBooking?.status),
    [mapBooking?.status],
  )

  const trackingThisJob =
    !!mapBooking &&
    mapBooking.id === locationTrackingBookingId &&
    ['matched', 'en_route', 'arrived', 'in_progress'].includes(mapBooking.status)

  const gpsFresh = liveGps && Date.now() - gpsUpdatedAt < DRIVER_GPS_FRESH_MS

  useEffect(() => {
    if (!mapsJsReady || !mapBooking?.pickupCoords || typeof google === 'undefined') {
      setDriverToPickupPath(null)
      setDriverLegEtaSeconds(null)
      setDriverLegTrafficDelaySeconds(null)
      setDriverLegNextStep(null)
      setDriverLegDistanceMeters(null)
      return
    }
    const st = mapBooking.status
    if (st !== 'matched' && st !== 'en_route') {
      setDriverToPickupPath(null)
      setDriverLegEtaSeconds(null)
      setDriverLegTrafficDelaySeconds(null)
      setDriverLegNextStep(null)
      setDriverLegDistanceMeters(null)
      return
    }
    if (mapBooking.assignedDriverId !== myDriverId) {
      setDriverToPickupPath(null)
      setDriverLegEtaSeconds(null)
      setDriverLegTrafficDelaySeconds(null)
      setDriverLegNextStep(null)
      setDriverLegDistanceMeters(null)
      return
    }

    let cancelled = false
    const pickup = {
      lat: mapBooking.pickupCoords.lat,
      lng: mapBooking.pickupCoords.lng,
    }

    const run = () => {
      if (cancelled) return
      const origin = gpsFresh && liveGps ? liveGps : stableDriverAnchorFromPickup(mapBooking.id, pickup)
      const svc = new google.maps.DirectionsService()
      svc.route(drivingTrafficDirectionsRequest(origin, pickup), (result, status) => {
        if (cancelled || status !== 'OK' || !result?.routes[0]) return
        const route = result.routes[0]
        const leg = route.legs?.[0]
        const path = overviewPathFromRoute(route)
        const { distanceMeters, durationSeconds, trafficDelaySeconds } =
          legDurationTrafficAndDistance(leg)
        setDriverToPickupPath(path.length >= 2 ? path : null)
        setDriverLegEtaSeconds(durationSeconds)
        setDriverLegTrafficDelaySeconds(trafficDelaySeconds)
        setDriverLegNextStep(firstStepPlainInstruction(route))
        setDriverLegDistanceMeters(distanceMeters > 0 ? distanceMeters : null)
      })
    }

    run()
    const iv = window.setInterval(run, 72_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [
    mapsJsReady,
    mapBooking?.id,
    mapBooking?.status,
    mapBooking?.pickupCoords?.lat,
    mapBooking?.pickupCoords?.lng,
    mapBooking?.assignedDriverId,
    myDriverId,
    gpsFresh,
    liveGps?.lat,
    liveGps?.lng,
    gpsUpdatedAt,
  ])

  const mapNavStrip = useMemo((): MapNavStatusStrip | null => {
    if (!driverToPickupPath || driverToPickupPath.length < 2 || driverLegEtaSeconds == null) return null
    const arrivalClock = formatArrivalClockFromEtaSeconds(driverLegEtaSeconds)
    return {
      layout: 'route',
      navChrome: 'default',
      nextTurn: driverLegNextStep,
      distanceToManeuverLabel: null,
      etaMinutes: Math.max(1, Math.round(driverLegEtaSeconds / 60)),
      arrivalClock,
      trafficDelaySeconds: driverLegTrafficDelaySeconds,
      liveRegionKey: `drv-dash-${mapBooking?.id ?? 'x'}-${driverLegEtaSeconds}-${(driverLegNextStep ?? '').slice(0, 48)}`,
      secondaryLine: null,
      tripDistanceMeters: driverLegDistanceMeters,
    }
  }, [
    driverToPickupPath,
    driverLegEtaSeconds,
    driverLegNextStep,
    driverLegTrafficDelaySeconds,
    driverLegDistanceMeters,
    mapBooking?.id,
  ])

  const showDriverDirections = mapNavStrip != null || (driverToPickupPath != null && driverToPickupPath.length >= 2)

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

  const onAccept = async () => {
    if (!selectedVm || !selectedIsAvailable) return
    setBusy(true)
    setError(null)
    try {
      const label = myDriverId.replace(/_/g, ' ')
      await acceptDispatchOffer({
        bookingId: selectedVm.id,
        driverId: myDriverId,
        matchedDriver: {
          name: label.slice(0, 1).toUpperCase() + label.slice(1),
          vehicle: 'Van',
          etaMinutes: 8,
          rating: 4.85,
        },
      })
      await refresh()
      const d = await fetchBookingDetail(selectedVm.id)
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

  const peekLine = useMemo(() => {
    const parts: string[] = []
    if (available.length) parts.push(`${available.length} incoming`)
    if (mine.length) parts.push(`${mine.length} active`)
    return parts.length ? parts.join(' · ') : 'Driver'
  }, [available.length, mine.length])

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
          driverToPickupPath={driverToPickupPath}
          driverLivePosition={null}
          mapFollowUser={mapFollowUser}
          onMapFollowUserChange={setMapFollowUser}
          suppressTrafficLayer={!showDriverDirections}
          mapOverlayContext="driver"
          onDriverMapExit={onBack}
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
        <div className="pb-2 pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Driver</p>
          <h2 className="text-[1.15rem] font-semibold tracking-tight text-white">Jobs</h2>
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
              {available.length === 0 ? (
                <p className="text-[13px] text-white/45">No dispatching jobs right now.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {available.map((b) => {
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
                      {statusPill(selectedVm.status)}
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

                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedIsAvailable ? (
                      <button type="button" className={btnPrimary} disabled={busy} onClick={() => void onAccept()}>
                        Accept job
                      </button>
                    ) : null}
                    {!selectedIsAvailable && nextLifecycleStatus ? (
                      <button type="button" className={btnPrimary} disabled={busy} onClick={() => void onAdvance()}>
                        Mark {nextLifecycleStatus.replace(/_/g, ' ')}
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
