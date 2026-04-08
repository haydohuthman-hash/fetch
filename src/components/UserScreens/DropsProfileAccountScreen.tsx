import { useCallback, useEffect, useMemo, useState } from 'react'
import { CURATED_DROP_REELS } from '../../lib/drops/constants'
import { mergeFeedReels } from '../../lib/drops/mergeFeedReels'
import {
  ensureDropProfileForSession,
  formatDropHandle,
  getMyDropProfile,
} from '../../lib/drops/profileStore'
import { useDropsApiFeed } from '../../lib/drops/useDropsApiFeed'
import { signOutUser } from '../../lib/fetchUserSession'
import {
  AccountNavIconFilled,
  ChatNavIconFilled,
  FetchEyesHomeIcon,
  MarketplaceNavIconFilled,
  ReelsNavIconFilled,
  FetchProfileSheet,
  type HomeShellTabRequest,
} from '../profile/FetchProfileSheet'

const PENDING_TAB_KEY = 'fetch.pendingHomeShellTab'
const PENDING_REEL_KEY = 'fetch.pendingDropsReelId'

function stashHomeTab(tab: HomeShellTabRequest) {
  try {
    sessionStorage.setItem(PENDING_TAB_KEY, tab)
  } catch {
    /* ignore */
  }
}

function stashHomeReel(reelId: string) {
  stashHomeTab('reels')
  try {
    sessionStorage.setItem(PENDING_REEL_KEY, reelId)
  } catch {
    /* ignore */
  }
}

export type DropsProfileAccountScreenProps = {
  onBack: () => void
  onSignOut: () => void
  onOpenDriver: () => void
  onOpenOnboarding: () => void
}

export function DropsProfileAccountScreen({
  onBack,
  onSignOut,
  onOpenDriver,
  onOpenOnboarding,
}: DropsProfileAccountScreenProps) {
  const { reels: apiFeedReels } = useDropsApiFeed()
  const pool = useMemo(
    () => mergeFeedReels([], apiFeedReels, CURATED_DROP_REELS),
    [apiFeedReels],
  )
  const [profileTick, setProfileTick] = useState(0)

  useEffect(() => {
    ensureDropProfileForSession()
    setProfileTick((x) => x + 1)
  }, [])

  const me = getMyDropProfile()
  const authorId = me?.id ?? '__self__'
  const sellerDisplay = me ? formatDropHandle(me.displayName) : '@you'

  const onProfileSaved = useCallback(() => setProfileTick((x) => x + 1), [])

  const onRequestTab = useCallback(
    (tab: HomeShellTabRequest) => {
      stashHomeTab(tab)
      onBack()
    },
    [onBack],
  )

  const onOpenReel = useCallback(
    (reelId: string) => {
      stashHomeReel(reelId)
      onBack()
    },
    [onBack],
  )

  const handleSignOut = useCallback(() => {
    signOutUser()
    onSignOut()
  }, [onSignOut])

  const openHomeTab = useCallback(
    (tab: HomeShellTabRequest) => {
      stashHomeTab(tab)
      onBack()
    },
    [onBack],
  )

  return (
    <>
      <FetchProfileSheet
        open
        onClose={onBack}
        authorId={authorId}
        sellerDisplay={sellerDisplay}
        pool={pool}
        isSelf
        profileRevision={profileTick}
        onProfileSaved={onProfileSaved}
        onRequestTab={onRequestTab}
        onOpenReel={onOpenReel}
        padBottomForFooter={false}
      />
      <nav
        className="fetch-home-intent-bottom-nav fixed inset-x-0 bottom-0 z-[95] border-t border-zinc-200/80 bg-white/97"
        aria-label="Home shell tabs"
      >
        <button
          type="button"
          className="fetch-home-intent-bottom-nav__icon"
          aria-label="Home"
          onClick={() => openHomeTab('services')}
        >
          <FetchEyesHomeIcon className="block" active={false} />
        </button>
        <button
          type="button"
          className="fetch-home-intent-bottom-nav__icon"
          aria-label="Drops"
          onClick={() => openHomeTab('reels')}
        >
          <ReelsNavIconFilled className="block" active={false} />
        </button>
        <button
          type="button"
          className="fetch-home-intent-bottom-nav__icon"
          aria-label="Fetch shop"
          onClick={() => openHomeTab('marketplace')}
        >
          <MarketplaceNavIconFilled className="block" active={false} />
        </button>
        <button
          type="button"
          className="fetch-home-intent-bottom-nav__icon"
          aria-label="Messages"
          onClick={() => openHomeTab('chat')}
        >
          <ChatNavIconFilled className="block" active={false} />
        </button>
        <button
          type="button"
          className="fetch-home-intent-bottom-nav__icon fetch-home-intent-bottom-nav__icon--active"
          aria-label="Profile"
          onClick={() => {}}
        >
          <AccountNavIconFilled className="block" active />
        </button>
      </nav>
    </>
  )
}
