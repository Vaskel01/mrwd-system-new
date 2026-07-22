import { useState, useEffect } from 'react'
import { useComplaintStore } from '../../store/complaintStore'
import { apiFetch } from '../../lib/api'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { PageLoader, ErrorBanner, Spinner } from '../../components/ui/Feedback'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const PRIORITY_STRIPE = {
  high:   'border-l-red-500',
  medium: 'border-l-amber-400',
  low:    'border-l-green-400',
}

// Every option does a full multi-level sort — a primary key, then a
// tiebreaker — rather than a flat single-field sort, so ties always
// resolve consistently instead of shuffling around.
const SORT_OPTIONS = {
  priority: { label: 'Priority (High → Low)', cmp: (a, b) => b.priority_score - a.priority_score || new Date(b.created_at) - new Date(a.created_at) },
  date_new: { label: 'Newest First',           cmp: (a, b) => new Date(b.created_at) - new Date(a.created_at) || b.priority_score - a.priority_score },
  date_old: { label: 'Oldest First',           cmp: (a, b) => new Date(a.created_at) - new Date(b.created_at) || b.priority_score - a.priority_score },
  type:     { label: 'Type (A → Z)',           cmp: (a, b) => a.complaint_type.localeCompare(b.complaint_type) || b.priority_score - a.priority_score },
}

