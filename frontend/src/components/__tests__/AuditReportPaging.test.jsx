import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AuditReport from '../AuditReport'

// Unlike AuditReport.test.jsx, the exporters here are the real ones, so these
// tests can read what was actually downloaded rather than trusting wiring.

const FINDINGS = 25 // 3 pages at 10 per page

function finding(i, severity = 'high') {
  const id = `GHSA-${String(i).padStart(3, '0')}`
  return {
    name: `pkg-${i}`,
    version: '1.0.0',
    severity,
    advisory: id,
    advisoryUrl: `https://osv.dev/vulnerability/${id}`,
    patchedVersion: '1.0.1',
    rank: severity === 'critical' ? 4 : 3,
  }
}

function report() {
  const rows = Array.from({ length: FINDINGS }, (_, i) =>
    finding(i, i < 5 ? 'critical' : 'high')
  )
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    scannedCount: FINDINGS,
    vulnerableCount: FINDINGS,
    counts: [
      { severity: 'critical', count: 5 },
      { severity: 'high', count: 20 },
      { severity: 'moderate', count: 0 },
      { severity: 'low', count: 0 },
    ],
    rows,
  }
}

const visibleIds = () =>
  screen.queryAllByText(/^GHSA-\d{3}$/).map((el) => el.textContent)

let downloaded
beforeEach(() => {
  downloaded = null
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn((blob) => {
      downloaded = blob
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

describe('paging the findings table', () => {
  it('shows 10 findings per page and pages through the rest', async () => {
    render(<AuditReport report={report()} />)
    const user = userEvent.setup()

    expect(visibleIds()).toHaveLength(10)
    expect(visibleIds()[0]).toBe('GHSA-000')
    expect(screen.getByText('page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'prev' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'next' }))
    expect(visibleIds()).toHaveLength(10)
    expect(visibleIds()[0]).toBe('GHSA-010')

    await user.click(screen.getByRole('button', { name: 'next' }))
    expect(visibleIds()).toHaveLength(5)
    expect(visibleIds().at(-1)).toBe('GHSA-024')
    expect(screen.getByText('page 3 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'next' })).toBeDisabled()
  })

  it('returns to page one when a filter changes', async () => {
    render(<AuditReport report={report()} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'next' }))
    await user.click(screen.getByRole('button', { name: 'next' }))
    expect(screen.getByText('page 3 of 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'high' }))

    // 20 high findings is two pages, and the reader starts from the first.
    expect(screen.getByText('page 1 of 2')).toBeInTheDocument()
    expect(visibleIds()[0]).toBe('GHSA-005')
  })

  it('hides the pager when every finding fits on one page', async () => {
    render(<AuditReport report={report()} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'critical' }))

    expect(visibleIds()).toHaveLength(5)
    expect(
      screen.queryByRole('navigation', { name: /finding pages/i })
    ).not.toBeInTheDocument()
  })
})

describe('exporting from a later page', () => {
  // Move to the last page and narrow the filter first, so the screen shows
  // only a handful of findings when the export button is pressed.
  async function onLastPageFiltered(user) {
    await user.click(screen.getByRole('button', { name: 'next' }))
    await user.click(screen.getByRole('button', { name: 'high' }))
    await user.click(screen.getByRole('button', { name: 'next' }))
    expect(screen.getByText('page 2 of 2')).toBeInTheDocument()
    expect(visibleIds()).toHaveLength(10)
  }

  it('JSON contains every finding, not just the visible page', async () => {
    render(<AuditReport report={report()} />)
    const user = userEvent.setup()
    await onLastPageFiltered(user)

    await user.click(screen.getByRole('button', { name: 'json' }))

    const body = JSON.parse(await downloaded.text())
    expect(body.findings).toHaveLength(FINDINGS)
    expect(body.findings.map((f) => f.advisory)).toContain('GHSA-000')
    expect(body.findings.map((f) => f.advisory)).toContain('GHSA-024')
  })

  it('CSV contains every finding, not just the visible page', async () => {
    render(<AuditReport report={report()} />)
    const user = userEvent.setup()
    await onLastPageFiltered(user)

    await user.click(screen.getByRole('button', { name: 'csv' }))

    const lines = (await downloaded.text()).trim().split('\n')
    expect(lines).toHaveLength(FINDINGS + 1) // plus the header row
  })

  it('Markdown contains every finding, not just the visible page', async () => {
    render(<AuditReport report={report()} />)
    const user = userEvent.setup()
    await onLastPageFiltered(user)

    await user.click(screen.getByRole('button', { name: 'markdown' }))

    const text = await downloaded.text()
    const findingRows = text.split('\n').filter((l) => l.startsWith('| `pkg-'))
    expect(findingRows).toHaveLength(FINDINGS)
  })
})
