import { useComplaintStore } from '../../store/complaintStore'
import { useAuthStore } from '../../store/authStore'
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

function StatCard({ label, value, icon, bg, text, sub }) {
  return (
    <div className={`${bg}  p-5 flex items-center gap-4`}>
      <div className="text-4xl">{icon}</div>
      <div>
        <p className={`font-display font-extrabold text-2xl sm:text-3xl ${text}`}>{value}</p>
        <p className="text-sm font-semibold text-gray-600">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const complaints = useComplaintStore(s => s.complaints)
  const user       = useAuthStore(s => s.user)
  const navigate   = useNavigate()

  const total      = complaints.length
  const pending    = complaints.filter(c => c.status === 'pending').length
  const inProgress = complaints.filter(c => c.status === 'in_progress').length
  const completed  = complaints.filter(c => c.status === 'completed').length
  const high       = complaints.filter(c => c.priority === 'high').length

  const recent = [...complaints]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <p className="text-brand-600 text-sm font-semibold mb-1">Good day 👋</p>
          <h1 className="font-display font-extrabold text-gray-900 text-2xl sm:text-3xl">
            Welcome, {user?.full_name?.split(' ')[0]}!
          </h1>
          <p className="text-gray-500 mt-1">Here's what's happening in the system today.</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Today</p>
          <p className="text-sm font-semibold text-gray-700">
            {new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Complaints" value={total}      icon="📋" bg="bg-white border border-gray-100 shadow-sm"   text="text-gray-800" />
        <StatCard label="Pending"          value={pending}    icon="⏳" bg="bg-amber-50 border border-amber-100"          text="text-amber-700" sub="Needs action" />
        <StatCard label="High Priority"    value={high}       icon="🔴" bg="bg-red-50 border border-red-100"              text="text-red-600"   sub="Urgent" />
        <StatCard label="Completed"        value={completed}  icon="✅" bg="bg-slate-50 border border-brand-100"          text="text-brand-700" sub="Resolved" />
      </div>

      {/* Progress bar */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Resolution Progress</h2>
          <span className="text-sm font-bold text-brand-600">
            {total > 0 ? Math.round((completed / total) * 100) : 0}% resolved
          </span>
        </div>
        <div className="w-full bg-gray-100  h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-brand-400 to-brand-600 h-3  transition-all duration-700"
            style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>{pending} pending</span>
          <span>{inProgress} in progress</span>
          <span>{completed} completed</span>
        </div>
      </div>

      {/* Recent complaints */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display font-bold text-gray-900">Recent Complaints</h2>
          <button onClick={() => navigate('/admin/complaints')}
            className="text-sm text-brand-600 hover:text-brand-700 font-semibold transition-colors">
            View all →
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {recent.map(c => (
            <div key={c.id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="w-10 h-10 bg-brand-100  flex items-center justify-center text-lg shrink-0">
                {c.priority === 'high' ? '🔴' : c.priority === 'medium' ? '🟡' : '🟢'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.complaint_type}</p>
                  <PriorityBadge priority={c.priority} />
                </div>
                <p className="text-xs text-gray-400 truncate">{c.customer_name} · {c.address}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
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
