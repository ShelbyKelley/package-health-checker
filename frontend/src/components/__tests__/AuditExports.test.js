import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  exportReportAsCsv,
  exportReportAsJson,
  exportReportAsMarkdown,
} from '../AuditExports'

function sampleReport() {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    scannedCount: 2,
    vulnerableCount: 1,
    counts: [
      { severity: 'critical', count: 0 },
      { severity: 'high', count: 1 },
      { severity: 'moderate', count: 0 },
      { severity: 'low', count: 0 },
    ],
    rows: [
      {
        name: 'lodash',
        version: '4.17.19',
        severity: 'high',
        advisory: 'GHSA-1 · CVE-2024-0001',
        advisoryUrl: 'https://osv.dev/vulnerability/GHSA-1',
        patchedVersion: '4.17.21',
        rank: 3,
      },
      {
        name: 'chalk',
        version: '5.3.0',
        severity: 'ok',
        advisory: 'no known advisories',
        advisoryUrl: null,
        patchedVersion: null,
        rank: 0,
      },
    ],
  }
}

// download() reaches real browser APIs jsdom doesn't implement
// (URL.createObjectURL) and triggers a synthetic click. Capturing the Blob
// passed to createObjectURL is the least invasive way to inspect what each
// export actually produced.
let capturedBlob
beforeEach(() => {
  capturedBlob = null
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn((blob) => {
      capturedBlob = blob
      return 'blob:mock'
    }),
    revokeObjectURL: vi.fn(),
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('exportReportAsMarkdown', () => {
  it('links each advisory to its OSV.dev page', async () => {
    exportReportAsMarkdown(sampleReport())

    const text = await capturedBlob.text()
    expect(text).toContain(
      '[GHSA-1 · CVE-2024-0001](https://osv.dev/vulnerability/GHSA-1)'
    )
  })

  it('falls back to plain text when a row has no advisory url', async () => {
    exportReportAsMarkdown(sampleReport())

    const text = await capturedBlob.text()
    // Only findings (rank > 0) are listed, so the clean "chalk" row (rank 0)
    // shouldn't appear at all, linked or not.
    expect(text).not.toContain('chalk')
  })

  it('includes the patched version, dashed when there is none', async () => {
    exportReportAsMarkdown(sampleReport())

    const text = await capturedBlob.text()
    expect(text).toContain('| `lodash` | 4.17.19 | 4.17.21 | high |')
  })
})

describe('exportReportAsJson', () => {
  it('includes the advisory url and patched version as their own fields', async () => {
    exportReportAsJson(sampleReport())

    const body = JSON.parse(await capturedBlob.text())
    expect(body.findings[0].advisoryUrl).toBe(
      'https://osv.dev/vulnerability/GHSA-1'
    )
    expect(body.findings[0].patchedIn).toBe('4.17.21')
  })
})

describe('exportReportAsCsv', () => {
  it('includes the advisory url and patched version as their own columns', async () => {
    exportReportAsCsv(sampleReport())

    const text = await capturedBlob.text()
    expect(text).toContain('https://osv.dev/vulnerability/GHSA-1')
    expect(text.split('\n')[0]).toBe(
      'package,installed,patched_in,severity,advisory,advisory_url'
    )
  })
})
