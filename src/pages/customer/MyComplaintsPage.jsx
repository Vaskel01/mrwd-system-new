import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useComplaintStore } from '../../store/complaintStore'
import { PriorityBadge } from '../../components/ui/Badges'
import { PageLoader, ErrorBanner } from '../../components/ui/Feedback'
import InlineMap from '../../components/ui/InlineMap'
import Timeline from '../../components/ui/Timeline'
import FeedbackBox from '../../components/ui/FeedbackBox'

function timeAgo(iso) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const STATUS_CONFIG = {
  pending:     { bar: 10,  color: '#94a3b8', icon: '⏳', label: 'Pending Review',  msg: 'Your report is queued for review.' },
  assigned:    { bar: 35,  color: '#7c3aed', icon: '📋', label: 'Assigned',        msg: 'A technician has been assigned to this.' },
  en_route:    { bar: 55,  color: '#c2410c', icon: '🚚', label: 'En Route',        msg: 'A technician is on the way.' },
  in_progress: { bar: 80,  color: '#3463b0', icon: '🔧', label: 'On Site',         msg: 'A technician is working on this now.' },
  completed:   { bar: 100, color: '#16a34a', icon: '✓',  label: 'Resolved',        msg: 'This issue has been resolved.' },
  rejected:    { bar: 100, color: '#dc2626', icon: '✗',  label: 'Rejected',        msg: 'This report was closed.' },
}

const PRIORITY_GLOW = {
  high:   'rgba(220,38,38,.12)',
  medium: 'rgba(234,179,8,.12)',
  low:    'rgba(22,163,74,.1)',
}

const PRIORITY_BORDER = {
  high:   '#fecaca',
  medium: '#fde68a',
  low:    '#bbf7d0',
}

