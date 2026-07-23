import { useEffect, useState } from 'react'
import { Spinner } from './Feedback'

export default function RejectionDialog({
  open,
  title = 'Reject complaint?',
  description = 'Explain why this complaint is being rejected. The reason will be visible to the customer.',
  confirmLabel = 'Reject Complaint',
  loading = false,
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  if (!open) return null

  const submit = () => {
    const trimmed = reason.trim()
    if (trimmed.length < 3 || loading) return
    onConfirm(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={loading ? undefined : onCancel} />
      <div className="relative bg-white w-full max-w-md shadow-2xl rounded-xl overflow-hidden">
        <div className="p-6">
          <h3 className="font-display font-bold text-gray-900 text-lg mb-2">{title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed mb-4">{description}</p>
          <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">
            Rejection reason
          </label>
          <textarea name="rejectiondialog-example-duplicate-report-incomplete-location-or-issue-is-outside-mrwd-jurisdiction-1" aria-label="Example: Duplicate report, incomplete location, or issue is outside MRWD jurisdiction."
            autoFocus
            rows={4}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Example: Duplicate report, incomplete location, or issue is outside MRWD jurisdiction."
            className="input-field resize-none"
            maxLength={500}
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-[11px] text-gray-400">At least 3 characters</p>
            <p className="text-[11px] text-gray-400">{reason.length}/500</p>
          </div>
        </div>
        <div className="flex gap-3 p-4 border-t border-gray-100 bg-gray-50">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-2.5 text-sm font-bold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors rounded-lg">
            Cancel
          </button>
          <button onClick={submit} disabled={loading || reason.trim().length < 3}
            className="flex-1 py-2.5 text-sm font-bold text-white flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 rounded-lg">
            {loading ? <Spinner className="w-4 h-4 border-2 border-white" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
