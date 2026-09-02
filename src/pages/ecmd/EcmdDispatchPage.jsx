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
import BulkActionPreviewDialog from '../../components/ui/BulkActionPreviewDialog'
import ComplaintFocusPanel from '../../components/ui/ComplaintFocusPanel'
import { readWorkspacePreferences, writeWorkspacePreferences } from '../../lib/workspacePreferences'
import { availabilityLabel, PRIORITY_LABELS, STATUS_LABELS } from '../../config/terminology'

const QUEUE_FILTERS = [
  { key: 'all', label: 'All active', test: () => true },
  { key: 'forwarded', label: 'Ready to assign', test: item => item.status === 'forwarded' && !item.assigned_to },
  { key: 'assigned', label: STATUS_LABELS.assigned, test: item => item.status === 'assigned' },
  { key: 'field_work', label: 'Field work', test: item => ['en_route', 'in_progress'].includes(item.status) },
  { key: 'blocked', label: STATUS_LABELS.blocked, test: item => item.status === 'blocked' },
  { key: 'verification', label: STATUS_LABELS.awaiting_verification, test: item => item.status === 'awaiting_verification' },
]
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
  const initialPreferences = useMemo(() => readWorkspacePreferences('ecmd_dispatch'), [])
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
  const [view, setView] = useState(() => searchParams.get('view') || initialPreferences.view || 'queue')
  const [queueFilter, setQueueFilter] = useState(() => searchParams.get('queue') || initialPreferences.queue || 'all')
  const [query, setQuery] = useState(() => searchParams.get('q') || initialPreferences.q || '')
  const [priority, setPriority] = useState(() => searchParams.get('priority') || initialPreferences.priority || 'all')
  const [sortBy, setSortBy] = useState(() => searchParams.get('sort') || initialPreferences.sort || 'priority')
  const [focusedId, setFocusedId] = useState(() => searchParams.get('focus') || '')
  const [assigning, setAssigning] = useState(null)
  const [form, setForm] = useState({ crewId: '', staffId: '', reasonCode: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [bulkPreviewOpen, setBulkPreviewOpen] = useState(false)

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
    if (focusedId) next.focus = focusedId
    setSearchParams(next, { replace: true })
  }, [view, queueFilter, query, priority, sortBy, focusedId, setSearchParams])

  useEffect(() => {
    writeWorkspacePreferences('ecmd_dispatch', { view, queue: queueFilter, q: query, priority, sort: sortBy })
  }, [view, queueFilter, query, priority, sortBy])

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

  const applySavedView = savedView => { setView(savedView.view || 'queue'); setQueueFilter(savedView.queue || 'all'); setQuery(savedView.q || ''); setPriority(savedView.priority || 'all'); setSortBy(savedView.sort || 'priority'); setFocusedId('') }
  const toggleSelected = id => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  const previewBulk = () => {
    if (!selected.length) return
    if (bulkChoice === 'assign' && !bulkStaffId) {
      setNotice('Choose Maintenance Personnel for the selected complaints. Crew assignment can be completed individually when needed.')
      return
    }
    if (bulkChoice === 'priority' && bulkReason.trim().length < 3) {
      setNotice('Enter a reason for the priority change.')
      return
    }
    setNotice('')
    setBulkPreviewOpen(true)
  }
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
      setBulkPreviewOpen(false)
    } catch (err) { setNotice(err.message); setBulkPreviewOpen(false) } finally { setBusy(false) }
  }

  const focusedComplaint = filtered.find(complaint => complaint.id === focusedId) || filtered[0] || null
  const selectedComplaints = complaints.filter(complaint => selected.includes(complaint.id))
  const allFilteredSelected = filtered.length > 0 && filtered.every(complaint => selected.includes(complaint.id))
  const selectedStaff = rankedStaff.find(person => person.id === bulkStaffId)
  const selectedStaffWorkload = selectedStaff ? workloadMap[selectedStaff.id]?.active_tasks || 0 : 0
  const bulkActionLabel = bulkChoice === 'assign'
    ? `Assign to ${selectedStaff?.full_name || 'Maintenance Personnel'}`
    : bulkChoice === 'priority'
      ? `Change priority to ${PRIORITY_LABELS[bulkPriority]}`
      : 'Add to watchlist'
  const bulkActionDescription = bulkChoice === 'assign'
    ? `${selected.length} complaint${selected.length === 1 ? '' : 's'} will be assigned directly to one Maintenance Personnel account.`
    : bulkChoice === 'priority'
      ? `Every selected complaint will use ${PRIORITY_LABELS[bulkPriority]} priority with the same recorded reason.`
      : 'The selected complaints will be added to your personal watchlist.'
  const bulkWarning = bulkChoice === 'assign'
    ? `${selectedStaff?.full_name || 'The selected person'} is ${availabilityLabel(selectedStaff?.availability_status).toLowerCase()} with ${activeTaskLabel(selectedStaffWorkload)}. Confirm that the combined workload is appropriate.`
    : bulkChoice === 'priority'
      ? 'Use one priority only when the same operational reason applies to every selected complaint.'
      : ''

  const toggleFilteredSelection = () => {
    const filteredIds = filtered.map(complaint => complaint.id)
    setSelected(current => allFilteredSelected
      ? current.filter(id => !filteredIds.includes(id))
      : [...new Set([...current, ...filteredIds])])
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
      <div className="page-band wave-header page-header">
        <p className="text-xs font-bold uppercase tracking-widest text-gold-400">Engineering, Construction and Maintenance Department (ECMD)</p><p className="mt-1 text-xs font-bold text-navy-300">Water Distribution and Leakage Control Division (WDLCD)</p>
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
                aria-pressed={queueFilter === filter.key}
                className={`filter-chip flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-black transition ${queueFilter === filter.key ? 'border-navy-700 bg-navy-700 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-navy-200 hover:text-navy-800'}`}
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
          <div className="flex items-end gap-2"><button onClick={load} className="btn-secondary filter-action flex-1 rounded-lg"><AppIcon name="refresh" className="mr-1 inline h-4 w-4"/>Refresh</button>{(query || priority !== 'all' || sortBy !== 'priority' || queueFilter !== 'all') && <button type="button" onClick={() => { setQuery(''); setPriority('all'); setSortBy('priority'); setQueueFilter('all') }} className="filter-action rounded-full border border-gray-200 bg-white px-3 py-2.5 text-xs font-black text-gray-500 hover:bg-gray-50">Clear</button>}</div>
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
        <button type="button" disabled={busy} onClick={previewBulk} className="btn-primary rounded-lg disabled:opacity-50">Review action</button>
      </BulkActionBar>

      {view === 'map' ? (
        <section className="card rounded-xl p-4">
          <div className="mb-3"><h2 className="font-display font-black text-navy-900">Active complaint map</h2><p className="text-xs text-gray-500">Pins show active complaints with saved map locations. Select a pin to open the complaint.</p></div>
          <ComplaintOperationsMap complaints={filtered} onOpen={item => navigate(`/complaints/${item.id}`)} />
        </section>
      ) : (
        <section className="card overflow-hidden rounded-xl" aria-label="WDLCD dispatch workspace">
          <div className="grid min-w-0 xl:grid-cols-[minmax(340px,0.86fr)_minmax(430px,1.14fr)]">
            <div className="min-w-0 border-b border-gray-100 xl:border-b-0 xl:border-r">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-5">
                <div><h2 className="font-display font-black text-navy-900">Dispatch queue</h2><p className="mt-0.5 text-xs text-gray-500">{filtered.length} complaint{filtered.length === 1 ? '' : 's'} shown · select one to work in place</p></div>
                <button type="button" onClick={toggleFilteredSelection} disabled={!filtered.length} className="btn-secondary rounded-lg px-3 py-2 text-xs disabled:opacity-50">{allFilteredSelected ? 'Clear filtered' : 'Select filtered'}</button>
              </div>

              <div className="focus-queue-list divide-y divide-gray-100">
                {filtered.map(item => (
                  <article key={item.id} className="focus-queue-row" data-active={focusedComplaint?.id === item.id}>
                    <div className="flex items-start gap-3 p-4">
                      <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelected(item.id)} aria-label={`Select ${item.reference_number}`} className="mt-1 h-4 w-4 shrink-0 accent-navy-800" />
                      <button type="button" onClick={() => setFocusedId(item.id)} className="min-w-0 flex-1 text-left" aria-current={focusedComplaint?.id === item.id ? 'true' : undefined}>
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0"><p className="break-words text-sm font-black text-gray-900">{item.complaint_type}</p><p className="mt-1 font-mono text-xs font-bold text-gray-500">{item.reference_number}</p></div>
                          <PriorityBadge priority={item.priority} />
                        </div>
                        <p className="mt-2 line-clamp-2 break-words text-xs font-semibold text-gray-600">{item.address || 'No address recorded'}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge status={item.status} /><span className="text-xs font-bold text-gray-500">{item.assigned_name || 'Unassigned'}</span></div>
                        {item.similar_count ? <p className="mt-2 text-xs font-bold text-amber-700">{item.similar_count} nearby or related complaint{item.similar_count === 1 ? '' : 's'}</p> : null}
                      </button>
                    </div>
                  </article>
                ))}
                {!filtered.length ? <div className="px-5 py-14 text-center"><p className="text-sm font-bold text-gray-600">No complaints in this queue.</p><p className="mt-1 text-xs text-gray-500">Choose another status or clear the filters.</p></div> : null}
              </div>
            </div>

            <ComplaintFocusPanel
              complaint={focusedComplaint}
              mode="ecmd"
              onOpen={complaint => navigate(`/complaints/${complaint.id}`)}
              primaryAction={focusedComplaint ? {
                label: focusedComplaint.status === 'awaiting_verification' ? 'Verify completion' : focusedComplaint.assigned_to ? 'Reassign field work' : 'Assign field work',
                onClick: () => focusedComplaint.status === 'awaiting_verification' ? navigate(`/complaints/${focusedComplaint.id}`) : openAssign(focusedComplaint),
              } : null}
              recommendation={rankedStaff.length ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-gray-500">Assignment guidance</p><p className="mt-1 text-sm font-black text-navy-900">Maintenance availability</p></div><span className="rounded-full bg-navy-100 px-2.5 py-1 text-xs font-black text-navy-700">{rankedStaff.length} staff</span></div>
                  <div className="mt-3 divide-y divide-gray-200">
                    {rankedStaff.slice(0, 3).map((person, index) => {
                      const current = workloadMap[person.id] || person
                      return <div key={person.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate text-xs font-black text-gray-900">{index === 0 && person.availability_status === 'available' ? '★ ' : ''}{person.full_name}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-black uppercase ${availabilityTone(person.availability_status)}`}>{availabilityLabel(person.availability_status)}</span></div><span className="shrink-0 text-xs font-black text-navy-800">{activeTaskLabel(current.active_tasks)}</span></div>
                    })}
                  </div>
                </div>
              ) : null}
            />
          </div>
        </section>
      )}

      <BulkActionPreviewDialog
        open={bulkPreviewOpen}
        title="Review WDLCD bulk action"
        actionLabel={bulkActionLabel}
        description={bulkActionDescription}
        complaints={selectedComplaints}
        warning={bulkWarning}
        loading={busy}
        onConfirm={runBulk}
        onCancel={() => !busy && setBulkPreviewOpen(false)}
      />

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
