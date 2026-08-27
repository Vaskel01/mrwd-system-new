export default function BulkActionBar({ count, children, message = '', onClear, noun = 'complaint' }) {
  if (!count) return null
  const label = `${count} ${noun}${count === 1 ? '' : 's'} selected`

  return (
    <section className="card rounded-xl border-2 border-navy-200 bg-navy-50/50 p-4" aria-label="Bulk actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-navy-900">{label}</p>
          <p className="mt-0.5 text-xs leading-5 text-gray-500">Choose one action for the selected records.</p>
        </div>
        <button type="button" onClick={onClear} className="btn-secondary rounded-lg px-3 py-2 text-xs">
          Clear selection
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
        {children}
      </div>
      {message ? <p className="mt-3 text-sm font-semibold text-navy-700" role="status" aria-live="polite">{message}</p> : null}
    </section>
  )
}
