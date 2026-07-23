import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useComplaintStore } from '../../store/complaintStore'
import { apiFetch } from '../../lib/api'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { PageLoader, ErrorBanner, Spinner } from '../../components/ui/Feedback'
import RejectionDialog from '../../components/ui/RejectionDialog'
import Pagination from '../../components/ui/Pagination'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }
const PRIORITY_STRIPE = {
  high: 'border-l-red-500',
  medium: 'border-l-amber-400',
  low: 'border-l-green-400',
}

const TABLE_ACTION_CLASS = 'inline-flex w-24 items-center justify-center rounded-lg bg-navy-800 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-navy-900 disabled:opacity-50'

function matchesSearch(complaint, query) {
  if (!query) return true
  return [
    complaint.id, complaint.complaint_type, complaint.description,
    complaint.customer_name, complaint.address, complaint.assigned_name,
    complaint.status, complaint.task_notes, complaint.rejection_reason,
  ].some(value => String(value || '').toLowerCase().includes(query))
}

function queueFor(complaint) {
  if (!complaint.assigned_to && !['completed', 'rejected', 'cancelled'].includes(complaint.status)) return 'unassigned'
  if (complaint.assigned_to && !['completed', 'rejected', 'cancelled'].includes(complaint.status)) return 'active'
  return 'resolved'
}

