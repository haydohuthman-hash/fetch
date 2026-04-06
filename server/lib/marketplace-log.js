/**
 * One JSON line per event for marketplace mutations (log aggregators).
 * @param {string} event
 * @param {Record<string, unknown>} fields
 */
export function marketplaceLog(event, fields = {}) {
  console.log(
    JSON.stringify({
      ts: Date.now(),
      svc: 'fetch-marketplace',
      event,
      ...fields,
    }),
  )
}
