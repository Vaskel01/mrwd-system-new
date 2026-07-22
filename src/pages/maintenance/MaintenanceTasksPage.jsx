import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useComplaintStore } from '../../store/complaintStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { PageLoader, ErrorBanner, Spinner } from '../../components/ui/Feedback'
import InlineMap from '../../components/ui/InlineMap'
import Timeline from '../../components/ui/Timeline'

function timeAgo(iso) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const STATUS_STEPS = ['assigned', 'en_route', 'in_progress', 'completed']
const STATUS_LABELS = { assigned: 'Assigned', en_route: 'En Route', in_progress: 'On Site', completed: 'Done' }
const PRIORITY_BORDER = { high: '#fecaca', medium: '#fde68a', low: '#bbf7d0' }
const PRIORITY_STRIPE = { high: '#dc2626', medium: '#d97706', low: '#16a34a' }

function TaskCard({ task, onStatus, onView }) {
  const postComment = useComplaintStore(s => s.postComment)
  const [mapOpen, setMapOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [comment, setComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [commentError, setCommentError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const stepIdx = STATUS_STEPS.indexOf(task.status)

  const submitComment = async () => {
    if (!comment.trim()) return
    setPosting(true); setCommentError('')
    try {
      await postComment(task.id, comment.trim())
      setComment(''); setRefreshKey(k => k + 1)
    } catch (err) { setCommentError(err.message) }
    finally { setPosting(false) }
  }

  return (
    <div className="card rounded-xl overflow-hidden" style={{ borderColor: PRIORITY_BORDER[task.priority] }}>
      <div className="h-1" style={{ background: PRIORITY_STRIPE[task.priority] }} />
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap"><h2 className="font-display font-bold text-navy-900">{task.complaint_type}</h2><PriorityBadge priority={task.priority}/><StatusBadge status={task.status}/></div>
            <p className="text-xs text-gray-400 mt-1">👤 {task.customer_name} · 🕒 {timeAgo(task.created_at)}</p>
          </div>
          <p className="font-display font-black text-3xl text-navy-900">{task.priority_score}</p>
        </div>

        <p className="text-sm text-gray-600 mt-3 leading-relaxed">{task.description}</p>
        {task.task_notes && <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200"><p className="text-[10px] font-black text-amber-700 uppercase">Admin Instructions</p><p className="text-sm text-amber-900 mt-1">{task.task_notes}</p></div>}

        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-400">📍 {task.address}</p>
          {task.gps && <button onClick={() => setMapOpen(v => !v)} className="text-xs font-bold text-brand-700">{mapOpen ? 'Hide Map' : 'View Map'}</button>}
        </div>
        {mapOpen && task.gps && <div className="mt-3"><InlineMap lat={task.gps.lat} lng={task.gps.lng} accuracy={task.gps.accuracy} height={200}/></div>}

        <div className="mt-4 flex gap-1">{STATUS_STEPS.map((s, i) => <div key={s} className="h-1.5 flex-1 rounded-full" style={{ background: i <= stepIdx ? '#3463b0' : '#e5e7eb' }} />)}</div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">{STATUS_STEPS.map((s, i) => <span key={s} className={i <= stepIdx ? 'font-bold text-navy-600' : ''}>{STATUS_LABELS[s]}</span>)}</div>

        <div className="flex gap-2 mt-4 flex-wrap">
          {task.status === 'assigned' && <button onClick={() => onStatus(task.id, 'en_route')} className="btn-primary rounded-lg text-sm flex-1">🚚 On My Way</button>}
          {task.status === 'en_route' && <button onClick={() => onStatus(task.id, 'in_progress')} className="btn-primary rounded-lg text-sm flex-1">📍 Arrived — Start Work</button>}
          {task.status === 'in_progress' && <button onClick={() => onStatus(task.id, 'completed')} className="rounded-lg text-sm font-bold py-2.5 px-4 text-white bg-green-600 flex-1">✓ Mark Complete</button>}
          <button onClick={() => onView(task.id)} className="px-4 py-2.5 rounded-lg text-sm font-bold text-navy-700 border border-navy-200 bg-white">View Full Details</button>
        </div>

        <button onClick={() => setLogOpen(v => !v)} className="mt-3 text-xs font-bold text-navy-500">{logOpen ? '▲ Hide activity' : '▼ Add note / view activity'}</button>
        {logOpen && <div className="mt-3 pt-3 border-t border-gray-100">
          <Timeline complaintId={task.id} refreshKey={`${task.status}-${refreshKey}`}/>
          {commentError && <p className="text-xs text-red-600 mb-2">{commentError}</p>}
          <div className="flex gap-2"><input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a work update..." className="input-field text-sm flex-1"/><button onClick={submitComment} disabled={posting || !comment.trim()} className="btn-primary px-4 disabled:opacity-50">{posting ? <Spinner className="w-4 h-4 border-2 border-white"/> : 'Post'}</button></div>
        </div>}
      </div>
    </div>
  )
}

export default function MaintenanceTasksPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const complaints = useComplaintStore(s => s.complaints)
  const loading = useComplaintStore(s => s.loading)
  const error = useComplaintStore(s => s.error)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)
  const updateStatus = useComplaintStore(s => s.updateStatus)
  const [tab, setTab] = useState('active')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => { fetchComplaints() }, [fetchComplaints])

  const myTasks = useMemo(() => complaints.filter(c => c.assigned_to === user?.id).sort((a, b) => b.priority_score - a.priority_score), [complaints, user?.id])
  const q = search.trim().toLowerCase()
  const searched = myTasks.filter(t => !q || [t.id, t.complaint_type, t.description, t.address, t.customer_name, t.status, t.task_notes].some(v => String(v || '').toLowerCase().includes(q)))
  const active = searched.filter(t => t.status !== 'completed')
  const completed = searched.filter(t => t.status === 'completed')
  const totalCompleted = myTasks.filter(t => t.status === 'completed').length
  const doneRate = myTasks.length ? Math.round(totalCompleted / myTasks.length * 100) : 0

  const handleStatus = async (id, status) => {
    setActionError('')
    try {
      await updateStatus(id, status)
      setToast(status === 'completed' ? '✅ Task marked complete.' : 'Status updated.')
      setTimeout(() => setToast(''), 3000)
    } catch (err) { setActionError(err.message) }
  }

  if (loading && complaints.length === 0) return <PageLoader label="Loading your tasks..." />

  return (
    <div className="space-y-6">
      <div className="page-band rounded-2xl px-6 py-6">
        <div className="flex items-end justify-between"><div><p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em]">Maintenance Portal</p><h1 className="font-display font-black text-white text-2xl sm:text-3xl mt-1">My Tasks</h1><p className="text-navy-300 text-sm mt-1">Search active or completed work and open the full timeline.</p></div><div className="text-right"><p className="font-display font-black text-4xl text-gold-400">{doneRate}%</p><p className="text-xs text-navy-300">completed</p></div></div>
      </div>

      {(error || actionError) && <ErrorBanner message={actionError || error} onRetry={fetchComplaints}/>} {toast && <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm font-bold">{toast}</div>}

      {myTasks.length === 0 ? <div className="card rounded-xl p-16 text-center"><div className="text-6xl mb-4">🔧</div><h2 className="font-display font-bold text-navy-800 text-xl">No tasks assigned yet</h2></div> : <>
        <div className="card rounded-xl p-4 space-y-3">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search task ID, complaint, customer, location or status..." className="input-field rounded-lg"/>
          <div className="flex gap-2">{[['active','Active Tasks', myTasks.filter(t => t.status !== 'completed').length], ['completed','Completed', totalCompleted]].map(([v,l,count]) => <button key={v} onClick={() => setTab(v)} className="px-4 py-2 rounded-full text-sm font-semibold" style={tab === v ? { background:'#0f2240',color:'#fff' } : { background:'#f3f4f6',color:'#6b7280' }}>{l} <b>{count}</b></button>)}</div>
        </div>

        {tab === 'active' ? (active.length ? <div className="space-y-4">{active.map(t => <TaskCard key={t.id} task={t} onStatus={handleStatus} onView={id => navigate(`/complaints/${id}`)}/>)}</div> : <div className="card rounded-xl p-10 text-center text-gray-400">No active tasks match your search.</div>) : (completed.length ? <div className="space-y-3">{completed.map(t => <button key={t.id} onClick={() => navigate(`/complaints/${t.id}`)} className="card rounded-xl p-4 w-full text-left flex items-center justify-between hover:border-navy-300"><div><p className="font-bold text-gray-800">{t.complaint_type}</p><p className="text-xs text-gray-400 mt-1">📍 {t.address} · Completed {timeAgo(t.completed_at || t.updated_at)}</p><p className="text-xs font-bold text-navy-600 mt-2">View details, notes and complete timeline →</p></div><StatusBadge status="completed"/></button>)}</div> : <div className="card rounded-xl p-10 text-center text-gray-400">No completed tasks match your search.</div>)}
      </>}
    </div>
  )
}
