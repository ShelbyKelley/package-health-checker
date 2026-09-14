function download(filename, mimeType, body) {
  const blob = new Blob([body], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking immediately can race the download in some browsers, so the
  // object URL is kept alive briefly instead.
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function findings(report) {
  return report.rows.filter((row) => row.rank > 0)
}

export function exportReportAsJson(report) {
  download(
    'package-health-report.json',
    'application/json',
    JSON.stringify(
      {
        generated: report.generatedAt,
        scanned: report.scannedCount,
        vulnerablePackages: report.vulnerableCount,
        counts: Object.fromEntries(
          report.counts.map((c) => [c.severity, c.count])
        ),
        findings: findings(report).map((row) => ({
          package: row.name,
          installed: row.version,
          patchedIn: row.patchedVersion,
          severity: row.severity,
          advisory: row.advisory,
          advisoryUrl: row.advisoryUrl,
        })),
      },
      null,
      2
    )
  )
}

export function exportReportAsCsv(report) {
  const escape = (value) => `"${String(value).replace(/"/g, '""')}"`
  const body = ['package,installed,patched_in,severity,advisory,advisory_url']
    .concat(
      findings(report).map((row) =>
        [
          row.name,
          row.version,
          row.patchedVersion ?? '',
          row.severity,
          row.advisory,
          row.advisoryUrl ?? '',
        ]
          .map(escape)
          .join(',')
      )
    )
    .join('\n')
  download('package-health-report.csv', 'text/csv', body)
}

export function exportReportAsMarkdown(report) {
  const lines = [
    '# Dependency health report',
    '',
    `Generated ${report.generatedAt} · ${report.scannedCount} packages scanned · ${report.vulnerableCount} affected`,
    '',
    '| Severity | Count |',
    '| --- | --- |',
  ]
  report.counts.forEach((c) => lines.push(`| ${c.severity} | ${c.count} |`))
  lines.push(
    '',
    '| Package | Installed | Patched | Severity | Advisory |',
    '| --- | --- | --- | --- | --- |'
  )
  findings(report).forEach((row) => {
    const advisory = row.advisoryUrl
      ? `[${row.advisory}](${row.advisoryUrl})`
      : row.advisory
    const patched = row.patchedVersion ?? '—'
    lines.push(
      `| \`${row.name}\` | ${row.version} | ${patched} | ${row.severity} | ${advisory} |`
    )
  })
  download('package-health-report.md', 'text/markdown', lines.join('\n'))
}
