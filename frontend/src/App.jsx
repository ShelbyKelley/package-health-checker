import { useState, useEffect } from 'react'

const API_URL = 'http://localhost:8000'

function App() {
  const [packageName, setPackageName] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'dark'
  })

  useEffect(() => {
    const root = document.documentElement
    if (darkMode) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [darkMode])

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
    <div className="min-h-screen bg-surface px-6 py-12 transition-colors">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-heading text-3xl font-bold text-heading">
            Package Health Checker
          </h1>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="rounded-full border border-subtle px-4 py-2 text-sm text-body hover:bg-brand hover:text-brand-contrast hover:border-brand transition-colors"
          >
            {darkMode ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
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
    </div>
  )
}

export default App
