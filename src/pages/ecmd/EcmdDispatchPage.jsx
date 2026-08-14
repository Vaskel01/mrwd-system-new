import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useComplaintStore } from '../../store/complaintStore'
import { useOperationalStore } from '../../store/operationalStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import ComplaintOperationsMap from '../../components/ui/ComplaintOperationsMap'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import AppIcon from '../../components/ui/AppIcon'

const QUEUE_FILTERS = [
  { key: 'all', label: 'All Active', test: () => true },
  { key: 'forwarded', label: 'Ready for Dispatch', test: item => item.status === 'forwarded' && !item.assigned_to },
  { key: 'assigned', label: 'Assigned', test: item => item.status === 'assigned' },
  { key: 'field_work', label: 'Field Work', test: item => ['en_route', 'in_progress'].includes(item.status) },
  { key: 'blocked', label: 'Needs Attention', test: item => item.status === 'blocked' },
  { key: 'verification', label: 'Awaiting Verification', test: item => item.status === 'awaiting_verification' },
]

const availabilityLabel = value => ({ available: 'Available', busy: 'Busy', on_leave: 'On Leave', off_duty: 'Off Duty' }[value] || value || 'Available')
const availabilityTone = value => ({
  available: 'bg-green-100 text-green-700',
  busy: 'bg-amber-100 text-amber-700',
  on_leave: 'bg-gray-100 text-gray-600',
  off_duty: 'bg-gray-100 text-gray-600',
}[value] || 'bg-gray-100 text-gray-600')

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
  const [view, setView] = useState('queue')
  const [queueFilter, setQueueFilter] = useState('all')
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

  const activeComplaints = useMemo(() => complaints.filter(item => !['resolved', 'completed', 'rejected', 'cancelled'].includes(item.status)), [complaints])

  const counts = useMemo(() => Object.fromEntries(QUEUE_FILTERS.map(filter => [filter.key, activeComplaints.filter(filter.test).length])), [activeComplaints])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const selected = QUEUE_FILTERS.find(filter => filter.key === queueFilter) || QUEUE_FILTERS[0]
    return activeComplaints.filter(item => {
      if (!selected.test(item)) return false
      if (priority !== 'all' && item.priority !== priority) return false
      if (!q) return true
      return [item.reference_number, item.complaint_type, item.description, item.address, item.customer_name, item.assigned_name]
        .some(value => String(value || '').toLowerCase().includes(q))
    })
  }, [activeComplaints, priority, query, queueFilter])

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

  if (loading && !complaints.length) return <PageLoader label="Loading ECMD dispatch queue..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-5 py-6 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gold-400">Engineering, Construction and Maintenance Department</p>
        <div className="mt-1 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-2xl font-black text-white sm:text-3xl">Complaint Dispatch</h1>
            <p className="mt-1 max-w-3xl text-sm text-navy-300">Review the active ECMD queue, assign Maintenance Personnel, monitor field work, and verify completed repairs.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('queue')} className={`rounded-lg px-4 py-2 text-xs font-black ${view === 'queue' ? 'bg-gold-400 text-navy-950' : 'border border-white/30 text-white'}`}>Queue</button>
            <button onClick={() => setView('map')} className={`rounded-lg px-4 py-2 text-xs font-black ${view === 'map' ? 'bg-gold-400 text-navy-950' : 'border border-white/30 text-white'}`}>Map</button>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {notice && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">{notice}</div>}

      <section className="card overflow-hidden rounded-xl">
        <div className="border-b border-gray-100 px-4 pt-4 sm:px-5">
          <div className="flex gap-2 overflow-x-auto pb-3">
            {QUEUE_FILTERS.map(filter => (
              <button
                key={filter.key}
                onClick={() => setQueueFilter(filter.key)}
                className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-black transition ${queueFilter === filter.key ? 'border-navy-700 bg-navy-700 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-navy-200 hover:text-navy-800'}`}
              >
                {filter.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${queueFilter === filter.key ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500'}`}>{counts[filter.key] || 0}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_180px_auto] sm:p-5">
          <div className="relative"><AppIcon name="search" className="absolute left-3 top-3 h-4 w-4 text-gray-400"/><input value={query} onChange={e => setQuery(e.target.value)} className="input-field rounded-lg pl-9" placeholder="Search reference, category, address, customer..."/></div>
          <select value={priority} onChange={e => setPriority(e.target.value)} className="input-field rounded-lg"><option value="all">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
          <button onClick={load} className="btn-secondary rounded-lg"><AppIcon name="refresh" className="mr-2 inline h-4 w-4"/>Refresh</button>
        </div>
      </section>

      {view === 'map' ? (
        <section className="card rounded-xl p-4">
          <div className="mb-3"><h2 className="font-display font-black text-navy-900">Active Complaint Map</h2><p className="text-xs text-gray-500">Pins show active complaints with recorded coordinates. Select a complaint to open its details.</p></div>
          <ComplaintOperationsMap complaints={filtered} onOpen={item => navigate(`/complaints/${item.id}`)} />
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
          <section className="card min-w-0 overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div><h2 className="font-display font-black text-navy-900">Dispatch Queue</h2><p className="mt-0.5 text-xs text-gray-500">{filtered.length} complaint{filtered.length === 1 ? '' : 's'} shown</p></div>
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left">
                <thead className="border-b border-gray-100 bg-gray-50/80 text-[10px] font-black uppercase tracking-wider text-gray-400">
                  <tr>
                    <th className="px-5 py-3">Complaint</th>
                    <th className="px-4 py-3">Location / Customer</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Assignment</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(item => (
                    <tr key={item.id} className="group hover:bg-navy-50/30">
                      <td className="px-5 py-4 align-top">
                        <button onClick={() => navigate(`/complaints/${item.id}`)} className="text-left">
                          <p className="font-mono text-[10px] font-bold text-gray-400">{item.reference_number}</p>
                          <p className="mt-1 text-sm font-black text-navy-900 group-hover:text-brand-700">{item.complaint_type}</p>
                          {item.similar_count ? <p className="mt-1 text-[10px] font-bold text-amber-700">{item.similar_count} nearby/related report{item.similar_count === 1 ? '' : 's'}</p> : null}
                        </button>
                      </td>
                      <td className="max-w-[260px] px-4 py-4 align-top">
                        <p className="truncate text-xs font-semibold text-gray-700">{item.address || 'No address'}</p>
                        <p className="mt-1 truncate text-[11px] text-gray-400">{item.customer_name || 'Customer'}</p>
                      </td>
                      <td className="px-4 py-4 align-top"><PriorityBadge priority={item.priority}/></td>
                      <td className="px-4 py-4 align-top"><StatusBadge status={item.status}/></td>
                      <td className="px-4 py-4 align-top">
                        <p className="text-xs font-bold text-gray-700">{item.assigned_name || 'Unassigned'}</p>
                        {item.assigned_name && <p className="mt-1 text-[10px] text-gray-400">Maintenance Personnel</p>}
                      </td>
                      <td className="px-5 py-4 align-top text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => navigate(`/complaints/${item.id}`)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] font-black text-gray-700 hover:border-navy-200">View</button>
                          {item.status === 'awaiting_verification' ? (
                            <button onClick={() => navigate(`/complaints/${item.id}`)} className="rounded-lg bg-violet-600 px-3 py-2 text-[11px] font-black text-white">Verify</button>
                          ) : (
                            <button onClick={() => openAssign(item)} className="rounded-lg bg-navy-800 px-3 py-2 text-[11px] font-black text-white hover:bg-navy-900">{item.assigned_to ? 'Reassign' : 'Assign'}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && <tr><td colSpan="6" className="px-5 py-14 text-center"><p className="text-sm font-bold text-gray-500">No complaints in this queue.</p><p className="mt-1 text-xs text-gray-400">Try another status or clear the filters.</p></td></tr>}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-gray-100 lg:hidden">
              {filtered.map(item => (
                <article key={item.id} className="p-4">
                  <button onClick={() => navigate(`/complaints/${item.id}`)} className="w-full text-left">
                    <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] font-bold text-gray-400">{item.reference_number}</p><p className="mt-1 font-black text-navy-900">{item.complaint_type}</p></div><PriorityBadge priority={item.priority}/></div>
                    <p className="mt-2 text-xs font-semibold text-gray-600">{item.address || 'No address'}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge status={item.status}/><span className="text-xs text-gray-500">{item.assigned_name || 'Unassigned'}</span></div>
                  </button>
                  <div className="mt-3 flex gap-2"><button onClick={() => navigate(`/complaints/${item.id}`)} className="btn-secondary flex-1 rounded-lg text-xs">View Details</button>{item.status === 'awaiting_verification' ? <button onClick={() => navigate(`/complaints/${item.id}`)} className="flex-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-black text-white">Verify</button> : <button onClick={() => openAssign(item)} className="btn-primary flex-1 rounded-lg text-xs">{item.assigned_to ? 'Reassign' : 'Assign'}</button>}</div>
                </article>
              ))}
              {!filtered.length && <div className="px-5 py-12 text-center"><p className="text-sm font-bold text-gray-500">No complaints in this queue.</p></div>}
            </div>
          </section>

          <aside className="card h-fit rounded-xl p-4 xl:sticky xl:top-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-display font-black text-navy-900">Maintenance Availability</h2><p className="mt-1 text-xs text-gray-500">Quick workload reference for dispatch.</p></div><span className="rounded-lg bg-navy-50 px-2 py-1 text-[10px] font-black text-navy-700">{rankedStaff.length} staff</span></div>
            <div className="mt-4 divide-y divide-gray-100">
              {rankedStaff.map((person, index) => {
                const current = workloadMap[person.id] || person
                return <div key={person.id} className="py-3 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-1.5"><p className="truncate text-xs font-black text-gray-900">{person.full_name}</p>{index === 0 && person.availability_status === 'available' && <span title="Recommended" className="text-gold-500">★</span>}</div><span className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${availabilityTone(person.availability_status)}`}>{availabilityLabel(person.availability_status)}</span></div><span className="shrink-0 text-xs font-black text-navy-800">{current.active_tasks || 0} active</span></div>{person.availability_note && <p className="mt-1.5 line-clamp-2 text-[10px] text-gray-400">{person.availability_note}</p>}</div>
              })}
              {!rankedStaff.length && <p className="py-6 text-center text-xs text-gray-400">No Maintenance Personnel found.</p>}
            </div>
          </aside>
        </div>
      )}

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
