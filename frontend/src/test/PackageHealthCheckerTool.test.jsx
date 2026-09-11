import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The component reads import.meta.env at module load, so each test stubs the
// env first and then imports it fresh.
async function renderTool({ apiUrl = 'https://api.test' } = {}) {
  vi.stubEnv('VITE_API_URL', apiUrl)
  vi.resetModules()
  const { default: Tool } =
    await import('../components/PackageHealthCheckerTool')
  return render(<Tool />)
}

function packageResponse(overrides = {}) {
  return {
    name: 'examplepkg',
    description: 'a synthetic fixture',
    latest_version: '1.0.0',
    last_publish_date: '2000-01-01T00:00:00.000Z',
    latest_version_vulnerable: true,
    vulnerability_count: 2,
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
  await user.type(screen.getByLabelText(/npm package name/i), term)
  await user.click(screen.getByRole('button', { name: /^search$/i }))
  return user
}

describe('configuration', () => {
  it('reports a missing API URL instead of requesting "undefined/package/..."', async () => {
    const fetchMock = mockFetch({})
    await renderTool({ apiUrl: '' })

    expect(screen.getByRole('alert')).toHaveTextContent(/VITE_API_URL/)
    expect(
      screen.queryByRole('button', { name: /^search$/i })
    ).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('strips a trailing slash so the request path has no double slash', async () => {
    const fetchMock = mockFetch(packageResponse())
    await renderTool({ apiUrl: 'https://api.test/' })
    await search()

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.test/package/examplepkg'
    )
  })
})

describe('searching', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn())
  })

  it('renders package metadata and the vulnerability history', async () => {
    mockFetch(packageResponse())
    await renderTool()
    await search()

    expect(
      await screen.findByRole('heading', { name: 'examplepkg' })
    ).toBeInTheDocument()
    expect(screen.getByText(/Latest version: 1\.0\.0/)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Vulnerability history \(2\)/ })
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      /has known vulnerabilities/
    )
  })

  it('scopes a scoped package name into a single path segment', async () => {
    const fetchMock = mockFetch(packageResponse({ name: '@scope/pkg' }))
    await renderTool()
    await search('@scope/pkg')

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.test/package/%40scope%2Fpkg'
    )
  })

  it('trims surrounding whitespace before querying', async () => {
    const fetchMock = mockFetch(packageResponse())
    await renderTool()
    await search('  examplepkg  ')

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.test/package/examplepkg'
    )
  })
})

describe('error handling', () => {
  it('reports a throttle as a throttle, not as a missing package', async () => {
    mockFetch({}, { ok: false, status: 429 })
    await renderTool()
    await search()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Too many requests/i
    )
  })

  it('distinguishes an upstream outage from a missing package', async () => {
    mockFetch({}, { ok: false, status: 502 })
    await renderTool()
    await search()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /temporarily unavailable/i
    )
  })

  it('explains a 404 in terms of case sensitivity', async () => {
    mockFetch({}, { ok: false, status: 404 })
    await renderTool()
    await search()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /case-sensitive/i
    )
  })

  it('recovers from a transport failure without getting stuck pending', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    await renderTool()
    await search()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Could not reach the API/i
    )
    // The button must be usable again rather than stuck on "Searching...".
    expect(screen.getByRole('button', { name: /^search$/i })).toBeEnabled()
  })
})

describe('filtering', () => {
  it('filters the history by severity and reports the subset count', async () => {
    mockFetch(packageResponse())
    await renderTool()
    const user = await search()

    await screen.findByRole('heading', { name: /Vulnerability history \(2\)/ })
    await user.selectOptions(
      screen.getByLabelText(/Filter by severity/i),
      'HIGH'
    )

    expect(
      screen.getByRole('heading', { name: /Vulnerability history \(1 of 2\)/ })
    ).toBeInTheDocument()
    expect(screen.getByText(/GHSA-high-0001/)).toBeInTheDocument()
    expect(screen.queryByText(/GHSA-low-0002/)).not.toBeInTheDocument()
  })

  it('narrows to advisories that still affect the latest version', async () => {
    mockFetch(packageResponse())
    await renderTool()
    const user = await search()

    await screen.findByRole('heading', { name: /Vulnerability history \(2\)/ })
    const toggle = screen.getByRole('button', { name: /affects latest only/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/GHSA-low-0002/)).not.toBeInTheDocument()
  })

  it('sorts by severity ascending on request', async () => {
    mockFetch(packageResponse())
    await renderTool()
    const user = await search()

    await screen.findByRole('heading', { name: /Vulnerability history \(2\)/ })
    await user.selectOptions(
      screen.getByLabelText(/Sort vulnerabilities/i),
      'severity-asc'
    )

    // The advisory id shares an element with its CVE, so match the id only.
    const ids = screen.getAllByRole('listitem').map(
      (item) =>
        within(item)
          .getByText(/^GHSA-/)
          .textContent.split(' ')[0]
    )
    expect(ids).toEqual(['GHSA-low-0002', 'GHSA-high-0001'])
  })

  it('resets active filters when a different package is searched', async () => {
    const fetchMock = mockFetch(packageResponse())
    await renderTool()
    const user = await search()

    await screen.findByRole('heading', { name: /Vulnerability history \(2\)/ })
    await user.selectOptions(
      screen.getByLabelText(/Filter by severity/i),
      'HIGH'
    )
    expect(
      screen.getByRole('heading', { name: /Vulnerability history \(1 of 2\)/ })
    ).toBeInTheDocument()

    // A new package must not inherit the previous package's filters.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => packageResponse({ name: 'otherpkg' }),
    })
    await user.clear(screen.getByLabelText(/npm package name/i))
    await search('otherpkg')

    expect(
      await screen.findByRole('heading', {
        name: /Vulnerability history \(2\)/,
      })
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/Filter by severity/i)).toHaveValue('ALL')
  })
})
