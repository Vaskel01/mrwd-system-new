import { useRef } from 'react'
import Dialog from './Dialog'
import { Spinner } from './Feedback'

export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', danger = false,
  onConfirm, onCancel, loading = false,
}) {
  const confirmRef = useRef(null)

  return (
    <Dialog open={open} title={title} description={message} onClose={onCancel} closeDisabled={loading} maxWidth="max-w-sm">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={loading} className="btn-secondary rounded-lg">
          Cancel
        </button>
        <button
          ref={confirmRef}
          type="button"
          autoFocus
          onClick={onConfirm}
          disabled={loading}
          className={`min-w-32 rounded-lg px-5 py-2.5 text-sm font-bold text-white disabled:opacity-70 ${danger ? 'bg-red-600 hover:bg-red-700' : 'btn-primary'}`}
        >
          {loading ? <span className="inline-flex items-center gap-2"><Spinner className="w-4 h-4 border-2 border-white" />Working…</span> : confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
