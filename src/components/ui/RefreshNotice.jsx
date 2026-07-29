import AppIcon from './AppIcon'

export default function RefreshNotice({ visible, onRefresh, label = 'New updates are available.' }) {
  if (!visible) return null
  return (
    <div className="no-print flex flex-col gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 sm:flex-row sm:items-center sm:justify-between" role="status">
      <span className="font-semibold">{label}</span>
      <button type="button" onClick={onRefresh} className="inline-flex items-center gap-2 font-black text-brand-700 hover:text-brand-900">
        <AppIcon name="refresh" className="w-4 h-4" />
        Refresh
      </button>
    </div>
  )
}
