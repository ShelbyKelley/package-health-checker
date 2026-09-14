const CASE_STUDY_URL = 'https://shelbyannkelley.com/package-health-checker'

function Notes() {
  return (
    <section
      id="notes"
      className="max-w-270 mx-auto pb-[clamp(72px,12vh,120px)]"
    >
      <div className="border-t border-subtle pt-[clamp(32px,5vh,48px)] grid gap-[clamp(24px,4vw,56px)] grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))]">
        <div>
          <h2 className="font-mono text-[13px] tracking-[0.16em] uppercase font-medium m-0 mb-3.5 text-brand-secondary">
            Where the data comes from
          </h2>
          <p className="m-0 text-body max-w-[42ch]">
            Package details come straight from the{' '}
            <strong className="font-medium text-heading">npm registry</strong>.
            Vulnerability data comes from{' '}
            <a href="https://osv.dev" target="_blank" rel="noopener noreferrer">
              OSV.dev
            </a>
            , which aggregates advisories from sources like the GitHub Security
            Advisory database. Every lookup is live, nothing is cached. This
            tool currently covers the{' '}
            <strong className="font-medium text-heading">
              npm ecosystem only
            </strong>
            .
          </p>
        </div>
        <div>
          <h2 className="font-mono text-[13px] tracking-[0.16em] uppercase font-medium m-0 mb-3.5 text-brand-secondary">
            Reading a search result
          </h2>
          <p className="m-0 text-body max-w-[42ch]">
            Advisories are rated from{' '}
            <strong className="font-medium text-heading">
              low to critical severity
            </strong>
            . A CVE number appears only when one has been assigned, so its
            absence doesn&rsquo;t mean the issue is minor. &ldquo;View
            advisory&rdquo; opens the exact affected range on OSV.dev; this tool
            doesn&rsquo;t calculate that range itself, and the{' '}
            <a href={CASE_STUDY_URL} target="_blank" rel="noopener noreferrer">
              case study
            </a>{' '}
            explains why. The{' '}
            <strong className="font-medium text-heading">
              health score and grade
            </strong>{' '}
            are a triage heuristic, not a certification.
          </p>
        </div>
        <div>
          <h2 className="font-mono text-[13px] tracking-[0.16em] uppercase font-medium m-0 mb-3.5 text-brand-secondary">
            Auditing a lockfile
          </h2>
          <p className="m-0 text-body max-w-[42ch]">
            The audit tab reads a{' '}
            <strong className="font-medium text-heading">
              package-lock.json
            </strong>{' '}
            and checks every installed package against the same advisory data,
            including the transitive dependencies a package.json never lists. A
            lockfile is required because it records the exact version installed,
            while a package.json only records a range. Parsing happens in your
            browser;{' '}
            <strong className="font-medium text-heading">
              nothing is uploaded
            </strong>
            .
          </p>
        </div>
        <div>
          <h2 className="font-mono text-[13px] tracking-[0.16em] uppercase font-medium m-0 mb-3.5 text-brand-secondary">
            How it is built
          </h2>
          <p className="m-0 text-body max-w-[42ch]">
            The backend runs on{' '}
            <strong className="font-medium text-heading">AWS Lambda</strong>{' '}
            behind{' '}
            <strong className="font-medium text-heading">API Gateway</strong>,
            with request throttling and input validation. That trades a little
            latency for real protection against the API being used as an open
            relay. The{' '}
            <a href={CASE_STUDY_URL} target="_blank" rel="noopener noreferrer">
              case study
            </a>{' '}
            covers the full scoping and trade-off decisions.
          </p>
        </div>
      </div>
    </section>
  )
}

export default Notes
