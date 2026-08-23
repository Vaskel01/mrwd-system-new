import { useId, useState } from 'react'
import Dialog from './Dialog'
import { Spinner } from './Feedback'

export default function RejectionDialog({
  open,
  title = 'Reject complaint?',
  description = 'Explain why this complaint is being rejected. The reason will be visible to the customer.',
  confirmLabel = 'Reject complaint',
  loading = false,
  options = [],
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState('')
  const [reasonCode, setReasonCode] = useState('')
  const reasonCodeId = useId()
  const detailsId = useId()

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
    <Dialog open={open} title={title} description={description} onClose={cancel} closeDisabled={loading} maxWidth="max-w-md">
      <div className="space-y-4">
        {options.length > 0 && (
          <div>
            <label htmlFor={reasonCodeId} className="block text-sm font-bold text-gray-700">Reason</label>
            <select id={reasonCodeId} autoFocus value={reasonCode} onChange={e => setReasonCode(e.target.value)} className="input-field mt-2 rounded-lg">
              <option value="">Choose a reason…</option>
              {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor={detailsId} className="block text-sm font-bold text-gray-700">
            {options.length ? 'Additional details (optional)' : 'Rejection reason'}
          </label>
          <textarea
            id={detailsId}
            autoFocus={options.length === 0}
            rows={4}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={options.length ? 'Add any details the customer should know…' : 'Example: This report duplicates an existing complaint.'}
            className="input-field mt-2 resize-none rounded-lg"
            maxLength={500}
          />
          <div className="mt-1.5 flex items-center justify-between gap-3 text-sm text-gray-500">
            <p>{options.length ? 'Choose a reason before continuing.' : 'Enter at least 3 characters.'}</p>
            <p>{reason.length}/500</p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={cancel} disabled={loading} className="btn-secondary rounded-lg">Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={loading || (options.length ? !reasonCode : reason.trim().length < 3)}
            className="min-h-11 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? <span className="inline-flex items-center gap-2"><Spinner className="w-4 h-4 border-2 border-white" />Working…</span> : confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
