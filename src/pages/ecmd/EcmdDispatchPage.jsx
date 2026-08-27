import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useComplaintStore } from '../../store/complaintStore'
import { useOperationalStore } from '../../store/operationalStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import ComplaintOperationsMap from '../../components/ui/ComplaintOperationsMap'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import AppIcon from '../../components/ui/AppIcon'
import SearchField from '../../components/ui/SearchField'
import { useToastStore } from '../../store/toastStore'
import SavedViewsBar from '../../components/ui/SavedViewsBar'
import BulkActionBar from '../../components/ui/BulkActionBar'
import Dialog from '../../components/ui/Dialog'
import { useProductionStore } from '../../store/productionStore'

const QUEUE_FILTERS = [
  { key: 'all', label: 'All active', test: () => true },
  { key: 'forwarded', label: 'Ready to assign', test: item => item.status === 'forwarded' && !item.assigned_to },
  { key: 'assigned', label: 'Assigned', test: item => item.status === 'assigned' },
  { key: 'field_work', label: 'Field work', test: item => ['en_route', 'in_progress'].includes(item.status) },
  { key: 'blocked', label: 'Needs attention', test: item => item.status === 'blocked' },
  { key: 'verification', label: 'Waiting for WDLCD verification', test: item => item.status === 'awaiting_verification' },
]

const availabilityLabel = value => ({ available: 'Available', busy: 'Busy', on_leave: 'On leave', off_duty: 'Off duty' }[value] || value || 'Available')
const activeTaskLabel = count => `${count || 0} active ${(count || 0) === 1 ? 'task' : 'tasks'}`
const availabilityTone = value => ({
  available: 'bg-green-100 text-green-700',
  busy: 'bg-amber-100 text-amber-700',
  on_leave: 'bg-gray-100 text-gray-600',
  off_duty: 'bg-gray-100 text-gray-600',
}[value] || 'bg-gray-100 text-gray-600')

