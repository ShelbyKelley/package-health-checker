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
      <select
        value={sortBy}
        onChange={(e) => onSortByChange(e.target.value)}
        className="rounded-md border border-subtle bg-surface-alt px-3 py-1.5 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-brand"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            Sort: {option.label}
          </option>
        ))}
      </select>

      <select
        value={severityFilter}
        onChange={(e) => onSeverityFilterChange(e.target.value)}
        className="rounded-md border border-subtle bg-surface-alt px-3 py-1.5 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-brand"
      >
        <option value="ALL">All severities</option>
        <option value="CRITICAL">Critical</option>
        <option value="HIGH">High</option>
        <option value="MODERATE">Moderate</option>
        <option value="LOW">Low</option>
      </select>

      <button
        type="button"
        onClick={() => onAffectsLatestOnlyChange(!affectsLatestOnly)}
        className={`rounded-full border px-4 py-1.5 font-mono text-[13px] transition-colors duration-200 ${
          affectsLatestOnly
            ? 'border-brand bg-brand/10 text-brand'
            : 'border-subtle text-body hover:border-brand hover:text-brand'
        }`}
      >
        affects latest only
      </button>
    </div>
  )
}

export default PackageHealthCheckerFilters
