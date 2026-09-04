import { useState } from 'react'

const API_URL = 'http://localhost:8000'

function App() {
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
    <div className="min-h-screen bg-gray-50 px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Package Health Checker
        </h1>

        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
          <input
            type="text"
            value={packageName}
            onChange={(e) => setPackageName(e.target.value)}
            placeholder="Enter a package name (e.g. lodash)"
            className="flex-1 rounded-md border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-blue-600 px-5 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-md border border-gray-200 bg-white p-6">
            <h2 className="text-xl font-semibold text-gray-900">
              {result.name}
            </h2>
            <p className="text-gray-600 mb-4">{result.description}</p>
            <div className="text-sm text-gray-500 mb-4">
              Latest version: {result.latest_version} · Last published:{' '}
              {new Date(result.last_publish_date).toLocaleDateString()}
            </div>

            <h3 className="font-semibold text-gray-900 mb-2">
              Vulnerabilities ({result.vulnerability_count})
            </h3>
            {result.vulnerability_count === 0 ? (
              <p className="text-green-700">
                No known vulnerabilities found.
              </p>
            ) : (
              <ul className="space-y-3">
                {result.vulnerabilities.map((vuln) => (
                  <li
                    key={vuln.id}
                    className="border-l-4 border-red-400 pl-3"
                  >
                    <div className="font-medium text-gray-900">
                      {vuln.id}
                      {vuln.cve && ` (${vuln.cve})`}
                    </div>
                    {vuln.severity && (
                      <div className="text-sm text-red-700">
                        Severity: {vuln.severity}
                      </div>
                    )}
                    <p className="text-sm text-gray-600">{vuln.summary}</p>
                    <a
                      href={vuln.advisory_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
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
    </div>
  )
}

export default App