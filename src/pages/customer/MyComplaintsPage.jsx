import { useAuthStore } from '../../store/authStore'
import { useComplaintStore } from '../../store/complaintStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function MyComplaintsPage() {
  const user       = useAuthStore(s => s.user)
  const complaints = useComplaintStore(s => s.getMyComplaints(user.id))

  if (complaints.length === 0) {
    return (
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">My Complaints</h1>
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500 font-medium">No complaints submitted yet.</p>
          <p className="text-sm text-gray-400 mt-1">Go to Submit Complaint to file a new one.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Complaints</h1>
          <p className="text-gray-500 text-sm mt-0.5">{complaints.length} complaint{complaints.length !== 1 ? 's' : ''} submitted</p>
        </div>
      </div>

      <div className="space-y-3">
        {complaints.map(c => (
          <div key={c.id} className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-gray-900 text-sm">{c.complaint_type}</span>
                  <PriorityBadge priority={c.priority} />
                  <StatusBadge status={c.status} />
                </div>
                <p className="text-sm text-gray-600 line-clamp-2 mb-2">{c.description}</p>
                <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                  <span>📍 {c.address}</span>
                  <span>🕒 {timeAgo(c.created_at)}</span>
                  {c.assigned_name && <span>👷 Assigned to {c.assigned_name}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold text-gray-700">{c.priority_score}</div>
                <div className="text-xs text-gray-400">score</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
