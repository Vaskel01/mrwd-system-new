import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useComplaintStore } from '../../store/complaintStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { PageLoader, ErrorBanner } from '../../components/ui/Feedback'

function timeAgo(iso) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const STATUS_CONFIG = {
  pending: { bar: 10, color: '#94a3b8', icon: '⏳', label: 'Pending Review', msg: 'Your report is queued for review.' },
  assigned: { bar: 35, color: '#7c3aed', icon: '📋', label: 'Assigned', msg: 'A technician has been assigned.' },
  en_route: { bar: 55, color: '#c2410c', icon: '🚚', label: 'En Route', msg: 'A technician is on the way.' },
  in_progress: { bar: 80, color: '#3463b0', icon: '🔧', label: 'On Site', msg: 'A technician is working on this.' },
  completed: { bar: 100, color: '#16a34a', icon: '✓', label: 'Resolved', msg: 'This issue has been resolved.' },
  rejected: { bar: 100, color: '#dc2626', icon: '✗', label: 'Rejected', msg: 'This report was closed by the administrator.' },
}

const PRIORITY_BORDER = { high: '#fecaca', medium: '#fde68a', low: '#bbf7d0' }
const PRIORITY_STRIPE = {
  high: 'linear-gradient(90deg,#dc2626,#f87171)',
  medium: 'linear-gradient(90deg,#d97706,#fbbf24)',
  low: 'linear-gradient(90deg,#16a34a,#4ade80)',
}

function ComplaintCard({ complaint, onView }) {
  const cfg = STATUS_CONFIG[complaint.status] || STATUS_CONFIG.pending
  return (
    <div className="card rounded-xl overflow-hidden" style={{ borderColor: PRIORITY_BORDER[complaint.priority] }}>
      <div className="h-1" style={{ background: PRIORITY_STRIPE[complaint.priority] }} />
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display font-bold text-navy-900">{complaint.complaint_type}</h2>
              <PriorityBadge priority={complaint.priority} />
              <StatusBadge status={complaint.status} />
            </div>
            <p className="text-[10px] text-gray-400 font-mono mt-1 break-all">{complaint.id}</p>
          </div>
          <div className="rounded-lg px-3 py-2 text-center shrink-0 bg-slate-50 border border-slate-200">
            <p className="font-display font-black text-2xl text-navy-900 leading-none">{complaint.priority_score}</p>
            <p className="text-[9px] text-gray-400 uppercase">score</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-semibold text-gray-700">{cfg.icon} {cfg.label}</span>
            <span className="text-xs font-bold text-gray-400">{cfg.bar}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full" style={{ width: `${cfg.bar}%`, background: cfg.color }} /></div>
          <p className="text-xs text-gray-400 mt-1.5">{cfg.msg}</p>
        </div>

        {complaint.status === 'rejected' && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-[10px] font-black text-red-600 uppercase tracking-wider">Why it was rejected</p>
            <p className="text-sm text-red-800 mt-1 leading-relaxed">{complaint.rejection_reason || 'No reason was recorded.'}</p>
          </div>
        )}

        <p className="text-sm text-gray-600 mt-4 line-clamp-2">{complaint.description}</p>
        <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-100">
          <div className="text-xs text-gray-400 min-w-0">
            <p className="truncate">📍 {complaint.address}</p>
            <p className="mt-1">🕒 {timeAgo(complaint.created_at)} {complaint.assigned_name ? `· 👷 ${complaint.assigned_name}` : ''}</p>
          </div>
          <button onClick={() => onView(complaint.id)} className="btn-primary shrink-0 rounded-lg text-xs px-4 py-2">View Details →</button>
        </div>
      </div>
    </div>
  )
}

export default function MyComplaintsPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const allComplaints = useComplaintStore(s => s.complaints)
  const complaints = useMemo(() => allComplaints.filter(c => c.customer_id === user?.id), [allComplaints, user?.id])
  const loading = useComplaintStore(s => s.loading)
  const error = useComplaintStore(s => s.error)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => { fetchComplaints() }, [fetchComplaints])

  const counts = {
    all: complaints.length,
    pending: complaints.filter(c => c.status === 'pending').length,
    active: complaints.filter(c => ['assigned', 'en_route', 'in_progress'].includes(c.status)).length,
    completed: complaints.filter(c => c.status === 'completed').length,
    rejected: complaints.filter(c => c.status === 'rejected').length,
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return complaints.filter(c => {
      const matchesStatus = filter === 'all' ||
        (filter === 'active' ? ['assigned', 'en_route', 'in_progress'].includes(c.status) : c.status === filter)
      const matchesSearch = !q || [c.id, c.complaint_type, c.description, c.address, c.status, c.assigned_name, c.rejection_reason]
        .some(value => String(value || '').toLowerCase().includes(q))
      return matchesStatus && matchesSearch
    })
  }, [complaints, filter, search])

  if (loading && complaints.length === 0) return <PageLoader label="Loading your reports..." />

  return (
    <div className="space-y-6">
      <div className="page-band rounded-2xl px-6 py-6 relative overflow-hidden">
        <div className="relative flex items-end justify-between">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Customer Portal</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl">My Reports</h1>
            <p className="text-navy-300 text-sm mt-1">Search and open any complaint for its complete timeline.</p>
          </div>
          <p className="font-display font-black text-5xl leading-none" style={{ color: '#e6b020' }}>{complaints.length}</p>
        </div>
      </div>

      {error && complaints.length === 0 && <ErrorBanner message={error} onRetry={fetchComplaints} />}

      {complaints.length > 0 && (
        <div className="card rounded-xl p-4 space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">⌕</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search reference ID, type, description, address or status..."
              className="input-field pl-9 rounded-lg" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {[['all','All'], ['pending','Pending'], ['active','Active'], ['completed','Done'], ['rejected','Rejected']].map(([v, label]) => (
              <button key={v} onClick={() => setFilter(v)} className="px-4 py-2 rounded-full text-sm font-semibold"
                style={filter === v ? { background: '#0f2240', color: '#fff' } : { background: '#f3f4f6', color: '#6b7280' }}>
                {label} <span className="ml-1 font-bold">{counts[v]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {complaints.length === 0 ? (
        <div className="card rounded-xl p-16 text-center"><div className="text-6xl mb-4">📋</div><h2 className="font-display font-bold text-navy-800 text-xl">No reports yet</h2></div>
      ) : filtered.length === 0 ? (
        <div className="card rounded-xl p-10 text-center text-gray-400">No reports match your search.</div>
      ) : (
        <div className="space-y-4">{filtered.map(c => <ComplaintCard key={c.id} complaint={c} onView={id => navigate(`/complaints/${id}`)} />)}</div>
      )}
    </div>
  )
}
