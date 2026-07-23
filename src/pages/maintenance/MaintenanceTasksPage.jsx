import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useComplaintStore } from '../../store/complaintStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { PageLoader, ErrorBanner } from '../../components/ui/Feedback'
import Pagination from '../../components/ui/Pagination'

function timeAgo(iso) {
  const value = iso ? new Date(iso).getTime() : Date.now()
  const diff = Date.now() - value
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
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
    task.id, task.complaint_type, task.description, task.address,
    task.customer_name, task.status, task.task_notes, task.rejection_reason,
  ].some(value => String(value || '').toLowerCase().includes(query))
}

export default function MaintenanceTasksPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const complaints = useComplaintStore(s => s.complaints)
  const loading = useComplaintStore(s => s.loading)
  const error = useComplaintStore(s => s.error)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)

  const [view, setView] = useState('active')
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('priority')
  const [page, setPage] = useState(1)
  const pageSize = 10

  useEffect(() => { fetchComplaints() }, [fetchComplaints])

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
      .filter(task => statusFilter === 'all' || task.status === statusFilter)
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

  useEffect(() => { setPage(1) }, [view, search, priorityFilter, statusFilter, sortBy])
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const resetFilters = () => {
    setSearch('')
    setPriorityFilter('all')
    setStatusFilter('all')
    setSortBy('priority')
  }

  const renderAction = task => (
    <button
      onClick={event => {
        event.stopPropagation()
        navigate(`/complaints/${task.id}`)
      }}
      className={TABLE_ACTION_CLASS}
    >
      Open
    </button>
  )

  const completionRate = counts.active + counts.completed > 0
    ? Math.round(counts.completed / (counts.active + counts.completed) * 100)
    : 0

  if (loading && complaints.length === 0) return <PageLoader label="Loading your tasks..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-6 py-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em]">Maintenance Portal</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl mt-1">My Tasks</h1>
            <p className="text-navy-300 text-sm mt-1">Open a task to view directions, update its status, and add work notes.</p>
          </div>
          <div className="text-right">
            <p className="font-display font-black text-5xl leading-none text-gold-400">{completionRate}%</p>
            <p className="text-navy-300 text-[11px] uppercase tracking-wider">completion rate</p>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchComplaints} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['active', 'Active', counts.active, 'text-brand-600'],
          ['completed', 'Completed', counts.completed, 'text-green-600'],
          ['rejected', 'Rejected', counts.rejected, 'text-red-600'],
          ['all', 'All Tasks', counts.all, 'text-navy-800'],
        ].map(([value, label, count, color]) => (
          <button key={value} onClick={() => setView(value)}
            className={`card rounded-xl p-4 text-left transition-all ${view === value ? 'ring-2 ring-navy-700 border-navy-300' : 'hover:border-navy-200'}`}>
            <p className={`font-display font-black text-3xl ${color}`}>{count}</p>
            <p className="text-xs font-bold text-gray-500 mt-1">{label}</p>
          </button>
        ))}
      </div>

      {myTasks.length > 0 && (
        <div className="card rounded-xl p-4 space-y-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={search} onChange={event => setSearch(event.target.value)}
              placeholder="Search task ID, complaint, customer, address, notes or status..."
              className="input-field pl-9 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)} className="input-field rounded-lg text-sm">
              <option value="all">Any Priority</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="input-field rounded-lg text-sm">
              <option value="all">Any Status</option>
              <option value="assigned">Assigned</option>
              <option value="en_route">En Route</option>
              <option value="in_progress">On Site</option>
              <option value="completed">Completed</option>
              <option value="blocked">Needs Attention</option>
              <option value="rejected">Rejected</option>
            </select>
            <select value={sortBy} onChange={event => setSortBy(event.target.value)} className="input-field rounded-lg text-sm">
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
          <div className="text-6xl mb-4">🔧</div>
          <h2 className="font-display font-bold text-navy-800 text-xl">No tasks assigned yet</h2>
          <p className="text-sm text-gray-400 mt-2">New assignments will appear here automatically.</p>
        </div>
      ) : (
        <>
          <div className="hidden lg:block card rounded-xl overflow-hidden p-2">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[36%]" />
                <col className="w-[14%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[17%]" />
                <col className="w-[11%]" />
                <col className="w-[136px]" />
              </colgroup>
              <thead>
                <tr className="border-b-2 border-gray-200 bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Task</th>
                  <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Location</th>
                  <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Updated</th>
                  <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="p-12 text-center text-gray-400">No tasks match your search and filters.</td></tr>
                ) : paged.map(task => (
                  <tr key={task.id} onClick={() => navigate(`/complaints/${task.id}`)}
                    className={`cursor-pointer hover:bg-gray-50 border-l-4 ${PRIORITY_STRIPE[task.priority]}`}>
                    <td className="px-4 py-3 align-top">
                      <p className="font-bold text-gray-900 truncate">{task.complaint_type}</p>
                      <p className="text-xs text-gray-400 truncate">{task.description}</p>
                      <p className="text-[10px] text-gray-300 font-mono mt-1 truncate">{task.id}</p>
                      {task.task_notes && <p className="text-xs text-amber-700 mt-1 truncate"><b>Instructions:</b> {task.task_notes}</p>}
                      {!task.acknowledged_at && ['assigned','en_route','in_progress'].includes(task.status) && <p className="text-[10px] font-bold text-brand-700 mt-1">Needs acknowledgement</p>}
                      {task.status === 'blocked' && <p className="text-xs font-bold text-orange-700 mt-1 truncate">Admin attention requested</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-700 align-top truncate">{task.customer_name}</td>
                    <td className="px-4 py-3 align-top"><PriorityBadge priority={task.priority} /></td>
                    <td className="px-4 py-3 align-top"><StatusBadge status={task.status} /></td>
                    <td className="px-4 py-3 text-gray-500 align-top truncate">{task.address}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs align-top whitespace-nowrap">{timeAgo(task.updated_at || task.created_at)}</td>
                    <td className="px-4 py-3 pr-6 align-top">{renderAction(task)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden space-y-3">
            {filtered.length === 0 ? (
              <div className="card rounded-xl p-10 text-center text-gray-400">No tasks match your search and filters.</div>
            ) : paged.map(task => (
              <div key={task.id} className={`card rounded-xl overflow-hidden border-l-4 ${PRIORITY_STRIPE[task.priority]}`}>
                <div onClick={() => navigate(`/complaints/${task.id}`)} className="p-4 cursor-pointer">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900">{task.complaint_type}</p>
                      <p className="text-xs text-gray-500 mt-1">{task.customer_name} · {timeAgo(task.updated_at || task.created_at)}</p>
                      <p className="text-xs text-gray-400 truncate mt-1">📍 {task.address}</p>
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
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} label="tasks" />
        </>
      )}
    </div>
  )
}
