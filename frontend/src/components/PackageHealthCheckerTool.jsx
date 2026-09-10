import { useState } from 'react'

import { getSeverityRank } from './PackageHealthCheckerConstants'
import PackageHealthCheckerFilters from './PackageHealthCheckerFilters'
import PackageHealthCheckerStatusBanner from './PackageHealthCheckerStatusBanner'
import PackageHealthCheckerVulnerabilityList from './PackageHealthCheckerVulnerabilityList'

const API_URL = import.meta.env.VITE_API_URL

function PackageHealthCheckerTool() {
  const [packageName, setPackageName] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [sortBy, setSortBy] = useState('default')
  const [severityFilter, setSeverityFilter] = useState('ALL')
  const [affectsLatestOnly, setAffectsLatestOnly] = useState(false)

  async function handleSearch(event) {
    event.preventDefault()
    if (!packageName.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)
    setPage(0)
    setSortBy('default')
    setSeverityFilter('ALL')
    setAffectsLatestOnly(false)

    try {
      const response = await fetch(
        `${API_URL}/package/${encodeURIComponent(packageName.trim())}`
      )

      if (!response.ok) {
        throw new Error('Package not found')
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const visibleVulnerabilities = (result?.vulnerabilities ?? [])
    .filter((vuln) => {
      if (
        severityFilter !== 'ALL' &&
        (vuln.severity ?? '').toUpperCase() !== severityFilter
      ) {
        return false
      }
      if (affectsLatestOnly && !vuln.affects_latest_version) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'severity-desc') {
        return getSeverityRank(b.severity) - getSeverityRank(a.severity)
      }
      if (sortBy === 'severity-asc') {
        return getSeverityRank(a.severity) - getSeverityRank(b.severity)
      }
      if (sortBy === 'affects-latest') {
        return (
          Number(b.affects_latest_version) - Number(a.affects_latest_version)
        )
      }
      return 0
    })

  return (
    <div className="mt-8">
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="text"
          value={packageName}
          onChange={(e) => setPackageName(e.target.value)}
          placeholder="Enter a package name (e.g. lodash)"
          spellCheck={false}
          autoCapitalize="off"
          className="flex-1 rounded-md border border-subtle bg-surface-alt px-4 py-2 text-heading placeholder:text-body focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-brand px-5 py-2 text-brand-contrast font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      <p className="text-xs text-body mb-6 -mt-4">
        Package names are case-sensitive — please verify the exact package name
        before searching.
      </p>

      {error && (
        <div className="rounded-md bg-surface-alt border border-brand p-4 text-brand">
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
            {new Date(result.last_publish_date).toLocaleDateString()}
          </div>

          <PackageHealthCheckerStatusBanner
            latestVersion={result.latest_version}
            vulnerable={result.latest_version_vulnerable}
          />

          {result.vulnerability_count > 0 && (
            <>
              <h3 className="font-heading font-semibold text-heading mb-2 mt-6">
                Vulnerability history ({visibleVulnerabilities.length}
                {visibleVulnerabilities.length !== result.vulnerability_count
                  ? ` of ${result.vulnerability_count}`
                  : ''}
                )
              </h3>

              <PackageHealthCheckerFilters
                sortBy={sortBy}
                onSortByChange={(value) => {
                  setSortBy(value)
                  setPage(0)
                }}
                severityFilter={severityFilter}
                onSeverityFilterChange={(value) => {
                  setSeverityFilter(value)
                  setPage(0)
                }}
                affectsLatestOnly={affectsLatestOnly}
                onAffectsLatestOnlyChange={(value) => {
                  setAffectsLatestOnly(value)
                  setPage(0)
                }}
              />

              <PackageHealthCheckerVulnerabilityList
                vulnerabilities={visibleVulnerabilities}
                page={page}
                onPageChange={setPage}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default PackageHealthCheckerTool
