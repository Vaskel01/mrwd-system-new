import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useComplaintStore } from '../../store/complaintStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { EmptyState, PageLoader, ErrorBanner } from '../../components/ui/Feedback'
import PageHeader from '../../components/ui/PageHeader'
import Pagination from '../../components/ui/Pagination'
import AppIcon from '../../components/ui/AppIcon'
import RefreshNotice from '../../components/ui/RefreshNotice'
import SearchField from '../../components/ui/SearchField'
import SavedViewsBar from '../../components/ui/SavedViewsBar'
import { useComplaintListRefresh } from '../../hooks/useComplaintRefresh'
import { PRIORITY_LABELS, STATUS_LABELS } from '../../config/terminology'
import { readWorkspacePreferences, writeWorkspacePreferences } from '../../lib/workspacePreferences'

function formatAssignedDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }
const PRIORITY_STRIPE = {
  high: 'border-l-red-500',
  medium: 'border-l-amber-400',
  low: 'border-l-green-400',
}

function matchesSearch(task, query) {
  if (!query) return true
  return [
    task.reference_number, task.complaint_type, task.description, task.address,
    task.customer_name, task.status, task.task_notes, task.rejection_reason,
  ].some(value => String(value || '').toLowerCase().includes(query))
}

export default function MaintenanceTasksPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialPreferences = useMemo(() => readWorkspacePreferences('maintenance_tasks'), [])
  const user = useAuthStore(s => s.user)
  const complaints = useComplaintStore(s => s.complaints)
  const loading = useComplaintStore(s => s.loading)
  const error = useComplaintStore(s => s.error)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)

  const [view, setView] = useState(() => searchParams.get('view') || initialPreferences.view || 'active')
  const [search, setSearch] = useState(() => searchParams.get('q') || initialPreferences.q || '')
  const [priorityFilter, setPriorityFilter] = useState(() => searchParams.get('priority') || initialPreferences.priority || 'all')
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || initialPreferences.status || 'all')
  const [sortBy, setSortBy] = useState(() => searchParams.get('sort') || initialPreferences.sort || 'priority')
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page')) || 1))
  const pageSize = 10

  useEffect(() => { fetchComplaints() }, [fetchComplaints])
  useEffect(() => {
    const next = {}
    if (view !== 'active') next.view = view
    if (search.trim()) next.q = search.trim()
    if (priorityFilter !== 'all') next.priority = priorityFilter
    if (statusFilter !== 'all') next.status = statusFilter
    if (sortBy !== 'priority') next.sort = sortBy
    if (page > 1) next.page = String(page)
    setSearchParams(next, { replace: true })
  }, [view, search, priorityFilter, statusFilter, sortBy, page, setSearchParams])

  useEffect(() => {
    writeWorkspacePreferences('maintenance_tasks', { view, q: search, priority: priorityFilter, status: statusFilter, sort: sortBy })
  }, [view, search, priorityFilter, statusFilter, sortBy])

  const { updatesAvailable, refreshNow } = useComplaintListRefresh(complaints, fetchComplaints)

  const myTasks = useMemo(() => complaints.filter(c => c.assigned_to === user?.id), [complaints, user?.id])
  const counts = useMemo(() => ({
    all: myTasks.length,
    active: myTasks.filter(t => ['assigned', 'en_route', 'in_progress', 'blocked'].includes(t.status)).length,
    completed: myTasks.filter(t => ['awaiting_verification', 'resolved', 'completed'].includes(t.status)).length,
    rejected: myTasks.filter(t => t.status === 'rejected').length,
  }), [myTasks])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return myTasks
      .filter(task => view === 'all' || (view === 'active' ? ['assigned', 'en_route', 'in_progress', 'blocked'].includes(task.status) : view === 'completed' ? ['awaiting_verification', 'resolved', 'completed'].includes(task.status) : task.status === view))
      .filter(task => priorityFilter === 'all' || task.priority === priorityFilter)
      .filter(task => statusFilter === 'all' ||
        (statusFilter === 'in_progress' ? ['en_route', 'in_progress'].includes(task.status) : task.status === statusFilter))
      .filter(task => matchesSearch(task, query))
      .sort((a, b) => {
        if (sortBy === 'priority') {
          return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
            || new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
        }
        if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at)
        if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
        if (sortBy === 'updated') return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
        if (sortBy === 'type') return a.complaint_type.localeCompare(b.complaint_type)
        return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
      })
  }, [myTasks, view, priorityFilter, statusFilter, search, sortBy])

  const effectivePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)))
  const paged = filtered.slice((effectivePage - 1) * pageSize, effectivePage * pageSize)

  const resetFilters = () => {
    setSearch('')
    setPriorityFilter('all')
    setStatusFilter('all')
    setSortBy('priority')
    setPage(1)
  }


  const completionRate = counts.active + counts.completed > 0
    ? Math.round(counts.completed / (counts.active + counts.completed) * 100)
    : 0

  if (loading && complaints.length === 0) return <PageLoader label="Loading your tasks…" />

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Maintenance Personnel"
        title="My tasks"
        description="Open assigned complaints, update field progress, and send completed work to WDLCD for verification."
        actions={<div className="text-left sm:text-right"><p className="font-display text-4xl font-black leading-none text-gold-400">{completionRate}%</p><p className="mt-1 text-xs font-bold text-navy-200">Completed field work</p></div>}
      />

      {error && <ErrorBanner message={error} onRetry={fetchComplaints} />}
      <RefreshNotice visible={updatesAvailable} onRefresh={refreshNow} label="Your assigned tasks have changed." />

      {myTasks.length > 0 && (
        <div className="qol-filter-bar card rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-2" aria-label="Task views">
            {[
              ['active', 'Active tasks', counts.active],
              ['completed', 'Completed field work', counts.completed],
              ['rejected', STATUS_LABELS.rejected, counts.rejected],
              ['all', 'All tasks', counts.all],
            ].map(([value, label, count]) => (
              <button key={value} type="button" aria-pressed={view === value} onClick={() => { setView(value); setPage(1) }} className={`filter-chip inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ${view === value ? 'border-navy-800 bg-navy-800 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
                {label}<span className={`rounded-full px-2 py-0.5 text-xs font-black ${view === value ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-600'}`}>{count}</span>
              </button>
            ))}
          </div>
          <SavedViewsBar
            moduleKey="maintenance_tasks"
            filters={{ view, q: search, priority: priorityFilter, status: statusFilter, sort: sortBy }}
            onApply={filters => {
              setView(filters.view || 'active')
              setSearch(filters.q || '')
              setPriorityFilter(filters.priority || 'all')
              setStatusFilter(filters.status || 'all')
              setSortBy(filters.sort || 'priority')
              setPage(1)
            }}
          />
          <div><p className="mb-1.5 text-xs font-bold text-gray-600">Search</p><SearchField value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} onClear={() => { setSearch(''); setPage(1) }} placeholder="Reference, customer, address, notes, or status" /></div>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <label className="block text-xs font-bold text-gray-600">Priority<select name="maintenancetaskspage-priority-filter-2" value={priorityFilter} onChange={event => { setPriorityFilter(event.target.value); setPage(1) }} className="input-field mt-1.5 rounded-lg text-sm">
              <option value="all">All priorities</option>
              {['high', 'medium', 'low'].map(priority => <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>)}
            </select></label>
            <label className="block text-xs font-bold text-gray-600">Status<select name="maintenancetaskspage-status-filter-3" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1) }} className="input-field mt-1.5 rounded-lg text-sm">
              <option value="all">All statuses</option>
              {['assigned', 'in_progress', 'awaiting_verification', 'resolved', 'blocked', 'rejected'].map(status => (
                <option key={status} value={status}>{STATUS_LABELS[status]}</option>
              ))}
            </select></label>
            <label className="block text-xs font-bold text-gray-600">Sort<select name="maintenancetaskspage-sort-by-4" value={sortBy} onChange={event => { setSortBy(event.target.value); setPage(1) }} className="input-field mt-1.5 rounded-lg text-sm">
              <option value="priority">Priority</option>
              <option value="updated">Recently updated</option>
              <option value="newest">Newest submitted</option>
              <option value="oldest">Oldest submitted</option>
              <option value="type">Complaint type A–Z</option>
            </select></label>
            <button onClick={resetFilters} className="btn-secondary filter-action rounded-lg text-sm">Clear filters</button>
          </div>
        </div>
      )}

      {myTasks.length === 0 ? (
        <EmptyState icon={<AppIcon name="tool" className="h-10 w-10" />} title="No tasks assigned" description="New field assignments will appear here when WDLCD assigns work to you." />
      ) : (
        <section className="card overflow-hidden rounded-xl" aria-label="Maintenance task workspace">
          <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
            <div><h2 className="font-display font-black text-navy-900">My work queue</h2><p className="mt-0.5 text-xs text-gray-500">Review each assignment at a glance, then open its workspace when you are ready to act.</p></div>
            <p className="text-xs font-bold text-gray-500">{filtered.length} {filtered.length === 1 ? 'task' : 'tasks'} in this view</p>
          </div>

          <div className="divide-y divide-gray-100">
            {paged.map(task => (
              <article key={task.id} className={`qol-clickable-row border-l-4 ${PRIORITY_STRIPE[task.priority]}`}>
                <div className="grid min-w-0 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,0.9fr)_minmax(180px,0.7fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-sm font-black text-gray-900">{task.complaint_type}</h3><PriorityBadge priority={task.priority} /></div>
                    <p className="mt-1 font-mono text-xs font-bold text-gray-500">{task.reference_number}</p>
                    <p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-gray-500">{task.description || 'No additional complaint description.'}</p>
                  </div>

                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold text-gray-800">{task.customer_name || 'Customer'}</p>
                    <p className="mt-1 flex min-w-0 items-start gap-1.5 text-xs leading-5 text-gray-500"><AppIcon name="location" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="break-words">{task.address || 'No address recorded'}</span></p>
                  </div>

                  <div className="min-w-0">
                    <StatusBadge status={task.status} />
                    <p className="mt-2 text-xs font-semibold text-gray-500">Assigned {formatAssignedDate(task.assigned_at || task.task_created_at)}</p>
                    {task.task_notes ? <p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-amber-800"><span className="font-black">Instructions: </span>{task.task_notes}</p> : null}
                  </div>

                  <button type="button" onClick={() => navigate(`/complaints/${task.id}`)} className="btn-primary w-full rounded-lg whitespace-nowrap lg:w-auto">
                    {['resolved', 'completed', 'awaiting_verification'].includes(task.status) ? 'Review task' : 'Open task'}
                  </button>
                </div>
              </article>
            ))}
            {!paged.length ? <div className="px-5 py-14 text-center"><p className="text-sm font-bold text-gray-600">No tasks match this view.</p><p className="mt-1 text-xs text-gray-500">Clear the filters or choose another saved view.</p></div> : null}
          </div>

          <div className="border-t border-gray-100 p-4"><Pagination page={effectivePage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} label="tasks" embedded /></div>
        </section>
      )}
    </div>
  )
}
