import { useCallback, useEffect, useMemo, useState } from 'react'
import { CURATED_DROP_REELS } from '../../lib/drops/constants'
import { mergeFeedReels } from '../../lib/drops/mergeFeedReels'
import {
  ensureDropProfileForSession,
  formatDropHandle,
  getMyDropProfile,
} from '../../lib/drops/profileStore'
import { loadSession } from '../../lib/fetchUserSession'
import { useMessagesUnreadPolling } from '../../lib/messagesApi'
import { useDropsApiFeed } from '../../lib/drops/useDropsApiFeed'
import {
  AccountNavIconFilled,
  ChatNavIconFilled,
  FetchEyesHomeIcon,
  MarketplaceNavIconFilled,
  ReelsNavIconFilled,
} from '../icons/HomeShellNavIcons'
import {
  FetchProfileSheet,
  type HomeShellTabRequest,
} from '../profile/FetchProfileSheet'

const PENDING_TAB_KEY = 'fetch.pendingHomeShellTab'
const PENDING_REEL_KEY = 'fetch.pendingDropsReelId'
const PENDING_PEER_LISTING_KEY = 'fetch.pendingPeerListingHandoff'

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

function stashPeerListingOpen(listingId: string) {
  try {
    sessionStorage.setItem(PENDING_PEER_LISTING_KEY, JSON.stringify({ listingId, mode: 'sheet' }))
  } catch {
    /* ignore */
  }
  stashHomeTab('buySell')
}

export type DropsProfileAccountScreenProps = {
  onBack: () => void
  onSignOut: () => void
  onOpenDriver: () => void
  onOpenOnboarding: () => void
}

export function DropsProfileAccountScreen({ onBack }: DropsProfileAccountScreenProps) {
  const { reels: apiFeedReels } = useDropsApiFeed()
  const pool = useMemo(
    () => mergeFeedReels([], apiFeedReels, CURATED_DROP_REELS),
    [apiFeedReels],
  )
  const [profileTick, setProfileTick] = useState(0)
  const [messagesUnread, setMessagesUnread] = useState({ listing: 0, support: 0, total: 0 })

  useMessagesUnreadPolling(Boolean(loadSession()?.email?.trim()), 12_000, setMessagesUnread)

  useEffect(() => {
    ensureDropProfileForSession()
    queueMicrotask(() => setProfileTick((x) => x + 1))
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

  const onOpenPeerListing = useCallback(
    (listingId: string) => {
      stashPeerListingOpen(listingId)
      onBack()
    },
    [onBack],
  )

  const openHomeTab = useCallback(
    (tab: HomeShellTabRequest) => {
      stashHomeTab(tab)
      onBack()
    },
    [onBack],
  )

  return (
    <div className="fetch-home-vision flex min-h-[100dvh] flex-col bg-white">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <FetchProfileSheet
          open
          surface="page"
          onClose={onBack}
          authorId={authorId}
          sellerDisplay={sellerDisplay}
          pool={pool}
          isSelf
          profileRevision={profileTick}
          onProfileSaved={onProfileSaved}
          onRequestTab={onRequestTab}
          onOpenReel={onOpenReel}
          onOpenPeerListing={onOpenPeerListing}
          padBottomForFooter={false}
        />
      </div>

      <div className="fetch-home-booking-sheet__shell-footer-stack pointer-events-auto relative z-[96] flex w-full shrink-0 flex-col">
        <div className="fetch-home-booking-sheet__shell-footer">
          <nav
            className="fetch-home-intent-bottom-nav fetch-home-intent-bottom-nav--compact"
            aria-label="Fetch shop, home, drops, messages, and account"
          >
            <button
              type="button"
              className="fetch-home-intent-bottom-nav__icon"
              aria-label="Fetch shop — buy & sell and supplies"
              onClick={() => openHomeTab('buySell')}
            >
              <MarketplaceNavIconFilled className="block" active={false} />
            </button>
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
              className="fetch-home-intent-bottom-nav__icon fetch-home-intent-bottom-nav__icon--reels"
              aria-label="Drops"
              onClick={() => openHomeTab('reels')}
            >
              <ReelsNavIconFilled className="block" active={false} />
            </button>
            <button
              type="button"
              className="fetch-home-intent-bottom-nav__icon relative"
              aria-label="Messages"
              onClick={() => openHomeTab('chat')}
            >
              <ChatNavIconFilled className="block" active={false} />
              {messagesUnread.total > 0 ? (
                <span className="pointer-events-none absolute right-[18%] top-[10%] flex h-[11px] min-w-[11px] rounded-full bg-red-500 ring-2 ring-white" />
              ) : null}
            </button>
            <button
              type="button"
              className="fetch-home-intent-bottom-nav__icon fetch-home-intent-bottom-nav__icon--active"
              aria-label="Profile"
              aria-current="page"
              onClick={() => {}}
            >
              <AccountNavIconFilled className="block" active />
            </button>
          </nav>
        </div>
      </div>
    </div>
  )
}
