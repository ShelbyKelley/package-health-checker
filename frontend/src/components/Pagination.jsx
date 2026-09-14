const BUTTON_CLASS =
  'rounded-full border border-body px-4 py-2 font-mono text-[13px] text-body hover:border-brand hover:text-brand transition-colors duration-200 disabled:opacity-40 disabled:hover:border-body disabled:hover:text-body'

// Prev/next paging for a list. Renders nothing when everything fits on one
// page. `page` is zero-based; the caller owns the state and clamps it.
function Pagination({ label, page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null

  return (
    <nav aria-label={label} className="flex items-center justify-between mt-4">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(page - 1, 0))}
        disabled={page === 0}
        className={BUTTON_CLASS}
      >
        prev
      </button>
      {/* aria-live so paging announces itself; the content above is replaced
          without any other cue. */}
      <span aria-live="polite" className="font-mono text-xs text-body">
        page {page + 1} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(Math.min(page + 1, totalPages - 1))}
        disabled={page >= totalPages - 1}
        className={BUTTON_CLASS}
      >
        next
      </button>
    </nav>
  )
}

export default Pagination
