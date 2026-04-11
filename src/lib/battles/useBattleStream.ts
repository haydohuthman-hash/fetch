/**
 * Hook for SSE battle event stream. Automatically connects when
 * a battle ID is provided and disconnects on unmount.
 */

import { useEffect, useRef } from 'react'
import { subscribeBattleStream } from './battleApi'
import { processRealtimeEvent } from './battleStore'
import type { BattleRealtimeEvent } from './types'

export function useBattleStream(battleId: string | null) {
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!battleId) return
    cleanupRef.current = subscribeBattleStream(battleId, (evt: BattleRealtimeEvent) => {
      processRealtimeEvent(evt)
    })
    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [battleId])
}
