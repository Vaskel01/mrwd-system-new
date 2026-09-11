import Dialog from './Dialog'
import { PriorityBadge, StatusBadge } from './Badges'
import { statusLabel } from '../../config/terminology'

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function Breakdown({ title, entries }) {
  const rows = Object.entries(entries || {}).filter(([, value]) => value > 0)
  if (!rows.length) return null
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wider text-gray-500">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {rows.map(([key, value]) => (
          <span key={key} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">
            {title === 'Status breakdown' ? statusLabel(key) : `${key.charAt(0).toUpperCase()}${key.slice(1)}`}: {value}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function HotspotDetailsDialog({ open, hotspot, onClose, onComplaintOpen, onViewMap }) {
  return (
    <Dialog
      open={open}
      title={hotspot ? `${hotspot.area} complaint hotspot` : 'Complaint hotspot'}
      description={hotspot ? `${hotspot.total} active complaints within ${hotspot.radiusMeters} meters` : undefined}
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      {hotspot ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs font-bold text-gray-500">Active complaints</p><p className="mt-1 text-xl font-black text-navy-900">{hotspot.total}</p></div>
            <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs font-bold text-gray-500">Most common issue</p><p className="mt-1 text-sm font-black text-navy-900">{hotspot.mostCommonCategory}</p></div>
            <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs font-bold text-gray-500">Radius</p><p className="mt-1 text-xl font-black text-navy-900">{hotspot.radiusMeters} m</p></div>
            <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs font-bold text-gray-500">Center</p><p className="mt-1 text-xs font-black text-navy-900">{hotspot.center.lat.toFixed(6)}, {hotspot.center.lng.toFixed(6)}</p></div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Breakdown title="Priority breakdown" entries={hotspot.priorityBreakdown} />
            <Breakdown title="Status breakdown" entries={hotspot.statusBreakdown} />
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={() => onViewMap?.(hotspot)} className="btn-secondary rounded-lg text-xs">View on map</button>
          </div>

          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-wider text-gray-500">Complaints in this hotspot</p>
            <div className="space-y-2">
              {hotspot.complaints.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onComplaintOpen?.(item)}
                  className="w-full rounded-xl border border-gray-200 p-3 text-left transition hover:border-navy-200 hover:bg-navy-50/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-black text-gray-900">{item.reference_number}</p>
                      <p className="mt-1 text-xs font-semibold text-gray-600">{item.complaint_type}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5"><PriorityBadge priority={item.priority} /><StatusBadge status={item.status} /></div>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">{item.address || 'No address on file'}</p>
                  <p className="mt-1 text-xs text-gray-500">Submitted: {formatDate(item.created_at || item.submitted_at)}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}
