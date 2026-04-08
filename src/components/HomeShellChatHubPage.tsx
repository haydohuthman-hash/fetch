import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { loadSession } from '../lib/fetchUserSession'
import {
  createMessageThread,
  fetchMessageThread,
  fetchMessageThreads,
  type MessageThreadKind,
  type MessageThreadSummary,
} from '../lib/messagesApi'
import {
  AccountNavIconFilled,
  FetchEyesHomeIcon,
  MarketplaceNavIconFilled,
  ShellMenuCloseIcon,
  ShellMenuIcon,
  ShellMenuRefreshIcon,
} from './icons/HomeShellNavIcons'
import { ChatThreadView } from './ChatThreadView'
import type { PeerListing } from '../lib/listingsApi'

type HubScreen = 'hub' | 'thread'
type ExpandedHub = 'field' | 'listing' | 'support' | null

export type HomeShellChatHubPageProps = {
  bottomNav: ReactNode
  onMenuAccount?: () => void
  onChatWithField: () => void
  initialThreadId?: string | null
  onConsumedInitialThread?: () => void
  listingUnread?: number
  supportUnread?: number
  onFetchIt?: (listing: PeerListing) => void
}

/** Headset — live / support inbox */
function SupportHeadsetIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        fill="currentColor"
        d="M12 3.5a6.25 6.25 0 00-6.2 5.5H4.75A2.25 2.25 0 002.5 11.25v3.5A2.25 2.25 0 004.75 17H6.5v-5H5.75a.75.75 0 01-.75-.75v-1.5c0-.41.34-.75.75-.75h.8a7.75 7.75 0 0115.4 0h.8c.41 0 .75.34.75.75v1.5c0 .41-.34.75-.75.75H21.5v5h1.75A2.25 2.25 0 0021.5 14.75v-3.5a2.25 2.25 0 00-2.25-2.25h-1.05A6.25 6.25 0 0012 3.5zm-1 13v2.25A1.25 1.25 0 0012.25 20h2a1.25 1.25 0 001.25-1.25V16.5h-4.5z"
      />
    </svg>
  )
}

