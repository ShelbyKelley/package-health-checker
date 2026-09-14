import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import SearchTab from '../SearchTab'

function packageResponse(overrides = {}) {
  return {
    name: 'examplepkg',
    description: 'a synthetic fixture',
    latest_version: '1.0.0',
    last_publish_date: '2026-01-01T00:00:00.000Z',
    latest_version_vulnerable: true,
    vulnerability_count: 2,
    license: 'MIT',
    maintainers_count: 3,
    dependency_count: 0,
    deprecated: false,
    weekly_downloads: 1000,
    vulnerabilities: [
      {
        id: 'GHSA-high-0001',
        summary: 'still present in the latest release',
        severity: 'HIGH',
        cve: 'CVE-2099-00001',
        advisory_url: 'https://osv.dev/vulnerability/GHSA-high-0001',
        affects_latest_version: true,
      },
      {
        id: 'GHSA-low-0002',
        summary: 'fixed in a later release',
        severity: 'LOW',
        cve: null,
        advisory_url: 'https://osv.dev/vulnerability/GHSA-low-0002',
        affects_latest_version: false,
      },
    ],
    ...overrides,
  }
}

function mockFetch(response, { ok = true, status = 200 } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => response,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function search(term = 'examplepkg') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/package name/i), term)
  await user.click(screen.getByRole('button', { name: /^check$/i }))
  return user
}

describe('searching', () => {
  it('requests the exact package and renders the health card and advisories', async () => {
    const fetchMock = mockFetch(packageResponse())
    render(<SearchTab apiBaseUrl="https://api.test" />)
    await search()

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.test/package/examplepkg'
    )
    expect(await screen.findByText('examplepkg')).toBeInTheDocument()
    expect(screen.getByText(/health score/)).toBeInTheDocument()
    expect(screen.getByText('GHSA-high-0001')).toBeInTheDocument()
    expect(screen.getByText('GHSA-low-0002')).toBeInTheDocument()
  })

  it('shows total vulnerabilities instead of a maintainer count', async () => {
    mockFetch(packageResponse({ vulnerability_count: 2, maintainers_count: 7 }))
    render(<SearchTab apiBaseUrl="https://api.test" />)
    await search()

    expect(await screen.findByText('total vulnerabilities')).toBeInTheDocument()
    expect(screen.queryByText('maintainers')).not.toBeInTheDocument()
    expect(screen.queryByText('7')).not.toBeInTheDocument()
  })

  it('scopes a scoped package name into a single path segment', async () => {
    const fetchMock = mockFetch(packageResponse({ name: '@scope/pkg' }))
    render(<SearchTab apiBaseUrl="https://api.test" />)
    await search('@scope/pkg')

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.test/package/%40scope%2Fpkg'
    )
  })

  it('runs a search from a suggestion pill', async () => {
    const fetchMock = mockFetch(packageResponse({ name: 'lodash' }))
    render(<SearchTab apiBaseUrl="https://api.test" />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'lodash' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/package/lodash')
    expect(await screen.findByText(/health score/)).toBeInTheDocument()
  })

  it('filters advisories by severity', async () => {
    mockFetch(packageResponse())
    render(<SearchTab apiBaseUrl="https://api.test" />)
    const user = await search()

    await screen.findByText('GHSA-high-0001')
    await user.click(screen.getByRole('button', { name: 'high' }))

    expect(screen.getByText('GHSA-high-0001')).toBeInTheDocument()
    expect(screen.queryByText('GHSA-low-0002')).not.toBeInTheDocument()
  })

  it('resets an active filter when a different package is searched', async () => {
    // AdvisoryList is keyed by result.name, so a new search remounts it and
    // drops the filter. That key IS the reset logic — without this test,
    // removing it would silently carry one package's filter onto the next.
    const fetchMock = mockFetch(packageResponse())
    render(<SearchTab apiBaseUrl="https://api.test" />)
    const user = await search()

    await screen.findByText('GHSA-high-0001')
    await user.click(screen.getByRole('button', { name: 'high' }))
    expect(screen.getByRole('button', { name: 'high' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.queryByText('GHSA-low-0002')).not.toBeInTheDocument()

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => packageResponse({ name: 'otherpkg' }),
    })
    await user.clear(screen.getByLabelText(/package name/i))
    await search('otherpkg')

    expect(await screen.findByText('GHSA-low-0002')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'all' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'high' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })
})

describe('pagination', () => {
  function manyVulnerabilities(count) {
    return Array.from({ length: count }, (_, i) => ({
      id: `GHSA-item-${String(i).padStart(4, '0')}`,
      summary: `advisory number ${i}`,
      severity: 'LOW',
      cve: null,
      advisory_url: `https://osv.dev/vulnerability/GHSA-item-${i}`,
      affects_latest_version: false,
    }))
  }

  it('shows 5 advisories per page by default', async () => {
    mockFetch(
      packageResponse({
        vulnerability_count: 7,
        vulnerabilities: manyVulnerabilities(7),
      })
    )
    render(<SearchTab apiBaseUrl="https://api.test" />)
    await search()

    await screen.findByText('GHSA-item-0000')
    expect(screen.getAllByText(/^GHSA-item-/)).toHaveLength(5)
    expect(screen.getByText('page 1 of 2')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'next' }))

    expect(screen.getByText('GHSA-item-0005')).toBeInTheDocument()
    expect(screen.queryByText('GHSA-item-0000')).not.toBeInTheDocument()
  })

  it('shows more per page when a larger page size is chosen', async () => {
    mockFetch(
      packageResponse({
        vulnerability_count: 7,
        vulnerabilities: manyVulnerabilities(7),
      })
    )
    render(<SearchTab apiBaseUrl="https://api.test" />)
    const user = await search()

    await screen.findByText('GHSA-item-0000')
    await user.selectOptions(
      screen.getByLabelText(/advisories per page/i),
      '25'
    )

    expect(screen.getAllByText(/^GHSA-item-/)).toHaveLength(7)
    expect(
      screen.queryByRole('navigation', { name: /advisory pages/i })
    ).not.toBeInTheDocument()
  })
})

describe('error handling', () => {
  it('reports a throttle as a throttle, not as a missing package', async () => {
    mockFetch({}, { ok: false, status: 429 })
    render(<SearchTab apiBaseUrl="https://api.test" />)
    await search()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /too many requests/i
    )
  })

  it('distinguishes an upstream outage from a missing package', async () => {
    mockFetch({}, { ok: false, status: 502 })
    render(<SearchTab apiBaseUrl="https://api.test" />)
    await search()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /temporarily unavailable/i
    )
  })

  it('reports a 404 as a missing package', async () => {
    mockFetch({}, { ok: false, status: 404 })
    render(<SearchTab apiBaseUrl="https://api.test" />)
    await search()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /case-sensitive/i
    )
  })

  it('recovers from a transport failure without getting stuck pending', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    render(<SearchTab apiBaseUrl="https://api.test" />)
    await search()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not reach the api/i
    )
    expect(screen.getByRole('button', { name: /^check$/i })).toBeEnabled()
  })
})
