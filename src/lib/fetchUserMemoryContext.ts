import { loadSavedAddresses } from './savedAddresses'
import { loadSession } from './fetchUserSession'

const MAX_LEN = 1100

/**
 * Compact block for Fetch AI chat system context (saved addresses + profile).
 */
export function buildFetchUserMemoryContext(): string {
  const u = loadSession()
  if (!u) return ''

  const addrs = loadSavedAddresses()
  const lines = addrs.map((a) => {
    const n = a.notes?.trim()
    return `• ${a.label}: ${a.address}${n ? ` — ${n}` : ''}`
  })

  const parts = [
    `User is signed in as ${u.displayName} (${u.email}).`,
    u.phone ? `Phone on file: ${u.phone}.` : null,
    addrs.length ? `Saved addresses (prefer these when the user asks for home/work or a quick pickup—always confirm before booking):\n${lines.join('\n')}` : 'No saved addresses yet.',
  ].filter(Boolean)

  const block = parts.join('\n')
  return block.length > MAX_LEN ? `${block.slice(0, MAX_LEN)}…` : block
}
