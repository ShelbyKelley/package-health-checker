import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import AuditTab from '../AuditTab'

// Builds a v3 package-lock.json installing each { name: version } at the top
// of node_modules, plus any extra raw `packages` entries (for nested installs).
function lockfile(installed, extraPackages = {}) {
  const packages = { '': { name: 'app', version: '1.0.0' } }
  for (const [name, version] of Object.entries(installed)) {
    packages[`node_modules/${name}`] = { version }
  }
  return JSON.stringify({
    name: 'app',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: { ...packages, ...extraPackages },
  })
}

function vulnerabilitiesResponse(vulnerabilities = []) {
  return { vulnerable: vulnerabilities.length > 0, vulnerabilities }
}

// Responds per package name, and records which name@version pairs were asked.
function mockLookup(byName) {
  const fetchMock = vi.fn((url) => {
    const decoded = decodeURIComponent(url)
    const name = decoded.match(/\/package\/(.+)\/vulnerabilities/)?.[1]
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => vulnerabilitiesResponse(byName[name] ?? []),
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function pasteLockfile(user, text) {
  const textarea = screen.getByLabelText(/package-lock\.json contents/i)
  await user.click(textarea)
  await user.paste(text)
}

function dropFile(text, filename = 'package-lock.json') {
  const file = new File([text], filename, { type: 'application/json' })
  const dropZone = screen.getByText(
    /drop your package-lock\.json/i
  ).parentElement
  fireEvent.dragOver(dropZone, { dataTransfer: { files: [file] } })
  fireEvent.drop(dropZone, { dataTransfer: { files: [file] } })
}

const runAuditButton = () => screen.getByRole('button', { name: /run audit/i })

describe('input validation', () => {
  it('reports invalid JSON without calling the API', async () => {
    const fetchMock = mockLookup({})
    render(<AuditTab apiBaseUrl="https://api.test" />)
    const user = userEvent.setup()

    await pasteLockfile(user, '{ not json')
    await user.click(runAuditButton())

    expect(await screen.findByText(/not valid json/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a package.json and explains that a lockfile is needed', async () => {
    const fetchMock = mockLookup({})
    render(<AuditTab apiBaseUrl="https://api.test" />)
    const user = userEvent.setup()

    await pasteLockfile(
      user,
      JSON.stringify({ name: 'app', dependencies: { lodash: '^4.17.19' } })
    )
    await user.click(runAuditButton())

    expect(
      await screen.findByText(/looks like a package\.json/i)
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a lockfile with nothing installed', async () => {
    render(<AuditTab apiBaseUrl="https://api.test" />)
    const user = userEvent.setup()

    await pasteLockfile(user, lockfile({}))
    await user.click(runAuditButton())

    expect(
      await screen.findByText(/no installed packages found/i)
    ).toBeInTheDocument()
  })
})

describe('running an audit', () => {
  it('looks up every installed package at its exact version', async () => {
    const fetchMock = mockLookup({
      lodash: [
        {
          id: 'GHSA-1',
          severity: 'HIGH',
          cve: null,
          advisory_url: 'https://osv.dev/vulnerability/GHSA-1',
        },
      ],
      chalk: [],
    })
    render(<AuditTab apiBaseUrl="https://api.test" />)
    const user = userEvent.setup()

    await pasteLockfile(user, lockfile({ lodash: '4.17.19', chalk: '5.3.0' }))
    await user.click(runAuditButton())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/package/lodash/vulnerabilities?version=4.17.19'
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/package/chalk/vulnerabilities?version=5.3.0'
    )

    expect(
      await screen.findByText(/1 package needs attention/i)
    ).toBeInTheDocument()
    expect(screen.getByText('GHSA-1')).toBeInTheDocument()
    expect(screen.getByText('2 installed packages checked')).toBeInTheDocument()
    // "vulnerable only" is on by default, so the clean package's row is hidden.
    expect(screen.queryByText('no known advisories')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'vulnerable only' }))
    expect(screen.getByText('no known advisories')).toBeInTheDocument()
  })

  it('audits transitive dependencies and every installed version of a package', async () => {
    const fetchMock = mockLookup({})
    render(<AuditTab apiBaseUrl="https://api.test" />)
    const user = userEvent.setup()

    await pasteLockfile(
      user,
      lockfile(
        { express: '4.18.1', qs: '6.10.3' },
        { 'node_modules/body-parser/node_modules/qs': { version: '6.9.7' } }
      )
    )
    await user.click(runAuditButton())

    await screen.findByText('3 installed packages checked')
    const asked = fetchMock.mock.calls.map(([url]) => decodeURIComponent(url))
    expect(asked).toContain(
      'https://api.test/package/qs/vulnerabilities?version=6.10.3'
    )
    expect(asked).toContain(
      'https://api.test/package/qs/vulnerabilities?version=6.9.7'
    )
  })

  it('loads the bundled sample lockfile', async () => {
    const fetchMock = mockLookup({})
    render(<AuditTab apiBaseUrl="https://api.test" />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /load sample/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(
      await screen.findByText(/nothing known-vulnerable/i)
    ).toBeInTheDocument()
  })

  it('clears the lockfile and report', async () => {
    mockLookup({})
    render(<AuditTab apiBaseUrl="https://api.test" />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /load sample/i }))
    await screen.findByText(/nothing known-vulnerable/i)

    await user.click(screen.getByRole('button', { name: /^clear$/i }))

    expect(
      screen.queryByText(/nothing known-vulnerable/i)
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText(/package-lock\.json contents/i)).toHaveValue(
      ''
    )
  })
})

describe('file input', () => {
  const LOCKFILE = lockfile({ lodash: '4.17.19' })

  it('audits a lockfile chosen through the file picker', async () => {
    const fetchMock = mockLookup({
      lodash: [
        { id: 'GHSA-file', severity: 'HIGH', cve: null, advisory_url: '#' },
      ],
    })
    render(<AuditTab apiBaseUrl="https://api.test" />)
    const user = userEvent.setup()

    const file = new File([LOCKFILE], 'package-lock.json', {
      type: 'application/json',
    })
    await user.upload(screen.getByLabelText(/choose file/i), file)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(
      await screen.findByText(/1 package needs attention/i)
    ).toBeInTheDocument()
    expect(screen.getByText('GHSA-file')).toBeInTheDocument()
    // The file's contents also populate the textarea, so the user can see
    // what was audited.
    expect(screen.getByLabelText(/package-lock\.json contents/i)).toHaveValue(
      LOCKFILE
    )
  })

  it('audits a lockfile dropped onto the drop zone', async () => {
    const fetchMock = mockLookup({ lodash: [] })
    render(<AuditTab apiBaseUrl="https://api.test" />)

    dropFile(LOCKFILE)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(
      await screen.findByText(/nothing known-vulnerable/i)
    ).toBeInTheDocument()
  })

  it('ignores a drop that carries no file', async () => {
    const fetchMock = mockLookup({})
    render(<AuditTab apiBaseUrl="https://api.test" />)

    const dropZone = screen.getByText(
      /drop your package-lock\.json/i
    ).parentElement
    fireEvent.drop(dropZone, { dataTransfer: { files: [] } })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/packages scanned/i)).not.toBeInTheDocument()
  })
})

