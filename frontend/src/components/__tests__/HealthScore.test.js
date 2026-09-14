import { describe, expect, it } from 'vitest'

import {
  computeHealthScore,
  gradeColorClass,
  gradeForScore,
} from '../HealthScore'

function baseResult(overrides = {}) {
  return {
    vulnerabilities: [],
    deprecated: false,
    maintainers_count: 5,
    last_publish_date: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('computeHealthScore', () => {
  it('scores a clean, healthy package at 100', () => {
    expect(computeHealthScore(baseResult())).toBe(100)
  })

  it('only penalizes vulnerabilities that still affect the latest version', () => {
    const result = baseResult({
      vulnerabilities: [
        { severity: 'CRITICAL', affects_latest_version: false },
        { severity: 'HIGH', affects_latest_version: true },
      ],
    })
    expect(computeHealthScore(result)).toBe(100 - 18)
  })

  it('penalizes a deprecated package', () => {
    expect(computeHealthScore(baseResult({ deprecated: true }))).toBe(80)
  })

  it('penalizes fewer than 2 maintainers, but not unknown maintainer counts', () => {
    expect(computeHealthScore(baseResult({ maintainers_count: 1 }))).toBe(92)
    expect(computeHealthScore(baseResult({ maintainers_count: null }))).toBe(
      100
    )
  })

  it('penalizes a stale last-publish year', () => {
    expect(
      computeHealthScore(baseResult({ last_publish_date: '2020-01-01' }))
    ).toBe(88)
  })

  it('clamps to a minimum of 4', () => {
    const result = baseResult({
      deprecated: true,
      maintainers_count: 1,
      last_publish_date: '2020-01-01',
      vulnerabilities: [
        { severity: 'CRITICAL', affects_latest_version: true },
        { severity: 'CRITICAL', affects_latest_version: true },
        { severity: 'CRITICAL', affects_latest_version: true },
        { severity: 'CRITICAL', affects_latest_version: true },
      ],
    })
    expect(computeHealthScore(result)).toBe(4)
  })
})

describe('gradeForScore', () => {
  it.each([
    [100, 'A'],
    [85, 'A'],
    [84, 'B'],
    [70, 'B'],
    [69, 'C'],
    [55, 'C'],
    [54, 'D'],
    [40, 'D'],
    [39, 'F'],
    [4, 'F'],
  ])('scores %i as grade %s', (score, grade) => {
    expect(gradeForScore(score)).toBe(grade)
  })
})

describe('gradeColorClass', () => {
  it('uses the safe color at or above 70', () => {
    expect(gradeColorClass(70)).toBe('text-status-safe')
  })

  it('uses the moderate color between 40 and 69', () => {
    expect(gradeColorClass(40)).toBe('text-severity-moderate')
  })

  it('uses the critical color below 40', () => {
    expect(gradeColorClass(39)).toBe('text-severity-critical')
  })
})
