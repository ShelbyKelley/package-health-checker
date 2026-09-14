export const SEVERITIES = ['critical', 'high', 'moderate', 'low']

export const SEVERITY_FILTERS = ['all', ...SEVERITIES]

export const PAGE_SIZE_OPTIONS = [5, 10, 25]
export const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0]

// A lockfile audit can produce hundreds of findings rows, so the report table
// pages at a fixed size rather than offering a selector.
export const REPORT_PAGE_SIZE = 10

const SEVERITY_RANK = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 }

export function getSeverityRank(severity) {
  return SEVERITY_RANK[severity?.toUpperCase()] ?? 0
}

// Text, border, AND a 10% background tint — the severity tokens in
// index.css are calibrated specifically for this combination (12px text on
// a 10% tint of its own color must clear 4.5:1 WCAG AA), so this is the
// exact case those values were tuned against. Don't drop the tint.
export const SEVERITY_CLASSES = {
  CRITICAL:
    'text-severity-critical border-severity-critical bg-severity-critical/10',
  HIGH: 'text-severity-high border-severity-high bg-severity-high/10',
  MODERATE:
    'text-severity-moderate border-severity-moderate bg-severity-moderate/10',
  LOW: 'text-severity-low border-severity-low bg-severity-low/10',
}
export const DEFAULT_SEVERITY_CLASS = 'text-body border-subtle'

export function severityClass(severity) {
  return SEVERITY_CLASSES[severity?.toUpperCase()] ?? DEFAULT_SEVERITY_CLASS
}

// Picked for a spread of health grades on real data, not just cleanliness —
// request and angular (legacy AngularJS) are both deprecated with unfixed
// advisories, so the tool has something to actually say on the first click.
export const SUGGESTED_PACKAGES = [
  'lodash',
  'express',
  'colors',
  'node-sass',
  'request',
  'angular',
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
