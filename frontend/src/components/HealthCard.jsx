import {
  computeHealthScore,
  gradeColorClass,
  gradeForScore,
} from './HealthScore'

function formatDownloads(count) {
  if (count == null) return 'unknown'
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return String(count)
}

function HealthCard({ result }) {
  const score = computeHealthScore(result)
  const grade = gradeForScore(score)
  const currentlyAffecting = result.vulnerabilities.filter(
    (v) => v.affects_latest_version
  ).length

  const signals = [
    {
      label: 'weekly installs',
      value: formatDownloads(result.weekly_downloads),
    },
    {
      label: 'total vulnerabilities',
      value: result.vulnerability_count,
      warn: result.vulnerability_count > 0,
    },
    { label: 'dependencies', value: result.dependency_count ?? 'unknown' },
    {
      label: 'status',
      value: result.deprecated ? 'deprecated' : 'active',
      warn: result.deprecated,
      ok: !result.deprecated,
    },
  ]

  return (
    <div className="mt-8 border border-subtle rounded-lg overflow-hidden">
      <div className="bg-surface-alt p-[clamp(20px,3vw,30px)] grid gap-6 items-start grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))]">
        <div>
          <div className="font-mono text-[22px] text-heading">
            {result.name}
          </div>
          <div className="font-mono text-[13px] text-body mt-1.5">
            latest {result.latest_version}
            {result.license ? ` · ${result.license}` : ''}
          </div>
          {result.description && (
            <p className="mt-3 text-body text-[17px] max-w-[44ch]">
              {result.description}
            </p>
          )}
        </div>
        {/* role=status announces the verdict when it replaces the previous
            result, which is the one thing a screen reader user is waiting
            for. Only the grade letter is hidden and restated, since "A" read
            on its own is ambiguous; the lines below it already read as
            sentences, so they stay as they are rather than being duplicated. */}
        <div role="status" className="flex items-center gap-4.5">
          <span className="sr-only">
            {result.name} {result.latest_version}, grade {grade}.
          </span>
          <div
            aria-hidden="true"
            className={`font-heading font-light leading-none ${gradeColorClass(score)}`}
            style={{ fontSize: 'clamp(44px, 6vw, 60px)' }}
          >
            {grade}
          </div>
          <div className="font-mono text-xs text-body leading-loose">
            <div>health score {score}/100</div>
            <div>
              {currentlyAffecting} open{' '}
              {currentlyAffecting === 1 ? 'advisory' : 'advisories'}
            </div>
            <div>
              last publish{' '}
              <time dateTime={result.last_publish_date}>
                {new Date(result.last_publish_date).toLocaleDateString()}
              </time>
            </div>
          </div>
        </div>
      </div>

      {/* Explicit 2/4 column counts, not auto-fit/minmax: auto-fit computed
          3 columns for these 4 tiles at some phone widths (e.g. 536px),
          orphaning the last tile alone on a second row. 2 and 4 both divide
          4 evenly, so there's never a partial trailing row. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-subtle">
        {signals.map((signal, index) => (
          <div
            key={signal.label}
            className={`px-5 py-4 border-subtle border-b sm:border-b-0 ${
              index % 2 === 0 ? 'border-r' : 'border-r-0'
            } ${index === signals.length - 1 ? 'sm:border-r-0' : 'sm:border-r'}`}
          >
            <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-body">
              {signal.label}
            </div>
            <div
              className={`font-mono text-[15px] mt-1.5 ${
                signal.warn
                  ? 'text-severity-moderate'
                  : signal.ok
                    ? 'text-status-safe'
                    : 'text-heading'
              }`}
            >
              {signal.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default HealthCard
