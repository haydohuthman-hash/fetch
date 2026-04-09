/**
 * Post–platform-onboarding setup for fetchers who want Drops / sell / live:
 * public handle + avatar, then optional handoff to first upload.
 */

import { loadPlatformIdentity, type PlatformInterestId } from '../fetchPlatformIdentity'
import { loadSession, normalizeEmail } from '../fetchUserSession'

const STORAGE_KEY = 'fetch.drops.creatorSetup.v2'
const RETURN_KEY = 'fetch.dropsCreatorReturnTarget.v2'
const PENDING_WIZARD_KEY = 'fetch.pendingOpenDropsPostWizard.v2'

const CREATOR_INTERESTS = new Set<PlatformInterestId>(['drops', 'sell', 'go_live'])

type DropsCreatorSetupV1 = {
  version: 1
  complete: boolean
  /** Normalized email — new account re-triggers setup */
  accountKey: string
  completedAt: number | null
}

function empty(): DropsCreatorSetupV1 {
  return { version: 1, complete: false, accountKey: '', completedAt: null }
}

function load(): DropsCreatorSetupV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty()
    const o = JSON.parse(raw) as Partial<DropsCreatorSetupV1>
    if (o?.version !== 1) return empty()
    return {
      version: 1,
      complete: Boolean(o.complete),
      accountKey: typeof o.accountKey === 'string' ? o.accountKey : '',
      completedAt: typeof o.completedAt === 'number' ? o.completedAt : null,
    }
  } catch {
    return empty()
  }
}

function save(next: DropsCreatorSetupV1) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export function currentSessionKey(): string {
  const s = loadSession()
  return s ? normalizeEmail(s.email) : ''
}

/** Call before navigating to Drops creator setup. */
export function setDropsCreatorReturnTarget(target: 'home' | 'account') {
  try {
    sessionStorage.setItem(RETURN_KEY, target)
  } catch {
    /* ignore */
  }
}

export function consumeDropsCreatorReturnTarget(): 'home' | 'account' {
  try {
    const v = sessionStorage.getItem(RETURN_KEY)
    sessionStorage.removeItem(RETURN_KEY)
    return v === 'account' ? 'account' : 'home'
  } catch {
    return 'home'
  }
}

export function stashPendingDropsPostWizard() {
  try {
    sessionStorage.setItem(PENDING_WIZARD_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function consumePendingDropsPostWizard(): boolean {
  try {
    const v = sessionStorage.getItem(PENDING_WIZARD_KEY)
    sessionStorage.removeItem(PENDING_WIZARD_KEY)
    return v === '1'
  } catch {
    return false
  }
}

export function needsDropsCreatorOnboarding(): boolean {
  const key = currentSessionKey()
  if (!key) return false
  const platform = loadPlatformIdentity()
  if (!platform.complete || platform.role !== 'fetcher') return false
  const wantsCreator = platform.interests.some((i) => CREATOR_INTERESTS.has(i))
  if (!wantsCreator) return false
  const st = load()
  if (st.accountKey !== key) return true
  return !st.complete
}

export function completeDropsCreatorOnboarding() {
  const key = currentSessionKey()
  if (!key) return
  save({
    version: 1,
    complete: true,
    accountKey: key,
    completedAt: Date.now(),
  })
}
