import AppIcon from './AppIcon'
import { PriorityBadge, StatusBadge } from './Badges'

function formatDate(value) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
}

function nextStepFor(complaint, mode) {
  if (!complaint) return null
  if (mode === 'commercial') {
    if (complaint.status === 'pending') return ['Review and route', 'Confirm the complaint details and priority, then send valid field work to WDLCD.']
    if (complaint.status === 'forwarded') return ['Handoff complete', 'WDLCD can now assign Maintenance Personnel and plan the field response.']
    if (complaint.status === 'blocked') return ['Coordinate support', 'Review the recorded blocker and help the field team remove it.']
    if (complaint.status === 'awaiting_verification') return ['Waiting for WDLCD', 'WDLCD must verify the completion report before this complaint is resolved.']
    if (complaint.status === 'resolved') return ['Resolved', 'The field response and verification are complete.']
    return ['Follow progress', 'Open the full record to review the latest assignment, notes, and activity.']
  }

  if (complaint.status === 'forwarded' && !complaint.assigned_to) return ['Assign field work', 'Choose an available Maintenance Crew or Maintenance Personnel member and add clear field instructions.']
  if (complaint.status === 'assigned') return ['Prepare the response', 'Confirm that the assignment and field instructions match the complaint location and priority.']
  if (['en_route', 'in_progress'].includes(complaint.status)) return ['Monitor field work', 'Follow the active repair and respond quickly if the assigned team reports a blocker.']
  if (complaint.status === 'blocked') return ['Remove the blocker', 'Coordinate access, materials, equipment, or additional support before lower-priority work.']
  if (complaint.status === 'awaiting_verification') return ['Verify completion', 'Review the completion evidence and resolve the complaint only when the work is confirmed.']
  return ['Review the record', 'Open the full complaint to check its latest activity and available actions.']
}

export default function ComplaintFocusPanel({
  complaint,
  mode,
  onOpen,
  primaryAction,
  secondaryActions = [],
  recommendation,
}) {
  if (!complaint) {
    return (
      <aside className="focus-panel flex min-h-[420px] items-center justify-center p-6 text-center">
        <div className="max-w-xs">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-navy-700"><AppIcon name="clipboard" /></span>
          <h2 className="mt-4 font-display text-lg font-black text-navy-900">Select a complaint</h2>
          <p className="mt-1 text-sm leading-6 text-gray-500">Choose an item from the queue to see its details and the recommended next action.</p>
        </div>
      </aside>
    )
  }

  const nextStep = nextStepFor(complaint, mode)
  const signals = [
    complaint.classification_mismatch ? `Selected as ${complaint.complaint_type}; automatic analysis suggests ${complaint.classified_category}.` : '',
    complaint.similar_count ? `${complaint.similar_count} nearby or related complaint${complaint.similar_count === 1 ? '' : 's'} may need review.` : '',
    complaint.priority_is_overridden ? 'The current priority was changed manually and includes a recorded reason.' : '',
  ].filter(Boolean)

  return (
    <aside className="focus-panel min-w-0" aria-label={`Focused complaint ${complaint.reference_number}`}>
      <div className="border-b border-gray-100 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs font-bold text-gray-500">{complaint.reference_number}</p>
            <h2 className="mt-1 break-words font-display text-xl font-black text-navy-900">{complaint.complaint_type}</h2>
          </div>
          <div className="flex flex-wrap gap-2"><PriorityBadge priority={complaint.priority} /><StatusBadge status={complaint.status} /></div>
        </div>

        <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <div className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700"><AppIcon name="assignment" className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wider text-brand-700">Recommended next step</p>
              <p className="mt-1 font-black text-navy-900">{nextStep[0]}</p>
              <p className="mt-1 text-sm leading-6 text-gray-600">{nextStep[1]}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="text-xs font-black uppercase tracking-wider text-gray-500">Customer</dt><dd className="mt-1 break-words text-sm font-bold text-gray-900">{complaint.customer_name || 'Customer'}</dd></div>
          <div><dt className="text-xs font-black uppercase tracking-wider text-gray-500">Submitted</dt><dd className="mt-1 text-sm font-bold text-gray-900">{formatDate(complaint.submitted_at || complaint.created_at)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs font-black uppercase tracking-wider text-gray-500">Address</dt><dd className="mt-1 break-words text-sm font-bold text-gray-900">{complaint.address || 'No address recorded'}</dd></div>
          <div><dt className="text-xs font-black uppercase tracking-wider text-gray-500">Assignment</dt><dd className="mt-1 break-words text-sm font-bold text-gray-900">{complaint.assigned_name || 'Unassigned'}</dd></div>
          <div><dt className="text-xs font-black uppercase tracking-wider text-gray-500">Priority score</dt><dd className="mt-1 text-sm font-bold text-gray-900">{complaint.priority_score ?? 'Not available'}{complaint.priority_score != null ? '/100' : ''}</dd></div>
        </dl>

        <div>
          <p className="text-xs font-black uppercase tracking-wider text-gray-500">Complaint details</p>
          <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">{complaint.description || 'No description was provided.'}</p>
        </div>

        {signals.length ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-amber-800">Review signals</p>
            <ul className="mt-2 space-y-2">{signals.map(signal => <li key={signal} className="flex gap-2 text-sm leading-5 text-amber-900"><span aria-hidden="true">•</span><span>{signal}</span></li>)}</ul>
          </div>
        ) : null}

        {recommendation}

        <div className="flex flex-col gap-2 border-t border-gray-100 pt-5 sm:flex-row sm:flex-wrap">
          {primaryAction ? <button type="button" onClick={primaryAction.onClick} disabled={primaryAction.disabled} className="btn-primary flex-1 rounded-lg disabled:opacity-50">{primaryAction.label}</button> : null}
          {secondaryActions.map(action => <button key={action.label} type="button" onClick={action.onClick} disabled={action.disabled} className="btn-secondary flex-1 rounded-lg disabled:opacity-50">{action.label}</button>)}
          <button type="button" onClick={() => onOpen(complaint)} className="btn-secondary flex-1 rounded-lg">Open full record</button>
        </div>
      </div>
    </aside>
  )
}