function HomeShellChatHubPageInner({
  bottomNav,
  onMenuAccount,
  onChatWithField,
  initialThreadId,
  onConsumedInitialThread,
  listingUnread = 0,
  supportUnread = 0,
  onFetchIt,
}: HomeShellChatHubPageProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [screen, setScreen] = useState<HubScreen>('hub')
  const [expandedHub, setExpandedHub] = useState<ExpandedHub>(null)
  const [threadKind, setThreadKind] = useState<MessageThreadKind>('listing')
  const [threads, setThreads] = useState<MessageThreadSummary[]>([])
  const [activeThread, setActiveThread] = useState<MessageThreadSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const consumedInitialRef = useRef<string | null>(null)
  const openedViaHandoffRef = useRef(false)

  const sessionEmail = loadSession()?.email?.trim() ?? ''

  const loadThreads = useCallback(
    async (kind: MessageThreadKind) => {
      setErr(null)
      setBusy(true)
      try {
        const rows = await fetchMessageThreads(kind)
        setThreads(rows)
      } catch (e) {
        setThreads([])
        setErr(e instanceof Error ? e.message : 'Could not load threads')
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!initialThreadId) return
    if (consumedInitialRef.current === initialThreadId) return
    consumedInitialRef.current = initialThreadId
    let cancelled = false
    void (async () => {
      try {
        const { thread } = await fetchMessageThread(initialThreadId)
        if (cancelled) return
        openedViaHandoffRef.current = true
        setThreadKind(thread.kind)
        setActiveThread(thread)
        setScreen('thread')
        setExpandedHub(null)
        onConsumedInitialThread?.()
      } catch {
        if (!cancelled) setErr('Could not open that conversation.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [initialThreadId, onConsumedInitialThread])

  useEffect(() => {
    if (screen !== 'hub') return
    if (expandedHub === 'listing') void loadThreads('listing')
    if (expandedHub === 'support') void loadThreads('support')
  }, [screen, expandedHub, loadThreads])

  const toggleHub = (section: Exclude<ExpandedHub, null>) => {
    setExpandedHub((prev) => (prev === section ? null : section))
    setErr(null)
  }

  const openOrCreateSupport = async () => {
    if (!sessionEmail) {
      setErr('Sign in to use support chat.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const { thread } = await createMessageThread({ kind: 'support' })
      setActiveThread(thread)
      setThreadKind('support')
      setScreen('thread')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start support chat')
    } finally {
      setBusy(false)
    }
  }

  const circleBtn = (
    id: string,
    expanded: boolean,
    onClick: () => void,
    ariaLabel: string,
    children: ReactNode,
    badge: number | undefined = undefined,
  ) => (
    <button
      type="button"
      id={id}
      aria-label={ariaLabel}
      aria-expanded={expanded}
      onClick={onClick}
      className={[
        'relative flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-full border-2 transition-[colors,box-shadow,transform] active:scale-[0.96]',
        expanded
          ? 'border-[#1877f2] bg-blue-50 text-[#1877f2] shadow-md shadow-blue-900/10'
          : 'border-zinc-200/90 bg-white text-zinc-700 shadow-sm active:bg-zinc-50',
      ].join(' ')}
    >
      {children}
      {badge != null && badge > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  )

  if (screen === 'thread' && activeThread) {
    return (
      <div className="fetch-home-buysell-page absolute inset-0 z-[60] flex min-h-0 flex-col bg-zinc-100" role="main">
        <ChatThreadView
          thread={activeThread}
          onBack={() => {
            setActiveThread(null)
            if (openedViaHandoffRef.current) {
              openedViaHandoffRef.current = false
              setExpandedHub(null)
              setScreen('hub')
            } else {
              setScreen('hub')
              setExpandedHub(threadKind === 'listing' ? 'listing' : 'support')
              void loadThreads(threadKind)
            }
          }}
          onFetchIt={onFetchIt}
        />
        {bottomNav ? (
          <div className="fetch-home-marketplace-shell-footer shrink-0 pb-[env(safe-area-inset-bottom,0px)]">
            {bottomNav}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className="fetch-home-buysell-page absolute inset-0 z-[60] flex min-h-0 flex-col bg-zinc-100"
      role="main"
      aria-label="Fetch chat"
    >
      {menuOpen ? (
        <div className="fixed inset-0 z-[75] flex" role="dialog" aria-modal aria-label="Chat menu">
          <button
            type="button"
            className="min-h-0 flex-1 bg-black/40"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div className="flex h-full w-[min(18rem,88vw)] flex-col border-l border-zinc-200 bg-white shadow-xl">
            <div className="border-b border-zinc-100 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
              <p className="text-[16px] font-bold text-zinc-900">Chat</p>
              <p className="mt-0.5 text-[12px] text-zinc-500">Marketplace, support, and the field</p>
            </div>
            <nav className="flex flex-col gap-0.5 p-2">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold text-zinc-900 active:bg-zinc-100"
                onClick={() => {
                  setMenuOpen(false)
                  void loadThreads('listing')
                }}
              >
                <ShellMenuRefreshIcon className="h-[1.35rem] w-[1.35rem] shrink-0 text-zinc-500" />
                <span className="min-w-0">Refresh marketplace threads</span>
              </button>
            </nav>
            <div className="mt-auto border-t border-zinc-100 p-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[15px] font-semibold text-zinc-600 active:bg-zinc-100"
                onClick={() => setMenuOpen(false)}
              >
                <ShellMenuCloseIcon className="h-[1.2rem] w-[1.2rem] shrink-0 text-zinc-400" />
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <header className="shrink-0 border-b border-zinc-200/80 bg-white px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] sm:px-4">
        <div className="mx-auto grid w-full min-w-0 max-w-lg grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-2">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-800 transition-colors active:bg-zinc-100"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <ShellMenuIcon className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center justify-center gap-2">
            <FetchEyesHomeIcon className="h-8 w-8 shrink-0 text-zinc-900 sm:h-9 sm:w-9" />
            <div className="min-w-0 text-left">
              <span className="flex min-w-0 items-baseline gap-1 truncate">
                <span className="fetch-home-map-brand-logo shrink-0 text-[1.2rem] font-bold leading-none tracking-[-0.03em] text-zinc-900 sm:text-[1.35rem]">
                  Fetch
                </span>
                <span className="min-w-0 truncate text-[0.8rem] font-semibold leading-none tracking-[-0.02em] text-zinc-700 sm:text-[0.9rem]">
                  chat
                </span>
              </span>
            </div>
          </div>
          {onMenuAccount ? (
            <button
              type="button"
              onClick={onMenuAccount}
              className="flex h-10 w-10 shrink-0 items-center justify-center justify-self-end rounded-full text-zinc-800 transition-colors active:bg-zinc-100"
              aria-label="Profile"
            >
              <AccountNavIconFilled className="h-6 w-6" />
            </button>
          ) : (
            <div className="h-10 w-10 shrink-0" aria-hidden />
          )}
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-zinc-200/60 bg-zinc-50/80 px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center gap-2.5">
            {circleBtn(
              'hub-opt-field',
              expandedHub === 'field',
              () => toggleHub('field'),
              'Chat with the field',
              <FetchEyesHomeIcon className="h-[1.35rem] w-[1.35rem]" />,
            )}
            {circleBtn(
              'hub-opt-listing',
              expandedHub === 'listing',
              () => toggleHub('listing'),
              'Marketplace listing messages',
              <MarketplaceNavIconFilled className="h-[1.35rem] w-[1.35rem]" />,
              listingUnread,
            )}
            {circleBtn(
              'hub-opt-support',
              expandedHub === 'support',
              () => toggleHub('support'),
              'Live support messages',
              <SupportHeadsetIcon className="h-[1.35rem] w-[1.35rem]" />,
              supportUnread,
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-2 sm:px-4">
          {err ? <p className="mb-2 text-[13px] text-red-600">{err}</p> : null}

          {expandedHub === null ? (
            <p className="py-6 text-center text-[14px] text-zinc-500">Tap a circle to open chats below.</p>
          ) : null}

          {expandedHub === 'field' ? (
            <div className="space-y-2" role="region" aria-labelledby="hub-opt-field">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200/90 bg-white p-3 text-left shadow-sm active:bg-zinc-50"
                onClick={() => onChatWithField()}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                  <FetchEyesHomeIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold text-zinc-900">Chat with the field</p>
                  <p className="text-[12px] text-zinc-500">Bookings, questions, and the home assistant</p>
                </div>
              </button>
            </div>
          ) : null}

          {expandedHub === 'listing' ? (
            <div className="space-y-2" role="region" aria-labelledby="hub-opt-listing">
              {busy && threads.length === 0 ? (
                <p className="py-6 text-center text-[14px] text-zinc-500">Loading…</p>
              ) : threads.length === 0 ? (
                <p className="py-6 text-center text-[14px] text-zinc-500">No listing chats yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {threads.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className="w-full rounded-2xl border border-zinc-200/90 bg-white p-3 text-left shadow-sm active:bg-zinc-50"
                        onClick={() => {
                          setThreadKind('listing')
                          setActiveThread(t)
                          setScreen('thread')
                        }}
                      >
                        <p className="line-clamp-2 text-[14px] font-semibold text-zinc-900">
                          {t.lastMessagePreview || 'Listing chat'}
                        </p>
                        <p className="mt-1 text-[12px] text-zinc-500">
                          {t.unreadCount > 0 ? `${t.unreadCount} unread · ` : ''}
                          Marketplace
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {expandedHub === 'support' ? (
            <div className="space-y-2" role="region" aria-labelledby="hub-opt-support">
              <button
                type="button"
                disabled={busy}
                className="w-full rounded-2xl border border-violet-200 bg-violet-50 p-3 text-left shadow-sm active:bg-violet-100/80 disabled:opacity-50"
                onClick={() => void openOrCreateSupport()}
              >
                <p className="text-[15px] font-bold text-violet-900">New support conversation</p>
                <p className="text-[12px] text-violet-700/90">Start or reopen your support thread</p>
              </button>
              {busy && threads.length === 0 ? (
                <p className="py-4 text-center text-[14px] text-zinc-500">Loading…</p>
              ) : threads.length === 0 ? (
                <p className="py-4 text-center text-[14px] text-zinc-500">No support threads yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {threads.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className="w-full rounded-2xl border border-zinc-200/90 bg-white p-3 text-left shadow-sm active:bg-zinc-50"
                        onClick={() => {
                          setThreadKind('support')
                          setActiveThread(t)
                          setScreen('thread')
                        }}
                      >
                        <p className="line-clamp-2 text-[14px] font-semibold text-zinc-900">
                          {t.lastMessagePreview || 'Support'}
                        </p>
                        <p className="mt-1 text-[12px] text-zinc-500">
                          {t.unreadCount > 0 ? `${t.unreadCount} unread · ` : ''}
                          Live support
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {bottomNav ? (
        <div className="fetch-home-marketplace-shell-footer shrink-0 pb-[env(safe-area-inset-bottom,0px)]">
          {bottomNav}
        </div>
      ) : null}
    </div>
  )
}

export const HomeShellChatHubPage = memo(HomeShellChatHubPageInner)
