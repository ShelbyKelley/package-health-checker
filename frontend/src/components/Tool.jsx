import { useState } from 'react'

import AuditTab from './AuditTab'
import { CONFIGURATION_ERROR_MESSAGE } from './Constants'
import SearchTab from './SearchTab'

// Vite inlines env vars at build time, so a missing value here means the
// build itself was misconfigured. Any trailing slash is stripped so a
// request path can never come out as "//package/...".
const API_BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/+$/, '')

const TAB_CLASSES = {
  active: 'text-heading border-b-2 border-brand',
  inactive: 'text-body border-b-2 border-transparent',
}

function Tool() {
  const [tab, setTab] = useState('search')

  // Hooks have to run unconditionally, so this guard sits below them rather
  // than at the top. Without it, a build missing the env var would quietly
  // request "undefined/package/lodash" and report it as a failed lookup.
  if (!API_BASE_URL) {
    return (
      <p
        role="alert"
        className="rounded-md border border-status-danger bg-surface-alt p-4 text-status-danger"
      >
        {CONFIGURATION_ERROR_MESSAGE}
      </p>
    )
  }

  return (
    <div id="tool">
      <div className="flex gap-1.5 border-b border-subtle">
        <button
          type="button"
          onClick={() => setTab('search')}
          className={`font-mono text-[13px] tracking-wide bg-transparent px-1 pt-2.5 pb-3 mr-4.5 cursor-pointer min-h-10 ${tab === 'search' ? TAB_CLASSES.active : TAB_CLASSES.inactive}`}
        >
          Search a package
        </button>
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`font-mono text-[13px] tracking-wide bg-transparent px-1 pt-2.5 pb-3 mr-4.5 cursor-pointer min-h-10 ${tab === 'audit' ? TAB_CLASSES.active : TAB_CLASSES.inactive}`}
        >
          Audit a lockfile
        </button>
      </div>

      <div className="pt-[clamp(28px,5vh,44px)]">
        {tab === 'search' ? (
          <SearchTab apiBaseUrl={API_BASE_URL} />
        ) : (
          <AuditTab apiBaseUrl={API_BASE_URL} />
        )}
      </div>
    </div>
  )
}

export default Tool
