import { lazy, Suspense } from 'react'

/** Default scene — replace via prop if needed. */
export const FETCH_BRAIN_SPLINE_SCENE =
  'https://prod.spline.design/wOJwAobW97ZolKxC/scene.splinecode'

const Spline = lazy(() => import('@splinetool/react-spline'))

type FetchBrainSplineBackdropProps = {
  /** When false, unmounts Spline (saves GPU after leaving brain). */
  active: boolean
  sceneUrl?: string
}

/**
 * Full-bleed WebGL backdrop for the neural field — sits under particles, pointer-events off.
 */
export function FetchBrainSplineBackdrop({
  active,
  sceneUrl = FETCH_BRAIN_SPLINE_SCENE,
}: FetchBrainSplineBackdropProps) {
  if (!active) return null

  return (
    <div
      className="fetch-brain-spline-backdrop pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <Suspense fallback={null}>
        <Spline
          scene={sceneUrl}
          renderOnDemand
          className="!block h-full min-h-full w-full min-w-full [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-cover"
        />
      </Suspense>
    </div>
  )
}
