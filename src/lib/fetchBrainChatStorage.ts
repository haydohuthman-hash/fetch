import type { FetchAiChatMessage, FetchAiChatRole } from './fetchAiChat'
import type { BrainChatBubbleUi, BrainChatCatalogLine } from './fetchBrainAccountSnapshot'

export const BRAIN_CHAT_STORAGE_KEY = 'fetch.brainChat.v1'
const MAX_MESSAGES = 30

export type BrainChatStoredLine = {
  id: string
  role: FetchAiChatRole
  content: string
  at: number
  ui?: BrainChatBubbleUi
  /** `blob:` URLs are kept in memory only — stripped before localStorage. */
  attachmentUrl?: string
}

export type { BrainChatBubbleUi } from './fetchBrainAccountSnapshot'

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function safeParse(raw: string | null): BrainChatStoredLine[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    return v.filter((row): row is BrainChatStoredLine => {
      if (
        !row ||
        typeof row !== 'object' ||
        typeof (row as BrainChatStoredLine).id !== 'string' ||
        ((row as BrainChatStoredLine).role !== 'user' &&
          (row as BrainChatStoredLine).role !== 'assistant') ||
        typeof (row as BrainChatStoredLine).content !== 'string' ||
        typeof (row as BrainChatStoredLine).at !== 'number'
      ) {
        return false
      }
      const attEarly = (row as BrainChatStoredLine).attachmentUrl
      if (attEarly != null && typeof attEarly !== 'string') return false
      const ui = (row as BrainChatStoredLine).ui
      if (ui == null) return true
      if (typeof ui !== 'object' || typeof (ui as { kind?: unknown }).kind !== 'string') {
        return false
      }
      const k = (ui as { kind: string }).kind
      if (k === 'scanning') return true
      if (k === 'address_confirm') {
        const o = ui as { pickup?: unknown; dropoff?: unknown }
        const ok = (x: unknown) => x == null || typeof x === 'string'
        return ok(o.pickup) && ok(o.dropoff)
      }
      if (k === 'price_preview') {
        const o = ui as Record<string, unknown>
        if (typeof o.rangeLabel === 'string') return true
        if (
          typeof o.headline === 'string' &&
          typeof o.totalAud === 'number' &&
          typeof o.depositAud === 'number' &&
          Array.isArray(o.summaryLines) &&
          (o.summaryLines as unknown[]).every((x) => typeof x === 'string') &&
          typeof o.payCtaLabel === 'string'
        ) {
          return true
        }
        return false
      }
      return false
    })
    .map((row) => {
      const att = (row as BrainChatStoredLine).attachmentUrl
      if (typeof att === 'string' && att.length > 0 && !att.startsWith('blob:')) {
        return { ...row, attachmentUrl: att.slice(0, 2000) }
      }
      const { attachmentUrl, ...rest } = row as BrainChatStoredLine
      void attachmentUrl
      return rest
    })
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
  const forDisk = capped.map((l) => {
    if (l.attachmentUrl?.startsWith('blob:')) {
      const { attachmentUrl, ...rest } = l
      void attachmentUrl
      return rest
    }
    return l
  })
  try {
    window.localStorage.setItem(BRAIN_CHAT_STORAGE_KEY, JSON.stringify(forDisk))
  } catch {
    /* ignore */
  }
}

export function revokeBrainChatLineBlobs(lines: readonly BrainChatStoredLine[]) {
  for (const l of lines) {
    const u = l.attachmentUrl
    if (u?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(u)
      } catch {
        /* ignore */
      }
    }
  }
}

export function brainLinesToApiMessages(lines: BrainChatStoredLine[]): FetchAiChatMessage[] {
  return lines.map(({ role, content, attachmentUrl }) => ({
    role,
    content: attachmentUrl
      ? `${content}\n[Thread: user attached a photo in-chat; use latest photo scan summary in server context when present.]`
      : content,
  }))
}

export function brainStoredToCatalogLine(l: BrainChatStoredLine): BrainChatCatalogLine {
  return {
    id: l.id,
    role: l.role,
    text: l.content,
    sortAt: l.at,
    ...(l.ui ? { ui: l.ui } : {}),
    ...(l.attachmentUrl ? { attachmentUrl: l.attachmentUrl } : {}),
  }
}

/** Assistant-only line persisted to local thread (e.g. address card, scan result). */
export function appendBrainAssistantLinePersisted(
  prior: BrainChatStoredLine[],
  content: string,
  ui?: BrainChatBubbleUi,
): BrainChatStoredLine[] {
  const at = Date.now()
  const next: BrainChatStoredLine[] = [
    ...prior,
    { id: genId('ba'), role: 'assistant' as const, content, at, ...(ui ? { ui } : {}) },
  ].slice(-MAX_MESSAGES)
  saveBrainChatLines(next)
  return next
}

/** Drop transient scanning bubbles (e.g. before replacing with result text). */
export function removeBrainScanningBubbles(prior: BrainChatStoredLine[]): BrainChatStoredLine[] {
  const next = prior.filter((l) => l.ui?.kind !== 'scanning')
  if (next.length === prior.length) return prior
  saveBrainChatLines(next)
  return next
}

/** User photo bubble — persists text; `blob:` preview URL is session-only (stripped on disk). */
export function appendBrainUserPhotoMessage(
  prior: BrainChatStoredLine[],
  content: string,
  attachmentUrl: string,
): BrainChatStoredLine[] {
  const at = Date.now()
  const next: BrainChatStoredLine[] = [
    ...prior,
    { id: genId('bu'), role: 'user' as const, content, at, attachmentUrl },
  ].slice(-MAX_MESSAGES)
  saveBrainChatLines(next)
  return next
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
