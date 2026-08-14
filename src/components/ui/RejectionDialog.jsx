import { useId, useState } from 'react'
import { Spinner } from './Feedback'

export default function RejectionDialog({
  open,
  title = 'Reject complaint?',
  description = 'Explain why this complaint is being rejected. The reason will be visible to the customer.',
  confirmLabel = 'Reject Complaint',
  loading = false,
  options = [],
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState('')
  const [reasonCode, setReasonCode] = useState('')
  const titleId = useId()

  if (!open) return null

  const submit = () => {
    const trimmed = reason.trim()
    const selected = options.find(option => option.value === reasonCode)
    if (loading || (options.length ? !selected : trimmed.length < 3)) return
    const finalReason = selected ? `${selected.label}${trimmed ? `: ${trimmed}` : ''}` : trimmed
    Promise.resolve(onConfirm(finalReason)).then(() => { setReason(''); setReasonCode('') })
  }

  const cancel = () => {
    setReason('')
    setReasonCode('')
    onCancel()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={loading ? undefined : cancel} aria-hidden="true" />
      <div className="relative bg-white w-full max-w-md shadow-2xl rounded-xl overflow-hidden" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="p-6">
          <h3 id={titleId} className="font-display font-bold text-gray-900 text-lg mb-2">{title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed mb-4">{description}</p>
          {options.length > 0 && <div className="mb-3"><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Reason code</label><select autoFocus value={reasonCode} onChange={e => setReasonCode(e.target.value)} className="input-field rounded-lg"><option value="">Choose a reason…</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>}
          <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">
            {options.length ? 'Additional details (optional)' : 'Rejection reason'}
          </label>
          <textarea name="rejectiondialog-example-duplicate-report-incomplete-location-or-issue-is-outside-mrwd-jurisdiction-1" aria-label="Rejection reason details"
            autoFocus={options.length === 0}
            rows={4}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={options.length ? 'Add any details the customer should know…' : 'Example: Duplicate report, incomplete location, or issue is outside MRWD jurisdiction.'}
            className="input-field resize-none"
            maxLength={500}
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-[11px] text-gray-400">{options.length ? 'A reason code is required' : 'At least 3 characters'}</p>
            <p className="text-[11px] text-gray-400">{reason.length}/500</p>
          </div>
        </div>
        <div className="flex gap-3 p-4 border-t border-gray-100 bg-gray-50">
          <button onClick={cancel} disabled={loading}
            className="flex-1 py-2.5 text-sm font-bold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors rounded-lg">
            Cancel
          </button>
          <button onClick={submit} disabled={loading || (options.length ? !reasonCode : reason.trim().length < 3)}
            className="flex-1 py-2.5 text-sm font-bold text-white flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 rounded-lg">
            {loading ? <Spinner className="w-4 h-4 border-2 border-white" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
