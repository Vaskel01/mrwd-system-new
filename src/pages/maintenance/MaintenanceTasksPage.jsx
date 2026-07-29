import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useComplaintStore } from '../../store/complaintStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { PageLoader, ErrorBanner } from '../../components/ui/Feedback'
import Pagination from '../../components/ui/Pagination'
import AppIcon from '../../components/ui/AppIcon'
import RefreshNotice from '../../components/ui/RefreshNotice'
import { useComplaintListRefresh } from '../../hooks/useComplaintRefresh'

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

const TABLE_ACTION_CLASS = 'inline-flex w-24 items-center justify-center rounded-lg bg-navy-800 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-navy-900'
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
  const user = useAuthStore(s => s.user)
  const complaints = useComplaintStore(s => s.complaints)
  const loading = useComplaintStore(s => s.loading)
  const error = useComplaintStore(s => s.error)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)
  const acknowledgeTask = useComplaintStore(s => s.acknowledgeTask)
  const [acknowledgingId, setAcknowledgingId] = useState(null)
  const [notice, setNotice] = useState(null)

  const [view, setView] = useState(() => searchParams.get('view') || 'active')
  const [search, setSearch] = useState(() => searchParams.get('q') || '')
  const [priorityFilter, setPriorityFilter] = useState(() => searchParams.get('priority') || 'all')
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'all')
  const [sortBy, setSortBy] = useState(() => searchParams.get('sort') || 'priority')
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

  const { updatesAvailable, refreshNow } = useComplaintListRefresh(complaints, fetchComplaints)

  const myTasks = useMemo(() => complaints.filter(c => c.assigned_to === user?.id), [complaints, user?.id])
  const counts = useMemo(() => ({
    all: myTasks.length,
    active: myTasks.filter(t => ['assigned', 'en_route', 'in_progress', 'blocked'].includes(t.status)).length,
    completed: myTasks.filter(t => t.status === 'completed').length,
    rejected: myTasks.filter(t => t.status === 'rejected').length,
  }), [myTasks])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return myTasks
      .filter(task => view === 'all' || (view === 'active' ? ['assigned', 'en_route', 'in_progress', 'blocked'].includes(task.status) : task.status === view))
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

  const quickAcknowledge = async (event, task) => {
    event.stopPropagation()
    setAcknowledgingId(task.id)
    try {
      await acknowledgeTask(task.id)
      setNotice({ type: 'success', message: `${task.reference_number} acknowledged.` })
      window.setTimeout(() => setNotice(null), 3000)
    } catch (acknowledgeError) {
      setNotice({
        type: 'error',
        message: acknowledgeError?.message || 'The task could not be acknowledged. Please try again.',
      })
      window.setTimeout(() => setNotice(null), 5000)
    } finally {
      setAcknowledgingId(null)
    }
  }

  const renderAction = task => {
    const needsAcknowledgement = !task.acknowledged_at && ['assigned', 'en_route', 'in_progress'].includes(task.status)
    return (
      <div className="flex flex-col items-start gap-1.5">
        {needsAcknowledgement && (
          <button
            type="button"
            onClick={event => quickAcknowledge(event, task)}
            disabled={acknowledgingId === task.id}
            className="inline-flex w-28 items-center justify-center rounded-lg bg-gold-500 px-3 py-2 text-xs font-black text-navy-950 hover:bg-gold-400 disabled:opacity-50"
          >
            {acknowledgingId === task.id ? 'Saving…' : 'Acknowledge'}
          </button>
        )}
        <button
          onClick={event => {
            event.stopPropagation()
            navigate(`/complaints/${task.id}`)
          }}
          className={needsAcknowledgement ? 'text-xs font-bold text-navy-700 underline underline-offset-2' : TABLE_ACTION_CLASS}
        >
          {needsAcknowledgement ? 'Open details' : 'Open'}
        </button>
      </div>
    )
  }

  const completionRate = counts.active + counts.completed > 0
    ? Math.round(counts.completed / (counts.active + counts.completed) * 100)
    : 0

  if (loading && complaints.length === 0) return <PageLoader label="Loading your tasks..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-4 sm:px-6 py-5 sm:py-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em]">Maintenance Portal</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl mt-1">My Tasks</h1>
            <p className="text-navy-300 text-sm mt-1">Review assigned work, update progress, and submit completion evidence.</p>
          </div>
          <div className="text-right">
            <p className="font-display font-black text-5xl leading-none text-gold-400">{completionRate}%</p>
            <p className="text-navy-300 text-[11px] uppercase tracking-wider">completion rate</p>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchComplaints} />}
      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`fixed right-4 top-20 z-50 max-w-sm rounded-xl border-l-4 p-4 text-sm font-bold shadow-xl ${
            notice.type === 'error'
              ? 'border-red-500 bg-red-50 text-red-800'
              : 'border-green-500 bg-green-50 text-green-800'
          }`}
        >
          {notice.message}
        </div>
      )}
      <RefreshNotice visible={updatesAvailable} onRefresh={refreshNow} label="Your task list changed since this page was loaded." />

      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['active', 'Active', counts.active, 'text-brand-600'],
          ['completed', 'Completed', counts.completed, 'text-green-600'],
          ['rejected', 'Rejected', counts.rejected, 'text-red-600'],
          ['all', 'All Tasks', counts.all, 'text-navy-800'],
        ].map(([value, label, count, color]) => (
          <button key={value} onClick={() => { setView(value); setPage(1) }}
            aria-pressed={view === value}
            className={`card rounded-xl p-4 text-left transition-all ${view === value ? 'ring-2 ring-navy-700 border-navy-300' : 'hover:border-navy-200'}`}>
            <p className={`font-display font-black text-3xl ${color}`}>{count}</p>
            <p className="text-xs font-bold text-gray-500 mt-1">{label}</p>
          </button>
        ))}
      </div>

      {myTasks.length > 0 && (
        <div className="card rounded-xl p-4 space-y-3">
          <div className="relative">
            <AppIcon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input name="maintenancetaskspage-search-reference-complaint-customer-address-notes-or-status-1" aria-label="Search complaint reference, customer, address, notes or status..." value={search} onChange={event => { setSearch(event.target.value); setPage(1) }}
              placeholder="Search complaint reference, customer, address, notes or status..."
              className="input-field pl-9 rounded-lg" />
          </div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-2">
            <select name="maintenancetaskspage-priority-filter-2" aria-label="Priority Filter" value={priorityFilter} onChange={event => { setPriorityFilter(event.target.value); setPage(1) }} className="input-field rounded-lg text-sm">
              <option value="all">Any Priority</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
            <select name="maintenancetaskspage-status-filter-3" aria-label="Status Filter" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1) }} className="input-field rounded-lg text-sm">
              <option value="all">Any Status</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="blocked">Needs Attention</option>
              <option value="rejected">Rejected</option>
            </select>
            <select name="maintenancetaskspage-sort-by-4" aria-label="Sort By" value={sortBy} onChange={event => { setSortBy(event.target.value); setPage(1) }} className="input-field rounded-lg text-sm">
              <option value="priority">Priority</option>
              <option value="updated">Recently Updated</option>
              <option value="newest">Newest Filed</option>
              <option value="oldest">Oldest Filed</option>
              <option value="type">Type A–Z</option>
            </select>
            <button onClick={resetFilters} className="btn-secondary rounded-lg text-sm">Reset Filters</button>
          </div>
        </div>
      )}

      {myTasks.length === 0 ? (
        <div className="card rounded-xl p-16 text-center">
          <AppIcon name="tool" className="mx-auto mb-4 h-12 w-12 text-navy-500" />
          <h2 className="font-display font-bold text-navy-800 text-xl">No tasks assigned yet</h2>
          <p className="text-sm text-gray-400 mt-2">New assignments will appear here automatically.</p>
        </div>
      ) : (
        <>
          <div className="hidden xl:block card rounded-xl overflow-x-auto p-2">
            <table className="w-full min-w-[780px] table-fixed text-sm">
              <colgroup>
                <col className="w-[33%]" />
                <col className="w-[24%]" />
                <col className="w-[17%]" />
                <col className="w-[14%]" />
                <col className="w-[124px]" />
              </colgroup>
              <thead>
                <tr className="border-b-2 border-gray-200 bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Task</th>
                  <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Customer & Location</th>
                  <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Progress</th>
                  <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Assignment</th>
                  <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="p-12 text-center text-gray-400">No tasks match your search and filters.</td></tr>
                ) : paged.map(task => (
                  <tr key={task.id}
                    className={`hover:bg-gray-50 border-l-4 ${PRIORITY_STRIPE[task.priority]}`}>
                    <td className="px-4 py-3 align-top">
                      <p className="font-bold text-gray-900">{task.complaint_type}</p>
                      <p className="mt-1 font-mono text-[10px] font-bold text-gray-500">{task.reference_number}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-400">{task.description}</p>
                      {task.task_notes && <p className="mt-2 line-clamp-2 text-xs text-amber-700"><b>Instructions:</b> {task.task_notes}</p>}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="truncate text-sm font-semibold text-gray-700">{task.customer_name}</p>
                      <p className="mt-1 flex min-w-0 items-start gap-1 text-xs text-gray-500">
                        <AppIcon name="location" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="line-clamp-2">{task.address}</span>
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col items-start gap-2">
                        <PriorityBadge priority={task.priority} />
                        <StatusBadge status={task.status} />
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="whitespace-nowrap text-xs font-semibold text-gray-600">{formatAssignedDate(task.assigned_at || task.task_created_at)}</p>
                      {!task.acknowledged_at && ['assigned','en_route','in_progress'].includes(task.status) && <p className="mt-2 text-[10px] font-bold text-brand-700">Needs acknowledgement</p>}
                      {task.status === 'blocked' && <p className="mt-2 text-[10px] font-bold text-orange-700">Attention requested</p>}
                    </td>
                    <td className="px-4 py-3 align-top">{renderAction(task)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="xl:hidden space-y-3">
            {filtered.length === 0 ? (
              <div className="card rounded-xl p-10 text-center text-gray-400">No tasks match your search and filters.</div>
            ) : paged.map(task => (
              <div key={task.id} className={`card rounded-xl overflow-hidden border-l-4 ${PRIORITY_STRIPE[task.priority]}`}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900">{task.complaint_type}</p>
                      <p className="text-[10px] text-gray-500 font-mono font-bold mt-1">{task.reference_number}</p>
                      <p className="text-xs text-gray-500 mt-1">{task.customer_name} · Assigned {formatAssignedDate(task.assigned_at || task.task_created_at)}</p>
                      <p className="mt-1 inline-flex max-w-full items-center gap-1 text-xs text-gray-400"><AppIcon name="location" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{task.address}</span></p>
                    </div>
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap"><PriorityBadge priority={task.priority} /></div>
                  {task.task_notes && <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900"><b>Instructions:</b> {task.task_notes}</div>}
                  <div className="mt-3 pt-3 border-t border-gray-100">{renderAction(task)}</div>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={effectivePage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} label="tasks" />
        </>
      )}
    </div>
  )
}