export default function EcmdDispatchPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const pushToast = useToastStore(state => state.push)
  const complaints = useComplaintStore(state => state.complaints)
  const loading = useComplaintStore(state => state.loading)
  const error = useComplaintStore(state => state.error)
  const fetchComplaints = useComplaintStore(state => state.fetchComplaints)
  const assignComplaint = useComplaintStore(state => state.assignComplaint)
  const workload = useOperationalStore(state => state.workload)
  const fetchWorkload = useOperationalStore(state => state.fetchWorkload)
  const reasonCodes = useOperationalStore(state => state.reasonCodes)
  const bulkAction = useProductionStore(state => state.bulkAction)
  const [selected, setSelected] = useState([])
  const [bulkStaffId, setBulkStaffId] = useState('')
  const [bulkChoice, setBulkChoice] = useState('assign')
  const [bulkPriority, setBulkPriority] = useState('medium')
  const [bulkReason, setBulkReason] = useState('')
  const fetchOperationalReference = useOperationalStore(state => state.fetchOperationalReference)

  const [staff, setStaff] = useState([])
  const [crews, setCrews] = useState([])
  const [view, setView] = useState(() => searchParams.get('view') || 'queue')
  const [queueFilter, setQueueFilter] = useState(() => searchParams.get('queue') || 'all')
  const [query, setQuery] = useState(() => searchParams.get('q') || '')
  const [priority, setPriority] = useState(() => searchParams.get('priority') || 'all')
  const [sortBy, setSortBy] = useState(() => searchParams.get('sort') || 'priority')
  const [assigning, setAssigning] = useState(null)
  const [form, setForm] = useState({ crewId: '', staffId: '', reasonCode: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    await Promise.all([fetchComplaints(), fetchWorkload(), fetchOperationalReference()])
    try {
      const [staffResult, crewResult] = await Promise.all([apiFetch('/users/maintenance-staff'), apiFetch('/operations/crews')])
      setStaff(staffResult.staff || [])
      setCrews(crewResult.crews || [])
    } catch {
      setStaff([])
      setCrews([])
    }
  }, [fetchComplaints, fetchWorkload, fetchOperationalReference])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])
  useEffect(() => {
    const next = {}
    if (view !== 'queue') next.view = view
    if (queueFilter !== 'all') next.queue = queueFilter
    if (query.trim()) next.q = query.trim()
    if (priority !== 'all') next.priority = priority
    if (sortBy !== 'priority') next.sort = sortBy
    setSearchParams(next, { replace: true })
  }, [view, queueFilter, query, priority, sortBy, setSearchParams])

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
    }).sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 }
      if (sortBy === 'priority') return (order[a.priority] ?? 9) - (order[b.priority] ?? 9) || new Date(a.submitted_at || a.created_at) - new Date(b.submitted_at || b.created_at)
      if (sortBy === 'oldest') return new Date(a.submitted_at || a.created_at) - new Date(b.submitted_at || b.created_at)
      if (sortBy === 'newest') return new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at)
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
    })
  }, [activeComplaints, priority, query, queueFilter, sortBy])

  const workloadMap = useMemo(() => Object.fromEntries(workload.map(item => [item.id, item])), [workload])
  const reassignmentReasons = reasonCodes.filter(item => item.action_type === 'reassignment')
  const rankedStaff = useMemo(() => [...staff].sort((a, b) => {
    const availabilityRank = value => value === 'available' ? 0 : value === 'busy' ? 1 : 2
    return availabilityRank(a.availability_status) - availabilityRank(b.availability_status)
      || (workloadMap[a.id]?.active_tasks || 0) - (workloadMap[b.id]?.active_tasks || 0)
      || a.full_name.localeCompare(b.full_name)
  }), [staff, workloadMap])

  const applySavedView = view => { setView(view.view || 'queue'); setQueueFilter(view.queue || 'all'); setQuery(view.q || ''); setPriority(view.priority || 'all'); setSortBy(view.sort || 'priority') }
  const toggleSelected = id => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  const runBulk = async () => {
    if (!selected.length) return
    setBusy(true); setNotice('')
    try {
      let result
      if (bulkChoice === 'assign') {
        if (!bulkStaffId) throw new Error('Choose Maintenance Personnel for the selected complaints. Crew assignment can be completed individually when needed.')
        result = await useComplaintStore.getState().bulkAssign(selected, bulkStaffId, bulkReason || '')
      } else if (bulkChoice === 'priority') {
        if (bulkReason.trim().length < 3) throw new Error('Enter a reason for the priority change.')
        result = await bulkAction(selected, 'priority', { priority: bulkPriority, reason: bulkReason })
      } else result = await bulkAction(selected, 'watch')
      const rows = result?.results || []
      const failed = rows.filter(row => !row.ok)
      const succeeded = rows.filter(row => row.ok)
      setSelected(failed.map(row => row.id))
      if (!failed.length) setBulkReason('')
      await Promise.all([fetchComplaints(), fetchWorkload()])
      setNotice(failed.length ? `${succeeded.length} updated; ${failed.length} skipped. ${failed[0]?.error || ''}` : `${succeeded.length || selected.length} complaint${(succeeded.length || selected.length) === 1 ? '' : 's'} updated.`)
    } catch (err) { setNotice(err.message) } finally { setBusy(false) }
  }

  const openAssign = complaint => {
    setAssigning(complaint)
    setForm({ crewId: complaint.assigned_crew_id || '', staffId: complaint.assigned_to || '', reasonCode: '', notes: complaint.task_notes || '' })
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
      await assignComplaint(assigning.id, form.staffId, form.notes.trim(), form.crewId, form.reasonCode)
      await Promise.all([fetchComplaints(), fetchWorkload()])
      const successMessage = assigning.assigned_to ? 'Complaint reassigned.' : 'Complaint assigned to Maintenance Personnel.'
      setNotice(successMessage)
      pushToast(successMessage, 'success')
      setAssigning(null)
    } catch (assignError) {
      setNotice(assignError.message)
      pushToast(assignError.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !complaints.length) return <PageLoader label="Loading WDLCD dispatch queue…" />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-5 py-6 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gold-400">Engineering, Construction and Maintenance Department (ECMD)</p><p className="mt-1 text-xs font-bold text-navy-300">Water Distribution and Leakage Control Division (WDLCD)</p>
        <div className="mt-1 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-2xl font-black text-white sm:text-3xl">Complaint dispatch</h1>
            <p className="mt-1 max-w-3xl text-sm text-navy-300">Assign field work, follow active repairs, and verify completed work before resolving a complaint.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('queue')} className={`rounded-lg px-4 py-2 text-xs font-black ${view === 'queue' ? 'bg-gold-400 text-navy-950' : 'border border-white/30 text-white'}`}>Queue</button>
            <button onClick={() => setView('map')} className={`rounded-lg px-4 py-2 text-xs font-black ${view === 'map' ? 'bg-gold-400 text-navy-950' : 'border border-white/30 text-white'}`}>Map</button>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {notice && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">{notice}</div>}

      <SavedViewsBar moduleKey="ecmd_dispatch" filters={{ view, queue: queueFilter, q: query, priority, sort: sortBy }} onApply={applySavedView} />

      <section className="card overflow-hidden rounded-xl">
        <div className="border-b border-gray-100 px-4 pt-4 sm:px-5">
          <div className="flex flex-wrap gap-2 pb-3">
            {QUEUE_FILTERS.map(filter => (
              <button
                key={filter.key}
                onClick={() => setQueueFilter(filter.key)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-black transition ${queueFilter === filter.key ? 'border-navy-700 bg-navy-700 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-navy-200 hover:text-navy-800'}`}
              >
                {filter.label}
                <span className={`rounded-full px-1.5 py-0.5 text-xs ${queueFilter === filter.key ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500'}`}>{counts[filter.key] || 0}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="qol-filter-bar grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_160px_180px_auto] sm:p-5">
          <label className="block min-w-0 text-xs font-bold text-gray-600">
            Search
            <div className="mt-1.5"><SearchField value={query} onChange={e => setQuery(e.target.value)} onClear={() => setQuery('')} placeholder="Reference, complaint type, address, or customer" /></div>
          </label>
          <label className="block text-xs font-bold text-gray-600">
            Priority
            <select value={priority} onChange={e => setPriority(e.target.value)} className="input-field mt-1.5 rounded-lg"><option value="all">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
          </label>
          <label className="block text-xs font-bold text-gray-600">
            Sort
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="input-field mt-1.5 rounded-lg"><option value="priority">Priority, then oldest</option><option value="updated">Recently updated</option><option value="oldest">Oldest submitted</option><option value="newest">Newest submitted</option></select>
          </label>
          <div className="flex items-end gap-2"><button onClick={load} className="btn-secondary flex-1 rounded-lg"><AppIcon name="refresh" className="mr-1 inline h-4 w-4"/>Refresh</button>{(query || priority !== 'all' || sortBy !== 'priority' || queueFilter !== 'all') && <button type="button" onClick={() => { setQuery(''); setPriority('all'); setSortBy('priority'); setQueueFilter('all') }} className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs font-black text-gray-500 hover:bg-gray-50">Clear</button>}</div>
        </div>
      </section>

      <BulkActionBar count={selected.length} onClear={() => setSelected([])}>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-gray-600">Action</span>
          <select value={bulkChoice} onChange={e => setBulkChoice(e.target.value)} className="input-field rounded-lg text-sm">
            <option value="assign">Assign personnel</option>
            <option value="priority">Change priority</option>
            <option value="watch">Add to watchlist</option>
          </select>
        </label>
        {bulkChoice === 'assign' ? (
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-gray-600">Maintenance Personnel</span>
            <select value={bulkStaffId} onChange={e => setBulkStaffId(e.target.value)} className="input-field rounded-lg text-sm">
              <option value="">Choose personnel</option>
              {rankedStaff.map(person => <option key={person.id} value={person.id}>{person.full_name} · {availabilityLabel(person.availability_status)}</option>)}
            </select>
          </label>
        ) : null}
        {bulkChoice === 'priority' ? (
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-gray-600">New priority</span>
            <select value={bulkPriority} onChange={e => setBulkPriority(e.target.value)} className="input-field rounded-lg text-sm">
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label>
        ) : null}
        {bulkChoice !== 'watch' ? (
          <label className="block sm:col-span-2 xl:col-span-1">
            <span className="mb-1.5 block text-xs font-bold text-gray-600">{bulkChoice === 'priority' ? 'Reason' : 'Dispatch note'}</span>
            <input value={bulkReason} onChange={e => setBulkReason(e.target.value)} className="input-field rounded-lg text-sm" placeholder={bulkChoice === 'priority' ? 'Required reason' : 'Optional note for the assigned personnel'} />
          </label>
        ) : null}
        <button type="button" disabled={busy} onClick={runBulk} className="btn-primary rounded-lg disabled:opacity-50">{busy ? 'Applying…' : 'Apply action'}</button>
      </BulkActionBar>

      {view === 'map' ? (
        <section className="card rounded-xl p-4">
          <div className="mb-3"><h2 className="font-display font-black text-navy-900">Active complaint map</h2><p className="text-xs text-gray-500">Pins show active complaints with saved map locations. Select a pin to open the complaint.</p></div>
          <ComplaintOperationsMap complaints={filtered} onOpen={item => navigate(`/complaints/${item.id}`)} />
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          <section className="card min-w-0 overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div><h2 className="font-display font-black text-navy-900">Dispatch queue</h2><p className="mt-0.5 text-xs text-gray-500">{filtered.length} complaint{filtered.length === 1 ? '' : 's'} shown</p></div>
            </div>

            <div className="hidden min-w-0 overflow-hidden lg:block">
              <table className="w-full table-fixed text-left">
                <thead className="border-b border-gray-100 bg-gray-50/80 text-xs font-black uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="w-[34%] px-4 py-3">Complaint</th>
                    <th className="w-[10%] px-3 py-3">Priority</th>
                    <th className="w-[16%] px-3 py-3">Status</th>
                    <th className="w-[18%] px-3 py-3">Assignment</th>
                    <th className="w-[22%] px-3 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(item => (
                    <tr key={item.id} onClick={() => navigate(`/complaints/${item.id}`)} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') navigate(`/complaints/${item.id}`) }} className="qol-clickable-row group hover:bg-navy-50/30">
                      <td className="px-4 py-4 align-top">
                        <div className="mb-2 flex items-center gap-2"><input type="checkbox" checked={selected.includes(item.id)} onClick={event => event.stopPropagation()} onChange={() => toggleSelected(item.id)} className="h-4 w-4 accent-navy-800"/><span className="text-[11px] font-black uppercase text-gray-500">Select</span></div>
                        <button onClick={() => navigate(`/complaints/${item.id}`)} className="min-w-0 text-left">
                          <p className="break-all font-mono text-xs font-bold text-gray-500">{item.reference_number}</p>
                          <p className="mt-1 break-words text-sm font-black text-navy-900 group-hover:text-brand-700">{item.complaint_type}</p>
                          <p className="mt-1 line-clamp-2 break-words text-xs font-semibold text-gray-600">{item.address || 'No address'}</p>
                          <p className="mt-1 break-words text-[11px] text-gray-500">{item.customer_name || 'Customer'}</p>
                          {item.similar_count ? <p className="mt-1 text-xs font-bold text-amber-700">{item.similar_count} nearby/related report{item.similar_count === 1 ? '' : 's'}</p> : null}
                        </button>
                      </td>
                      <td className="px-3 py-4 align-top"><PriorityBadge priority={item.priority}/></td>
                      <td className="px-3 py-4 align-top"><StatusBadge status={item.status}/></td>
                      <td className="px-3 py-4 align-top">
                        <p className="text-xs font-bold text-gray-700">{item.assigned_name || 'Unassigned'}</p>
                        {item.assigned_name && <p className="mt-1 text-xs text-gray-500">Maintenance Personnel</p>}
                      </td>
                      <td className="px-3 py-4 align-top text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button onClick={event => { event.stopPropagation(); navigate(`/complaints/${item.id}`) }} className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] font-black text-gray-700 hover:border-navy-200">View</button>
                          {item.status === 'awaiting_verification' ? (
                            <button onClick={event => { event.stopPropagation(); navigate(`/complaints/${item.id}`) }} className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-violet-600 px-3 py-2 text-[11px] font-black text-white">Verify</button>
                          ) : (
                            <button onClick={event => { event.stopPropagation(); openAssign(item) }} className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-navy-800 px-3 py-2 text-[11px] font-black text-white hover:bg-navy-900">{item.assigned_to ? 'Reassign' : 'Assign'}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && <tr><td colSpan="5" className="px-5 py-14 text-center"><p className="text-sm font-bold text-gray-500">No complaints in this queue.</p><p className="mt-1 text-xs text-gray-500">Choose another status or clear the filters.</p></td></tr>}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-gray-100 lg:hidden">
              {filtered.map(item => (
                <article key={item.id} className="p-4">
                  <div className="mb-2 flex items-center gap-2"><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelected(item.id)} className="h-4 w-4 accent-navy-800"/><span className="text-[11px] font-black uppercase text-gray-500">Select complaint</span></div>
                  <button onClick={() => navigate(`/complaints/${item.id}`)} className="w-full text-left">
                    <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-gray-500">{item.reference_number}</p><p className="mt-1 font-black text-navy-900">{item.complaint_type}</p></div><PriorityBadge priority={item.priority}/></div>
                    <p className="mt-2 text-xs font-semibold text-gray-600">{item.address || 'No address'}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge status={item.status}/><span className="text-xs text-gray-500">{item.assigned_name || 'Unassigned'}</span></div>
                  </button>
                  <div className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2"><button onClick={() => navigate(`/complaints/${item.id}`)} className="btn-secondary w-full rounded-lg text-xs">View details</button>{item.status === 'awaiting_verification' ? <button onClick={() => navigate(`/complaints/${item.id}`)} className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-lg bg-violet-600 px-3 py-2 text-xs font-black text-white">Verify</button> : <button onClick={() => openAssign(item)} className="btn-primary w-full rounded-lg text-xs">{item.assigned_to ? 'Reassign' : 'Assign'}</button>}</div>
                </article>
              ))}
              {!filtered.length && <div className="px-5 py-12 text-center"><p className="text-sm font-bold text-gray-500">No complaints in this queue.</p></div>}
            </div>
          </section>

          <aside className="card h-fit rounded-xl p-4 xl:sticky xl:top-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-display font-black text-navy-900">Maintenance availability</h2><p className="mt-1 text-xs text-gray-500">Check who is available and how many active assignments each person has.</p></div><span className="rounded-lg bg-navy-50 px-2 py-1 text-xs font-black text-navy-700">{rankedStaff.length} staff</span></div>
            <div className="mt-4 divide-y divide-gray-100">
              {rankedStaff.map((person, index) => {
                const current = workloadMap[person.id] || person
                return <div key={person.id} className="py-3 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-1.5"><p className="truncate text-xs font-black text-gray-900">{person.full_name}</p>{index === 0 && person.availability_status === 'available' && <span title="Recommended" className="text-gold-500">★</span>}</div><span className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[11px] font-black uppercase ${availabilityTone(person.availability_status)}`}>{availabilityLabel(person.availability_status)}</span></div><span className="shrink-0 text-xs font-black text-navy-800">{activeTaskLabel(current.active_tasks)}</span></div>{person.availability_note && <p className="mt-1.5 line-clamp-2 text-xs text-gray-500">{person.availability_note}</p>}</div>
              })}
              {!rankedStaff.length && <p className="py-6 text-center text-xs text-gray-500">No Maintenance Personnel are available in this list.</p>}
            </div>
          </aside>
        </div>
      )}

      <Dialog
        open={Boolean(assigning)}
        title={assigning?.assigned_to ? 'Reassign field work' : 'Assign field work'}
        description={assigning ? `${assigning.reference_number} · ${assigning.complaint_type}` : ''}
        onClose={() => !busy && setAssigning(null)}
        closeDisabled={busy}
      >
        {assigning ? (
          <form onSubmit={saveAssignment}>
            <div className="space-y-4">
              <div>
                <label htmlFor="dispatch-crew" className="mb-1.5 block text-xs font-bold text-gray-600">Maintenance Crew</label>
                <select id="dispatch-crew" value={form.crewId} onChange={event => { const crewId = event.target.value; const crew = crews.find(item => item.id === crewId); setForm(value => ({ ...value, crewId, staffId: crew?.team_leader_id || value.staffId })) }} className="input-field rounded-lg">
                  <option value="">Direct personnel assignment</option>
                  {crews.map(crew => <option key={crew.id} value={crew.id}>{crew.name}</option>)}
                </select>
                <p className="mt-1.5 text-xs text-gray-500">WDLCD normally assigns a Maintenance Crew. If no crew is selected, the complaint can still be assigned directly to Maintenance Personnel.</p>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor="dispatch-staff" className="block text-xs font-bold text-gray-600">Maintenance Personnel</label>
                  {rankedStaff[0]?.availability_status === 'available' ? <button type="button" onClick={() => setForm(value => ({ ...value, staffId: rankedStaff[0].id }))} className="text-xs font-black text-brand-700 hover:text-brand-900">Use suggested person</button> : null}
                </div>
                <select id="dispatch-staff" required value={form.staffId} onChange={event => setForm(value => ({ ...value, staffId: event.target.value }))} className="input-field rounded-lg">
                  <option value="">Choose personnel</option>
                  {rankedStaff.map((person, index) => <option key={person.id} value={person.id} disabled={['on_leave','off_duty'].includes(person.availability_status)}>{index === 0 && person.availability_status === 'available' ? 'Recommended · ' : ''}{person.full_name} · {availabilityLabel(person.availability_status)} · {activeTaskLabel(workloadMap[person.id]?.active_tasks)}</option>)}
                </select>
                {form.staffId ? <p className="mt-1.5 text-xs font-semibold text-gray-500">{rankedStaff.find(person => person.id === form.staffId)?.full_name || 'Selected personnel'} · {availabilityLabel(rankedStaff.find(person => person.id === form.staffId)?.availability_status)} · {activeTaskLabel(workloadMap[form.staffId]?.active_tasks)}</p> : null}
              </div>
              {assigning.assigned_to && form.staffId !== assigning.assigned_to ? (
                <div>
                  <label htmlFor="dispatch-reason" className="mb-1.5 block text-xs font-bold text-gray-600">Reason for reassignment <span aria-hidden="true">*</span></label>
                  <select id="dispatch-reason" required value={form.reasonCode} onChange={event => setForm(value => ({ ...value, reasonCode: event.target.value }))} className="input-field rounded-lg">
                    <option value="">Choose reason</option>
                    {reassignmentReasons.map(reason => <option key={reason.code} value={reason.code}>{reason.label}</option>)}
                  </select>
                </div>
              ) : null}
              <div>
                <label htmlFor="dispatch-notes" className="mb-1.5 block text-xs font-bold text-gray-600">Field instructions</label>
                <textarea id="dispatch-notes" rows={4} value={form.notes} onChange={event => setForm(value => ({ ...value, notes: event.target.value }))} className="input-field resize-none rounded-lg" placeholder="Optional instructions for the assigned personnel" />
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setAssigning(null)} disabled={busy} className="btn-secondary rounded-lg">Cancel</button>
              <button disabled={busy || !form.staffId} className="btn-primary rounded-lg disabled:opacity-50">{busy ? 'Saving…' : assigning.assigned_to ? 'Confirm reassignment' : 'Confirm assignment'}</button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </div>
  )
}
