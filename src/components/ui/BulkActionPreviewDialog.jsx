import Dialog from './Dialog'
import { Spinner } from './Feedback'

export default function BulkActionPreviewDialog({
  open,
  title = 'Review bulk action',
  actionLabel,
  description,
  complaints = [],
  warning = '',
  loading = false,
  onConfirm,
  onCancel,
}) {
  const visible = complaints.slice(0, 4)
  const remaining = Math.max(0, complaints.length - visible.length)

  return (
    <Dialog
      open={open}
      title={title}
      description="Check the affected complaints before applying this change."
      onClose={onCancel}
      closeDisabled={loading}
      maxWidth="max-w-xl"
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-navy-100 bg-navy-50 p-4">
          <p className="text-xs font-black uppercase tracking-wider text-navy-600">Action</p>
          <p className="mt-1 text-base font-black text-navy-900">{actionLabel}</p>
          {description ? <p className="mt-1 text-sm leading-6 text-gray-600">{description}</p> : null}
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-navy-900">Affected complaints</p>
            <span className="rounded-full bg-navy-100 px-2.5 py-1 text-xs font-black text-navy-700">{complaints.length}</span>
          </div>
          <div className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
            {visible.map(complaint => (
              <div key={complaint.id} className="px-3 py-2.5">
                <p className="font-mono text-xs font-bold text-gray-500">{complaint.reference_number}</p>
                <p className="mt-0.5 truncate text-sm font-bold text-gray-900">{complaint.complaint_type}</p>
              </div>
            ))}
            {remaining ? <p className="px-3 py-2.5 text-xs font-bold text-gray-500">And {remaining} more complaint{remaining === 1 ? '' : 's'}</p> : null}
          </div>
        </div>

        {warning ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            <span className="font-black">Before continuing: </span>{warning}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={loading} className="btn-secondary rounded-lg">Go back</button>
          <button type="button" autoFocus onClick={onConfirm} disabled={loading} className="btn-primary min-w-40 rounded-lg disabled:opacity-60">
            {loading ? <span className="inline-flex items-center gap-2"><Spinner className="h-4 w-4 border-2" />Applying…</span> : 'Confirm action'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