function ComplaintCard({ c }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.pending

  return (
    <div className="card rounded-xl overflow-hidden transition-all duration-200"
         style={{ borderColor: PRIORITY_BORDER[c.priority], boxShadow: `0 2px 8px ${PRIORITY_GLOW[c.priority]}, 0 1px 3px rgba(0,0,0,.06)` }}>

      {/* Priority top stripe */}
      <div className="h-1"
           style={{ background: c.priority === 'high' ? 'linear-gradient(90deg,#dc2626,#f87171)' : c.priority === 'medium' ? 'linear-gradient(90deg,#d97706,#fbbf24)' : 'linear-gradient(90deg,#16a34a,#4ade80)' }} />

      <div className="p-4 sm:p-5">
        {/* Header row */}
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="font-display font-bold text-navy-900 text-base">{c.complaint_type}</p>
              <PriorityBadge priority={c.priority}/>
            </div>
            <p className="text-[11px] text-gray-400 font-mono">{c.id}</p>
          </div>
          <div className="text-right shrink-0 px-3 py-2 rounded-lg" style={{ background: '#f8fafc', border: '1px solid #e9ecf2' }}>
            <p className="font-display font-black text-3xl text-navy-900 leading-none">{c.priority_score}</p>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">/100</p>
          </div>
        </div>

        {/* Status track */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              {cfg.icon} {cfg.label}
            </span>
            <span className="text-xs font-bold text-gray-400">{cfg.bar}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${cfg.bar}%`, background: cfg.color }} />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">{cfg.msg}</p>
        </div>

        {/* Tags row */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {c.assigned_name && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-700 px-2 py-1 rounded-md"
                    style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                👷 {c.assigned_name}
              </span>
            )}
            {c.gps && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 px-2 py-1 rounded-md"
                    style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                📍 GPS
              </span>
            )}
          </div>
          <button onClick={() => setExpanded(v => !v)}
            className="text-xs font-semibold text-navy-500 hover:text-navy-800 transition-colors flex items-center gap-1">
            {expanded ? '▲ Hide' : '▼ Details'}
          </button>
        </div>

        {/* Expanded */}
        {expanded && (
          <div className="mt-4 pt-4 space-y-3 text-sm" style={{ borderTop: '1px solid #f0f4f8' }}>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Description</p>
              <p className="text-gray-600 leading-relaxed">{c.description}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Location</p>
              <p className="text-gray-600">{c.address}</p>
            </div>
            {c.gps && (
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">GPS Coordinates</p>
                <p className="font-mono text-xs text-navy-600 mb-1">
                  📍 {c.gps.lat.toFixed(5)}, {c.gps.lng.toFixed(5)} {c.gps.accuracy != null && <span className="text-gray-400">±{c.gps.accuracy}m</span>}
                </p>
                <InlineMap lat={c.gps.lat} lng={c.gps.lng} accuracy={c.gps.accuracy} height={160} />
              </div>
            )}
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Progress Timeline</p>
              <Timeline key={`${c.id}-${c.status}`} complaintId={c.id} refreshKey={c.status} />
            </div>
            {c.status === 'completed' && (
              <div>
                <FeedbackBox complaintId={c.id} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card footer */}
      <div className="px-5 py-2.5 flex items-center justify-between text-[11px] text-gray-400"
           style={{ background: '#fafbfd', borderTop: '1px solid #f0f4f8' }}>
        <span>🕒 {timeAgo(c.created_at)}</span>
        <span>📍 {c.address.split(',')[0]}</span>
      </div>
    </div>
  )
}

export default function MyComplaintsPage() {
  const user       = useAuthStore(s => s.user)
  const getMyComplaints = useComplaintStore(s => s.getMyComplaints)
  const loading = useComplaintStore(s => s.loading)
  const error = useComplaintStore(s => s.error)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)
  const complaints = getMyComplaints(user?.id) || []
  const [filter, setFilter] = useState('all')

  useEffect(() => { fetchComplaints() }, [fetchComplaints])

  if (loading && complaints.length === 0) {
    return <PageLoader label="Loading your reports..." />
  }

  const filtered = filter === 'all' ? complaints
    : filter === 'in_progress' ? complaints.filter(c => ['assigned', 'en_route', 'in_progress'].includes(c.status))
    : complaints.filter(c => c.status === filter)
  const counts   = {
    all:         complaints.length,
    pending:     complaints.filter(c => c.status === 'pending').length,
    in_progress: complaints.filter(c => ['assigned', 'en_route', 'in_progress'].includes(c.status)).length,
    completed:   complaints.filter(c => c.status === 'completed').length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-band rounded-2xl px-6 py-6 relative overflow-hidden">
        <svg className="absolute bottom-0 left-0 right-0 w-full opacity-10" viewBox="0 0 1200 60" preserveAspectRatio="none">
          <path d="M0,30 C200,0 400,60 600,30 C800,0 1000,60 1200,30 L1200,60 L0,60 Z" fill="white"/>
        </svg>
        <div className="relative flex items-end justify-between">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Customer Portal</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl">My Reports</h1>
            <p className="text-navy-300 text-sm mt-1">{complaints.length} report{complaints.length !== 1 ? 's' : ''} filed</p>
          </div>
          <p className="font-display font-black text-5xl leading-none" style={{ color: '#e6b020' }}>{complaints.length}</p>
        </div>
      </div>

      {error && complaints.length === 0 ? (
        <ErrorBanner message={error} onRetry={fetchComplaints} />
      ) : complaints.length === 0 ? (
        <div className="card rounded-xl p-16 text-center">
          <div className="text-6xl mb-4">📋</div>
          <h2 className="font-display font-bold text-navy-800 text-xl mb-2">No reports yet</h2>
          <p className="text-gray-400 text-sm">Use the Submit Complaint menu to file your first report.</p>
        </div>
      ) : (
        <>
          {/* Filter tabs */}
          <div className="flex gap-2 flex-wrap">
            {[['all','All'], ['pending','Pending'], ['in_progress','Active'], ['completed','Done']].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)}
                className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
                style={filter === v
                  ? { background: 'linear-gradient(135deg, #1b3366, #0f2240)', color: '#fff', boxShadow: '0 2px 8px rgba(15,34,64,.25)' }
                  : { background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb' }
                }>
                {l} <span className="ml-1 font-bold" style={filter === v ? { color: '#e6b020' } : {}}>{counts[v] ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {filtered.length === 0 ? (
              <div className="card rounded-xl p-10 text-center text-gray-400 text-sm">No reports in this category.</div>
            ) : filtered.map(c => <ComplaintCard key={c.id} c={c} />)}
          </div>
        </>
      )}
    </div>
  )
}
