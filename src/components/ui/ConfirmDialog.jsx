import { useEffect, useId, useRef } from 'react'
import { Spinner } from './Feedback'

export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', danger = false,
  onConfirm, onCancel, loading = false,
}) {
  const titleId = useId()
  const confirmRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = event => {
      if (event.key === 'Escape' && !loading) onCancel?.()
    }
    window.addEventListener('keydown', onKeyDown)
    window.setTimeout(() => confirmRef.current?.focus(), 20)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, loading, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={loading ? undefined : onCancel} aria-hidden="true" />
      <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl animate-[fadeIn_.15s_ease-out]" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="p-6">
          <h3 id={titleId} className="font-display font-bold text-gray-900 text-lg mb-2">{title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
          <p className="mt-3 text-[10px] font-semibold text-gray-400">Press Esc to cancel.</p>
        </div>
        <div className="flex gap-3 p-4 border-t border-gray-100">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 rounded-lg py-2.5 text-sm font-bold text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors">
            Cancel
          </button>
          <button ref={confirmRef} onClick={onConfirm} disabled={loading}
            className={`flex-1 rounded-lg py-2.5 text-sm font-bold text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-70 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'btn-primary'
            }`}>
            {loading ? <Spinner className="w-4 h-4 border-2 border-white" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
