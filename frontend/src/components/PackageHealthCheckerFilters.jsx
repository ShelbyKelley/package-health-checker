import { SORT_OPTIONS } from './PackageHealthCheckerConstants'

function PackageHealthCheckerFilters({
  sortBy,
  onSortByChange,
  severityFilter,
  onSeverityFilterChange,
  affectsLatestOnly,
  onAffectsLatestOnlyChange,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {/* Both selects show their purpose in the option text ("Sort: ...",
          "All severities"), but a select still needs its own accessible
          name for screen readers. */}
      <select
        aria-label="Sort vulnerabilities"
        value={sortBy}
        onChange={(event) => onSortByChange(event.target.value)}
        className="rounded-md border border-body bg-surface-alt px-3 py-1.5 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-brand"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            Sort: {option.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by severity"
        value={severityFilter}
        onChange={(event) => onSeverityFilterChange(event.target.value)}
        className="rounded-md border border-body bg-surface-alt px-3 py-1.5 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-brand"
      >
        <option value="ALL">All severities</option>
        <option value="CRITICAL">Critical</option>
        <option value="HIGH">High</option>
        <option value="MODERATE">Moderate</option>
        <option value="LOW">Low</option>
      </select>

      <button
        type="button"
        aria-pressed={affectsLatestOnly}
        onClick={() => onAffectsLatestOnlyChange(!affectsLatestOnly)}
        className={`rounded-full border px-4 py-1.5 font-mono text-[13px] transition-colors duration-200 ${
          affectsLatestOnly
            ? 'border-brand bg-brand/10 text-brand'
            : 'border-body text-body hover:border-brand hover:text-brand'
        }`}
      >
        affects latest only
      </button>
    </div>
  )
}

export default PackageHealthCheckerFilters
