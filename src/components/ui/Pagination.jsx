export default function Pagination({ page, pageSize, total, onPageChange, label = 'records' }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const start = (safePage - 1) * pageSize + 1
  const end = Math.min(safePage * pageSize, total)

  return (
    <div className="card rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <p className="text-xs text-gray-500">Showing <b>{start}–{end}</b> of <b>{total}</b> {label}</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 1}
          className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-bold text-navy-700 disabled:opacity-40">← Previous</button>
        <span className="px-3 text-xs font-bold text-gray-500">Page {safePage} of {totalPages}</span>
        <button type="button" onClick={() => onPageChange(safePage + 1)} disabled={safePage >= totalPages}
          className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-bold text-navy-700 disabled:opacity-40">Next →</button>
      </div>
    </div>
  )
}
