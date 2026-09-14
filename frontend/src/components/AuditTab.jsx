import { useRef, useState } from 'react'

import { buildAuditReport } from './AuditBuilder'
import AuditReport from './AuditReport'
import { AUDIT_CONCURRENCY, mapWithConcurrency } from './Concurrency'
import { NETWORK_ERROR_MESSAGE } from './Constants'
import { parseLockfile, SAMPLE_LOCKFILE } from './LockfileParsing'

async function lookupVersion(apiBaseUrl, name, version) {
  try {
    const response = await fetch(
      `${apiBaseUrl}/package/${encodeURIComponent(name)}/vulnerabilities?version=${encodeURIComponent(version)}`
    )
    if (!response.ok) return { error: true }
    const body = await response.json()
    return { vulnerabilities: body.vulnerabilities }
  } catch {
    return { error: true }
  }
}

function packageCount(count) {
  return `${count} installed ${count === 1 ? 'package' : 'packages'}`
}

function AuditTab({ apiBaseUrl }) {
  const [lockfileText, setLockfileText] = useState('')
  const [report, setReport] = useState(null)
  const [statusNote, setStatusNote] = useState('')
  const [auditError, setAuditError] = useState(null)
  const [progress, setProgress] = useState(null)
  const [dragging, setDragging] = useState(false)
  // "load sample" and file drops stay usable mid-audit, so a slow earlier
  // run can finish after a newer one. Each run takes a number, and only the
  // latest run is allowed to write its results or its progress.
  const latestRunRef = useRef(0)
  const isAuditing = progress !== null

  async function runAudit(text) {
    const run = ++latestRunRef.current
    const parsed = parseLockfile(text)
    if (parsed.error) {
      setReport(null)
      setAuditError(null)
      setProgress(null)
      setStatusNote(parsed.error)
      return
    }

    const { packages } = parsed
    setAuditError(null)
    setReport(null)
    setStatusNote(`${packageCount(packages.length)} found, checking…`)
    setProgress({ checked: 0, total: packages.length })

    const lookups = await mapWithConcurrency(
      packages,
      AUDIT_CONCURRENCY,
      async ({ name, version }) => {
        const result = await lookupVersion(apiBaseUrl, name, version)
        if (run === latestRunRef.current) {
          setProgress(
            (current) => current && { ...current, checked: current.checked + 1 }
          )
        }
        return result
      }
    )
    if (run !== latestRunRef.current) return

    setProgress(null)
    const failedCount = lookups.filter((lookup) => lookup.error).length

    if (failedCount === packages.length) {
      // Every single lookup failed, almost always a connectivity problem
      // rather than "none of these happen to have advisories" — showing a
      // zeroed-out clean report in that case would be actively misleading.
      setStatusNote('')
      setAuditError(NETWORK_ERROR_MESSAGE)
      return
    }

    setStatusNote(
      failedCount > 0
        ? `${packageCount(packages.length)} checked · ${failedCount} could not be checked`
        : `${packageCount(packages.length)} checked`
    )
    setReport(buildAuditReport(packages, lookups))
  }

  function readFile(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      setLockfileText(text)
      runAudit(text)
    }
    reader.readAsText(file)
  }

  function loadSample() {
    setLockfileText(SAMPLE_LOCKFILE)
    runAudit(SAMPLE_LOCKFILE)
  }

  function clearAudit() {
    // Also retires any in-flight run, so it can't repopulate what was cleared.
    latestRunRef.current++
    setLockfileText('')
    setReport(null)
    setStatusNote('')
    setAuditError(null)
    setProgress(null)
  }

  return (
    <div>
      <div
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          readFile(event.dataTransfer?.files?.[0])
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        className={`text-center rounded-lg border border-dashed px-5 py-[clamp(28px,5vh,44px)] transition-colors duration-200 ${
          dragging
            ? 'border-brand bg-surface-alt'
            : 'border-subtle bg-transparent'
        }`}
      >
        <div className="font-mono text-sm text-body">
          Drop your package-lock.json to audit every installed package,
          including transitive dependencies
        </div>
        <div className="flex gap-2.5 flex-wrap justify-center mt-4.5">
          <label className="inline-flex items-center font-mono text-[13px] text-heading bg-surface border border-body rounded-md px-4.5 py-2.5 min-h-10 cursor-pointer hover:border-brand hover:text-brand transition-colors">
            choose file
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => readFile(event.target.files?.[0])}
              className="absolute w-px h-px opacity-0 pointer-events-none"
            />
          </label>
          <button
            type="button"
            onClick={loadSample}
            className="font-mono text-[13px] text-body bg-transparent border border-body rounded-md px-4.5 py-2.5 min-h-10 cursor-pointer hover:border-brand hover:text-brand transition-colors"
          >
            load sample
          </button>
        </div>
      </div>

      <label htmlFor="lockfile-text" className="sr-only">
        package-lock.json contents
      </label>
      <textarea
        id="lockfile-text"
        value={lockfileText}
        onChange={(event) => setLockfileText(event.target.value)}
        spellCheck={false}
        placeholder='{ "lockfileVersion": 3, "packages": { "node_modules/lodash": { "version": "4.17.19" } } }'
        className="w-full box-border mt-3.5 min-h-42.5 resize-y font-mono text-[13px] leading-relaxed text-heading bg-surface-alt border border-body rounded-md p-4 focus:outline-none focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      />

      <div className="flex gap-2.5 flex-wrap items-center mt-3.5">
        <button
          type="button"
          onClick={() => runAudit(lockfileText)}
          disabled={isAuditing}
          className="font-mono text-sm tracking-wide text-brand-contrast bg-brand border border-brand rounded-md px-6 py-3.5 min-h-11 cursor-pointer hover:bg-brand-secondary hover:border-brand-secondary disabled:opacity-50 transition-colors"
        >
          {isAuditing ? 'auditing…' : 'run audit'}
        </button>
        <button
          type="button"
          onClick={clearAudit}
          className="font-mono text-[13px] text-body bg-transparent border border-body rounded-md px-4.5 py-3.5 min-h-11 cursor-pointer hover:border-brand hover:text-brand transition-colors"
        >
          clear
        </button>
        {/* Announces the start and end of an audit only. The per-package
            count below deliberately sits outside this live region, since
            announcing hundreds of increments would drown a screen reader. */}
        <span className="font-mono text-xs text-body" aria-live="polite">
          {statusNote}
        </span>
      </div>

      {progress && (
        <div className="mt-4 flex items-center gap-3">
          {/* A styled div rather than a native <progress>, whose fill colour
              browsers draw from their own defaults and can't be themed
              consistently. The ARIA attributes give it the same semantics. */}
          <div
            role="progressbar"
            aria-label="Packages checked"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.checked}
            className="w-48 h-1.5 rounded-full bg-subtle overflow-hidden"
          >
            <div
              className="h-full bg-brand transition-[width] duration-200"
              style={{
                width: `${(progress.checked / progress.total) * 100}%`,
              }}
            />
          </div>
          <span className="font-mono text-xs text-body">
            {progress.checked} of {progress.total} checked
          </span>
        </div>
      )}

      {auditError && (
        <p
          role="alert"
          className="font-mono text-sm text-body mt-8 border-l-2 border-subtle pl-4"
        >
          {auditError}
        </p>
      )}

      {report && <AuditReport report={report} />}
    </div>
  )
}

export default AuditTab
