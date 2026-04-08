import { useLocation } from 'react-router-dom'
import { AdminUnlockPanel, useAdminAuth } from './AdminAuthContext'

export function AdminPlaceholderPage() {
  const { pathname } = useLocation()
  const { unlocked } = useAdminAuth()
  const title = pathname.split('/').pop() || 'Page'

  if (!unlocked) {
    return (
      <AdminUnlockPanel
        title={title.charAt(0).toUpperCase() + title.slice(1)}
        description="Unlock once with your store admin key to use all admin pages in this session."
      />
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-2">
      <h1 className="text-xl font-bold capitalize tracking-tight">{title}</h1>
      <p className="text-[14px] text-zinc-600">Coming soon.</p>
    </div>
  )
}
