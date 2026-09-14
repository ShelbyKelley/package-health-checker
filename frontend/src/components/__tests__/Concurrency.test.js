import { describe, expect, it } from 'vitest'

import { AUDIT_CONCURRENCY, mapWithConcurrency } from '../Concurrency'

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('mapWithConcurrency', () => {
  it('never runs more than `limit` calls at once', async () => {
    let inFlight = 0
    let peak = 0

    await mapWithConcurrency(
      Array.from({ length: 50 }, (_, i) => i),
      4,
      async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await tick(1)
        inFlight--
      }
    )

    expect(peak).toBe(4)
  })

  it('returns results in input order even when calls finish out of order', async () => {
    // Earlier items take longer, so they finish last.
    const delays = [30, 20, 10, 0]

    const results = await mapWithConcurrency(delays, 4, async (ms, index) => {
      await tick(ms)
      return `item-${index}`
    })

    expect(results).toEqual(['item-0', 'item-1', 'item-2', 'item-3'])
  })

  it('processes every item exactly once', async () => {
    const seen = []

    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      seen.push(n)
    })

    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('handles a limit larger than the item count', async () => {
    const results = await mapWithConcurrency([1, 2], 10, async (n) => n * 2)
    expect(results).toEqual([2, 4])
  })

  it('handles an empty list', async () => {
    await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toEqual([])
  })
})

describe('AUDIT_CONCURRENCY', () => {
  it('stays under the Lambda account concurrency cap of 10', () => {
    // Raising this toward 10 would let one audit starve every other user of
    // the API, and past 10 guarantees throttled lookups.
    expect(AUDIT_CONCURRENCY).toBeGreaterThan(0)
    expect(AUDIT_CONCURRENCY).toBeLessThan(10)
  })
})