// A fetch whose responses resolve only when the test says so, so the order
// results land in can be controlled precisely.
function deferredFetch() {
  const pending = []
  const fetchMock = vi.fn(
    (url) =>
      new Promise((resolve) => {
        pending.push({ url: decodeURIComponent(url), resolve, settled: false })
      })
  )
  vi.stubGlobal('fetch', fetchMock)
  // Resolves every still-pending call whose URL satisfies `matches`. Calls
  // are marked settled so a broad matcher can't silently pre-resolve a call a
  // later step means to control (a promise only resolves once).
  const respondWhere = (matches, vulnerabilities = []) => {
    for (const call of pending.filter((c) => !c.settled && matches(c.url))) {
      call.settled = true
      call.resolve({
        ok: true,
        status: 200,
        json: async () => vulnerabilitiesResponse(vulnerabilities),
      })
    }
  }
  return { fetchMock, respondWhere }
}

describe('progress', () => {
  it('counts packages as they are checked, then gives way to the report', async () => {
    const { fetchMock, respondWhere } = deferredFetch()
    render(<AuditTab apiBaseUrl="https://api.test" />)
    const user = userEvent.setup()

    await pasteLockfile(user, lockfile({ a: '1.0.0', b: '1.0.0', c: '1.0.0' }))
    await user.click(runAuditButton())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))

    expect(screen.getByText('0 of 3 checked')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: /packages checked/i })
    ).toBeInTheDocument()
    // Mid-audit the button relabels itself, so it's found by that label.
    expect(screen.getByRole('button', { name: /auditing/i })).toBeDisabled()

    respondWhere((url) => url.includes('/a/'))
    expect(await screen.findByText('1 of 3 checked')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar', { name: /packages checked/i })
    expect(bar).toHaveAttribute('aria-valuenow', '1')
    expect(bar).toHaveAttribute('aria-valuemax', '3')

    respondWhere(() => true)
    expect(
      await screen.findByText('3 installed packages checked')
    ).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(runAuditButton()).toBeEnabled()
  })
})

