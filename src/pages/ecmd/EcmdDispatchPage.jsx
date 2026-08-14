import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useComplaintStore } from '../../store/complaintStore'
import { useOperationalStore } from '../../store/operationalStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import ComplaintOperationsMap from '../../components/ui/ComplaintOperationsMap'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import AppIcon from '../../components/ui/AppIcon'

const GROUPS = [
  ['forwarded', 'Ready for Dispatch', item => item.status === 'forwarded' && !item.assigned_to],
  ['assigned', 'Assigned', item => item.status === 'assigned'],
  ['in_progress', 'In Progress', item => ['en_route', 'in_progress'].includes(item.status)],
  ['blocked', 'Needs Attention', item => item.status === 'blocked'],
  ['verification', 'Awaiting Verification', item => item.status === 'awaiting_verification'],
]

const availabilityLabel = value => ({ available: 'Available', busy: 'Busy', on_leave: 'On Leave', off_duty: 'Off Duty' }[value] || value || 'Available')

export default function EcmdDispatchPage() {
  const navigate = useNavigate()
  const complaints = useComplaintStore(state => state.complaints)
  const loading = useComplaintStore(state => state.loading)
  const error = useComplaintStore(state => state.error)
  const fetchComplaints = useComplaintStore(state => state.fetchComplaints)
  const assignComplaint = useComplaintStore(state => state.assignComplaint)
  const workload = useOperationalStore(state => state.workload)
  const fetchWorkload = useOperationalStore(state => state.fetchWorkload)
  const reasonCodes = useOperationalStore(state => state.reasonCodes)
  const fetchOperationalReference = useOperationalStore(state => state.fetchOperationalReference)

  const [staff, setStaff] = useState([])
  const [view, setView] = useState('board')
  const [query, setQuery] = useState('')
  const [priority, setPriority] = useState('all')
  const [assigning, setAssigning] = useState(null)
  const [form, setForm] = useState({ staffId: '', reasonCode: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    await Promise.all([fetchComplaints(), fetchWorkload(), fetchOperationalReference()])
    try {
      const result = await apiFetch('/users/maintenance-staff')
      setStaff(result.staff || [])
    } catch (_) {}
  }, [fetchComplaints, fetchWorkload, fetchOperationalReference])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return complaints.filter(item => {
      if (['resolved','completed','rejected','cancelled'].includes(item.status)) return false
      if (priority !== 'all' && item.priority !== priority) return false
      if (!q) return true
      return [item.reference_number, item.complaint_type, item.description, item.address, item.customer_name]
        .some(value => String(value || '').toLowerCase().includes(q))
    })
  }, [complaints, priority, query])

  const workloadMap = useMemo(() => Object.fromEntries(workload.map(item => [item.id, item])), [workload])
  const reassignmentReasons = reasonCodes.filter(item => item.action_type === 'reassignment')
  const rankedStaff = useMemo(() => [...staff].sort((a, b) => {
    const availabilityRank = value => value === 'available' ? 0 : value === 'busy' ? 1 : 2
    return availabilityRank(a.availability_status) - availabilityRank(b.availability_status)
      || (workloadMap[a.id]?.active_tasks || 0) - (workloadMap[b.id]?.active_tasks || 0)
      || a.full_name.localeCompare(b.full_name)
  }), [staff, workloadMap])

  const openAssign = complaint => {
    setAssigning(complaint)
    setForm({ staffId: complaint.assigned_to || '', reasonCode: '', notes: complaint.task_notes || '' })
  }

  const saveAssignment = async event => {
    event.preventDefault()
    if (!assigning || !form.staffId) return
    if (assigning.assigned_to && form.staffId !== assigning.assigned_to && !form.reasonCode) {
      setNotice('Choose a reassignment reason before changing personnel.')
      return
    }
    setBusy(true)
    try {
      await assignComplaint(assigning.id, form.staffId, form.notes.trim(), '', form.reasonCode)
      await Promise.all([fetchComplaints(), fetchWorkload()])
      setNotice(assigning.assigned_to ? 'Complaint reassigned.' : 'Complaint dispatched to Maintenance Personnel.')
      setAssigning(null)
    } catch (assignError) {
      setNotice(assignError.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading && !complaints.length) return <PageLoader label="Loading ECMD dispatch board..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-5 py-6 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gold-400">Engineering, Construction and Maintenance Department</p>
        <div className="mt-1 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-2xl font-black text-white sm:text-3xl">Complaint Dispatch Board</h1>
            <p className="mt-1 max-w-3xl text-sm text-navy-300">Dispatch forwarded complaints, balance maintenance workload, monitor field progress, and review work waiting for ECMD verification.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('board')} className={`rounded-lg px-4 py-2 text-xs font-black ${view === 'board' ? 'bg-gold-400 text-navy-950' : 'border border-white/30 text-white'}`}>Board</button>
            <button onClick={() => setView('map')} className={`rounded-lg px-4 py-2 text-xs font-black ${view === 'map' ? 'bg-gold-400 text-navy-950' : 'border border-white/30 text-white'}`}>Map</button>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {notice && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">{notice}</div>}

      <div className="card rounded-xl p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
          <div className="relative"><AppIcon name="search" className="absolute left-3 top-3 h-4 w-4 text-gray-400"/><input value={query} onChange={e => setQuery(e.target.value)} className="input-field rounded-lg pl-9" placeholder="Search reference, category, address, customer..."/></div>
          <select value={priority} onChange={e => setPriority(e.target.value)} className="input-field rounded-lg"><option value="all">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
          <button onClick={load} className="btn-secondary rounded-lg"><AppIcon name="refresh" className="mr-2 inline h-4 w-4"/>Refresh</button>
        </div>
      </div>

      {view === 'map' ? (
        <section className="card rounded-xl p-4">
          <div className="mb-3"><h2 className="font-display font-black text-navy-900">Active Complaint Map</h2><p className="text-xs text-gray-500">Pins show active complaints with recorded coordinates. High-priority complaints use larger markers.</p></div>
          <ComplaintOperationsMap complaints={filtered} onOpen={item => navigate(`/complaints/${item.id}`)} />
        </section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-5">
          {GROUPS.map(([key, label, test]) => {
            const items = filtered.filter(test)
            return <section key={key} className="min-w-0 rounded-xl border border-gray-200 bg-gray-50/70">
              <div className="flex items-center justify-between border-b border-gray-200 px-3 py-3"><h2 className="text-xs font-black uppercase tracking-wide text-gray-700">{label}</h2><span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-gray-600 shadow-sm">{items.length}</span></div>
              <div className="space-y-2 p-2">
                {items.length === 0 ? <p className="px-2 py-6 text-center text-xs text-gray-400">No complaints</p> : items.map(item => <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                  <button onClick={() => navigate(`/complaints/${item.id}`)} className="w-full text-left">
                    <div className="flex flex-wrap items-center gap-1.5"><PriorityBadge priority={item.priority}/><StatusBadge status={item.status}/>{item.similar_count ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{item.similar_count} nearby/related</span> : null}</div>
                    <p className="mt-2 font-mono text-[10px] font-bold text-gray-400">{item.reference_number}</p>
                    <p className="mt-1 text-sm font-black text-navy-900">{item.complaint_type}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-500">{item.address}</p>
                    {item.assigned_name && <p className="mt-2 text-[11px] font-semibold text-gray-600">Assigned: {item.assigned_name}</p>}
                  </button>
                  {!['awaiting_verification'].includes(item.status) && <button onClick={() => openAssign(item)} className="btn-secondary mt-3 w-full rounded-lg text-xs">{item.assigned_to ? 'Reassign' : 'Assign'}</button>}
                  {item.status === 'awaiting_verification' && <button onClick={() => navigate(`/complaints/${item.id}`)} className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-black text-white">Verify Resolution</button>}
                </article>)}
              </div>
            </section>
          })}
        </div>
      )}

      <section className="card rounded-xl p-5">
        <h2 className="font-display font-black text-navy-900">Maintenance Workload</h2>
        <p className="mt-1 text-xs text-gray-500">Use availability and current active-task counts before assigning or reassigning field work.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rankedStaff.map((person, index) => {
            const current = workloadMap[person.id] || person
            return <div key={person.id} className="rounded-xl border border-gray-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-gray-900">{person.full_name}</p>{index === 0 && person.availability_status === 'available' && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-green-700">Recommended</span>}</div><p className="mt-1 text-xs text-gray-500">{availabilityLabel(person.availability_status)}</p></div><span className="rounded-lg bg-navy-50 px-2.5 py-1 text-xs font-black text-navy-800">{current.active_tasks || 0} active</span></div>{person.availability_note && <p className="mt-2 text-xs text-gray-500">{person.availability_note}</p>}</div>
          })}
        </div>
      </section>

      {assigning && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4" onMouseDown={() => !busy && setAssigning(null)}><form onSubmit={saveAssignment} onMouseDown={e => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="font-display text-xl font-black text-navy-900">{assigning.assigned_to ? 'Reassign Complaint' : 'Assign Complaint'}</h2>
        <p className="mt-1 text-xs text-gray-500">{assigning.reference_number} · {assigning.complaint_type}</p>
        <div className="mt-5 space-y-4">
          <div><label className="mb-1.5 block text-xs font-black uppercase text-gray-500">Maintenance Personnel</label><select required value={form.staffId} onChange={e => setForm(v => ({...v, staffId:e.target.value}))} className="input-field rounded-lg"><option value="">Choose personnel</option>{rankedStaff.map((person, index) => <option key={person.id} value={person.id} disabled={['on_leave','off_duty'].includes(person.availability_status)}>{index === 0 && person.availability_status === 'available' ? 'Recommended · ' : ''}{person.full_name} · {availabilityLabel(person.availability_status)} · {workloadMap[person.id]?.active_tasks || 0} active</option>)}</select></div>
          {assigning.assigned_to && form.staffId !== assigning.assigned_to && <div><label className="mb-1.5 block text-xs font-black uppercase text-gray-500">Reassignment Reason *</label><select required value={form.reasonCode} onChange={e => setForm(v => ({...v, reasonCode:e.target.value}))} className="input-field rounded-lg"><option value="">Choose reason</option>{reassignmentReasons.map(reason => <option key={reason.code} value={reason.code}>{reason.label}</option>)}</select></div>}
          <div><label className="mb-1.5 block text-xs font-black uppercase text-gray-500">Dispatch Instructions / Notes</label><textarea rows={4} value={form.notes} onChange={e => setForm(v => ({...v, notes:e.target.value}))} className="input-field resize-none rounded-lg" placeholder="Optional field instructions..."/></div>
        </div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setAssigning(null)} className="btn-secondary rounded-lg">Cancel</button><button disabled={busy || !form.staffId} className="btn-primary rounded-lg disabled:opacity-50">{busy ? 'Saving...' : 'Confirm'}</button></div>
      </form></div>}
    </div>
  )
}
