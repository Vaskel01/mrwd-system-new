import { Spinner } from './Feedback'

export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', danger = false,
  onConfirm, onCancel, loading = false,
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={loading ? undefined : onCancel} />
      <div className="relative bg-white w-full max-w-sm shadow-2xl animate-[fadeIn_.15s_ease-out]">
        <div className="p-6">
          <h3 className="font-display font-bold text-gray-900 text-lg mb-2">{title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-3 p-4 border-t border-gray-100">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-2.5 text-sm font-bold text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={`flex-1 py-2.5 text-sm font-bold text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-70 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'btn-primary'
            }`}>
            {loading ? <Spinner className="w-4 h-4 border-2 border-white" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
