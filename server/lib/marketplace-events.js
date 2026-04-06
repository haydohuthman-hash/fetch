/**
 * In-process bus: notify SSE clients after marketplace writes.
 */
export function createMarketplaceEventBus() {
  const listeners = new Set()
  return {
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    emit() {
      for (const fn of listeners) {
        try {
          fn()
        } catch {
          /* ignore */
        }
      }
    },
  }
}
