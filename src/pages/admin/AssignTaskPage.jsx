import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useComplaintStore } from '../../store/complaintStore'
import { apiFetch } from '../../lib/api'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { PageLoader, ErrorBanner, Spinner } from '../../components/ui/Feedback'
import RejectionDialog from '../../components/ui/RejectionDialog'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const PRIORITY_STRIPE = { high: 'border-l-red-500', medium: 'border-l-amber-400', low: 'border-l-green-400' }
const SORT_OPTIONS = {
  priority: { label: 'Priority', cmp: (a, b) => b.priority_score - a.priority_score },
  newest: { label: 'Newest', cmp: (a, b) => new Date(b.created_at) - new Date(a.created_at) },
  oldest: { label: 'Oldest', cmp: (a, b) => new Date(a.created_at) - new Date(b.created_at) },
  type: { label: 'Type A–Z', cmp: (a, b) => a.complaint_type.localeCompare(b.complaint_type) },
}

function matchesSearch(c, query) {
  if (!query) return true
  return [c.id, c.complaint_type, c.description, c.customer_name, c.address, c.assigned_name, c.status, c.task_notes, c.rejection_reason]
    .some(v => String(v || '').toLowerCase().includes(query))
}

export default function AssignTaskPage() {
  const navigate = useNavigate()
  const complaints = useComplaintStore(s => s.complaints)
  const loading = useComplaintStore(s => s.loading)
  const error = useComplaintStore(s => s.error)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)
  const assignComplaint = useComplaintStore(s => s.assignComplaint)
  const updateStatus = useComplaintStore(s => s.updateStatus)
  const bulkAssign = useComplaintStore(s => s.bulkAssign)
  const bulkStatus = useComplaintStore(s => s.bulkStatus)
  const restoreComplaint = useComplaintStore(s => s.restoreComplaint)

  const [staffList, setStaffList] = useState([])
  const [staffError, setStaffError] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('priority')
  const [assignedTab, setAssignedTab] = useState('active')
  const [selectedId, setSelectedId] = useState(null)
  const [selectedStaff, setSelectedStaff] = useState('')
  const [assignNotes, setAssignNotes] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [checked, setChecked] = useState(new Set())
  const [bulkStaff, setBulkStaff] = useState('')
  const [bulkNotes, setBulkNotes] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [restoringId, setRestoringId] = useState(null)
  const [toast, setToast] = useState({ message: '', type: 'success' })

  useEffect(() => { fetchComplaints() }, [fetchComplaints])
  useEffect(() => {
    apiFetch('/users/maintenance-staff').then(({ staff }) => setStaffList(staff)).catch(err => setStaffError(err.message))
  }, [])

  const q = search.trim().toLowerCase()
  const unassigned = useMemo(() => complaints
    .filter(c => !c.assigned_to && !['completed', 'rejected'].includes(c.status))
    .filter(c => matchesSearch(c, q))
    .sort(SORT_OPTIONS[sortBy].cmp), [complaints, q, sortBy])
  const assignedAll = useMemo(() => complaints.filter(c => c.assigned_to).filter(c => matchesSearch(c, q)).sort((a, b) => b.priority_score - a.priority_score), [complaints, q])
  const assignedActive = assignedAll.filter(c => !['completed', 'rejected'].includes(c.status))
  const assignedDone = assignedAll.filter(c => ['completed', 'rejected'].includes(c.status))
  const selectedComplaint = unassigned.find(c => c.id === selectedId)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast({ message: '', type: 'success' }), 3500)
  }

  const handleAssign = async () => {
    if (!selectedComplaint || !selectedStaff) return
    setAssigning(true)
    try {
      await assignComplaint(selectedComplaint.id, selectedStaff, assignNotes.trim())
      showToast('Complaint assigned successfully.')
      setSelectedId(null); setSelectedStaff(''); setAssignNotes('')
    } catch (err) { showToast(err.message, 'error') }
    finally { setAssigning(false) }
  }

  const toggleChecked = id => setChecked(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleBulkAssign = async () => {
    if (!checked.size || !bulkStaff) return
    setBulkAssigning(true)
    try {
      await bulkAssign([...checked], bulkStaff, bulkNotes.trim())
      showToast(`${checked.size} complaints assigned.`)
      setChecked(new Set()); setBulkStaff(''); setBulkNotes('')
    } catch (err) { showToast(err.message, 'error') }
    finally { setBulkAssigning(false) }
  }

  const handleReject = async reason => {
    setRejecting(true)
    try {
      if (rejectTarget) {
        await updateStatus(rejectTarget.id, 'rejected', reason)
        showToast(`“${rejectTarget.complaint_type}” rejected with a recorded reason.`)
        setRejectTarget(null)
      } else if (bulkRejectOpen) {
        await bulkStatus([...checked], 'rejected', reason)
        showToast(`${checked.size} complaints rejected with a recorded reason.`)
        setChecked(new Set()); setBulkRejectOpen(false)
      }
    } catch (err) { showToast(err.message, 'error') }
    finally { setRejecting(false) }
  }

  const handleRestore = async complaint => {
    setRestoringId(complaint.id)
    try {
      await restoreComplaint(complaint.id)
      showToast('Rejection undone. Complaint restored.')
    } catch (err) { showToast(err.message, 'error') }
    finally { setRestoringId(null) }
  }

  const handleStatus = async (id, status) => {
    try { await updateStatus(id, status); showToast(`Status changed to ${status.replace('_', ' ')}.`) }
    catch (err) { showToast(err.message, 'error') }
  }

  if (loading && complaints.length === 0) return <PageLoader label="Loading tasks..." />

  return (
    <div className="space-y-5">
      <div className="page-band rounded-2xl px-6 py-6"><p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em]">Admin</p><h1 className="font-display font-black text-white text-2xl mt-1">Assign Tasks</h1><p className="text-navy-300 text-sm mt-1">Search, assign, reject with a reason, restore, and open complete task records.</p></div>

      {toast.message && <div className={`p-3 border-l-4 text-sm font-bold ${toast.type === 'error' ? 'bg-red-50 border-red-500 text-red-800' : 'bg-green-50 border-green-500 text-green-800'}`}>{toast.message}</div>}
      {error && <ErrorBanner message={error} onRetry={fetchComplaints}/>} {staffError && <ErrorBanner message={staffError}/>} 

      <div className="card rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search complaint, task ID, customer, address, technician or status..." className="input-field flex-1 rounded-lg"/>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="input-field sm:w-44 rounded-lg">{Object.entries(SORT_OPTIONS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select>
      </div>

      <div className="grid grid-cols-3 card rounded-xl overflow-hidden divide-x divide-gray-100 text-center">
        <div className="p-3"><p className="font-black text-2xl text-amber-600">{unassigned.length}</p><p className="text-xs text-gray-400">Unassigned</p></div>
        <div className="p-3"><p className="font-black text-2xl text-brand-600">{assignedActive.length}</p><p className="text-xs text-gray-400">Active</p></div>
        <div className="p-3"><p className="font-black text-2xl text-green-600">{assignedDone.length}</p><p className="text-xs text-gray-400">Resolved/Rejected</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section>
          <div className="flex items-center justify-between mb-3"><h2 className="text-xs font-black text-gray-500 uppercase tracking-widest">Unassigned Queue</h2><span className="text-xs font-bold text-amber-700">{unassigned.length} shown</span></div>
          {unassigned.length === 0 ? <div className="card rounded-xl p-10 text-center text-gray-400">No unassigned complaints match your search.</div> : <>
            <div className="card rounded-xl p-3 mb-3 space-y-2">
              <div className="flex items-center gap-2"><input type="checkbox" checked={checked.size === unassigned.length && unassigned.length > 0} onChange={() => setChecked(checked.size === unassigned.length ? new Set() : new Set(unassigned.map(c => c.id)))} className="accent-brand-600"/><span className="text-xs font-bold text-gray-500">{checked.size ? `${checked.size} selected` : 'Select all shown'}</span></div>
              {checked.size > 0 && <><div className="flex gap-2"><select value={bulkStaff} onChange={e => setBulkStaff(e.target.value)} className="input-field flex-1 text-sm"><option value="">Assign selected to…</option>{staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select><button onClick={handleBulkAssign} disabled={!bulkStaff || bulkAssigning} className="btn-primary px-4 disabled:opacity-50">{bulkAssigning ? <Spinner className="w-4 h-4 border-2 border-white"/> : 'Assign'}</button></div><input value={bulkNotes} onChange={e => setBulkNotes(e.target.value)} placeholder="Instructions for all selected (optional)" className="input-field text-sm"/><button onClick={() => setBulkRejectOpen(true)} className="text-xs font-bold text-red-600">✕ Reject selected with one reason</button></>}
            </div>
            <div className="space-y-2">{unassigned.map(c => {
              const selected = selectedId === c.id
              return <div key={c.id} className={`card rounded-xl overflow-hidden border-l-4 ${PRIORITY_STRIPE[c.priority]}`}>
                <div className="p-4 flex gap-3">
                  <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggleChecked(c.id)} className="accent-brand-600 mt-1"/>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-3"><div><p className="font-bold text-gray-900">{c.complaint_type}</p><p className="text-xs text-gray-400 mt-1">{c.customer_name} · {timeAgo(c.created_at)}</p><p className="text-xs text-gray-400 truncate mt-1">📍 {c.address}</p></div><span className="font-black text-2xl text-navy-800">{c.priority_score}</span></div>
                    <div className="flex items-center gap-2 mt-3"><PriorityBadge priority={c.priority}/><button onClick={() => navigate(`/complaints/${c.id}`)} className="text-xs font-bold text-navy-600 ml-auto">View Details</button><button onClick={() => { setSelectedId(selected ? null : c.id); setSelectedStaff(''); setAssignNotes('') }} className="text-xs font-bold text-brand-700">{selected ? 'Close' : 'Assign →'}</button></div>
                  </div>
                </div>
                {selected && <div className="p-4 border-t border-brand-200 bg-brand-50 space-y-2"><select value={selectedStaff} onChange={e => setSelectedStaff(e.target.value)} className="input-field text-sm"><option value="">Select maintenance staff…</option>{staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select><textarea value={assignNotes} onChange={e => setAssignNotes(e.target.value)} rows={2} placeholder="Instructions for the technician (optional)" className="input-field resize-none text-sm"/><button onClick={handleAssign} disabled={!selectedStaff || assigning} className="btn-primary w-full disabled:opacity-50">{assigning ? 'Assigning…' : 'Confirm Assignment'}</button></div>}
              </div>
            })}</div>
          </>}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3"><h2 className="text-xs font-black text-gray-500 uppercase tracking-widest">Assigned Tasks</h2><span className="text-xs font-bold text-brand-700">{assignedAll.length} shown</span></div>
          <div className="grid grid-cols-2 card rounded-xl overflow-hidden mb-3"><button onClick={() => setAssignedTab('active')} className={`py-2 text-xs font-black ${assignedTab === 'active' ? 'bg-navy-900 text-white' : 'text-gray-500'}`}>ACTIVE ({assignedActive.length})</button><button onClick={() => setAssignedTab('done')} className={`py-2 text-xs font-black ${assignedTab === 'done' ? 'bg-navy-900 text-white' : 'text-gray-500'}`}>RESOLVED ({assignedDone.length})</button></div>

          {assignedTab === 'active' ? (assignedActive.length ? <div className="space-y-2">{assignedActive.map(c => <div key={c.id} className={`card rounded-xl p-4 border-l-4 ${PRIORITY_STRIPE[c.priority]}`}><div className="flex justify-between gap-3"><div><p className="font-bold text-gray-900">{c.complaint_type}</p><p className="text-xs text-brand-600 font-bold mt-1">👷 {c.assigned_name}</p><p className="text-xs text-gray-400 mt-1">📍 {c.address}</p></div><div className="text-right"><StatusBadge status={c.status}/><p className="font-black text-xl text-navy-800 mt-1">{c.priority_score}</p></div></div><div className="flex gap-2 flex-wrap mt-3 pt-3 border-t border-gray-100"><button onClick={() => navigate(`/complaints/${c.id}`)} className="text-xs px-3 py-1.5 font-bold border border-navy-200 text-navy-700">View Details</button>{c.status === 'assigned' && <button onClick={() => handleStatus(c.id, 'en_route')} className="text-xs px-3 py-1.5 font-bold border border-orange-200 text-orange-700">En Route</button>}{c.status === 'en_route' && <button onClick={() => handleStatus(c.id, 'in_progress')} className="text-xs px-3 py-1.5 font-bold border border-brand-200 text-brand-700">On Site</button>}{c.status === 'in_progress' && <button onClick={() => handleStatus(c.id, 'completed')} className="text-xs px-3 py-1.5 font-bold border border-green-200 text-green-700">Complete</button>}<button onClick={() => setRejectTarget(c)} className="text-xs px-3 py-1.5 font-bold border border-red-200 text-red-600">Reject</button></div></div>)}</div> : <div className="card rounded-xl p-10 text-center text-gray-400">No active tasks match your search.</div>) : (assignedDone.length ? <div className="space-y-2">{assignedDone.map(c => <div key={c.id} className={`card rounded-xl p-4 border-l-4 ${PRIORITY_STRIPE[c.priority]}`}><div className="flex justify-between gap-3"><div><p className="font-bold text-gray-800">{c.complaint_type}</p><p className="text-xs text-gray-400 mt-1">👷 {c.assigned_name}</p>{c.status === 'rejected' && <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded"><p className="text-xs text-red-700"><b>Reason:</b> {c.rejection_reason || 'Not recorded'}</p></div>}</div><StatusBadge status={c.status}/></div><div className="flex gap-2 mt-3"><button onClick={() => navigate(`/complaints/${c.id}`)} className="text-xs font-bold text-navy-700">View details & timeline →</button>{c.status === 'rejected' && <button onClick={() => handleRestore(c)} disabled={restoringId === c.id} className="ml-auto text-xs font-bold text-white bg-navy-800 px-3 py-1.5 rounded disabled:opacity-50">{restoringId === c.id ? 'Restoring…' : '↶ Undo Rejection'}</button>}</div></div>)}</div> : <div className="card rounded-xl p-10 text-center text-gray-400">No resolved tasks match your search.</div>)}
        </section>
      </div>

      <RejectionDialog open={!!rejectTarget} title="Reject this complaint?" description={rejectTarget ? `Explain why “${rejectTarget.complaint_type}” is being rejected. The customer will see this reason.` : ''} loading={rejecting} onConfirm={handleReject} onCancel={() => setRejectTarget(null)}/>
      <RejectionDialog open={bulkRejectOpen} title={`Reject ${checked.size} complaints?`} description="Enter one clear reason that will be saved on every selected complaint and shown to each customer." confirmLabel={`Reject ${checked.size}`} loading={rejecting} onConfirm={handleReject} onCancel={() => setBulkRejectOpen(false)}/>
    </div>
  )
}
