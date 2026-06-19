import { useState } from 'react'
import { useComplaintStore } from '../../store/complaintStore'
import { MAINTENANCE_STAFF } from '../../mock/data'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'

export default function AssignTaskPage() {
  const complaints     = useComplaintStore(s => s.complaints)
  const assignComplaint = useComplaintStore(s => s.assignComplaint)
  const updateStatus   = useComplaintStore(s => s.updateStatus)

  const [selected, setSelected]         = useState(null)
  const [selectedStaff, setSelectedStaff] = useState('')
  const [assigning, setAssigning]       = useState(false)
  const [toast, setToast]               = useState('')

  const unassigned = complaints.filter(c => !c.assigned_to && c.status === 'pending')
  const assigned   = complaints.filter(c => c.assigned_to)

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const handleAssign = async () => {
    if (!selected || !selectedStaff) return
    setAssigning(true)
    await new Promise(r => setTimeout(r, 600))
    const staff = MAINTENANCE_STAFF.find(s => s.id === selectedStaff)
    assignComplaint(selected.id, staff.id, staff.full_name)
    setSelected(null)
    setSelectedStaff('')
    setAssigning(false)
    showToast(`Assigned to ${staff.full_name} successfully.`)
  }

  const handleStatusChange = (id, status) => {
    updateStatus(id, status)
    showToast('Status updated.')
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Assign Tasks</h1>
        <p className="text-gray-500 text-sm mt-0.5">Assign pending complaints to maintenance personnel</p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3  flex items-center gap-2">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
          {toast}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Unassigned */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Unassigned ({unassigned.length})
          </h2>
          {unassigned.length === 0 ? (
            <div className="card p-8 text-center text-gray-400 text-sm">All complaints are assigned ✅</div>
          ) : (
            <div className="space-y-2">
              {unassigned
                .sort((a, b) => b.priority_score - a.priority_score)
                .map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelected(selected?.id === c.id ? null : c)}
                  className={`card p-4 cursor-pointer transition-all ${
                    selected?.id === c.id
                      ? 'border-brand-500 ring-2 ring-brand-200'
                      : 'hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-medium text-sm text-gray-900">{c.complaint_type}</span>
                    <PriorityBadge priority={c.priority}/>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2 mb-2">{c.description}</p>
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>📍 {c.address.slice(0, 40)}...</span>
                    <span className="font-semibold text-gray-600">Score: {c.priority_score}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Assign panel */}
          {selected && (
            <div className="mt-4 card p-4 bg-slate-50 border-brand-200">
              <p className="text-sm font-semibold text-brand-800 mb-3">Assign: {selected.complaint_type}</p>
              <select
                value={selectedStaff}
                onChange={e => setSelectedStaff(e.target.value)}
                className="input-field mb-3"
              >
                <option value="">Select maintenance staff</option>
                {MAINTENANCE_STAFF.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
              <button
                onClick={handleAssign}
                disabled={!selectedStaff || assigning}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {assigning
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent  animate-spin"/>Assigning...</>
                  : 'Confirm Assignment'
                }
              </button>
            </div>
          )}
        </div>

        {/* Assigned */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Assigned ({assigned.length})
          </h2>
          {assigned.length === 0 ? (
            <div className="card p-8 text-center text-gray-400 text-sm">No assigned complaints yet</div>
          ) : (
            <div className="space-y-2">
              {assigned.map(c => (
                <div key={c.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-medium text-sm text-gray-900">{c.complaint_type}</span>
                    <StatusBadge status={c.status}/>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">👷 {c.assigned_name}</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={c.status}
                      onChange={e => handleStatusChange(c.id, e.target.value)}
                      className="input-field text-xs py-1.5 w-auto"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
