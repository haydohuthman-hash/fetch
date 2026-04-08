import fs from 'node:fs/promises'
import path from 'node:path'

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export const SUPPORT_PARTICIPANT_KEY = 'support:fetch'

/**
 * File-backed peer DMs: listing buyer–seller threads and support inbox threads.
 * @param {string} filePath
 */
export function createPeerMessagesStore(filePath) {
  const resolved = path.resolve(filePath)

  async function readAll() {
    try {
      const raw = await fs.readFile(resolved, 'utf8')
      const p = JSON.parse(raw)
      return {
        threads: Array.isArray(p.threads) ? p.threads : [],
        messages: Array.isArray(p.messages) ? p.messages : [],
      }
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        return { threads: [], messages: [] }
      }
      throw e
    }
  }

  async function writeAll(data) {
    await fs.mkdir(path.dirname(resolved), { recursive: true })
    await fs.writeFile(resolved, JSON.stringify(data, null, 2), 'utf8')
  }

  function isParticipant(thread, key) {
    return Array.isArray(thread.participantKeys) && thread.participantKeys.includes(key)
  }

  function bumpUnread(thread, senderKey) {
    const map = { ...(thread.unreadByParticipant || {}) }
    for (const pk of thread.participantKeys || []) {
      if (pk === senderKey) continue
      map[pk] = (map[pk] ?? 0) + 1
    }
    return map
  }

  return {
    async listThreadsForParticipant(participantKey, { kind } = {}) {
      if (!participantKey) return []
      const { threads } = await readAll()
      let rows = threads.filter((t) => isParticipant(t, participantKey))
      if (kind === 'listing' || kind === 'support') {
        rows = rows.filter((t) => t.kind === kind)
      }
      rows.sort((a, b) => (b.lastMessageAt ?? b.updatedAt ?? 0) - (a.lastMessageAt ?? a.updatedAt ?? 0))
      return rows
    },

    async unreadSummary(participantKey) {
      if (!participantKey) {
        return { listing: 0, support: 0, total: 0 }
      }
      const rows = await this.listThreadsForParticipant(participantKey)
      let listing = 0
      let support = 0
      for (const t of rows) {
        const n = t.unreadByParticipant?.[participantKey] ?? 0
        if (n <= 0) continue
        if (t.kind === 'listing') listing += n
        else if (t.kind === 'support') support += n
      }
      return { listing, support, total: listing + support }
    },

    /**
     * One thread per (listingId, buyerKey). sellerKey from listing owner.
     */
    async getOrCreateListingThread({ listingId, buyerKey, sellerKey }) {
      if (!listingId || !buyerKey || !sellerKey) return { error: 'bad_request' }
      if (buyerKey === sellerKey) return { error: 'cannot_message_self' }
      const data = await readAll()
      const existing = data.threads.find(
        (t) => t.kind === 'listing' && t.listingId === listingId && t.buyerKey === buyerKey,
      )
      if (existing) return { thread: existing, created: false }

      const now = Date.now()
      const thread = {
        id: makeId('thr'),
        kind: 'listing',
        listingId,
        buyerKey,
        sellerKey,
        participantKeys: [buyerKey, sellerKey].sort(),
        createdAt: now,
        updatedAt: now,
        lastMessagePreview: '',
        lastMessageAt: 0,
        unreadByParticipant: { [buyerKey]: 0, [sellerKey]: 0 },
      }
      data.threads.unshift(thread)
      await writeAll(data)
      return { thread, created: true }
    },

    /** One open support thread per buyer (MVP). */
    async getOrCreateSupportThread(buyerKey) {
      if (!buyerKey) return { error: 'bad_request' }
      const keys = [buyerKey, SUPPORT_PARTICIPANT_KEY].sort()
      const data = await readAll()
      const existing = data.threads.find((t) => t.kind === 'support' && t.buyerKey === buyerKey)
      if (existing) return { thread: existing, created: false }

      const now = Date.now()
      const thread = {
        id: makeId('thr'),
        kind: 'support',
        listingId: null,
        buyerKey,
        sellerKey: null,
        participantKeys: keys,
        createdAt: now,
        updatedAt: now,
        lastMessagePreview: '',
        lastMessageAt: 0,
        unreadByParticipant: { [buyerKey]: 0, [SUPPORT_PARTICIPANT_KEY]: 0 },
      }
      data.threads.unshift(thread)
      const welcome = {
        id: makeId('msg'),
        threadId: thread.id,
        senderKey: SUPPORT_PARTICIPANT_KEY,
        body: 'Hi — this is Fetch support. Reply here any time; we will get back to you.',
        createdAt: now,
        messageType: 'system',
      }
      data.messages.push(welcome)
      thread.lastMessagePreview = welcome.body.slice(0, 160)
      thread.lastMessageAt = now
      thread.updatedAt = now
      thread.unreadByParticipant = bumpUnread(thread, SUPPORT_PARTICIPANT_KEY)
      await writeAll(data)
      return { thread, created: true }
    },

    async getThread(threadId, participantKey) {
      if (!threadId || !participantKey) return null
      const { threads } = await readAll()
      const t = threads.find((x) => x.id === threadId) ?? null
      if (!t || !isParticipant(t, participantKey)) return null
      return t
    },

    async recentMessages(threadId, participantKey, limit = 80) {
      const t = await this.getThread(threadId, participantKey)
      if (!t) return null
      const { messages } = await readAll()
      const rows = messages
        .filter((m) => m.threadId === threadId)
        .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      return rows.slice(-Math.max(1, Math.min(200, limit)))
    },

    /** Older page: optional `cursor` = message id; returns up to `limit` messages strictly before that message, oldest first. */
    async listMessagesPage(threadId, participantKey, { cursor, limit = 40 } = {}) {
      const t = await this.getThread(threadId, participantKey)
      if (!t) return null
      const lim = Math.max(1, Math.min(100, Math.floor(Number(limit) || 40)))
      const { messages } = await readAll()
      let rows = messages
        .filter((m) => m.threadId === threadId)
        .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      if (cursor && typeof cursor === 'string') {
        const pivot = rows.find((m) => m.id === cursor)
        if (pivot) {
          rows = rows.filter((m) => (m.createdAt ?? 0) < (pivot.createdAt ?? 0))
        }
      }
      const slice = rows.length > lim ? rows.slice(rows.length - lim) : rows
      const nextCursor = rows.length > lim ? slice[0]?.id ?? null : null
      return { messages: slice, nextCursor }
    },

    async appendMessage(threadId, senderKey, { text, messageType = 'user' }) {
      const body = String(text ?? '').trim()
      if (!body) return { error: 'empty_message' }
      const data = await readAll()
      const idx = data.threads.findIndex((x) => x.id === threadId)
      if (idx < 0) return { error: 'thread_not_found' }
      const thread = data.threads[idx]
      if (!isParticipant(thread, senderKey)) return { error: 'forbidden' }
      const now = Date.now()
      const msg = {
        id: makeId('msg'),
        threadId,
        senderKey,
        body: body.slice(0, 8000),
        createdAt: now,
        messageType: messageType === 'system' ? 'system' : 'user',
      }
      data.messages.push(msg)
      const nextThread = {
        ...thread,
        updatedAt: now,
        lastMessagePreview: msg.body.slice(0, 160),
        lastMessageAt: now,
        unreadByParticipant: bumpUnread(thread, senderKey),
      }
      data.threads[idx] = nextThread
      await writeAll(data)
      return { message: msg, thread: nextThread }
    },

    async markRead(threadId, readerKey) {
      if (!threadId || !readerKey) return { error: 'bad_request' }
      const data = await readAll()
      const idx = data.threads.findIndex((x) => x.id === threadId)
      if (idx < 0) return { error: 'thread_not_found' }
      const thread = data.threads[idx]
      if (!isParticipant(thread, readerKey)) return { error: 'forbidden' }
      const unreadByParticipant = { ...(thread.unreadByParticipant || {}) }
      unreadByParticipant[readerKey] = 0
      data.threads[idx] = { ...thread, unreadByParticipant, updatedAt: Date.now() }
      await writeAll(data)
      return { ok: true, thread: data.threads[idx] }
    },
  }
}
