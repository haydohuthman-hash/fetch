/**
 * React hook for battle state. Re-renders on any store change.
 */

import { useCallback, useSyncExternalStore } from 'react'
import {
  subscribeBattleStore,
  getBattle,
  getActivityFeed,
  getViewerBoostCount,
  canBoost,
  applyLocalBoost,
  endBattleLocally,
} from './battleStore'
import type { BattleBoostTier, BattleSide } from './types'

let storeVersion = 0
function getSnapshot() {
  return storeVersion
}

const sub = (onStoreChange: () => void) => {
  return subscribeBattleStore(() => {
    storeVersion += 1
    onStoreChange()
  })
}

export function useBattle() {
  useSyncExternalStore(sub, getSnapshot)

  const battle = getBattle()
  const activity = getActivityFeed()
  const boostCount = getViewerBoostCount()

  const sendBoost = useCallback((side: BattleSide, tier: BattleBoostTier, viewerName: string) => {
    return applyLocalBoost(side, tier, viewerName)
  }, [])

  const checkCanBoost = useCallback(() => canBoost(), [])

  const endBattle = useCallback(() => endBattleLocally(), [])

  return { battle, activity, boostCount, sendBoost, checkCanBoost, endBattle }
}
