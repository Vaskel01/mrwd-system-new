export function PriorityBadge({ priority }) {
  const map = {
    high:   'badge-high',
    medium: 'badge-medium',
    low:    'badge-low',
  }
  return <span className={map[priority] || 'badge-low'}>{priority}</span>
}

export function StatusBadge({ status }) {
  const map = {
    pending:     'badge-pending',
    assigned:    'badge-assigned',
    en_route:    'badge-en_route',
    in_progress: 'badge-in_progress',
    completed:   'badge-completed',
    rejected:    'inline-flex items-center px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700 border border-red-200 rounded-sm',
    cancelled:   'inline-flex items-center px-2.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200 rounded-sm',
    blocked:     'inline-flex items-center px-2.5 py-0.5 text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200 rounded-sm',
  }
  const labels = {
    pending:     'Pending',
    assigned:    'Assigned',
    en_route:    'En Route',
    in_progress: 'On Site',
    completed:   'Completed',
    rejected:    'Rejected',
    cancelled:   'Cancelled',
    blocked:     'Needs Attention',
  }
  return <span className={map[status] || 'badge-pending'}>{labels[status] || status}</span>
}
