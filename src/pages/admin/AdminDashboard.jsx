import { useEffect } from 'react'
import { useComplaintStore } from '../../store/complaintStore'
import { useAuthStore } from '../../store/authStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { PageLoader, EmptyState } from '../../components/ui/Feedback'
import { useNavigate } from 'react-router-dom'

function timeAgo(iso) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function StatCard({ label, value, sub, accent, icon }) {
  return (
    <div className={`stat-card ${accent}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-tight">{label}</p>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
             style={{ background: 'rgba(0,0,0,.04)' }}>{icon}</div>
      </div>
      <p className="font-display font-black text-4xl text-navy-900 leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
    </div>
  )
}

export default function AdminDashboard() {
  const complaints  = useComplaintStore(s => s.complaints)
  const loading     = useComplaintStore(s => s.loading)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)
  const user        = useAuthStore(s => s.user)
  const navigate    = useNavigate()

  useEffect(() => { fetchComplaints() }, [fetchComplaints])

  const total       = complaints.length
  const pending     = complaints.filter(c => c.status === 'pending').length
  const inProgress  = complaints.filter(c => c.status === 'in_progress').length
  const completed   = complaints.filter(c => c.status === 'completed').length
  const high        = complaints.filter(c => c.priority === 'high').length
  const unassigned  = complaints.filter(c => !c.assigned_to && c.status === 'pending').length
  const resolveRate = total > 0 ? Math.round((completed / total) * 100) : 0

  const recent = [...complaints]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 6)

  if (loading && complaints.length === 0) {
    return <PageLoader label="Loading dashboard..." />
  }

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="page-band rounded-2xl overflow-hidden px-6 py-7 relative">
        {/* Decorative wave */}
        <svg className="absolute bottom-0 left-0 right-0 w-full opacity-10" viewBox="0 0 1200 80" preserveAspectRatio="none">
          <path d="M0,40 C200,0 400,80 600,40 C800,0 1000,80 1200,40 L1200,80 L0,80 Z" fill="white"/>
        </svg>

        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[0.15em] mb-2">Admin Command Center</p>
            <h1 className="font-display font-black text-white text-3xl leading-tight">
              Good day, <span style={{ color: '#e6b020' }}>{user?.full_name?.split(' ')[0]}</span>
            </h1>
            <p className="text-navy-300 text-sm mt-1">
              {new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Resolution ring */}
          <div className="flex items-center gap-6 shrink-0">
            {unassigned > 0 && (
              <button onClick={() => navigate('/admin/assign')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold animate-pulse"
                style={{ background: 'rgba(234,179,8,.15)', border: '1px solid rgba(234,179,8,.3)', color: '#fde68a' }}>
                <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                {unassigned} unassigned
              </button>
            )}
            <div className="text-right">
              <p className="font-display font-black text-5xl leading-none" style={{ color: '#e6b020' }}>{resolveRate}%</p>
              <p className="text-navy-300 text-[11px] uppercase tracking-wider mt-0.5">resolved</p>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative mt-5 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.12)' }}>
          <div className="h-full rounded-full transition-all duration-700"
               style={{ width: `${resolveRate}%`, background: 'linear-gradient(90deg, #e6b020, #fde68a)' }} />
        </div>
        <div className="flex justify-between text-[11px] text-navy-300 mt-1.5">
          <span>⏳ {pending} pending</span>
          <span>🔧 {inProgress} active</span>
          <span>✓ {completed} done</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Filed"   value={total}     sub="all time"           accent="accent-navy"  icon="📋" />
        <StatCard label="Pending"       value={pending}   sub="awaiting review"    accent="accent-amber" icon="⏳" />
        <StatCard label="High Priority" value={high}      sub="urgent cases"       accent="accent-red"   icon="🚨" />
        <StatCard label="Resolved"      value={completed} sub={`${resolveRate}% rate`} accent="accent-green" icon="✅" />
      </div>

      {/* Unassigned alert */}
      {unassigned > 0 && (
        <button onClick={() => navigate('/admin/assign')}
          className="w-full flex items-center justify-between px-5 py-4 rounded-xl text-left group transition-all"
          style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '1px solid #fde68a' }}>
          <div>
            <p className="font-bold text-amber-900 text-sm">{unassigned} complaint{unassigned > 1 ? 's' : ''} need assignment</p>
            <p className="text-xs text-amber-700 mt-0.5">Unassigned reports delay resolution — assign to maintenance staff now</p>
          </div>
          <span className="font-black text-amber-600 text-xl group-hover:translate-x-1 transition-transform">→</span>
        </button>
      )}

      {/* Recent complaints table */}
      <div className="card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f0f0f0', background: 'linear-gradient(135deg, #fafbfd, #f4f7fb)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #e6b020, #c9921a)' }}></div>
            <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Recent Complaints</p>
          </div>
          <button onClick={() => navigate('/admin/complaints')}
            className="text-xs font-bold text-navy-600 hover:text-navy-900 transition-colors">
            View All →
          </button>
        </div>

        {recent.length === 0 ? (
          <EmptyState icon="📋" title="No complaints filed yet"
            description="Once residents start submitting reports, they'll show up here." />
        ) : (
        <>
        {/* Desktop */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #f0f4f8', background: '#fafbfd' }}>
                {['Type', 'Customer', 'Priority', 'Score', 'Status', 'Filed'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: i < recent.length - 1 ? '1px solid #f8f9fb' : 'none' }}
                    onClick={() => navigate(`/complaints/${c.id}`)} className="hover:bg-navy-50/40 transition-colors cursor-pointer">
                  <td className="px-5 py-3.5 font-semibold text-gray-900">{c.complaint_type}</td>
                  <td className="px-5 py-3.5 text-gray-500">{c.customer_name}</td>
                  <td className="px-5 py-3.5"><PriorityBadge priority={c.priority}/></td>
                  <td className="px-5 py-3.5">
                    <span className="font-display font-black text-2xl text-navy-800">{c.priority_score}</span>
                    <span className="text-xs text-gray-400 ml-0.5">/100</span>
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge status={c.status}/></td>
                  <td className="px-5 py-3.5 text-gray-400 text-xs font-mono">{timeAgo(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="sm:hidden divide-y divide-gray-50">
          {recent.map(c => (
            <div key={c.id} onClick={() => navigate(`/complaints/${c.id}`)} className="p-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50">
              <div className={`w-1 self-stretch rounded-full shrink-0 ${c.priority === 'high' ? 'bg-red-500' : c.priority === 'medium' ? 'bg-amber-400' : 'bg-green-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{c.complaint_type}</p>
                <p className="text-xs text-gray-400">{c.customer_name} · {timeAgo(c.created_at)}</p>
              </div>
              <div className="shrink-0 text-right">
                <StatusBadge status={c.status}/>
                <p className="font-display font-black text-2xl text-navy-800 mt-0.5">{c.priority_score}</p>
              </div>
            </div>
          ))}
        </div>
        </>
        )}
      </div>
    </div>
  )
}
