import { useState, useEffect } from 'react'
import { useComplaintStore } from '../../store/complaintStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { PageLoader, ErrorBanner } from '../../components/ui/Feedback'
import InlineMap from '../../components/ui/InlineMap'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

const PRIORITY_STRIPE = {
  high:   'border-l-red-500',
  medium: 'border-l-amber-400',
  low:    'border-l-green-400',
}

export default function AllComplaintsPage() {
  const complaints = useComplaintStore(s => s.complaints)
  const loading = useComplaintStore(s => s.loading)
  const error = useComplaintStore(s => s.error)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)
  const [filterStatus, setFilterStatus]     = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('score')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { fetchComplaints() }, [fetchComplaints])

  if (loading && complaints.length === 0) {
    return <PageLoader label="Loading complaints..." />
  }

  const filtered = complaints
    .filter(c => filterStatus   === 'all' || c.status   === filterStatus)
    .filter(c => filterPriority === 'all' || c.priority === filterPriority)
    .filter(c =>
      search === '' ||
      c.complaint_type.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      c.customer_name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => sortBy === 'score'
      ? b.priority_score - a.priority_score
      : sortBy === 'priority'
      ? PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      : new Date(b.created_at) - new Date(a.created_at)
    )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-band rounded-2xl overflow-hidden px-6 py-6 relative">
        <svg className="absolute bottom-0 left-0 right-0 w-full opacity-10" viewBox="0 0 1200 60" preserveAspectRatio="none">
          <path d="M0,30 C200,0 400,60 600,30 C800,0 1000,60 1200,30 L1200,60 L0,60 Z" fill="white"/>
        </svg>
        <div className="relative flex items-end justify-between">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Admin · Records</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl">All Complaints</h1>
          </div>
          <div className="text-right">
            <p className="font-display font-black text-5xl leading-none" style={{ color: '#e6b020' }}>{filtered.length}</p>
            <p className="text-navy-300 text-[11px] uppercase tracking-wider">shown / {complaints.length}</p>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchComplaints} />}

      {/* Filter panel */}
      <div className="card rounded-xl p-4 space-y-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input type="text" placeholder="Search complaints, customers, descriptions..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="input-field pl-9" style={{ borderRadius: 8 }} />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-1">
            {[['all','All'], ['pending','Pending'], ['in_progress','Active'], ['completed','Done']].map(([v, l]) => (
              <button key={v} onClick={() => setFilterStatus(v)}
                className="px-3 py-1.5 text-xs font-bold rounded-full transition-all"
                style={filterStatus === v
                  ? { background: 'linear-gradient(135deg,#1b3366,#0f2240)', color: '#fff' }
                  : { background: '#f3f4f6', color: '#6b7280' }
                }>{l}</button>
            ))}
          </div>
          <div className="flex gap-1">
            {[['all','Any'], ['high','High'], ['medium','Med'], ['low','Low']].map(([v, l]) => (
              <button key={v} onClick={() => setFilterPriority(v)}
                className="px-3 py-1.5 text-xs font-bold rounded-full transition-all"
                style={filterPriority === v
                  ? { background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff' }
                  : { background: '#f3f4f6', color: '#6b7280' }
                }>{l}</button>
            ))}
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="text-xs border border-gray-200 px-3 py-1.5 text-gray-600 bg-white font-bold rounded-full">
            <option value="score">↓ Score</option>
            <option value="priority">↓ Priority</option>
            <option value="date">↓ Newest</option>
          </select>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50 text-left">
              <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">#</th>
              <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Complaint</th>
              <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Customer</th>
              <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Priority</th>
              <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Score</th>
              <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Filed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">
                {complaints.length === 0 ? 'No complaints have been filed yet.' : 'No complaints match the current filters.'}
              </td></tr>
            ) : filtered.map((c, i) => (
              <>
                <tr key={c.id} onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  className={`cursor-pointer transition-colors border-l-4 ${PRIORITY_STRIPE[c.priority]} ${
                    expanded === c.id ? 'bg-slate-50' : 'hover:bg-gray-50'
                  }`}>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono font-bold">{String(i+1).padStart(2,'0')}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-gray-900">{c.complaint_type}</p>
                    <p className="text-xs text-gray-400 truncate max-w-xs">{c.description.slice(0, 50)}…</p>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-700">{c.customer_name}</td>
                  <td className="px-4 py-3"><PriorityBadge priority={c.priority}/></td>
                  <td className="px-4 py-3 font-black text-2xl text-gray-800">{c.priority_score}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status}/></td>
                  <td className="px-4 py-3 text-gray-400 text-xs font-mono">{timeAgo(c.created_at)}</td>
                </tr>
                {expanded === c.id && (
                  <tr key={`${c.id}-exp`}>
                    <td colSpan={7} className="bg-slate-50 border-b border-gray-200 px-8 py-4">
                      <div className="grid grid-cols-2 gap-6 text-sm">
                        <div>
                          <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">Description</p>
                          <p className="text-gray-700 leading-relaxed">{c.description}</p>
                        </div>
                        <div className="space-y-2 text-xs">
                          <div><span className="font-black text-gray-400 uppercase">Address: </span><span className="text-gray-700">{c.address}</span></div>
                          {c.gps ? (
                            <div>
                              <span className="font-black text-gray-400 uppercase">GPS: </span>
                              <span className="font-mono text-brand-600">
                                📍 {c.gps.lat.toFixed(5)}, {c.gps.lng.toFixed(5)}
                              </span>
                              {c.gps.accuracy != null && <span className="text-gray-400 ml-1">±{c.gps.accuracy}m</span>}
                              <InlineMap lat={c.gps.lat} lng={c.gps.lng} accuracy={c.gps.accuracy} height={180} />
                            </div>
                          ) : (
                            <div><span className="font-black text-gray-400 uppercase">GPS: </span><span className="text-gray-400 italic">Not captured</span></div>
                          )}
                          <div><span className="font-black text-gray-400 uppercase">Assigned: </span><span className="text-gray-700">{c.assigned_name || '—'}</span></div>
                          <div><span className="font-black text-gray-400 uppercase">Ref ID: </span><span className="font-mono text-gray-700">{c.id}</span></div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3 p-3">
        {filtered.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 p-8 text-center text-gray-400 text-sm">
            {complaints.length === 0 ? 'No complaints have been filed yet.' : 'No complaints match the current filters.'}
          </div>
        ) : filtered.map((c) => (
          <div key={c.id} className={`bg-white border border-gray-200 border-l-4 ${PRIORITY_STRIPE[c.priority]} overflow-hidden`}>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-black text-gray-900 text-sm">{c.complaint_type}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.customer_name} · {timeAgo(c.created_at)}</p>
                </div>
                <span className="font-black text-2xl text-gray-800 shrink-0">{c.priority_score}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <PriorityBadge priority={c.priority} />
                <StatusBadge status={c.status} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
