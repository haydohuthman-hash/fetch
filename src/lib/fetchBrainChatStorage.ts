import type { FetchAiChatMessage, FetchAiChatRole } from './fetchAiChat'

export const BRAIN_CHAT_STORAGE_KEY = 'fetch.brainChat.v1'
const MAX_MESSAGES = 30

export type BrainChatStoredLine = {
  id: string
  role: FetchAiChatRole
  content: string
  at: number
}

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function safeParse(raw: string | null): BrainChatStoredLine[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    return v.filter(
      (row): row is BrainChatStoredLine =>
        !!row &&
        typeof row === 'object' &&
        typeof (row as BrainChatStoredLine).id === 'string' &&
        ((row as BrainChatStoredLine).role === 'user' ||
          (row as BrainChatStoredLine).role === 'assistant') &&
        typeof (row as BrainChatStoredLine).content === 'string' &&
        typeof (row as BrainChatStoredLine).at === 'number',
    )
  } catch {
    return []
  }
}

export function loadBrainChatLines(): BrainChatStoredLine[] {
  try {
    return safeParse(window.localStorage.getItem(BRAIN_CHAT_STORAGE_KEY)).sort(
      (a, b) => a.at - b.at,
    )
  } catch {
    return []
  }
}

export function saveBrainChatLines(lines: BrainChatStoredLine[]) {
  const capped = lines.slice(-MAX_MESSAGES)
  try {
    window.localStorage.setItem(BRAIN_CHAT_STORAGE_KEY, JSON.stringify(capped))
  } catch {
    /* ignore */
  }
}

export function brainLinesToApiMessages(lines: BrainChatStoredLine[]): FetchAiChatMessage[] {
  return lines.map(({ role, content }) => ({ role, content }))
}

/** Append user + assistant lines, cap, persist. Call only after a successful assistant reply. */
export function persistBrainChatExchange(
  prior: BrainChatStoredLine[],
  userContent: string,
  assistantContent: string,
): BrainChatStoredLine[] {
  const at = Date.now()
  const next: BrainChatStoredLine[] = [
    ...prior,
    { id: genId('bu'), role: 'user' as const, content: userContent, at },
    { id: genId('ba'), role: 'assistant' as const, content: assistantContent, at: at + 1 },
  ].slice(-MAX_MESSAGES)
  saveBrainChatLines(next)
  return next
}

/** Keep a failed user attempt in memory only — no persist until assistant succeeds. */
export function appendBrainUserLineEphemeral(
  prior: BrainChatStoredLine[],
  userContent: string,
): BrainChatStoredLine[] {
  const at = Date.now()
  return [...prior, { id: genId('bu'), role: 'user' as const, content: userContent, at }].slice(
    -MAX_MESSAGES,
  )
}

export function removeLastBrainLineIfUser(lines: BrainChatStoredLine[]): BrainChatStoredLine[] {
  const last = lines[lines.length - 1]
  if (!last || last.role !== 'user') return lines
  return lines.slice(0, -1)
}
