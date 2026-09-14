import { severityClass } from './Constants'

const COLUMNS = 'grid-cols-[1.6fr_0.8fr_0.8fr_0.9fr_1.6fr]'

function FindingsTable({ rows }) {
  return (
    <div className="mt-5 border border-subtle rounded-lg overflow-x-auto">
      <div className="min-w-160">
        <div
          className={`grid ${COLUMNS} gap-3 px-4.5 py-3 border-b border-subtle bg-surface-alt font-mono text-[10px] tracking-[0.12em] uppercase text-body`}
        >
          <div>Package</div>
          <div>Installed</div>
          <div>Patched</div>
          <div>Severity</div>
          <div>Advisory</div>
        </div>
        {rows.map((row) => (
          <div
            key={`${row.name}@${row.version}:${row.advisory}`}
            className={`grid ${COLUMNS} gap-3 px-4.5 py-3.5 border-b border-subtle font-mono text-[13px] items-baseline`}
          >
            <div className="text-heading wrap-anywhere">{row.name}</div>
            <div className="text-body">{row.version}</div>
            <div
              className={
                row.patchedVersion ? 'text-brand-secondary' : 'text-body'
              }
            >
              {row.patchedVersion ?? '—'}
            </div>
            <div
              className={
                row.rank > 0
                  ? severityClass(row.severity).split(' ')[0]
                  : 'text-body'
              }
            >
              {row.severity}
            </div>
            <div className="text-body wrap-anywhere">
              {row.advisoryUrl ? (
                <a
                  href={row.advisoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {row.advisory}
                </a>
              ) : (
                row.advisory
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default FindingsTable
