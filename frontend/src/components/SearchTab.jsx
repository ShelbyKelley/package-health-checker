import { startTransition, useActionState, useState } from 'react'

import AdvisoryList from './AdvisoryList'
import {
  getErrorMessage,
  NETWORK_ERROR_MESSAGE,
  SUGGESTED_PACKAGES,
} from './Constants'
import HealthCard from './HealthCard'

const NO_SEARCH_YET = { result: null, error: null, searched: false }

function SearchTab({ apiBaseUrl }) {
  const [packageName, setPackageName] = useState('')

  // A form Action gets the pending flag for free and removes the
  // preventDefault / setLoading / try-finally bookkeeping a manual submit
  // handler needs. Errors are returned as state, not thrown, so a failed
  // lookup never leaves the UI stuck mid-request.
  const [search, submitSearch, isSearching] = useActionState(
    async (previousSearch, payload) => {
      // The form submits with a FormData payload we don't need (the input
      // is already controlled); a suggestion pill calls this directly with
      // the package name string instead.
      const name = typeof payload === 'string' ? payload : packageName
      const trimmed = name.trim()
      if (!trimmed) return previousSearch

      try {
        const response = await fetch(
          `${apiBaseUrl}/package/${encodeURIComponent(trimmed)}`
        )

        if (!response.ok) {
          return {
            result: null,
            error: getErrorMessage(response.status),
            searched: true,
          }
        }

        return { result: await response.json(), error: null, searched: true }
      } catch {
        // fetch rejects only on a transport-level failure; HTTP statuses are
        // handled above.
        return { result: null, error: NETWORK_ERROR_MESSAGE, searched: true }
      }
    },
    NO_SEARCH_YET
  )

  const { result, error } = search

  function pick(name) {
    setPackageName(name)
    // Outside a form submission, the action dispatch must be wrapped in a
    // transition itself, or isPending stops tracking it correctly.
    startTransition(() => submitSearch(name))
  }

  return (
    <div>
      <form
        action={submitSearch}
        className="flex gap-2.5 flex-wrap items-stretch"
      >
        <label htmlFor="package-name" className="sr-only">
          Package name
        </label>
        <input
          id="package-name"
          name="packageName"
          type="text"
          value={packageName}
          onChange={(event) => setPackageName(event.target.value)}
          placeholder="package name, e.g. lodash"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="flex-1 min-w-65 font-mono text-[15px] text-heading bg-surface-alt border border-body rounded-md px-4 py-3.5 focus:outline-none focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
        />
        <button
          type="submit"
          disabled={isSearching}
          className="font-mono text-sm tracking-wide text-brand-contrast bg-brand border border-brand rounded-md px-6 py-3.5 min-h-11 cursor-pointer hover:bg-brand-secondary hover:border-brand-secondary disabled:opacity-50 transition-colors"
        >
          {isSearching ? 'checking…' : 'check'}
        </button>
      </form>

      <div className="flex gap-2 flex-wrap items-center mt-3.5">
        <span className="font-mono text-xs text-body">try:</span>
        {SUGGESTED_PACKAGES.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => pick(name)}
            className="font-mono text-xs text-body bg-transparent border border-body rounded-full px-3 py-1.5 cursor-pointer hover:border-brand hover:text-brand transition-colors"
          >
            {name}
          </button>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="font-mono text-sm text-body mt-8 border-l-2 border-subtle pl-4"
        >
          {error}
        </p>
      )}

      {result && (
        <>
          <HealthCard result={result} />
          {result.vulnerability_count > 0 && (
            // Keyed by package, so the severity filter resets on a new
            // search instead of being carried over from the previous one.
            <AdvisoryList
              key={result.name}
              vulnerabilities={result.vulnerabilities}
            />
          )}
        </>
      )}
    </div>
  )
}

export default SearchTab
