import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL

function PackageHealthCheckerTool() {
  const [packageName, setPackageName] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSearch(event) {
    event.preventDefault()
    if (!packageName.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)

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

  return (
    <div className="mt-8">
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="text"
          value={packageName}
          onChange={(e) => setPackageName(e.target.value)}
          placeholder="Enter a package name (e.g. lodash)"
          spellCheck={false}
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

          <h3 className="font-heading font-semibold text-heading mb-2">
            Vulnerabilities ({result.vulnerability_count})
          </h3>
          {result.vulnerability_count === 0 ? (
            <p className="text-brand-secondary">
              No known vulnerabilities found.
            </p>
          ) : (
            <ul className="space-y-3">
              {result.vulnerabilities.map((vuln) => (
                <li key={vuln.id} className="border-l-4 border-brand pl-3">
                  <div className="font-medium text-heading">
                    {vuln.id}
                    {vuln.cve && ` (${vuln.cve})`}
                  </div>
                  {vuln.severity && (
                    <div className="text-sm text-brand">
                      Severity: {vuln.severity}
                    </div>
                  )}
                  <p className="text-sm text-body">{vuln.summary}</p>
                  <a
                    href={vuln.advisory_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-brand-secondary hover:underline"
                  >
                    View advisory →
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default PackageHealthCheckerTool