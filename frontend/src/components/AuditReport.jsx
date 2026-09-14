import { useMemo, useState } from 'react'

import { reportHeadline } from './AuditBuilder'
import {
  exportReportAsCsv,
  exportReportAsJson,
  exportReportAsMarkdown,
} from './AuditExports'
import { REPORT_PAGE_SIZE, SEVERITY_FILTERS } from './Constants'
import FindingsTable from './FindingsTable'
import Pagination from './Pagination'

function pillClass(active) {
  return `font-mono text-[11px] tracking-wide uppercase rounded-full px-3 py-1.5 min-h-7.5 cursor-pointer border transition-colors ${
    active
      ? 'bg-brand text-brand-contrast border-brand'
      : 'bg-transparent text-body border-body hover:border-brand hover:text-brand'
  }`
}

// Rectangular, not pill-shaped: filters below are rounded-full toggles that
// change what's visible, while these are one-shot download actions (always
// covering the full, unfiltered findings set) — matching shapes would make
// download and toggling look like the same kind of control.
const EXPORT_BUTTON_CLASS =
  'inline-flex items-center gap-1.5 font-mono text-xs text-heading bg-transparent border border-body rounded-md px-3.5 py-1.5 min-h-8.5 cursor-pointer hover:border-brand hover:text-brand transition-colors'

function AuditReport({ report }) {
  const [onlyVulnerable, setOnlyVulnerable] = useState(true)
  const [severityFilter, setSeverityFilter] = useState('all')
  const [page, setPage] = useState(0)

  const visibleRows = useMemo(() => {
    return report.rows.filter((row) => {
      if (onlyVulnerable && row.rank <= 0) return false
      if (severityFilter !== 'all' && row.severity !== severityFilter) {
        return false
      }
      return true
    })
  }, [report, onlyVulnerable, severityFilter])

  // Paging only ever narrows what's on screen. The export buttons below are
  // handed the whole `report`, never these rows, so an export always covers
  // every finding regardless of the current page or filter.
  const totalPages = Math.max(
    1,
    Math.ceil(visibleRows.length / REPORT_PAGE_SIZE)
  )
  const currentPage = Math.min(page, totalPages - 1)
  const pageRows = visibleRows.slice(
    currentPage * REPORT_PAGE_SIZE,
    (currentPage + 1) * REPORT_PAGE_SIZE
  )

  // A filter change sends the reader back to page one rather than leaving
  // them past the end of a shorter list.
  function toggleOnlyVulnerable() {
    setOnlyVulnerable((value) => !value)
    setPage(0)
  }

  function chooseSeverity(filter) {
    setSeverityFilter(filter)
    setPage(0)
  }

  return (
    <div className="mt-9">
      <div className="border border-subtle rounded-lg overflow-hidden">
        <div className="bg-surface-alt p-[clamp(20px,3vw,30px)] grid gap-6 items-center grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))]">
          <div>
            <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-body">
              Report
            </div>
            <div
              className="font-heading font-light mt-2 max-w-[24ch]"
              style={{ fontSize: 'clamp(26px, 3.4vw, 36px)', lineHeight: 1.15 }}
            >
              {reportHeadline(report)}
            </div>
            <div className="font-mono text-xs text-body mt-2.5">
              {report.scannedCount} packages scanned ·{' '}
              {new Date(report.generatedAt).toLocaleString()}
            </div>
          </div>
          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(84px,1fr))]">
            {report.counts.map((c) => (
              <div
                key={c.severity}
                className="border border-subtle rounded-md px-3.5 py-3 bg-surface"
              >
                <div
                  className={`font-mono text-[26px] leading-none ${
                    c.count
                      ? {
                          critical: 'text-severity-critical',
                          high: 'text-severity-high',
                          moderate: 'text-severity-moderate',
                          low: 'text-severity-low',
                        }[c.severity]
                      : 'text-body'
                  }`}
                >
                  {c.count}
                </div>
                <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-body mt-1.5">
                  {c.severity}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap items-center px-[clamp(20px,3vw,30px)] py-3.5 border-t border-subtle">
          <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-body mr-1">
            Export full report
          </span>
          <button
            type="button"
            onClick={() => exportReportAsJson(report)}
            className={EXPORT_BUTTON_CLASS}
          >
            <span aria-hidden="true">&darr;</span> json
          </button>
          <button
            type="button"
            onClick={() => exportReportAsCsv(report)}
            className={EXPORT_BUTTON_CLASS}
          >
            <span aria-hidden="true">&darr;</span> csv
          </button>
          <button
            type="button"
            onClick={() => exportReportAsMarkdown(report)}
            className={EXPORT_BUTTON_CLASS}
          >
            <span aria-hidden="true">&darr;</span> markdown
          </button>
        </div>

        <div className="flex gap-2 flex-wrap items-center px-[clamp(20px,3vw,30px)] py-3.5 border-t border-subtle">
          <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-body mr-1">
            Filter this view
          </span>
          {/* Same fixed-label, pressed/unpressed pattern as the severity
              pills below, on purpose: this used to swap its own label text
              ("vulnerable only" / "all packages"), which read as a
              different button in each state rather than one toggle. */}
          <button
            type="button"
            aria-pressed={onlyVulnerable}
            onClick={toggleOnlyVulnerable}
            className={pillClass(onlyVulnerable)}
          >
            vulnerable only
          </button>
          {SEVERITY_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={severityFilter === filter}
              onClick={() => chooseSeverity(filter)}
              className={pillClass(severityFilter === filter)}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <FindingsTable rows={pageRows} />
      <Pagination
        label="Finding pages"
        page={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  )
}

export default AuditReport
