import { useAuthStore } from '../../store/authStore'
import { useComplaintStore } from '../../store/complaintStore'
import { PriorityBadge } from '../../components/ui/Badges'
import { PageLoader, ErrorBanner, Spinner } from '../../components/ui/Feedback'
import { useState, useEffect } from 'react'
import InlineMap from '../../components/ui/InlineMap'
import Timeline from '../../components/ui/Timeline'

function timeAgo(iso) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// From a technician's point of view, "pending" isn't reachable — a
// task only becomes visible to them once it's been assigned, so the
// progression they actually experience starts there.
const STATUS_STEPS  = ['assigned', 'en_route', 'in_progress', 'completed']
const STATUS_LABELS = { assigned: 'Assigned', en_route: 'En Route', in_progress: 'On Site', completed: 'Done' }
const PRIORITY_BORDER = { high: '#fecaca', medium: '#fde68a', low: '#bbf7d0' }
const PRIORITY_STRIPE = {
  high:   'linear-gradient(90deg,#dc2626,#f87171)',
  medium: 'linear-gradient(90deg,#d97706,#fbbf24)',
  low:    'linear-gradient(90deg,#16a34a,#4ade80)',
}

function TaskCard({ t, onStatus }) {
  const postComment = useComplaintStore(s => s.postComment)
  const stepIdx  = STATUS_STEPS.indexOf(t.status)
  const [mapOpen, setMapOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [comment, setComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [commentError, setCommentError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const handlePostComment = async () => {
    if (!comment.trim()) return
    setPosting(true)
    setCommentError('')
    try {
      await postComment(t.id, comment.trim())
      setComment('')
      setRefreshKey(k => k + 1)
    } catch (err) {
      setCommentError(err.message)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="card rounded-xl overflow-hidden"
         style={{ borderColor: PRIORITY_BORDER[t.priority] }}>
      <div className="h-1" style={{ background: PRIORITY_STRIPE[t.priority] }} />

      <div className="p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-display font-bold text-navy-900">{t.complaint_type}</span>
              <PriorityBadge priority={t.priority}/>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-400">
              <span>👤 {t.customer_name}</span>
              <span>·</span>
              <span>🕒 {timeAgo(t.created_at)}</span>
            </div>
          </div>
          <div className="rounded-lg px-3 py-2 text-center shrink-0" style={{ background: '#f8fafc', border: '1px solid #e9ecf2' }}>
            <p className="font-display font-black text-2xl text-navy-900 leading-none">{t.priority_score}</p>
            <p className="text-[10px] text-gray-400 uppercase">score</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed mb-3">{t.description}</p>

        {t.task_notes && (
          <div className="mb-3 px-3 py-2.5 rounded-lg text-sm" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
            <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-0.5">📌 Admin Note</p>
            <p className="text-amber-900">{t.task_notes}</p>
          </div>
        )}

        {/* Address row */}
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <span className="text-base">📍</span> {t.address}
          </p>
          {t.gps && (
            <button onClick={() => setMapOpen(v => !v)}
              className="text-xs font-semibold px-2.5 py-1 rounded-full transition-all"
              style={{ background: mapOpen ? '#1b3366' : '#f0f4fa', color: mapOpen ? '#fff' : '#3463b0', border: '1px solid #b9cceb' }}>
              {mapOpen ? '✕ Hide Map' : '🗺 View Map'}
            </button>
          )}
        </div>

        {t.gps && mapOpen && (
          <div className="mb-4 rounded-lg overflow-hidden" style={{ border: '1px solid #e9ecf2' }}>
            <InlineMap lat={t.gps.lat} lng={t.gps.lng} accuracy={t.gps.accuracy} height={200} />
          </div>
        )}

        {/* Progress stepper */}
        <div className="flex items-center gap-1 mb-4">
          {STATUS_STEPS.map((s, i) => (
            <div key={s} className="flex-1 flex items-center gap-1">
              <div className="h-1.5 flex-1 rounded-full transition-all duration-300"
                   style={{ background: i <= stepIdx ? 'linear-gradient(90deg,#1b3366,#3463b0)' : '#e9ecf2' }} />
              {i < STATUS_STEPS.length - 1 && (
                <div className="w-1.5 h-1.5 rounded-full shrink-0"
                     style={{ background: i < stepIdx ? '#3463b0' : '#e9ecf2' }} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mb-4 -mt-2">
          {STATUS_STEPS.map((s, i) => (
            <span key={s} className={i <= stepIdx ? 'text-navy-600 font-semibold' : ''}>{STATUS_LABELS[s]}</span>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {t.status === 'assigned' && (
            <button onClick={() => onStatus(t.id, 'en_route')} className="btn-primary flex-1 rounded-lg text-sm">
              🚚 On My Way
            </button>
          )}
          {t.status === 'en_route' && (
            <>
              <button onClick={() => onStatus(t.id, 'in_progress')} className="btn-primary flex-1 rounded-lg text-sm">
                📍 Arrived — Start Work
              </button>
              <button onClick={() => onStatus(t.id, 'assigned')}
                className="px-4 rounded-lg text-sm font-semibold transition-all text-gray-600"
                style={{ background: '#f3f4f6', border: '1px solid #e5e7eb' }}>↩</button>
            </>
          )}
          {t.status === 'in_progress' && (
            <>
              <button onClick={() => onStatus(t.id, 'completed')}
                className="flex-1 rounded-lg text-sm font-semibold py-2.5 transition-all text-white"
                style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>
                ✓ Mark Complete
              </button>
              <button onClick={() => onStatus(t.id, 'en_route')}
                className="px-4 rounded-lg text-sm font-semibold transition-all text-gray-600"
                style={{ background: '#f3f4f6', border: '1px solid #e5e7eb' }}>↩</button>
            </>
          )}
          {t.status === 'completed' && (
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                   style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>✓</div>
              Task Completed
            </div>
          )}
        </div>

        {/* Notes & activity log toggle */}
        <button onClick={() => setLogOpen(v => !v)}
          className="mt-3 text-xs font-semibold text-navy-500 hover:text-navy-800 transition-colors flex items-center gap-1">
          {logOpen ? '▲ Hide activity log' : '▼ Add a note / view activity log'}
        </button>

        {logOpen && (
          <div className="mt-3 pt-3 space-y-3" style={{ borderTop: '1px solid #f0f4f8' }}>
            <Timeline key={`${t.id}-${t.status}-${refreshKey}`} complaintId={t.id} refreshKey={`${t.status}-${refreshKey}`} />
            {commentError && <p className="text-xs text-red-600">{commentError}</p>}
            <div className="flex gap-2">
              <input value={comment} onChange={e => setComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePostComment()}
                placeholder="e.g. Waiting on a replacement part..."
                className="input-field text-sm flex-1" />
              <button onClick={handlePostComment} disabled={posting || !comment.trim()}
                className="btn-primary text-sm px-4 flex items-center gap-1.5 disabled:opacity-50">
                {posting ? <Spinner className="w-4 h-4 border-2 border-white" /> : 'Post'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function MaintenanceTasksPage() {
  const user         = useAuthStore(s => s.user)
  const complaints   = useComplaintStore(s => s.complaints)
  const loading = useComplaintStore(s => s.loading)
  const error = useComplaintStore(s => s.error)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)
  const updateStatus = useComplaintStore(s => s.updateStatus)
  const [toast, setToast] = useState('')
  const [tab,   setTab]   = useState('active')

  useEffect(() => { fetchComplaints() }, [fetchComplaints])

  const myTasks  = complaints.filter(c => c.assigned_to === user.id)
    .sort((a, b) => b.priority_score - a.priority_score)
  const active    = myTasks.filter(t => t.status !== 'completed')
  const completed = myTasks.filter(t => t.status === 'completed')
  const doneRate  = myTasks.length > 0 ? Math.round((completed.length / myTasks.length) * 100) : 0

  const showToast    = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }
  const handleStatus = (id, status) => {
    updateStatus(id, status)
    showToast(status === 'completed' ? '✅ Task marked complete' : 'Status updated')
  }

  if (loading && complaints.length === 0) {
    return <PageLoader label="Loading your tasks..." />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl overflow-hidden px-6 py-6 relative"
           style={{ background: 'linear-gradient(135deg, #0f2240 0%, #1b3366 60%, #d97706 200%)', position: 'relative' }}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #0f2240 0%, #1e3a6e 100%)' }} />
        {/* Amber accent bar at left */}
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: 'linear-gradient(180deg,#fbbf24,#d97706)' }} />
        <svg className="absolute bottom-0 left-0 right-0 w-full opacity-10" viewBox="0 0 1200 60" preserveAspectRatio="none">
          <path d="M0,30 C200,0 400,60 600,30 C800,0 1000,60 1200,30 L1200,60 L0,60 Z" fill="white"/>
        </svg>
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4 pl-3">
          <div>
            <p className="text-amber-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Field Technician</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl">{user?.full_name}</h1>
            <p className="text-navy-300 text-sm mt-1">Maintenance Portal</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="font-display font-black text-4xl leading-none text-amber-400">{active.length}</p>
              <p className="text-navy-300 text-[11px] uppercase tracking-wider">active</p>
            </div>
            <div className="text-right">
              <p className="font-display font-black text-4xl leading-none" style={{ color: '#e6b020' }}>{doneRate}%</p>
              <p className="text-navy-300 text-[11px] uppercase tracking-wider">done</p>
            </div>
          </div>
        </div>
        {myTasks.length > 0 && (
          <div className="relative mt-4 h-1.5 rounded-full overflow-hidden pl-3" style={{ background: 'rgba(255,255,255,.12)' }}>
            <div className="h-full rounded-full" style={{ width: `${doneRate}%`, background: 'linear-gradient(90deg,#fbbf24,#e6b020)' }} />
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="rounded-xl px-4 py-3 text-sm font-semibold flex items-center gap-2"
             style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }}>
          {toast}
        </div>
      )}

      {myTasks.length === 0 && error ? (
        <ErrorBanner message={error} onRetry={fetchComplaints} />
      ) : myTasks.length === 0 ? (
        <div className="card rounded-xl p-16 text-center">
          <div className="text-6xl mb-4">🔧</div>
          <h2 className="font-display font-bold text-navy-800 text-xl mb-2">No tasks assigned yet</h2>
          <p className="text-gray-400 text-sm">The administrator will assign complaints to you shortly.</p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-2">
            {[['active','Active Tasks', active.length], ['completed','Completed', completed.length]].map(([v, l, count]) => (
              <button key={v} onClick={() => setTab(v)}
                className="px-4 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2"
                style={tab === v
                  ? { background: 'linear-gradient(135deg,#1b3366,#0f2240)', color: '#fff', boxShadow: '0 2px 8px rgba(15,34,64,.25)' }
                  : { background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb' }
                }>
                {l}
                <span className="font-bold text-sm" style={tab === v ? { color: '#fbbf24' } : {}}>{count}</span>
              </button>
            ))}
          </div>

          {tab === 'active' && (
            <div className="space-y-4">
              {active.length === 0 ? (
                <div className="card rounded-xl p-12 text-center">
                  <div className="text-5xl mb-3">🎉</div>
                  <p className="font-display font-bold text-navy-700 text-lg">All caught up!</p>
                </div>
              ) : active.map(t => <TaskCard key={t.id} t={t} onStatus={handleStatus} />)}
            </div>
          )}

          {tab === 'completed' && (
            <div className="space-y-2">
              {completed.length === 0 ? (
                <div className="card rounded-xl p-8 text-center text-gray-400 text-sm">No completed tasks yet.</div>
              ) : completed.map(t => (
                <div key={t.id} className="card rounded-xl p-4 flex items-center justify-between opacity-70">
                  <div>
                    <p className="font-semibold text-gray-700 text-sm">{t.complaint_type}</p>
                    <p className="text-xs text-gray-400 mt-0.5">📍 {t.address.split(',')[0]}</p>
                  </div>
                  <span className="badge-completed">✓ Done</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
