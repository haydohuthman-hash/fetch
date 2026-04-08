import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { AdminAuthProvider, useAdminAuth } from './AdminAuthContext'

const nav = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/products', label: 'Products', end: false },
  { to: '/admin/categories', label: 'Categories', end: false },
  { to: '/admin/assistant', label: 'AI', end: false },
  { to: '/admin/orders', label: 'Orders', end: false },
  { to: '/admin/settings', label: 'Settings', end: false },
]

function AdminLayoutShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { unlocked, lockAdmin } = useAdminAuth()

  return (
    <div className="flex min-h-dvh bg-zinc-50 text-zinc-900">
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-zinc-200 bg-white shadow-lg transition-transform lg:static lg:translate-x-0 lg:shadow-none',
          drawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        <div className="flex h-14 shrink-0 items-center border-b border-zinc-200 px-4">
          <span className="text-[15px] font-bold tracking-tight">Fetch Admin</span>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) =>
                [
                  'rounded-lg px-3 py-2.5 text-[14px] font-semibold transition-colors',
                  isActive ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {unlocked ? (
          <div className="mt-auto border-t border-zinc-200 p-2">
            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-zinc-600 hover:bg-zinc-100"
              onClick={() => lockAdmin()}
            >
              Sign out key
            </button>
          </div>
        ) : null}
      </aside>
      {drawerOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-zinc-200 bg-white/95 px-3 backdrop-blur-md">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-800 lg:hidden"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <span className="text-[14px] font-semibold text-zinc-500 lg:hidden">Menu</span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export function AdminLayout() {
  return (
    <AdminAuthProvider>
      <AdminLayoutShell />
    </AdminAuthProvider>
  )
}
