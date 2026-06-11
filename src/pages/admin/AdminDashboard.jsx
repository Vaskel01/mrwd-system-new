import { useComplaintStore } from '../../store/complaintStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { useNavigate } from 'react-router-dom'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function AdminDashboard() {
  const complaints = useComplaintStore(s => s.complaints)
  const navigate   = useNavigate()

  const total      = complaints.length
  const pending    = complaints.filter(c => c.status === 'pending').length
  const inProgress = complaints.filter(c => c.status === 'in_progress').length
  const completed  = complaints.filter(c => c.status === 'completed').length
  const high       = complaints.filter(c => c.priority === 'high').length

  const recent = [...complaints]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)

  const stats = [
    { label: 'Total Complaints', value: total,      color: 'bg-blue-50 text-blue-700',   icon: '📋' },
    { label: 'Pending',          value: pending,    color: 'bg-yellow-50 text-yellow-700', icon: '⏳' },
    { label: 'In Progress',      value: inProgress, color: 'bg-blue-50 text-blue-700',   icon: '🔧' },
    { label: 'High Priority',    value: high,       color: 'bg-red-50 text-red-700',     icon: '🔴' },
    { label: 'Completed',        value: completed,  color: 'bg-green-50 text-green-700', icon: '✅' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">Overview of all complaints in the system</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {stats.map(s => (
          <div key={s.label} className="card p-4 text-center">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className={`text-2xl font-bold mb-0.5 ${s.color.split(' ')[1]}`}>{s.value}</div>
            <div className="text-xs text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Recent complaints */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Complaints</h2>
          <button onClick={() => navigate('/admin/complaints')}
            className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            View all →
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {recent.map(c => (
            <div key={c.id} className="px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-gray-900">{c.complaint_type}</span>
                  <PriorityBadge priority={c.priority} />
                </div>
                <p className="text-xs text-gray-500 truncate">{c.customer_name} · {c.address}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge status={c.status} />
                <span className="text-xs text-gray-400">{timeAgo(c.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
