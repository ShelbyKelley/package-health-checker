import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// Tool reads import.meta.env at module load, so each test stubs the env
// first and then imports it fresh.
async function renderTool({ apiUrl = 'https://api.test' } = {}) {
  vi.stubEnv('VITE_API_URL', apiUrl)
  vi.resetModules()
  const { default: Tool } = await import('../Tool')
  return render(<Tool />)
}

// Minimal but *shape-accurate* PackageHealth response. The backend's
// Pydantic model makes every field here non-optional, so the components are
// entitled to trust they exist rather than guarding against a shape our own
// API can't return.
function packageResponse() {
  return {
    name: 'lodash',
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
  }
}

describe('configuration', () => {
  it('reports a missing API URL instead of requesting "undefined/package/..."', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await renderTool({ apiUrl: '' })

    expect(screen.getByRole('alert')).toHaveTextContent(/VITE_API_URL/)
    // The tool itself must not render at all, so nothing can fire a request.
    expect(
      screen.queryByRole('button', { name: /^check$/i })
    ).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('strips a trailing slash so the request path has no double slash', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => packageResponse(),
    })
    vi.stubGlobal('fetch', fetchMock)
    await renderTool({ apiUrl: 'https://api.test/' })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'lodash' }))

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/package/lodash')
  })
})

describe('tabs', () => {
  it('opens on the search tab and swaps to the audit tab on request', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await renderTool()
    const user = userEvent.setup()

    expect(screen.getByLabelText(/package name/i)).toBeInTheDocument()
    expect(
      screen.queryByLabelText(/package-lock\.json contents/i)
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /audit a lockfile/i }))

    expect(
      screen.getByLabelText(/package-lock\.json contents/i)
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/package name/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /search a package/i }))
    expect(screen.getByLabelText(/package name/i)).toBeInTheDocument()
  })
})