export default function AssignTaskPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const complaints = useComplaintStore(s => s.complaints)
  const loading = useComplaintStore(s => s.loading)
  const error = useComplaintStore(s => s.error)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)
  const assignComplaint = useComplaintStore(s => s.assignComplaint)
  const bulkAssign = useComplaintStore(s => s.bulkAssign)
  const bulkStatus = useComplaintStore(s => s.bulkStatus)
  const updateStatus = useComplaintStore(s => s.updateStatus)
  const restoreComplaint = useComplaintStore(s => s.restoreComplaint)

  const [staffList, setStaffList] = useState([])
  const [staffError, setStaffError] = useState('')
  const [view, setView] = useState(searchParams.get('staff') ? 'active' : 'unassigned')
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [staffFilter, setStaffFilter] = useState(searchParams.get('staff') || 'all')
  const [sortBy, setSortBy] = useState('priority')
  const [checked, setChecked] = useState(new Set())
  const [assignTarget, setAssignTarget] = useState(null)
  const [selectedStaff, setSelectedStaff] = useState('')
  const [assignNotes, setAssignNotes] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [bulkStaff, setBulkStaff] = useState('')
  const [bulkNotes, setBulkNotes] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [restoringId, setRestoringId] = useState(null)
  const [toast, setToast] = useState({ message: '', type: 'success' })
  const [page, setPage] = useState(1)
  const pageSize = 10

  useEffect(() => { fetchComplaints() }, [fetchComplaints])
  useEffect(() => {
    apiFetch('/users/maintenance-staff')
      .then(({ staff }) => setStaffList(staff))
      .catch(err => setStaffError(err.message))
  }, [])

  useEffect(() => {
    const staff = searchParams.get('staff') || 'all'
    setStaffFilter(staff)
    if (staff !== 'all') setView('active')
  }, [searchParams])

  const counts = useMemo(() => ({
    all: complaints.length,
    unassigned: complaints.filter(c => queueFor(c) === 'unassigned').length,
    active: complaints.filter(c => queueFor(c) === 'active').length,
    resolved: complaints.filter(c => queueFor(c) === 'resolved').length,
  }), [complaints])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return complaints
      .filter(c => view === 'all' || queueFor(c) === view)
      .filter(c => priorityFilter === 'all' || c.priority === priorityFilter)
      .filter(c => statusFilter === 'all' || c.status === statusFilter)
      .filter(c => staffFilter === 'all' || c.assigned_to === staffFilter)
      .filter(c => matchesSearch(c, query))
      .sort((a, b) => {
        if (sortBy === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.priority_score - a.priority_score
        if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at)
        if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
        if (sortBy === 'type') return a.complaint_type.localeCompare(b.complaint_type)
        if (sortBy === 'staff') return String(a.assigned_name || 'ZZZ').localeCompare(String(b.assigned_name || 'ZZZ'))
        return b.priority_score - a.priority_score
      })
  }, [complaints, view, priorityFilter, statusFilter, staffFilter, search, sortBy])

  useEffect(() => { setPage(1) }, [view, priorityFilter, statusFilter, staffFilter, search, sortBy])
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const selectableRows = paged.filter(c => queueFor(c) === 'unassigned')
  const allSelectableChecked = selectableRows.length > 0 && selectableRows.every(c => checked.has(c.id))
  const selectedComplaints = complaints.filter(c => checked.has(c.id) && queueFor(c) === 'unassigned')

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast({ message: '', type: 'success' }), 3500)
  }

  const changeStaffFilter = value => {
    setStaffFilter(value)
    const next = new URLSearchParams(searchParams)
    if (value === 'all') next.delete('staff')
    else next.set('staff', value)
    setSearchParams(next, { replace: true })
  }

  const toggleChecked = id => setChecked(previous => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const toggleAllShown = () => setChecked(previous => {
    const next = new Set(previous)
    if (allSelectableChecked) selectableRows.forEach(c => next.delete(c.id))
    else selectableRows.forEach(c => next.add(c.id))
    return next
  })

  const openAssignment = complaint => {
    setAssignTarget(complaint)
    setSelectedStaff(complaint.assigned_to || '')
    setAssignNotes('')
  }

  const handleAssign = async () => {
    if (!assignTarget || !selectedStaff) return
    setAssigning(true)
    try {
      await assignComplaint(assignTarget.id, selectedStaff, assignNotes.trim())
      showToast(`“${assignTarget.complaint_type}” assigned successfully.`)
      setAssignTarget(null)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setAssigning(false)
    }
  }

  const handleBulkAssign = async () => {
    if (!selectedComplaints.length || !bulkStaff) return
    setBulkAssigning(true)
    try {
      await bulkAssign(selectedComplaints.map(c => c.id), bulkStaff, bulkNotes.trim())
      showToast(`${selectedComplaints.length} complaints assigned.`)
      setChecked(new Set())
      setBulkStaff('')
      setBulkNotes('')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setBulkAssigning(false)
    }
  }

  const handleReject = async reason => {
    setRejecting(true)
    try {
      if (rejectTarget) {
        await updateStatus(rejectTarget.id, 'rejected', reason)
        showToast(`“${rejectTarget.complaint_type}” rejected with a recorded reason.`)
        setRejectTarget(null)
      } else if (bulkRejectOpen) {
        await bulkStatus(selectedComplaints.map(c => c.id), 'rejected', reason)
        showToast(`${selectedComplaints.length} complaints rejected.`)
        setChecked(new Set())
        setBulkRejectOpen(false)
      }
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setRejecting(false)
    }
  }

  const handleRestore = async complaint => {
    setRestoringId(complaint.id)
    try {
      await restoreComplaint(complaint.id)
      showToast('Rejection undone. Complaint restored.')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setRestoringId(null)
    }
  }



  const resetFilters = () => {
    setSearch('')
    setPriorityFilter('all')
    setStatusFilter('all')
    changeStaffFilter('all')
    setSortBy('priority')
  }

  const renderActions = complaint => {
    const queue = queueFor(complaint)
    return (
      <div className="w-full" onClick={event => event.stopPropagation()}>
        {complaint.status === 'rejected' ? (
          <button onClick={() => handleRestore(complaint)} disabled={restoringId === complaint.id} className={TABLE_ACTION_CLASS}>
            {restoringId === complaint.id ? 'Working…' : 'Restore'}
          </button>
        ) : queue === 'unassigned' ? (
          <button onClick={() => openAssignment(complaint)} className={TABLE_ACTION_CLASS}>Assign</button>
        ) : queue === 'active' ? (
          <button onClick={() => openAssignment(complaint)} className={TABLE_ACTION_CLASS}>Reassign</button>
        ) : (
          <button onClick={() => navigate(`/complaints/${complaint.id}`)} className={TABLE_ACTION_CLASS}>Open</button>
        )}
      </div>
    )
  }


  if (loading && complaints.length === 0) return <PageLoader label="Loading tasks..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-6 py-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em]">Admin · Dispatch</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl mt-1">Assign Tasks</h1>
            <p className="text-navy-300 text-sm mt-1">Manage the entire dispatch queue from one complaint-style list.</p>
          </div>
          <div className="text-right">
            <p className="font-display font-black text-5xl leading-none text-gold-400">{filtered.length}</p>
            <p className="text-navy-300 text-[11px] uppercase tracking-wider">tasks shown</p>
          </div>
        </div>
      </div>

      {toast.message && (
        <div className={`p-3 rounded-xl border-l-4 text-sm font-bold ${toast.type === 'error' ? 'bg-red-50 border-red-500 text-red-800' : 'bg-green-50 border-green-500 text-green-800'}`}>
          {toast.message}
        </div>
      )}
      {error && <ErrorBanner message={error} onRetry={fetchComplaints} />}
      {staffError && <ErrorBanner message={staffError} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['unassigned', 'Unassigned', counts.unassigned, 'text-amber-600'],
          ['active', 'Active', counts.active, 'text-brand-600'],
          ['resolved', 'Resolved', counts.resolved, 'text-green-600'],
          ['all', 'All Records', counts.all, 'text-navy-800'],
        ].map(([value, label, count, color]) => (
          <button key={value} onClick={() => setView(value)}
            className={`card rounded-xl p-4 text-left transition-all ${view === value ? 'ring-2 ring-navy-700 border-navy-300' : 'hover:border-navy-200'}`}>
            <p className={`font-display font-black text-3xl ${color}`}>{count}</p>
            <p className="text-xs font-bold text-gray-500 mt-1">{label}</p>
          </button>
        ))}
      </div>

      <div className="card rounded-xl p-4 space-y-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Search ID, complaint, customer, address, status or technician..."
            className="input-field pl-9 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)} className="input-field rounded-lg text-sm">
            <option value="all">Any Priority</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="input-field rounded-lg text-sm">
            <option value="all">Any Status</option>
            <option value="pending">Pending</option>
            <option value="assigned">Assigned</option>
            <option value="en_route">En Route</option>
            <option value="in_progress">On Site</option>
            <option value="completed">Completed</option>
            <option value="blocked">Needs Attention</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={staffFilter} onChange={event => changeStaffFilter(event.target.value)} className="input-field rounded-lg text-sm">
            <option value="all">Any Technician</option>
            {staffList.map(staff => <option key={staff.id} value={staff.id} disabled={!staff.is_active || ['on_leave', 'off_duty'].includes(staff.availability_status)}>{staff.full_name}{!staff.is_active ? ' — Inactive' : staff.availability_status && staff.availability_status !== 'available' ? ` — ${staff.availability_status.replace('_', ' ')}` : ''}</option>)}
          </select>
          <select value={sortBy} onChange={event => setSortBy(event.target.value)} className="input-field rounded-lg text-sm">
            <option value="priority">Priority</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="type">Type A–Z</option>
            <option value="staff">Technician A–Z</option>
          </select>
          <button onClick={resetFilters} className="btn-secondary rounded-lg text-sm col-span-2 lg:col-span-1">Reset Filters</button>
        </div>
      </div>

      {selectedComplaints.length > 0 && (
        <div className="card rounded-xl p-4 border-navy-200 bg-navy-50/40 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-display font-bold text-navy-900">{selectedComplaints.length} unassigned complaint{selectedComplaints.length !== 1 ? 's' : ''} selected</p>
              <p className="text-xs text-gray-500 mt-1">Assign or reject all selected records at once.</p>
            </div>
            <button onClick={() => setChecked(new Set())} className="text-xs font-bold text-gray-500">Clear selection</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2">
            <select value={bulkStaff} onChange={event => setBulkStaff(event.target.value)} className="input-field rounded-lg text-sm">
              <option value="">Assign selected to…</option>
              {staffList.map(staff => <option key={staff.id} value={staff.id} disabled={!staff.is_active || ['on_leave', 'off_duty'].includes(staff.availability_status)}>{staff.full_name}{!staff.is_active ? ' — Inactive' : staff.availability_status && staff.availability_status !== 'available' ? ` — ${staff.availability_status.replace('_', ' ')}` : ''}</option>)}
            </select>
            <input value={bulkNotes} onChange={event => setBulkNotes(event.target.value)} placeholder="Shared instructions (optional)" className="input-field rounded-lg text-sm" />
            <button onClick={handleBulkAssign} disabled={!bulkStaff || bulkAssigning} className="btn-primary rounded-lg disabled:opacity-50">
              {bulkAssigning ? <Spinner className="w-4 h-4 border-2 border-white" /> : 'Assign Selected'}
            </button>
            <button onClick={() => setBulkRejectOpen(true)} className="btn-danger rounded-lg">Reject Selected</button>
          </div>
        </div>
      )}

      <div className="hidden lg:block card rounded-xl overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[44px]" />
            <col className="w-[32%]" />
            <col className="w-[14%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[8%]" />
            <col className="w-[112px]" />
          </colgroup>
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50 text-left">
              <th className="px-3 py-3">
                {selectableRows.length > 0 && <input type="checkbox" checked={allSelectableChecked} onChange={toggleAllShown} className="accent-brand-600" aria-label="Select all shown unassigned complaints" />}
              </th>
              <th className="px-3 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Complaint</th>
              <th className="px-3 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Customer</th>
              <th className="px-3 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Priority</th>
              <th className="px-3 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-3 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Assigned</th>
              <th className="px-3 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Filed</th>
              <th className="px-3 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-12 text-center text-gray-400">No tasks match your search and filters.</td></tr>
            ) : paged.map(complaint => {
              const selectable = queueFor(complaint) === 'unassigned'
              return (
                <tr key={complaint.id} onClick={() => navigate(`/complaints/${complaint.id}`)}
                  className={`cursor-pointer hover:bg-gray-50 border-l-4 ${PRIORITY_STRIPE[complaint.priority]}`}>
                  <td className="px-3 py-3 align-top" onClick={event => event.stopPropagation()}>
                    {selectable && <input type="checkbox" checked={checked.has(complaint.id)} onChange={() => toggleChecked(complaint.id)} className="accent-brand-600" aria-label={`Select ${complaint.complaint_type}`} />}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <p className="font-bold text-gray-900 truncate">{complaint.complaint_type}</p>
                    <p className="text-xs text-gray-400 truncate">{complaint.description}</p>
                    <p className="text-[10px] text-gray-300 font-mono mt-1 truncate">{complaint.id}</p>
                    {complaint.status === 'rejected' && <p className="text-xs text-red-600 mt-1 truncate"><b>Reason:</b> {complaint.rejection_reason || 'Not recorded'}</p>}
                  </td>
                  <td className="px-3 py-3 text-gray-700 align-top truncate">{complaint.customer_name}</td>
                  <td className="px-3 py-3 align-top"><PriorityBadge priority={complaint.priority} /></td>
                  <td className="px-3 py-3 align-top"><StatusBadge status={complaint.status} /></td>
                  <td className="px-3 py-3 text-gray-500 align-top truncate">{complaint.assigned_name || 'Unassigned'}</td>
                  <td className="px-3 py-3 text-gray-400 text-xs align-top whitespace-nowrap">{timeAgo(complaint.created_at)}</td>
                  <td className="px-3 py-3 align-top">{renderActions(complaint)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="lg:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="card rounded-xl p-10 text-center text-gray-400">No tasks match your search and filters.</div>
        ) : paged.map(complaint => {
          const selectable = queueFor(complaint) === 'unassigned'
          return (
            <div key={complaint.id} onClick={() => navigate(`/complaints/${complaint.id}`)}
              className={`card rounded-xl p-4 border-l-4 ${PRIORITY_STRIPE[complaint.priority]} cursor-pointer`}>
              <div className="flex items-start gap-3">
                {selectable && (
                  <input type="checkbox" checked={checked.has(complaint.id)} onChange={() => toggleChecked(complaint.id)}
                    onClick={event => event.stopPropagation()} className="accent-brand-600 mt-1" aria-label={`Select ${complaint.complaint_type}`} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900">{complaint.complaint_type}</p>
                      <p className="text-xs text-gray-500 mt-1">{complaint.customer_name} · {timeAgo(complaint.created_at)}</p>
                      <p className="text-xs text-gray-400 truncate mt-1">📍 {complaint.address}</p>
                    </div>
                    <span className="font-display font-black text-2xl text-navy-800">{complaint.priority_score}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap"><PriorityBadge priority={complaint.priority} /><StatusBadge status={complaint.status} /></div>
                  <p className="text-xs text-gray-500 mt-3">👷 {complaint.assigned_name || 'Not assigned'}</p>
                  {complaint.status === 'rejected' && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700"><b>Reason:</b> {complaint.rejection_reason || 'Not recorded'}</div>
                  )}
                  <div className="mt-3 pt-3 border-t border-gray-100">{renderActions(complaint)}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} label="complaints" />

      {assignTarget && (
        <div className="fixed inset-0 z-50 bg-navy-950/60 backdrop-blur-sm p-4 flex items-center justify-center" onMouseDown={() => !assigning && setAssignTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onMouseDown={event => event.stopPropagation()}>
            <div className="page-band wave-header px-6 py-5">
              <p className="text-gold-400 text-[10px] font-black uppercase tracking-widest">{assignTarget.assigned_to ? 'Reassign Complaint' : 'Assign Complaint'}</p>
              <h2 className="font-display font-black text-white text-xl mt-1">{assignTarget.complaint_type}</h2>
              <p className="text-navy-300 text-xs mt-1">{assignTarget.customer_name} · {assignTarget.address}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Maintenance Staff</label>
                <select value={selectedStaff} onChange={event => setSelectedStaff(event.target.value)} className="input-field rounded-lg">
                  <option value="">Select technician…</option>
                  {staffList.map(staff => <option key={staff.id} value={staff.id} disabled={!staff.is_active || ['on_leave', 'off_duty'].includes(staff.availability_status)}>{staff.full_name}{!staff.is_active ? ' — Inactive' : staff.availability_status && staff.availability_status !== 'available' ? ` — ${staff.availability_status.replace('_', ' ')}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Instructions</label>
                <textarea value={assignNotes} onChange={event => setAssignNotes(event.target.value)} rows={4}
                  placeholder="Optional instructions for the technician" className="input-field rounded-lg resize-none" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setAssignTarget(null)} disabled={assigning} className="btn-secondary rounded-lg">Cancel</button>
                <button onClick={handleAssign} disabled={!selectedStaff || assigning} className="btn-primary rounded-lg disabled:opacity-50">
                  {assigning ? <><Spinner className="w-4 h-4 border-2 border-white" /> Saving…</> : assignTarget.assigned_to ? 'Confirm Reassignment' : 'Confirm Assignment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <RejectionDialog
        open={!!rejectTarget}
        title="Reject this complaint?"
        description={rejectTarget ? `Explain why “${rejectTarget.complaint_type}” is being rejected. The customer will see this reason.` : ''}
        loading={rejecting}
        onConfirm={handleReject}
        onCancel={() => setRejectTarget(null)}
      />
      <RejectionDialog
        open={bulkRejectOpen}
        title={`Reject ${selectedComplaints.length} complaints?`}
        description="Enter one clear reason that will be saved on every selected complaint and shown to each customer."
        confirmLabel={`Reject ${selectedComplaints.length}`}
        loading={rejecting}
        onConfirm={handleReject}
        onCancel={() => setBulkRejectOpen(false)}
      />
    </div>
  )
}
