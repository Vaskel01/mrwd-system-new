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
    in_progress: 'badge-in_progress',
    completed:   'badge-completed',
    rejected:    'inline-flex items-center px-2.5 py-0.5  text-xs font-semibold bg-red-100 text-red-700',
  }
  const labels = {
    pending:     'Pending',
    in_progress: 'In Progress',
    completed:   'Completed',
    rejected:    'Rejected',
  }
  return <span className={map[status] || 'badge-pending'}>{labels[status] || status}</span>
}
