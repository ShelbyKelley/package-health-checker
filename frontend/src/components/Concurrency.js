// The backend runs on a Lambda account capped at 10 concurrent executions,
// behind a throttled API Gateway. A real lockfile easily lists hundreds of
// packages, so firing every lookup at once would get most of them throttled.
// Staying well under 10 also leaves headroom for other people using the API.
export const AUDIT_CONCURRENCY = 6

// Maps `items` through async `fn` with at most `limit` calls in flight, and
// resolves to results in the same order as `items` regardless of which call
// finishes first. `fn` is expected to handle its own errors (the audit's
// lookup resolves failures to `{ error: true }` rather than rejecting), so
// one failed item never cancels the rest.
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index], index)
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workerCount }, worker))
  return results
}
