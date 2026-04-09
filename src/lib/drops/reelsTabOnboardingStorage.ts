/** First-run hints for Drops / Local / Live top tabs (reels shell). */

export type ReelsTopTabOnboard = 'drops' | 'local' | 'live'

export const REELS_TOP_TAB_ORDER: readonly ReelsTopTabOnboard[] = ['drops', 'local', 'live']

function storageKey(tab: ReelsTopTabOnboard): string {
  return `fetch.reels.tabOnboard.${tab}.v2`
}

export function reelsTabOnboardingSeen(tab: ReelsTopTabOnboard): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(storageKey(tab)) === '1'
  } catch {
    return true
  }
}

export function markReelsTabOnboardingSeen(tab: ReelsTopTabOnboard): void {
  try {
    localStorage.setItem(storageKey(tab), '1')
  } catch {
    /* ignore */
  }
}
