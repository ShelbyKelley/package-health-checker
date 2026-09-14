import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import AuditReport from '../AuditReport'

// The export builders themselves are covered in AuditExports.test.js. What
// this file checks is the wiring: that each button calls its own exporter,
// and that exports always cover the full findings set rather than whatever
// the filter pills happen to be showing.
vi.mock('../AuditExports', () => ({
  exportReportAsJson: vi.fn(),
  exportReportAsCsv: vi.fn(),
  exportReportAsMarkdown: vi.fn(),
}))

const { exportReportAsCsv, exportReportAsJson, exportReportAsMarkdown } =
  await import('../AuditExports')

function report() {
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
        advisory: 'GHSA-1',
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

describe('export buttons', () => {
  it.each([
    ['json', () => exportReportAsJson],
    ['csv', () => exportReportAsCsv],
    ['markdown', () => exportReportAsMarkdown],
  ])(
    'the %s button calls its own exporter with the report',
    async (label, getExporter) => {
      vi.clearAllMocks()
      const data = report()
      render(<AuditReport report={data} />)

      await userEvent.setup().click(screen.getByRole('button', { name: label }))

      expect(getExporter()).toHaveBeenCalledWith(data)
      expect(getExporter()).toHaveBeenCalledTimes(1)
    }
  )

  it('exports the full report even while the view is filtered down', async () => {
    vi.clearAllMocks()
    const data = report()
    render(<AuditReport report={data} />)
    const user = userEvent.setup()

    // Narrow the visible table to a severity that matches nothing.
    await user.click(screen.getByRole('button', { name: 'critical' }))
    expect(screen.queryByText('GHSA-1')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'json' }))

    // Still the whole report object, not the filtered rows.
    expect(exportReportAsJson).toHaveBeenCalledWith(data)
  })
})

describe('filters', () => {
  it('hides clean rows by default and reveals them when toggled off', async () => {
    render(<AuditReport report={report()} />)
    const user = userEvent.setup()

    const toggle = screen.getByRole('button', { name: 'vulnerable only' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('no known advisories')).not.toBeInTheDocument()

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('no known advisories')).toBeInTheDocument()
  })

  it('shows the patched version, and a dash when there is none', async () => {
    render(<AuditReport report={report()} />)
    const user = userEvent.setup()

    expect(screen.getByText('4.17.21')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'vulnerable only' }))
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
