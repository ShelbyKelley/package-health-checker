import { getSeverityRank } from './Constants'

// One row per (installed package, matching advisory) pair, so a package with
// three hits produces three rows. A package with no hits still gets a row
// ("no known advisories"), so it's never silently dropped.
//
// `packages` is the parsed lockfile's [{ name, version }] list, and
// `lookups[i]` is the advisory lookup for `packages[i]`. Everything is keyed
// by name@version rather than name, because one dependency tree can install
// the same package at two versions with different advisories.
export function buildAuditReport(packages, lookups) {
  const rows = []

  packages.forEach(({ name, version }, index) => {
    const lookup = lookups[index]

    if (!lookup || lookup.error) {
      rows.push({
        name,
        version,
        severity: 'unknown',
        advisory: 'lookup failed',
        advisoryUrl: null,
        patchedVersion: null,
        rank: -1,
      })
      return
    }

    if (!lookup.vulnerabilities.length) {
      rows.push({
        name,
        version,
        severity: 'ok',
        advisory: 'no known advisories',
        advisoryUrl: null,
        patchedVersion: null,
        rank: 0,
      })
      return
    }

    lookup.vulnerabilities
      .slice()
      .sort((a, b) => getSeverityRank(b.severity) - getSeverityRank(a.severity))
      .forEach((vuln) => {
        rows.push({
          name,
          version,
          severity: (vuln.severity ?? 'unknown').toLowerCase(),
          advisory: vuln.cve ? `${vuln.id} · ${vuln.cve}` : vuln.id,
          advisoryUrl: vuln.advisory_url,
          patchedVersion: vuln.fixed_version ?? null,
          rank: getSeverityRank(vuln.severity),
        })
      })
  })

  rows.sort(
    (a, b) =>
      b.rank - a.rank ||
      a.name.localeCompare(b.name) ||
      a.version.localeCompare(b.version)
  )

  const counts = ['critical', 'high', 'moderate', 'low'].map((severity) => ({
    severity,
    count: rows.filter((row) => row.severity === severity).length,
  }))
  const vulnerablePackages = new Set(
    rows
      .filter((row) => row.rank > 0)
      .map((row) => `${row.name}@${row.version}`)
  )

  return {
    rows,
    counts,
    scannedCount: packages.length,
    vulnerableCount: vulnerablePackages.size,
    generatedAt: new Date().toISOString(),
  }
}

export function reportHeadline(report) {
  if (report.vulnerableCount === 0) return 'Nothing known-vulnerable.'
  const worst = report.counts.find((c) => c.count > 0)
  const worstNote =
    worst && (worst.severity === 'critical' || worst.severity === 'high')
      ? `, ${worst.count} ${worst.severity}`
      : ''
  const noun = report.vulnerableCount === 1 ? 'package needs' : 'packages need'
  return `${report.vulnerableCount} ${noun} attention${worstNote}.`
}
