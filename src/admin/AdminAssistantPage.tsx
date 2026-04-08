import { useCallback, useEffect, useRef, useState } from 'react'
import { postAdminAiChat, type AdminAiMessage } from '../lib/adminAiApi'
import { AdminUnlockPanel, useAdminAuth } from './AdminAuthContext'

export function AdminAssistantPage() {
  const { adminKey, unlocked } = useAdminAuth()
  const [messages, setMessages] = useState<AdminAiMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const send = useCallback(async () => {
    const k = adminKey.trim()
    const text = input.trim()
    if (!k || !text || busy) return
    setBusy(true)
    setError(null)
    setInput('')
    let next: AdminAiMessage[] = []
    setMessages((prev) => {
      next = [...prev, { role: 'user', content: text }]
      return next
    })
    try {
      const { message } = await postAdminAiChat(k, next)
      setMessages((m) => [...m, message])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat failed')
      setMessages((m) => m.slice(0, -1))
      setInput(text)
    } finally {
      setBusy(false)
    }
  }, [adminKey, input, busy])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  if (!unlocked) {
    return (
      <AdminUnlockPanel
        title="AI assistant"
        description="Ask about catalog, categories, and sales. Unlock with your store admin key (shared with the rest of this admin app)."
      />
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4" style={{ minHeight: 'min(70dvh, 640px)' }}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI assistant</h1>
        <p className="text-[14px] text-zinc-600">
          Context refreshes each message with a compact store snapshot (no customer PII).
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50/80 p-3">
        {messages.length === 0 ? (
          <p className="text-[14px] text-zinc-500">Try: “Summarize top categories by active product count.”</p>
        ) : null}
        {messages.map((m, i) => (
          <div
            key={`${i}-${m.role}`}
            className={`max-w-[95%] rounded-xl px-3 py-2 text-[14px] leading-relaxed ${
              m.role === 'user' ? 'ml-auto bg-zinc-900 text-white' : 'mr-auto border border-zinc-200 bg-white text-zinc-900'
            }`}
          >
            {m.content}
          </div>
        ))}
        {busy ? <p className="text-[13px] text-zinc-500">Thinking…</p> : null}
        <div ref={bottomRef} />
      </div>
      {error ? <p className="text-[14px] text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[15px]"
          placeholder="Message…"
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button
          type="button"
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-xl bg-violet-600 px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-40"
          onClick={() => void send()}
        >
          Send
        </button>
      </div>
    </div>
  )
}
