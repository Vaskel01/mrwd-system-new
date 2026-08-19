import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useComplaintStore } from '../../store/complaintStore'
import { apiFetch } from '../../lib/api'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { PageLoader, ErrorBanner, Spinner } from '../../components/ui/Feedback'
import RejectionDialog from '../../components/ui/RejectionDialog'
import Pagination from '../../components/ui/Pagination'
import AppIcon from '../../components/ui/AppIcon'
import SearchField from '../../components/ui/SearchField'

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

const TABLE_ACTION_CLASS = 'inline-flex max-w-full items-center justify-center whitespace-nowrap rounded-lg bg-navy-800 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-navy-900 disabled:opacity-50'

function matchesSearch(complaint, query) {
  if (!query) return true
  return [
    complaint.reference_number, complaint.complaint_type, complaint.description,
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
  const [crewList, setCrewList] = useState([])
  const [staffError, setStaffError] = useState('')
  const [view, setView] = useState(searchParams.get('view') || (searchParams.get('staff') ? 'active' : 'unassigned'))
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [priorityFilter, setPriorityFilter] = useState(searchParams.get('priority') || 'all')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all')
  const [staffFilter, setStaffFilter] = useState(searchParams.get('staff') || 'all')
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'priority')
  const [checked, setChecked] = useState(new Set())
  const [assignTarget, setAssignTarget] = useState(null)
  const [selectedStaff, setSelectedStaff] = useState('')
  const [selectedCrew, setSelectedCrew] = useState('')
  const [assignNotes, setAssignNotes] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [bulkStaff, setBulkStaff] = useState('')
  const [bulkCrew, setBulkCrew] = useState('')
  const [bulkNotes, setBulkNotes] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [restoringId, setRestoringId] = useState(null)
  const [toast, setToast] = useState({ message: '', type: 'success' })
  const [page, setPage] = useState(Math.max(1, Number(searchParams.get('page')) || 1))
  const pageSize = 10

  useEffect(() => { fetchComplaints() }, [fetchComplaints])
  useEffect(() => {
    Promise.all([apiFetch('/users/maintenance-staff'), apiFetch('/operations/crews')])
      .then(([staffResult, crewResult]) => { setStaffList(staffResult.staff || []); setCrewList(crewResult.crews || []) })
      .catch(err => setStaffError(err.message))
  }, [])
  useEffect(() => {
    const next = {}
    if (view !== 'unassigned') next.view = view
    if (search.trim()) next.q = search.trim()
    if (priorityFilter !== 'all') next.priority = priorityFilter
    if (statusFilter !== 'all') next.status = statusFilter
    if (staffFilter !== 'all') next.staff = staffFilter
    if (sortBy !== 'priority') next.sort = sortBy
    if (page > 1) next.page = String(page)
    setSearchParams(next, { replace: true })
  }, [view, search, priorityFilter, statusFilter, staffFilter, sortBy, page, setSearchParams])

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
      .filter(c => statusFilter === 'all' ||
        (statusFilter === 'in_progress' ? ['en_route', 'in_progress'].includes(c.status) : c.status === statusFilter))
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

  const effectivePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)))
  const paged = filtered.slice((effectivePage - 1) * pageSize, effectivePage * pageSize)

  const selectableRows = paged.filter(c => queueFor(c) === 'unassigned')
  const allSelectableChecked = selectableRows.length > 0 && selectableRows.every(c => checked.has(c.id))
  const selectedComplaints = complaints.filter(c => checked.has(c.id) && queueFor(c) === 'unassigned')

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast({ message: '', type: 'success' }), 3500)
  }

  const changeStaffFilter = value => {
    setStaffFilter(value)
    setPage(1)
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
    setSelectedCrew(complaint.assigned_crew_id || '')
    setAssignNotes('')
  }

  const handleAssign = async () => {
    if (!assignTarget || !selectedStaff) return
    setAssigning(true)
    try {
      await assignComplaint(assignTarget.id, selectedStaff, assignNotes.trim(), selectedCrew)
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
      await bulkAssign(selectedComplaints.map(c => c.id), bulkStaff, bulkNotes.trim(), bulkCrew)
      showToast(`${selectedComplaints.length} complaints assigned.`)
      setChecked(new Set())
      setBulkStaff('')
      setBulkCrew('')
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
    setView('unassigned')
    setSearch('')
    setPriorityFilter('all')
    setStatusFilter('all')
    changeStaffFilter('all')
    setSortBy('priority')
    setPage(1)
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
      <div className="page-band wave-header rounded-2xl px-4 sm:px-6 py-5 sm:py-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em]">ECMD</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl mt-1">Complaint Dispatch</h1>
            <p className="text-navy-300 text-sm mt-1">Manage the entire dispatch queue from one complaint-style list.</p>
          </div>
          <div className="text-right">
            <p className="font-display font-black text-5xl leading-none text-gold-400">{filtered.length}</p>
            <p className="text-navy-300 text-[11px] uppercase tracking-wider">tasks shown</p>
          </div>
        </div>
      </div>

      {toast.message && (
        <div role="status" aria-live="polite" className={`fixed right-4 top-20 z-50 max-w-sm rounded-xl border-l-4 p-4 text-sm font-bold shadow-xl ${toast.type === 'error' ? 'bg-red-50 border-red-500 text-red-800' : 'bg-green-50 border-green-500 text-green-800'}`}>
          {toast.message}
        </div>
      )}
      {error && <ErrorBanner message={error} onRetry={fetchComplaints} />}
      {staffError && <ErrorBanner message={staffError} />}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <AppIcon name="assignment" className="mt-0.5 h-5 w-5 shrink-0 text-navy-700" />
          <div>
            <p className="font-display font-bold text-navy-900">Dispatch workspace</p>
            <p className="mt-1 text-sm text-gray-600">Use this page to assign, reassign, or batch-dispatch complaints. Use <b>Complaint Review</b> when you only need to search, review, or open a complaint record.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['unassigned', 'Unassigned', counts.unassigned, 'text-amber-600'],
          ['active', 'Active', counts.active, 'text-brand-600'],
          ['resolved', 'Resolved', counts.resolved, 'text-green-600'],
          ['all', 'All Records', counts.all, 'text-navy-800'],
        ].map(([value, label, count, color]) => (
          <button key={value} onClick={() => { setView(value); setPage(1) }}
            className={`card rounded-xl p-4 text-left transition-all ${view === value ? 'ring-2 ring-navy-700 border-navy-300' : 'hover:border-navy-200'}`}>
            <p className={`font-display font-black text-3xl ${color}`}>{count}</p>
            <p className="text-xs font-bold text-gray-500 mt-1">{label}</p>
          </button>
        ))}
      </div>

      <div className="qol-filter-bar card rounded-xl p-4 space-y-3">
        <SearchField value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} onClear={() => { setSearch(''); setPage(1) }} placeholder="Search reference, complaint type, customer, address, status or Maintenance Personnel…" />
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-5 gap-2">
          <select name="assigntaskpage-priority-filter-2" aria-label="Priority Filter" value={priorityFilter} onChange={event => { setPriorityFilter(event.target.value); setPage(1) }} className="input-field rounded-lg text-sm">
            <option value="all">Any Priority</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
          <select name="assigntaskpage-status-filter-3" aria-label="Status Filter" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1) }} className="input-field rounded-lg text-sm">
            <option value="all">Any Status</option>
            <option value="pending">Pending Review</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Resolved</option>
            <option value="blocked">Needs Attention</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select name="assigntaskpage-staff-filter-4" aria-label="Staff Filter" value={staffFilter} onChange={event => changeStaffFilter(event.target.value)} className="input-field rounded-lg text-sm">
            <option value="all">Any Maintenance Personnel</option>
            {staffList.map(staff => <option key={staff.id} value={staff.id} disabled={!staff.is_active || ['on_leave', 'off_duty'].includes(staff.availability_status)}>{staff.full_name}{!staff.is_active ? ' — Inactive' : staff.availability_status && staff.availability_status !== 'available' ? ` — ${staff.availability_status.replace('_', ' ')}` : ''}</option>)}
          </select>
          <select name="assigntaskpage-sort-by-5" aria-label="Sort By" value={sortBy} onChange={event => { setSortBy(event.target.value); setPage(1) }} className="input-field rounded-lg text-sm">
            <option value="priority">Priority</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="type">Type A–Z</option>
            <option value="staff">Maintenance Personnel A–Z</option>
          </select>
          <button onClick={resetFilters} className="btn-secondary rounded-lg text-sm min-[420px]:col-span-2 lg:col-span-1">Clear Filters</button>
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto_auto] gap-2">
            <select name="assigntaskpage-bulk-staff-6" aria-label="Bulk Staff" value={bulkStaff} onChange={event => setBulkStaff(event.target.value)} className="input-field rounded-lg text-sm">
              <option value="">Assign selected to…</option>
              {staffList.map(staff => <option key={staff.id} value={staff.id} disabled={!staff.is_active || ['on_leave', 'off_duty'].includes(staff.availability_status)}>{staff.full_name}{!staff.is_active ? ' — Inactive' : staff.availability_status && staff.availability_status !== 'available' ? ` — ${staff.availability_status.replace('_', ' ')}` : ''}</option>)}
            </select>
            <select aria-label="Bulk ECMD crew" value={bulkCrew} onChange={event => setBulkCrew(event.target.value)} className="input-field rounded-lg text-sm">
              <option value="">No crew assignment</option>
              {crewList.map(crew => <option key={crew.id} value={crew.id}>{crew.name}</option>)}
            </select>
            <input name="assigntaskpage-shared-instructions-optional-7" aria-label="Shared instructions (optional)" value={bulkNotes} onChange={event => setBulkNotes(event.target.value)} placeholder="Shared instructions (optional)" className="input-field rounded-lg text-sm" />
            <button onClick={handleBulkAssign} disabled={!bulkStaff || bulkAssigning} className="btn-primary rounded-lg disabled:opacity-50">
              {bulkAssigning ? <Spinner className="w-4 h-4 border-2 border-white" /> : 'Assign Selected'}
            </button>
            <button onClick={() => setBulkRejectOpen(true)} className="btn-danger rounded-lg">Reject Selected</button>
          </div>
        </div>
      )}

      <div className="hidden xl:block card rounded-xl overflow-hidden p-2">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[5%]" />
            <col className="w-[27%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[11%]" />
            <col className="w-[13%]" />
            <col className="w-[9%]" />
            <col className="w-[13%]" />
          </colgroup>
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50 text-left">
              <th className="px-3 py-3">
                {selectableRows.length > 0 && <input name="assigntaskpage-checkbox-field-8" type="checkbox" checked={allSelectableChecked} onChange={toggleAllShown} className="accent-brand-600" aria-label="Select all shown unassigned complaints" />}
              </th>
              <th className="px-3 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Complaint</th>
              <th className="px-3 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Customer</th>
              <th className="px-3 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Priority</th>
              <th className="px-3 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-3 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Assigned</th>
              <th className="px-3 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Submitted</th>
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
                    {selectable && <input name="assigntaskpage-checkbox-field-9" type="checkbox" checked={checked.has(complaint.id)} onChange={() => toggleChecked(complaint.id)} className="accent-brand-600" aria-label={`Select ${complaint.complaint_type}`} />}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <p className="font-bold text-gray-900 break-words">{complaint.complaint_type}</p>
                    <p className="text-xs text-gray-400 line-clamp-2 break-words">{complaint.description}</p>
                    <p className="text-[10px] text-gray-500 font-mono font-bold mt-1 break-all">{complaint.reference_number}</p>
                    {complaint.status === 'rejected' && <p className="text-xs text-red-600 mt-1 break-words"><b>Reason:</b> {complaint.rejection_reason || 'Not recorded'}</p>}
                  </td>
                  <td className="px-3 py-3 text-gray-700 align-top break-words">{complaint.customer_name}</td>
                  <td className="px-3 py-3 align-top"><PriorityBadge priority={complaint.priority} /></td>
                  <td className="px-3 py-3 align-top"><StatusBadge status={complaint.status} /></td>
                  <td className="px-3 py-3 text-gray-500 align-top"><p className="break-words">{complaint.assigned_name || 'Unassigned'}</p>{complaint.assigned_at && <p className="text-[10px] text-gray-400 mt-1">{new Date(complaint.assigned_at).toLocaleDateString('en-PH')}</p>}</td>
                  <td className="px-3 py-3 text-gray-400 text-xs align-top break-words">{timeAgo(complaint.created_at)}</td>
                  <td className="px-3 py-3 pr-5 align-top">{renderActions(complaint)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="xl:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="card rounded-xl p-10 text-center text-gray-400">No tasks match your search and filters.</div>
        ) : paged.map(complaint => {
          const selectable = queueFor(complaint) === 'unassigned'
          return (
            <div key={complaint.id} onClick={() => navigate(`/complaints/${complaint.id}`)}
              className={`card rounded-xl p-4 border-l-4 ${PRIORITY_STRIPE[complaint.priority]} cursor-pointer`}>
              <div className="flex items-start gap-3">
                {selectable && (
                  <input name="assigntaskpage-checkbox-field-10" type="checkbox" checked={checked.has(complaint.id)} onChange={() => toggleChecked(complaint.id)}
                    onClick={event => event.stopPropagation()} className="accent-brand-600 mt-1" aria-label={`Select ${complaint.complaint_type}`} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900">{complaint.complaint_type}</p>
                      <p className="text-[10px] text-gray-500 font-mono font-bold mt-1">{complaint.reference_number}</p>
                      <p className="text-xs text-gray-500 mt-1">{complaint.customer_name} · {timeAgo(complaint.created_at)}</p>
                      <p className="mt-1 inline-flex max-w-full items-center gap-1 text-xs text-gray-400"><AppIcon name="location" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{complaint.address}</span></p>
                    </div>
                    <span className="font-display font-black text-2xl text-navy-800">{complaint.priority_score}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap"><PriorityBadge priority={complaint.priority} /><StatusBadge status={complaint.status} /></div>
                  <p className="mt-3 inline-flex items-center gap-1 text-xs text-gray-500"><AppIcon name="user" className="h-3.5 w-3.5" />{complaint.assigned_name || 'Not assigned'}{complaint.assigned_at ? ` · Assigned ${new Date(complaint.assigned_at).toLocaleDateString('en-PH')}` : ''}</p>
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

      <Pagination page={effectivePage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} label="complaints" />

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
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Maintenance Personnel</label>
                <select name="assigntaskpage-selected-staff-11" aria-label="Selected Staff" value={selectedStaff} onChange={event => setSelectedStaff(event.target.value)} className="input-field rounded-lg">
                  <option value="">Select Maintenance Personnel…</option>
                  {staffList.map(staff => <option key={staff.id} value={staff.id} disabled={!staff.is_active || ['on_leave', 'off_duty'].includes(staff.availability_status)}>{staff.full_name}{!staff.is_active ? ' — Inactive' : staff.availability_status && staff.availability_status !== 'available' ? ` — ${staff.availability_status.replace('_', ' ')}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">ECMD Crew (optional)</label>
                <select aria-label="Selected ECMD crew" value={selectedCrew} onChange={event => setSelectedCrew(event.target.value)} className="input-field rounded-lg">
                  <option value="">No crew assignment</option>
                  {crewList.map(crew => <option key={crew.id} value={crew.id}>{crew.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Instructions</label>
                <textarea name="assigntaskpage-optional-assignment-instructions-12" aria-label="Optional assignment instructions" value={assignNotes} onChange={event => setAssignNotes(event.target.value)} rows={4}
                  placeholder="Optional instructions for Maintenance Personnel" className="input-field rounded-lg resize-none" />
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
