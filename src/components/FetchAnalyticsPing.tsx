import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { pingAnalytics } from '../lib/analyticsPing'

/** Registers periodic analytics pings for the current SPA path. */
export function FetchAnalyticsPing() {
  const { pathname } = useLocation()

  useEffect(() => {
    pingAnalytics(pathname)
  }, [pathname])

  return null
}
