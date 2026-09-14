import { describe, expect, it } from 'vitest'

import { buildAuditReport, reportHeadline } from '../AuditBuilder'

function vuln(overrides = {}) {
  return {
    id: 'GHSA-1',
    severity: 'HIGH',
    cve: null,
    advisory_url: 'https://osv.dev/vulnerability/GHSA-1',
    affects_latest_version: true,
    ...overrides,
  }
}

function pkg(name, version) {
  return { name, version }
}

describe('buildAuditReport', () => {
  it('produces one row per package with no known advisories', () => {
    const report = buildAuditReport(
      [pkg('lodash', '4.17.19')],
      [{ vulnerabilities: [] }]
    )
    expect(report.rows).toEqual([
      {
        name: 'lodash',
        version: '4.17.19',
        severity: 'ok',
        advisory: 'no known advisories',
        advisoryUrl: null,
        patchedVersion: null,
        rank: 0,
      },
    ])
    expect(report.vulnerableCount).toBe(0)
  })

  it('produces one row per matching advisory for a vulnerable package', () => {
    const report = buildAuditReport(
      [pkg('lodash', '4.17.19')],
      [
        {
          vulnerabilities: [
            vuln({ id: 'GHSA-a', severity: 'LOW' }),
            vuln({ id: 'GHSA-b', severity: 'CRITICAL' }),
          ],
        },
      ]
    )
    // Sorted by severity rank descending within the package.
    expect(report.rows.map((r) => r.advisory)).toEqual(['GHSA-b', 'GHSA-a'])
    expect(report.vulnerableCount).toBe(1)
  })

  it('carries the patched version through, falling back to null', () => {
    const report = buildAuditReport(
      [pkg('lodash', '4.17.19')],
      [
        {
          vulnerabilities: [
            vuln({ fixed_version: '4.17.21' }),
            vuln({ id: 'GHSA-c' }),
          ],
        },
      ]
    )
    expect(report.rows[0].patchedVersion).toBe('4.17.21')
    expect(report.rows[1].patchedVersion).toBeNull()
  })

  it('marks a failed lookup distinctly instead of treating it as clean', () => {
    const report = buildAuditReport(
      [pkg('lodash', '4.17.19')],
      [{ error: true }]
    )
    expect(report.rows[0]).toMatchObject({ severity: 'unknown', rank: -1 })
    expect(report.vulnerableCount).toBe(0)
  })

  it('sorts rows by severity rank, then by package name', () => {
    const report = buildAuditReport(
      [pkg('zeta', '1.0.0'), pkg('alpha', '1.0.0')],
      [
        { vulnerabilities: [vuln({ severity: 'HIGH' })] },
        { vulnerabilities: [vuln({ severity: 'HIGH' })] },
      ]
    )
    expect(report.rows.map((r) => r.name)).toEqual(['alpha', 'zeta'])
  })

  it('treats two installed versions of one package as separate packages', () => {
    // One tree can install qs twice. Each version gets its own rows, and each
    // vulnerable version counts toward "packages need attention".
    const report = buildAuditReport(
      [pkg('qs', '6.9.7'), pkg('qs', '6.10.3')],
      [
        { vulnerabilities: [vuln({ id: 'GHSA-old', severity: 'HIGH' })] },
        { vulnerabilities: [vuln({ id: 'GHSA-new', severity: 'HIGH' })] },
      ]
    )
    expect(report.rows.map((r) => `${r.name}@${r.version}`)).toEqual([
      'qs@6.10.3',
      'qs@6.9.7',
    ])
    expect(report.scannedCount).toBe(2)
    expect(report.vulnerableCount).toBe(2)
  })

  it('counts findings per severity across all packages', () => {
    const report = buildAuditReport(
      [pkg('a', '1.0.0'), pkg('b', '1.0.0')],
      [
        { vulnerabilities: [vuln({ severity: 'CRITICAL' })] },
        {
          vulnerabilities: [
            vuln({ severity: 'CRITICAL' }),
            vuln({ severity: 'LOW' }),
          ],
        },
      ]
    )
    const bySeverity = Object.fromEntries(
      report.counts.map((c) => [c.severity, c.count])
    )
    expect(bySeverity).toEqual({ critical: 2, high: 0, moderate: 0, low: 1 })
  })
})

describe('reportHeadline', () => {
  it('reports a clean scan', () => {
    expect(reportHeadline({ vulnerableCount: 0, counts: [] })).toBe(
      'Nothing known-vulnerable.'
    )
  })

  it('singularizes for exactly one affected package', () => {
    expect(
      reportHeadline({
        vulnerableCount: 1,
        counts: [{ severity: 'high', count: 1 }],
      })
    ).toBe('1 package needs attention, 1 high.')
  })

  it('omits the severity note for moderate/low-only findings', () => {
    expect(
      reportHeadline({
        vulnerableCount: 2,
        counts: [{ severity: 'moderate', count: 3 }],
      })
    ).toBe('2 packages need attention.')
  })
})
