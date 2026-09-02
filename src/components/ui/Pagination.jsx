export default function Pagination({ page, pageSize, total, onPageChange, label = 'records', embedded = false }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const start = (safePage - 1) * pageSize + 1
  const end = Math.min(safePage * pageSize, total)

  const changePage = next => {
    const bounded = Math.min(Math.max(next, 1), totalPages)
    onPageChange(bounded)
    window.requestAnimationFrame(() => document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  return (
    <nav className={`${embedded ? '' : 'card px-4 py-3'} flex flex-col justify-between gap-3 md:flex-row md:items-center`} aria-label={`${label} pagination`}>
      <p className="text-xs text-gray-500">Showing <b>{start}–{end}</b> of <b>{total}</b> {label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => changePage(1)} disabled={safePage <= 1}
          className="hidden min-h-11 min-w-11 items-center justify-center rounded-full border border-gray-200 bg-white px-2.5 py-2 text-xs font-bold text-navy-700 disabled:opacity-40 sm:inline-flex" aria-label="First page">«</button>
        <button type="button" onClick={() => changePage(safePage - 1)} disabled={safePage <= 1}
          className="min-h-11 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-navy-700 disabled:opacity-40">← Previous</button>
        <label className="inline-flex items-center gap-2 text-xs font-bold text-gray-500">
          <span className="hidden sm:inline">Page</span>
          <select value={safePage} onChange={event => changePage(Number(event.target.value))} className="min-h-11 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs font-black text-navy-800" aria-label="Choose page">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <span>of {totalPages}</span>
        </label>
        <button type="button" onClick={() => changePage(safePage + 1)} disabled={safePage >= totalPages}
          className="min-h-11 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-navy-700 disabled:opacity-40">Next →</button>
        <button type="button" onClick={() => changePage(totalPages)} disabled={safePage >= totalPages}
          className="hidden min-h-11 min-w-11 items-center justify-center rounded-full border border-gray-200 bg-white px-2.5 py-2 text-xs font-bold text-navy-700 disabled:opacity-40 sm:inline-flex" aria-label="Last page">»</button>
      </div>
    </nav>
  )
}
