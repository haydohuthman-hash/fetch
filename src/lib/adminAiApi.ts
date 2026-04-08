import { getFetchApiBaseUrl } from './fetchApiBase'

export type AdminAiMessage = { role: 'user' | 'assistant'; content: string }

export async function postAdminAiChat(
  adminKey: string,
  messages: AdminAiMessage[],
): Promise<{ message: AdminAiMessage; llmMs?: number }> {
  const response = await fetch(`${getFetchApiBaseUrl()}/api/store/admin/ai/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Fetch-Store-Admin-Key': adminKey.trim(),
    },
    body: JSON.stringify({ messages }),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    message?: AdminAiMessage
    llmMs?: number
    error?: string
    detail?: string
  }
  if (!response.ok) {
    const error = typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`
    const detail = typeof payload.detail === 'string' ? `: ${payload.detail}` : ''
    throw new Error(`${error}${detail}`)
  }
  if (!payload.message || typeof payload.message.content !== 'string') {
    throw new Error('assistant_message_missing')
  }
  return { message: payload.message, llmMs: payload.llmMs }
}
