import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import HealthCard from '../HealthCard'

function result(overrides = {}) {
  return {
    name: 'examplepkg',
    description: 'a synthetic fixture',
    latest_version: '1.0.0',
    last_publish_date: '2026-01-01T00:00:00.000Z',
    latest_version_vulnerable: false,
    vulnerability_count: 0,
    license: 'MIT',
    maintainers_count: 3,
    dependency_count: 0,
    deprecated: false,
    weekly_downloads: 1000,
    vulnerabilities: [],
    ...overrides,
  }
}

// Reads the value rendered under a given signal-tile label.
function signalValue(label) {
  const tile = screen.getByText(label).parentElement
  return within(tile).getAllByText(/.+/)[1].textContent
}

describe('signal tiles', () => {
  it.each([
    [52_000_000, '52.0M'],
    [120_067_588, '120.1M'],
    [4200, '4.2K'],
    [1000, '1.0K'],
    [999, '999'],
    [0, '0'],
    [null, 'unknown'],
  ])('formats %s weekly downloads as %s', (downloads, expected) => {
    render(<HealthCard result={result({ weekly_downloads: downloads })} />)
    expect(signalValue('weekly installs')).toBe(expected)
  })

  it('shows total vulnerabilities rather than a maintainer count', () => {
    render(<HealthCard result={result({ vulnerability_count: 7 })} />)

    expect(signalValue('total vulnerabilities')).toBe('7')
    expect(screen.queryByText('maintainers')).not.toBeInTheDocument()
  })

  it('reports an unknown dependency count without crashing', () => {
    render(<HealthCard result={result({ dependency_count: null })} />)
    expect(signalValue('dependencies')).toBe('unknown')
  })

  it('distinguishes a deprecated package from an active one', () => {
    const { unmount } = render(<HealthCard result={result()} />)
    expect(signalValue('status')).toBe('active')
    unmount()

    render(<HealthCard result={result({ deprecated: true })} />)
    expect(signalValue('status')).toBe('deprecated')
  })
})

describe('grade summary', () => {
  it('grades a clean, healthy package an A and reports no open advisories', () => {
    render(<HealthCard result={result()} />)

    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText(/health score 100\/100/)).toBeInTheDocument()
    expect(screen.getByText(/0 open advisories/)).toBeInTheDocument()
  })

  it('counts only advisories still affecting the latest version as open', () => {
    render(
      <HealthCard
        result={result({
          vulnerability_count: 2,
          vulnerabilities: [
            { severity: 'CRITICAL', affects_latest_version: false },
            { severity: 'HIGH', affects_latest_version: true },
          ],
        })}
      />
    )

    expect(screen.getByText(/1 open advisory/)).toBeInTheDocument()
    // 100 - 18 (the one HIGH still affecting latest) = 82 → grade B.
    expect(screen.getByText(/health score 82\/100/)).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('announces the verdict in a live region, spelling out the bare grade letter', () => {
    render(<HealthCard result={result()} />)

    const status = screen.getByRole('status')
    // "A" alone is meaningless read aloud, so the hidden line names it.
    expect(status).toHaveTextContent(/examplepkg 1\.0\.0, grade A\./)
    // The visible lines still read as sentences, so they aren't duplicated.
    expect(status).toHaveTextContent(/health score 100\/100/)
  })

  it('omits the license from the meta line when the registry has none', () => {
    render(<HealthCard result={result({ license: null })} />)
    expect(screen.getByText(/latest 1\.0\.0/)).not.toHaveTextContent('·')
  })
})
