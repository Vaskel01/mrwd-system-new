import { STATUS_LABELS } from '../../config/terminology'

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
    forwarded:   'inline-flex max-w-full items-center rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-center text-xs font-semibold leading-tight text-brand-700 whitespace-normal',
    assigned:    'badge-assigned',
    en_route:    'badge-in_progress',
    in_progress: 'badge-in_progress',
    awaiting_verification: 'inline-flex max-w-full items-center rounded-full border border-water-200 bg-water-50 px-2.5 py-1 text-center text-xs font-semibold leading-tight text-navy-700 whitespace-normal',
    resolved:    'badge-completed',
    completed:   'badge-completed',
    rejected:    'inline-flex max-w-full items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-center text-xs font-semibold leading-tight text-red-700 whitespace-normal',
    cancelled:   'inline-flex max-w-full items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-center text-xs font-semibold leading-tight text-gray-700 whitespace-normal',
    blocked:     'inline-flex max-w-full items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-center text-xs font-semibold leading-tight text-amber-800 whitespace-normal',
  }
  const labels = STATUS_LABELS
  return <span className={map[status] || 'badge-pending'} aria-label={`Status: ${labels[status] || status}`}>{labels[status] || status}</span>
}
