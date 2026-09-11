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

// Every failure used to surface as "Package not found", which hid the two
// cases a user can actually act on: a name typo and hitting the API's rate
// limit. Keyed by the status the backend returns.
const ERROR_MESSAGES = {
  400: 'That does not look like a valid npm package name.',
  404: 'Package not found — names are case-sensitive, so check the exact spelling.',
  429: 'Too many requests right now. Wait a moment and try again.',
  502: 'The npm registry or vulnerability database is temporarily unavailable. Try again shortly.',
}

export const NETWORK_ERROR_MESSAGE =
  'Could not reach the API. Check your connection and try again.'

// Shown when the build has no API URL baked in. Naming the variable is the
// whole point — this is a deploy mistake, and it should say how to fix it.
export const CONFIGURATION_ERROR_MESSAGE =
  'This tool is not configured: VITE_API_URL was missing at build time.'

export function getErrorMessage(status) {
  return (
    ERROR_MESSAGES[status] ??
    'Something went wrong looking up that package. Please try again.'
  )
}
