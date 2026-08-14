export function PriorityBadge({ priority }) {
  const map = {
    high:   'badge-high',
    medium: 'badge-medium',
    low:    'badge-low',
  }
  return <span className={map[priority] || 'badge-low'} aria-label={`Priority: ${priority || 'not set'}`}>{priority}</span>
}

export function StatusBadge({ status }) {
  const map = {
    pending:     'badge-pending',
    forwarded:   'inline-flex items-center px-2.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200 rounded-sm',
    assigned:    'badge-assigned',
    en_route:    'badge-in_progress',
    in_progress: 'badge-in_progress',
    awaiting_verification: 'inline-flex items-center px-2.5 py-0.5 text-xs font-semibold bg-violet-100 text-violet-700 border border-violet-200 rounded-sm',
    resolved:    'badge-completed',
    completed:   'badge-completed',
    rejected:    'inline-flex items-center px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700 border border-red-200 rounded-sm',
    cancelled:   'inline-flex items-center px-2.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200 rounded-sm',
    blocked:     'inline-flex items-center px-2.5 py-0.5 text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200 rounded-sm',
  }
  const labels = {
    pending:     'Pending Review',
    forwarded:   'Forwarded to ECMD',
    assigned:    'Assigned',
    en_route:    'In Progress',
    in_progress: 'In Progress',
    awaiting_verification: 'Awaiting Verification',
    resolved:    'Resolved',
    completed:   'Resolved',
    rejected:    'Rejected',
    cancelled:   'Cancelled',
    blocked:     'Needs Attention',
  }
  return <span className={map[status] || 'badge-pending'} aria-label={`Status: ${labels[status] || status}`}>{labels[status] || status}</span>
}
