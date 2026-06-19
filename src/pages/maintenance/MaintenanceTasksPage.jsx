import { useAuthStore } from '../../store/authStore'
import { useComplaintStore } from '../../store/complaintStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { useState } from 'react'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function MaintenanceTasksPage() {
  const user         = useAuthStore(s => s.user)
  const complaints   = useComplaintStore(s => s.complaints)
  const updateStatus = useComplaintStore(s => s.updateStatus)
  const [toast, setToast] = useState('')

  const myTasks = complaints
    .filter(c => c.assigned_to === user.id)
    .sort((a, b) => b.priority_score - a.priority_score)

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const handleStatus = (id, status) => {
    updateStatus(id, status)
    showToast('Status updated.')
  }

  if (myTasks.length === 0) {
    return (
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">My Tasks</h1>
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">🔧</div>
          <p className="text-gray-500 font-medium">No tasks assigned yet.</p>
          <p className="text-sm text-gray-400 mt-1">The admin will assign complaints to you soon.</p>
        </div>
      </div>
    )
  }

  const active    = myTasks.filter(t => t.status !== 'completed')
  const completed = myTasks.filter(t => t.status === 'completed')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Tasks</h1>
        <p className="text-gray-500 text-sm mt-0.5">{active.length} active · {completed.length} completed</p>
      </div>

      {toast && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 ">
          ✅ {toast}
        </div>
      )}

      {/* Active tasks */}
      {active.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Active</h2>
          <div className="space-y-3">
            {active.map(t => (
              <div key={t.id} className="card p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{t.complaint_type}</span>
                      <PriorityBadge priority={t.priority}/>
                    </div>
                    <StatusBadge status={t.status}/>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-bold text-gray-700">{t.priority_score}</div>
                    <div className="text-xs text-gray-400">score</div>
                  </div>
                </div>

                <p className="text-sm text-gray-600 mb-3">{t.description}</p>

                <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
                  <span>📍 {t.address}</span>
                  <span>·</span>
                  <span>👤 {t.customer_name}</span>
                  <span>·</span>
                  <span>🕒 {timeAgo(t.created_at)}</span>
                </div>

                {/* Status update */}
                <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                  <span className="text-xs text-gray-500 font-medium">Update status:</span>
                  {['pending', 'in_progress', 'completed'].map(s => (
                    <button
                      key={s}
                      onClick={() => handleStatus(t.id, s)}
                      className={`px-3 py-1  text-xs font-medium border transition-colors ${
                        t.status === s
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400 hover:text-brand-600'
                      }`}
                    >
                      {s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">Completed</h2>
          <div className="space-y-2">
            {completed.map(t => (
              <div key={t.id} className="card p-4 opacity-60">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{t.complaint_type}</span>
                  <StatusBadge status={t.status}/>
                </div>
                <p className="text-xs text-gray-400 mt-1">{t.address}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