describe('overlapping runs', () => {
  it('does not let a slow earlier run overwrite a newer one', async () => {
    const { fetchMock, respondWhere } = deferredFetch()
    render(<AuditTab apiBaseUrl="https://api.test" />)
    const user = userEvent.setup()
    const isSlowPkg = (url) => url.includes('/slow-pkg/')

    // Run 1: a single package whose lookup stays pending.
    await pasteLockfile(user, lockfile({ 'slow-pkg': '1.0.0' }))
    await user.click(runAuditButton())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    // Run 2 starts before run 1 finishes, via a dropped file (the run button
    // is disabled mid-audit, but drops are not). Resolve only run 2's lookup.
    dropFile(lockfile({ 'fast-pkg': '1.0.0' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    respondWhere((url) => !isSlowPkg(url))
    await screen.findByText(/nothing known-vulnerable/i)

    // Now run 1's stale response finally lands, reporting a critical issue.
    respondWhere(isSlowPkg, [
      { id: 'GHSA-stale', severity: 'CRITICAL', cve: null, advisory_url: '#' },
    ])

    // The newer, clean report must survive; the stale result is discarded.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.getByText(/nothing known-vulnerable/i)).toBeInTheDocument()
    expect(screen.queryByText('GHSA-stale')).not.toBeInTheDocument()
  })

  it('does not let an in-flight run repopulate a cleared report', async () => {
    const { fetchMock, respondWhere } = deferredFetch()
    render(<AuditTab apiBaseUrl="https://api.test" />)
    const user = userEvent.setup()

    await pasteLockfile(user, lockfile({ lodash: '4.17.19' }))
    await user.click(runAuditButton())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: /^clear$/i }))
    respondWhere(
      (url) => url.includes('/lodash/'),
      [{ id: 'GHSA-late', severity: 'HIGH', cve: null, advisory_url: '#' }]
    )

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByText(/packages scanned/i)).not.toBeInTheDocument()
    expect(screen.queryByText('GHSA-late')).not.toBeInTheDocument()
    // Clearing also releases the run button rather than leaving it stuck.
    expect(runAuditButton()).toBeEnabled()
  })

  it('never has more lookups in flight than the concurrency cap', async () => {
    let inFlight = 0
    let peak = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 2))
        inFlight--
        return {
          ok: true,
          status: 200,
          json: async () => vulnerabilitiesResponse([]),
        }
      })
    )
    render(<AuditTab apiBaseUrl="https://api.test" />)
    const user = userEvent.setup()

    // A realistically large lockfile: 40 installed packages.
    const installed = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`pkg-${i}`, '1.0.0'])
    )
    await pasteLockfile(user, lockfile(installed))
    await user.click(runAuditButton())

    await screen.findByText(/nothing known-vulnerable/i, {}, { timeout: 3000 })
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(6)
  })
})

describe('lookup failures', () => {
  it('reports a network error instead of a fake clean report when every lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    render(<AuditTab apiBaseUrl="https://api.test" />)
    const user = userEvent.setup()

    await pasteLockfile(user, lockfile({ lodash: '4.17.19', chalk: '5.3.0' }))
    await user.click(runAuditButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not reach the api/i
    )
    expect(
      screen.queryByText(/nothing known-vulnerable/i)
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/packages scanned/i)).not.toBeInTheDocument()
  })

  it('still shows the report when only some lookups fail, and says how many', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) =>
        decodeURIComponent(url).includes('/lodash/')
          ? Promise.reject(new TypeError('network'))
          : Promise.resolve({
              ok: true,
              status: 200,
              json: async () => vulnerabilitiesResponse([]),
            })
      )
    )
    render(<AuditTab apiBaseUrl="https://api.test" />)
    const user = userEvent.setup()

    await pasteLockfile(user, lockfile({ lodash: '4.17.19', chalk: '5.3.0' }))
    await user.click(runAuditButton())

    expect(
      await screen.findByText(
        '2 installed packages checked · 1 could not be checked'
      )
    ).toBeInTheDocument()
    expect(screen.getByText(/packages scanned/i)).toBeInTheDocument()
  })
})

describe('severity filtering', () => {
  it('filters the findings table by severity', async () => {
    mockLookup({
      lodash: [
        { id: 'GHSA-high', severity: 'HIGH', cve: null, advisory_url: '#' },
      ],
      axios: [
        { id: 'GHSA-crit', severity: 'CRITICAL', cve: null, advisory_url: '#' },
      ],
    })
    render(<AuditTab apiBaseUrl="https://api.test" />)
    const user = userEvent.setup()

    await pasteLockfile(user, lockfile({ lodash: '4.17.19', axios: '0.21.0' }))
    await user.click(runAuditButton())
    await screen.findByText('GHSA-high')

    await user.click(screen.getByRole('button', { name: 'critical' }))

    expect(screen.getByText('GHSA-crit')).toBeInTheDocument()
    expect(screen.queryByText('GHSA-high')).not.toBeInTheDocument()
  })
})
