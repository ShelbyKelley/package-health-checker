import { useActionState, useState } from 'react'

import {
  CONFIGURATION_ERROR_MESSAGE,
  getErrorMessage,
  NETWORK_ERROR_MESSAGE,
} from './PackageHealthCheckerConstants'
import PackageHealthCheckerStatusBanner from './PackageHealthCheckerStatusBanner'
import PackageHealthCheckerVulnerabilityHistory from './PackageHealthCheckerVulnerabilityHistory'

// Vite inlines env vars at build time, so a missing value here means the
// build itself was misconfigured. Any trailing slash is stripped so the
// request path can never come out as "//package/...".
const API_BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/+$/, '')

const NO_SEARCH_YET = { result: null, error: null }

function PackageHealthCheckerTool() {
  const [packageName, setPackageName] = useState('')

  // A form Action gets the pending flag for free and removes the
  // preventDefault / setLoading / try-finally bookkeeping a manual submit
  // handler needs. Errors are returned as state, not thrown, so a failed
  // lookup never leaves the UI stuck mid-request.
  const [search, submitSearch, isSearching] = useActionState(
    async (previousSearch) => {
      const name = packageName.trim()
      if (!name) return previousSearch

      try {
        const response = await fetch(
          `${API_BASE_URL}/package/${encodeURIComponent(name)}`
        )

        if (!response.ok) {
          return { result: null, error: getErrorMessage(response.status) }
        }

        return { result: await response.json(), error: null }
      } catch {
        // fetch rejects only on a transport-level failure; HTTP statuses are
        // handled above.
        return { result: null, error: NETWORK_ERROR_MESSAGE }
      }
    },
    NO_SEARCH_YET
  )

  // Hooks have to run unconditionally, so this guard sits below them rather
  // than at the top. Without it, a build missing the env var would quietly
  // request "undefined/package/lodash" and report it as a failed lookup.
  if (!API_BASE_URL) {
    return (
      <p
        role="alert"
        className="mt-8 rounded-md border border-status-danger bg-surface-alt p-4 text-status-danger"
      >
        {CONFIGURATION_ERROR_MESSAGE}
      </p>
    )
  }

  const { result, error } = search

  return (
    <div className="mt-8">
      <form action={submitSearch} className="flex gap-2 mb-6">
        <label htmlFor="package-name" className="sr-only">
          npm package name
        </label>
        <input
          id="package-name"
          name="packageName"
          type="text"
          value={packageName}
          onChange={(event) => setPackageName(event.target.value)}
          placeholder="Enter a package name (e.g. lodash)"
          required
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="flex-1 rounded-md border border-body bg-surface-alt px-4 py-2 text-heading placeholder:text-body focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <button
          type="submit"
          disabled={isSearching}
          className="rounded-md bg-brand px-5 py-2 text-brand-contrast font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </form>

      <p className="text-xs text-body mb-6 -mt-4">
        Package names are case-sensitive — please verify the exact package name
        before searching.
      </p>

      {error && (
        <div
          role="alert"
          className="rounded-md bg-surface-alt border border-brand p-4 text-brand"
        >
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-subtle bg-surface-alt p-6">
          <h2 className="font-heading text-xl font-semibold text-heading">
            {result.name}
          </h2>
          <p className="text-body mb-4">{result.description}</p>
          <div className="text-sm text-body mb-4">
            Latest version: {result.latest_version} · Last published:{' '}
            <time dateTime={result.last_publish_date}>
              {new Date(result.last_publish_date).toLocaleDateString()}
            </time>
          </div>

          <PackageHealthCheckerStatusBanner
            latestVersion={result.latest_version}
            vulnerable={result.latest_version_vulnerable}
          />

          {result.vulnerability_count > 0 && (
            // Keyed by package, so every filter and the page number reset
            // themselves on a new search instead of being cleared by hand.
            <PackageHealthCheckerVulnerabilityHistory
              key={result.name}
              vulnerabilities={result.vulnerabilities}
              totalCount={result.vulnerability_count}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default PackageHealthCheckerTool
