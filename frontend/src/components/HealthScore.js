// Mirrors the design's score() heuristic, but scores against vulnerabilities
// that still affect the latest version rather than every advisory ever
// reported — a CVE fixed years ago shouldn't keep dinging today's grade.
const SEVERITY_PENALTY = { CRITICAL: 26, HIGH: 18, MODERATE: 9, LOW: 4 }
const DEPRECATED_PENALTY = 20
const LOW_MAINTAINER_PENALTY = 8
const STALE_PUBLISH_PENALTY = 12
const STALE_PUBLISH_YEAR = 2023
const MIN_SCORE = 4
const MAX_SCORE = 100

export function computeHealthScore(result) {
  let score = MAX_SCORE

  for (const vuln of result.vulnerabilities) {
    if (vuln.affects_latest_version) {
      score -= SEVERITY_PENALTY[vuln.severity?.toUpperCase()] ?? 0
    }
  }

  if (result.deprecated) score -= DEPRECATED_PENALTY
  if (result.maintainers_count != null && result.maintainers_count < 2) {
    score -= LOW_MAINTAINER_PENALTY
  }

  const publishYear = new Date(result.last_publish_date).getFullYear()
  if (!Number.isNaN(publishYear) && publishYear < STALE_PUBLISH_YEAR) {
    score -= STALE_PUBLISH_PENALTY
  }

  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, score))
}

export function gradeForScore(score) {
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

export function gradeColorClass(score) {
  if (score >= 70) return 'text-status-safe'
  if (score >= 40) return 'text-severity-moderate'
  return 'text-severity-critical'
}