export default function AssignTaskPage() {
  const complaints      = useComplaintStore(s => s.complaints)
  const loading         = useComplaintStore(s => s.loading)
  const error           = useComplaintStore(s => s.error)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)
  const assignComplaint = useComplaintStore(s => s.assignComplaint)
  const updateStatus    = useComplaintStore(s => s.updateStatus)
  const bulkAssign      = useComplaintStore(s => s.bulkAssign)
  const bulkStatus      = useComplaintStore(s => s.bulkStatus)

  const [staffList, setStaffList]         = useState([])
  const [staffError, setStaffError]       = useState('')
  const [selectedId, setSelectedId]       = useState(null)
  const [selectedStaff, setSelectedStaff] = useState('')
  const [assignNotes, setAssignNotes]     = useState('')
  const [assigning, setAssigning]         = useState(false)
  const [toast, setToast]                 = useState({ msg: '', type: 'success' })
  const [assignedTab, setAssignedTab]     = useState('active')
  const [rejectTarget, setRejectTarget]   = useState(null)
  const [rejecting, setRejecting]         = useState(false)
  const [sortBy, setSortBy]               = useState('priority')

  // Bulk selection (checkboxes) on the unassigned queue
  const [checked, setChecked]             = useState(new Set())
  const [bulkStaff, setBulkStaff]         = useState('')
  const [bulkNotes, setBulkNotes]         = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [bulkRejectConfirm, setBulkRejectConfirm] = useState(false)
  const [bulkRejecting, setBulkRejecting] = useState(false)

  useEffect(() => { fetchComplaints() }, [fetchComplaints])
  useEffect(() => {
    apiFetch('/users/maintenance-staff')
      .then(({ staff }) => setStaffList(staff))
      .catch(err => setStaffError(err.message))
  }, [])

  if (loading && complaints.length === 0) {
    return <PageLoader label="Loading tasks..." />
  }

  // Unassigned = no staff, not yet finished
  const unassigned = complaints
    .filter(c => !c.assigned_to && c.status !== 'completed' && c.status !== 'rejected')
    .sort(SORT_OPTIONS[sortBy].cmp)

  // Assigned = has a staff member attached
  const assignedAll    = complaints.filter(c => c.assigned_to).sort((a, b) => b.priority_score - a.priority_score)
  const assignedActive = assignedAll.filter(c => c.status !== 'completed' && c.status !== 'rejected')
  const assignedDone   = assignedAll.filter(c => c.status === 'completed' || c.status === 'rejected')

  const selectedComplaint = unassigned.find(c => c.id === selectedId) || null

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: '', type: 'success' }), 3000)
  }

  const toggleChecked = (id) => {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleCheckAll = () => {
    setChecked(prev => prev.size === unassigned.length ? new Set() : new Set(unassigned.map(c => c.id)))
  }

  const handleAssign = async () => {
    if (!selectedComplaint || !selectedStaff) return
    setAssigning(true)
    try {
      const staff = staffList.find(s => s.id === selectedStaff)
      await assignComplaint(selectedComplaint.id, staff.id, assignNotes.trim())
      setSelectedId(null)
      setSelectedStaff('')
      setAssignNotes('')
      showToast(`Assigned "${selectedComplaint.complaint_type}" to ${staff.full_name}`)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setAssigning(false)
    }
  }

  const handleBulkAssign = async () => {
    if (checked.size === 0 || !bulkStaff) return
    setBulkAssigning(true)
    try {
      const staff = staffList.find(s => s.id === bulkStaff)
      const result = await bulkAssign([...checked], bulkStaff, bulkNotes.trim())
      const failed = result.results.filter(r => !r.ok)
      setChecked(new Set())
      setBulkStaff('')
      setBulkNotes('')
      showToast(
        failed.length === 0
          ? `Assigned ${result.results.length} complaints to ${staff.full_name}.`
          : `Assigned ${result.results.length - failed.length} of ${result.results.length} — ${failed.length} failed.`,
        failed.length === 0 ? 'success' : 'error'
      )
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setBulkAssigning(false)
    }
  }

  const handleBulkReject = async () => {
    setBulkRejecting(true)
    try {
      await bulkStatus([...checked], 'rejected')
      showToast(`Rejected ${checked.size} complaints.`)
      setChecked(new Set())
      setBulkRejectConfirm(false)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setBulkRejecting(false)
    }
  }

  const handleStatusChange = (id, newStatus) => {
    updateStatus(id, newStatus)
    showToast(`Status updated to ${newStatus.replace('_', ' ')}`)
  }

  const handleReject = async () => {
    if (!rejectTarget) return
    setRejecting(true)
    try {
      await updateStatus(rejectTarget.id, 'rejected')
      showToast(`"${rejectTarget.complaint_type}" was rejected.`)
      setRejectTarget(null)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setRejecting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-band rounded-2xl overflow-hidden px-6 py-6 relative">
        <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Admin</p>
        <h1 className="font-display font-black text-white text-xl sm:text-2xl tracking-tight">Assign Tasks</h1>
      </div>

      {/* Toast */}
      {toast.msg && (
        <div className={`mb-4 px-4 py-3 text-sm font-bold flex items-center gap-2 border-l-4 ${
          toast.type === 'success'
            ? 'bg-green-50 border-green-500 text-green-800'
            : 'bg-red-50 border-red-500 text-red-800'
        }`}>
          {toast.type === 'success' ? '✓' : '!'} {toast.msg}
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={fetchComplaints} />}
      {staffError && (
        <ErrorBanner message={`Couldn't load the maintenance staff list: ${staffError}`} />
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-3 border border-gray-200 bg-white mb-5 divide-x divide-gray-200 text-center">
        <div className="py-3">
          <p className="font-black text-2xl text-amber-600">{unassigned.length}</p>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wide">Unassigned</p>
        </div>
        <div className="py-3">
          <p className="font-black text-2xl text-brand-600">{assignedActive.length}</p>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wide">In Progress</p>
        </div>
        <div className="py-3">
          <p className="font-black text-2xl text-green-600">{assignedDone.length}</p>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wide">Resolved</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* ── LEFT: Unassigned queue ── */}
        <div>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest">Unassigned Queue</h2>
            <div className="flex items-center gap-2">
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                className="text-xs font-bold border border-gray-200 px-2 py-1 bg-white text-gray-600">
                {Object.entries(SORT_OPTIONS).map(([v, o]) => (
                  <option key={v} value={v}>Sort: {o.label}</option>
                ))}
              </select>
              {unassigned.length > 0 && (
                <span className="text-xs font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 shrink-0">
                  {unassigned.length} waiting
                </span>
              )}
            </div>
          </div>

          {unassigned.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-200 p-10 text-center">
              <p className="text-3xl mb-2">✅</p>
              <p className="font-bold text-gray-600 text-sm">All complaints assigned</p>
              <p className="text-xs text-gray-400 mt-1">New submissions will appear here.</p>
            </div>
          ) : (
            <>
              {/* Select-all + bulk action bar */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <input type="checkbox" checked={checked.size === unassigned.length}
                  onChange={toggleCheckAll} className="w-4 h-4 accent-brand-600" />
                <span className="text-xs text-gray-500 font-semibold">
                  {checked.size > 0 ? `${checked.size} selected` : 'Select all'}
                </span>
              </div>

              {checked.size > 0 && (
                <div className="bg-navy-900 text-white p-3 mb-3 space-y-2">
                  <div className="flex gap-2">
                    <select value={bulkStaff} onChange={e => setBulkStaff(e.target.value)}
                      className="input-field text-sm flex-1 !bg-white !text-gray-900">
                      <option value="">— Assign {checked.size} to... —</option>
                      {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                    <button onClick={handleBulkAssign} disabled={!bulkStaff || bulkAssigning}
                      className="btn-primary text-sm px-4 shrink-0 disabled:opacity-50 flex items-center gap-1.5">
                      {bulkAssigning ? <Spinner className="w-4 h-4 border-2 border-white" /> : '✓ Assign'}
                    </button>
                  </div>
                  <input value={bulkNotes} onChange={e => setBulkNotes(e.target.value)}
                    placeholder="Note for the crew (optional, applies to all selected)"
                    className="input-field text-sm !bg-white !text-gray-900" />
                  <button onClick={() => setBulkRejectConfirm(true)}
                    className="text-xs font-bold text-red-300 hover:text-red-200 transition-colors">
                    ✕ Reject all {checked.size} instead
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {unassigned.map(c => {
                const isSelected = selectedId === c.id
                const isChecked = checked.has(c.id)
                return (
                  <div key={c.id} className={`bg-white border-2 border-l-4 ${PRIORITY_STRIPE[c.priority]} overflow-hidden transition-all ${
                    isSelected ? 'border-brand-600' : isChecked ? 'border-navy-400' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <div className="p-4 flex gap-3">
                      <input type="checkbox" checked={isChecked} onClick={e => e.stopPropagation()}
                        onChange={() => toggleChecked(c.id)}
                        className="w-4 h-4 accent-brand-600 mt-1 shrink-0" />

                      {/* Click header to select for single assignment */}
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => {
                        setSelectedId(isSelected ? null : c.id)
                        setSelectedStaff('')
                        setAssignNotes('')
                      }}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-gray-900 text-sm">{c.complaint_type}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{c.customer_name} · {timeAgo(c.created_at)}</p>
                            <p className="text-xs text-gray-400 truncate">📍 {c.address.split(',')[0]}</p>
                            {c.similar_count > 0 && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 mt-1">
                                ⚠ {c.similar_count} similar report{c.similar_count !== 1 ? 's' : ''} nearby
                              </span>
                            )}
                          </div>
                          <div className={`text-center px-2.5 py-1.5 shrink-0 transition-colors ${
                            isSelected ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700'
                          }`}>
                            <p className="font-black text-xl leading-none">{c.priority_score}</p>
                            <p className="text-xs opacity-70">/ 100</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <PriorityBadge priority={c.priority}/>
                          <span className={`text-xs font-bold ${isSelected ? 'text-brand-600' : 'text-gray-300'}`}>
                            {isSelected ? 'Selected ✓' : 'Tap to assign →'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Inline assignment panel */}
                    {isSelected && (
                      <div className="border-t-2 border-brand-600 bg-brand-50 px-4 py-3">
                        <p className="text-xs font-black text-brand-700 uppercase tracking-wider mb-2">Assign to:</p>
                        <select
                          value={selectedStaff}
                          onChange={e => setSelectedStaff(e.target.value)}
                          className="input-field mb-2 text-sm"
                        >
                          <option value="">— Select maintenance staff —</option>
                          {staffList.map(s => (
                            <option key={s.id} value={s.id}>{s.full_name}</option>
                          ))}
                        </select>
                        <textarea value={assignNotes} onChange={e => setAssignNotes(e.target.value)}
                          placeholder="Note for the crew (optional) — e.g. bring a replacement gasket"
                          rows={2} className="input-field mb-2 text-sm resize-none" />
                        <div className="flex gap-2">
                          <button
                            onClick={handleAssign}
                            disabled={!selectedStaff || assigning}
                            className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                          >
                            {assigning
                              ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent animate-spin"/>Assigning…</>
                              : '✓ Confirm Assignment'
                            }
                          </button>
                          <button
                            onClick={() => { setSelectedId(null); setSelectedStaff(''); setAssignNotes('') }}
                            className="btn-secondary text-sm px-3"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: Assigned tasks ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest">Assigned Tasks</h2>
            <span className="text-xs font-black text-brand-700 bg-brand-50 border border-brand-200 px-2 py-0.5">
              {assignedAll.length} total
            </span>
          </div>

          {/* Tab: Active / Done */}
          <div className="grid grid-cols-2 border border-gray-200 mb-3 overflow-hidden text-xs font-black">
            <button onClick={() => setAssignedTab('active')}
              className={`py-2 border-r border-gray-200 transition-colors ${
                assignedTab === 'active' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}>
              ACTIVE ({assignedActive.length})
            </button>
            <button onClick={() => setAssignedTab('done')}
              className={`py-2 transition-colors ${
                assignedTab === 'done' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}>
              RESOLVED ({assignedDone.length})
            </button>
          </div>

          {/* Active assigned tasks */}
          {assignedTab === 'active' && (
            assignedActive.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-200 p-10 text-center">
                <p className="text-3xl mb-2">👷</p>
                <p className="font-bold text-gray-600 text-sm">No active tasks</p>
                <p className="text-xs text-gray-400 mt-1">Assign from the queue on the left.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {assignedActive.map(c => (
                  <div key={c.id} className={`bg-white border border-gray-200 border-l-4 ${PRIORITY_STRIPE[c.priority]} overflow-hidden`}>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-gray-900 text-sm">{c.complaint_type}</p>
                          <p className="text-xs text-brand-600 font-bold mt-0.5">👷 {c.assigned_name}</p>
                          <p className="text-xs text-gray-400 truncate mt-0.5">📍 {c.address.split(',')[0]}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <StatusBadge status={c.status}/>
                          <span className="font-black text-lg text-gray-700 leading-none">{c.priority_score}</span>
                        </div>
                      </div>

                      {/* Status actions — only forward-moving transitions */}
                      <div className="flex gap-1.5 flex-wrap border-t border-gray-100 pt-3 mt-2">
                        {c.status === 'assigned' && (
                          <button onClick={() => handleStatusChange(c.id, 'en_route')}
                            className="text-xs px-3 py-1.5 font-bold border bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100 transition-colors">
                            🚚 Mark En Route
                          </button>
                        )}
                        {c.status === 'en_route' && (
                          <button onClick={() => handleStatusChange(c.id, 'in_progress')}
                            className="text-xs px-3 py-1.5 font-bold border bg-brand-50 border-brand-300 text-brand-700 hover:bg-brand-100 transition-colors">
                            📍 Mark On Site
                          </button>
                        )}
                        {c.status === 'in_progress' && (
                          <button onClick={() => handleStatusChange(c.id, 'completed')}
                            className="text-xs px-3 py-1.5 font-bold border bg-green-50 border-green-300 text-green-700 hover:bg-green-100 transition-colors">
                            ✓ Mark Done
                          </button>
                        )}
                        {c.status !== 'completed' && (
                          <button onClick={() => setRejectTarget(c)}
                            className="text-xs px-3 py-1.5 font-bold border bg-red-50 border-red-200 text-red-600 hover:bg-red-100 transition-colors">
                            ✕ Reject
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Resolved/done tasks — read-only */}
          {assignedTab === 'done' && (
            assignedDone.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-200 p-10 text-center">
                <p className="text-3xl mb-2">📋</p>
                <p className="font-bold text-gray-600 text-sm">No resolved tasks yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {assignedDone.map(c => (
                  <div key={c.id} className={`bg-white border border-gray-200 border-l-4 ${PRIORITY_STRIPE[c.priority]} overflow-hidden opacity-70`}>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-700 text-sm">{c.complaint_type}</p>
                          <p className="text-xs text-gray-400 mt-0.5">👷 {c.assigned_name}</p>
                          <p className="text-xs text-gray-400 truncate mt-0.5">📍 {c.address.split(',')[0]}</p>
                        </div>
                        <StatusBadge status={c.status}/>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

      </div>

      <ConfirmDialog
        open={!!rejectTarget}
        title="Reject this complaint?"
        message={rejectTarget ? `"${rejectTarget.complaint_type}" from ${rejectTarget.customer_name} will be marked as rejected. This won't delete it, but there's no undo button in the app — you'd need to change it back manually.` : ''}
        confirmLabel="Reject Complaint"
        danger
        loading={rejecting}
        onConfirm={handleReject}
        onCancel={() => setRejectTarget(null)}
      />

      <ConfirmDialog
        open={bulkRejectConfirm}
        title={`Reject ${checked.size} complaints?`}
        message="All selected complaints will be marked as rejected. This won't delete them, but there's no undo button in the app."
        confirmLabel={`Reject ${checked.size}`}
        danger
        loading={bulkRejecting}
        onConfirm={handleBulkReject}
        onCancel={() => setBulkRejectConfirm(false)}
      />
    </div>
  )
}
