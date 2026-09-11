function PackageHealthCheckerStatusBanner({ latestVersion, vulnerable }) {
  return (
    // role=status announces the verdict when it replaces the previous
    // result, which is the one thing a screen reader user is waiting for.
    <div
      role="status"
      className={`flex items-center gap-2 rounded-md border p-4 font-medium ${
        vulnerable
          ? 'border-status-danger text-status-danger'
          : 'border-status-safe text-status-safe'
      }`}
    >
      <span aria-hidden="true">{vulnerable ? '⚠' : '✓'}</span>
      <span>
        Latest version ({latestVersion}){' '}
        {vulnerable
          ? 'has known vulnerabilities'
          : 'has no known vulnerabilities'}
      </span>
    </div>
  )
}

export default PackageHealthCheckerStatusBanner
