import { useMemo, useState } from 'react'

import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  severityClass,
  SEVERITY_FILTERS,
} from './Constants'
import Pagination from './Pagination'

function pillClass(active) {
  return `font-mono text-[11px] tracking-wide uppercase rounded-full px-3 py-1.5 min-h-7.5 cursor-pointer border transition-colors ${
    active
      ? 'bg-brand text-brand-contrast border-brand'
      : 'bg-transparent text-body border-body hover:border-brand hover:text-brand'
  }`
}

function AdvisoryList({ vulnerabilities }) {
  const [severityFilter, setSeverityFilter] = useState('all')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [page, setPage] = useState(0)

  const filtered = useMemo(
    () =>
      vulnerabilities.filter(
        (vuln) =>
          severityFilter === 'all' ||
          (vuln.severity ?? '').toLowerCase() === severityFilter
      ),
    [vulnerabilities, severityFilter]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages - 1)
  const visible = filtered.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize
  )

  // Any change to what is being shown, or how much of it, sends the reader
  // back to page one rather than leaving them stranded past the new end.
  function applyFilterChange(setFilter) {
    return (value) => {
      setFilter(value)
      setPage(0)
    }
  }

  return (
    <div className="mt-[clamp(32px,5vh,48px)]">
      <div className="flex items-baseline justify-between gap-4 flex-wrap border-b border-subtle pb-3.5">
        <h3 className="font-mono text-[13px] tracking-[0.16em] uppercase font-medium m-0 text-body">
          Advisories ({filtered.length}
          {filtered.length !== vulnerabilities.length
            ? ` of ${vulnerabilities.length}`
            : ''}
          )
        </h3>
        <div className="flex gap-2 flex-wrap items-center">
          <label htmlFor="advisory-page-size" className="sr-only">
            Advisories per page
          </label>
          <select
            id="advisory-page-size"
            value={pageSize}
            onChange={(event) =>
              applyFilterChange(setPageSize)(Number(event.target.value))
            }
            className="font-mono text-[11px] tracking-wide uppercase rounded-md border border-body bg-transparent px-2.5 py-1.5 text-body focus:outline-none focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                show {size}
              </option>
            ))}
          </select>
          {SEVERITY_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={severityFilter === filter}
              onClick={() => applyFilterChange(setSeverityFilter)(filter)}
              className={pillClass(severityFilter === filter)}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 && (
        <p className="text-sm text-body mt-4">
          No advisories match this filter.
        </p>
      )}

      {visible.map((vuln) => (
        <article
          key={vuln.id}
          className="grid gap-[clamp(16px,3vw,44px)] py-6.5 border-b border-subtle grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))]"
        >
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span
                className={`font-mono text-[11px] tracking-wide uppercase rounded-full border px-2.5 py-0.5 ${severityClass(vuln.severity)}`}
              >
                {vuln.severity ?? 'unknown'}
              </span>
              {vuln.cve && (
                <span className="font-mono text-xs text-body">{vuln.cve}</span>
              )}
              <span className="font-mono text-xs text-body">{vuln.id}</span>
            </div>
            {vuln.summary && (
              <h4 className="font-heading font-light text-2xl leading-tight mt-3 mb-0 max-w-[30ch]">
                {vuln.summary}
              </h4>
            )}
          </div>
          <div className="flex flex-col gap-3.5">
            <div className="font-mono text-xs text-body">
              {vuln.affects_latest_version
                ? 'still affects the latest version'
                : 'fixed in the latest version'}
            </div>
            <a
              href={vuln.advisory_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View advisory ${vuln.id} on OSV.dev`}
              className="font-mono text-xs text-brand-secondary self-start"
            >
              View advisory on OSV.dev →
            </a>
          </div>
        </article>
      ))}

      <Pagination
        label="Advisory pages"
        page={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  )
}

export default AdvisoryList
