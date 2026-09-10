export const PAGE_SIZE = 5

export const SEVERITY_STYLES = {
  CRITICAL:
    'text-severity-critical border-severity-critical bg-severity-critical/10',
  HIGH: 'text-severity-high border-severity-high bg-severity-high/10',
  MODERATE:
    'text-severity-moderate border-severity-moderate bg-severity-moderate/10',
  LOW: 'text-severity-low border-severity-low bg-severity-low/10',
}
export const DEFAULT_SEVERITY_STYLE = 'text-body border-subtle'

const SEVERITY_RANK = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 }

export function getSeverityRank(severity) {
  return SEVERITY_RANK[severity?.toUpperCase()] ?? 0
}

export const SORT_OPTIONS = [
  { value: 'default', label: 'Default order' },
  { value: 'severity-desc', label: 'Severity: high to low' },
  { value: 'severity-asc', label: 'Severity: low to high' },
  { value: 'affects-latest', label: 'Affects latest first' },
]
