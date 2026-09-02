import { priorityLabel, statusLabel } from '../../config/terminology'

export function PriorityBadge({ priority }) {
  const map = {
    high:   'badge-high',
    medium: 'badge-medium',
    low:    'badge-low',
  }
  const label = priorityLabel(priority)
  return <span className={map[priority] || 'badge-low'} aria-label={`Priority: ${label}`}>{label}</span>
}

export function StatusBadge({ status }) {
  const map = {
    pending:     'badge-pending',
    forwarded:   'badge-forwarded',
    assigned:    'badge-assigned',
    en_route:    'badge-en_route',
    in_progress: 'badge-in_progress',
    awaiting_verification: 'badge-awaiting',
    resolved:    'badge-completed',
    completed:   'badge-completed',
    rejected:    'badge-rejected',
    cancelled:   'badge-cancelled',
    blocked:     'badge-blocked',
    merged:      'badge-cancelled',
  }
  const label = statusLabel(status)
  return <span className={map[status] || 'badge-pending'} aria-label={`Status: ${label}`}>{label}</span>
}
