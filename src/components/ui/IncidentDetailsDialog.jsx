import Dialog from './Dialog'
import { PriorityBadge, StatusBadge } from './Badges'
import { Spinner } from './Feedback'

const INCIDENT_STATUS_LABELS = { active: 'Active', monitoring: 'Monitoring', resolved: 'Resolved' }
const INCIDENT_STATUS_STYLES = {
  active: 'bg-red-100 text-red-800',
  monitoring: 'bg-amber-100 text-amber-800',
  resolved: 'bg-green-100 text-green-800',
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function DetailRow({ label, children }) {
  return (
    <div className="border-b border-gray-100 py-3 last:border-0">
      <p className="mb-1 text-xs font-semibold text-gray-500">{label}</p>
      <div className="break-words text-sm leading-6 text-gray-700">{children}</div>
    </div>
  )
}

// Shown when the "View Details" action is used on an incident. Data comes
// from GET /workflow/incidents/:id, fetched by the caller — this component
// only renders whatever loading/error/incident state it is handed.
export default function IncidentDetailsDialog({ open, loading, error, incident, onClose }) {
  const statusKey = incident?.status
  return (
    <Dialog
      open={open}
      title={incident?.title || 'Incident details'}
      description={incident ? (incident.location_text || 'No location label') : undefined}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-10" role="status" aria-live="polite">
          <Spinner className="h-6 w-6 border-[3px] border-brand-600" />
          <p className="text-sm font-medium text-gray-600">Loading incident details…</p>
        </div>
      ) : error ? (
        <div role="alert" className="rounded-lg border-l-4 border-red-500 bg-red-50 px-4 py-3.5 text-sm font-medium text-red-800">{error}</div>
      ) : incident ? (
        <div>
          <span className={`inline-block rounded px-2 py-1 text-xs font-black uppercase ${INCIDENT_STATUS_STYLES[statusKey] || 'bg-gray-100 text-gray-700'}`}>
            {INCIDENT_STATUS_LABELS[statusKey] || statusKey}
          </span>

          <DetailRow label="Location">{incident.location_text || 'No location label'}</DetailRow>
          <DetailRow label="Description">{incident.description || 'No description provided.'}</DetailRow>
          <DetailRow label="Date created">{formatDate(incident.created_at)}</DetailRow>
          <DetailRow label="Created by">{incident.created_by_name || 'Unavailable'}</DetailRow>
          {statusKey === 'resolved' && <DetailRow label="Date resolved">{formatDate(incident.resolved_at)}</DetailRow>}

          <div className="mt-4">
            <p className="mb-2 text-xs font-black uppercase tracking-wider text-gray-500">
              Linked complaints ({incident.complaints?.length || 0})
            </p>
            {incident.complaints?.length ? (
              <div className="space-y-2">
                {incident.complaints.map(item => (
                  <div key={item.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-gray-900">{item.reference_number}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PriorityBadge priority={item.priority} />
                        <StatusBadge status={item.status} />
                      </div>
                    </div>
                    <p className="mt-1.5 text-xs text-gray-500">{item.complaint_type}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{item.address || 'No address on file'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No complaints are currently linked to this incident.</p>
            )}
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}
