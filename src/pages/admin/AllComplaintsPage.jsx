import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useComplaintStore } from '../../store/complaintStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { PageLoader, ErrorBanner, Spinner } from '../../components/ui/Feedback'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }
const PRIORITY_STRIPE = {
  high: 'border-l-red-500',
  medium: 'border-l-amber-400',
  low: 'border-l-green-400',
}

export default function AllComplaintsPage() {
  const navigate = useNavigate()
  const complaints = useComplaintStore(s => s.complaints)
  const loading = useComplaintStore(s => s.loading)
  const error = useComplaintStore(s => s.error)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)
  const restoreComplaint = useComplaintStore(s => s.restoreComplaint)
  const reclassifyAllComplaints = useComplaintStore(s => s.reclassifyAllComplaints)

  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('score')
  const [restoringId, setRestoringId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [reclassifying, setReclassifying] = useState(false)
  const [reclassifyMessage, setReclassifyMessage] = useState('')

  useEffect(() => { fetchComplaints() }, [fetchComplaints])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return complaints
      .filter(c => filterStatus === 'all' || c.status === filterStatus)
      .filter(c => filterPriority === 'all' || c.priority === filterPriority)
      .filter(c => !query || [
        c.id, c.complaint_type, c.description, c.customer_name,
        c.address, c.assigned_name, c.status, c.rejection_reason,
      ].some(value => String(value || '').toLowerCase().includes(query)))
      .sort((a, b) => sortBy === 'score'
        ? b.priority_score - a.priority_score || new Date(b.created_at) - new Date(a.created_at)
        : sortBy === 'priority'
          ? PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.priority_score - a.priority_score
          : sortBy === 'type'
            ? a.complaint_type.localeCompare(b.complaint_type) || b.priority_score - a.priority_score
            : sortBy === 'oldest'
              ? new Date(a.created_at) - new Date(b.created_at)
              : new Date(b.created_at) - new Date(a.created_at))
  }, [complaints, filterStatus, filterPriority, search, sortBy])

  const handleRestore = async (event, complaint) => {
    event.stopPropagation()
    setRestoringId(complaint.id)
    setActionError('')
    try {
      await restoreComplaint(complaint.id)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setRestoringId(null)
    }
  }

  const handleReclassifyAll = async () => {
    setReclassifying(true)
    setActionError('')
    setReclassifyMessage('')
    try {
      const result = await reclassifyAllComplaints()
      setReclassifyMessage(`Classifier updated ${result.updated} complaint${result.updated === 1 ? '' : 's'}${result.failed ? `; ${result.failed} failed` : ''}.`)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setReclassifying(false)
    }
  }

  if (loading && complaints.length === 0) return <PageLoader label="Loading complaints..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl overflow-hidden px-6 py-6 relative">
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

      {(error || actionError) && <ErrorBanner message={actionError || error} onRetry={fetchComplaints} />}
      {reclassifyMessage && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800">{reclassifyMessage}</div>}

      <div className="card rounded-xl p-4 space-y-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input type="text" placeholder="Search ID, complaint, customer, address, status or technician..."
            value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9 rounded-lg" />
        </div>
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex gap-1 flex-wrap">
            {[['all','All'], ['pending','Pending'], ['assigned','Assigned'], ['en_route','En Route'], ['in_progress','On Site'], ['completed','Done'], ['rejected','Rejected']].map(([v, l]) => (
              <button key={v} onClick={() => setFilterStatus(v)}
                className="px-3 py-1.5 text-xs font-bold rounded-full transition-all"
                style={filterStatus === v ? { background: '#0f2240', color: '#fff' } : { background: '#f3f4f6', color: '#6b7280' }}>{l}</button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <button onClick={handleReclassifyAll} disabled={reclassifying}
              className="inline-flex items-center gap-2 text-xs border border-navy-200 px-3 py-1.5 text-navy-700 bg-navy-50 font-bold rounded-full hover:bg-navy-100 disabled:opacity-50">
              {reclassifying ? <><Spinner className="w-3.5 h-3.5 border-2 border-navy-700" /> Classifying...</> : '↻ Classify Existing'}
            </button>
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="text-xs border border-gray-200 px-3 py-1.5 text-gray-600 bg-white font-bold rounded-full">
              <option value="all">Any Priority</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="text-xs border border-gray-200 px-3 py-1.5 text-gray-600 bg-white font-bold rounded-full">
              <option value="score">Score</option><option value="priority">Priority</option><option value="type">Type A–Z</option><option value="date">Newest</option><option value="oldest">Oldest</option>
            </select>
          </div>
        </div>
      </div>

      <div className="hidden md:block card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b-2 border-gray-200 bg-gray-50 text-left">
            {['Complaint', 'Customer', 'Priority', 'Status', 'Assigned', 'Filed', ''].map(h => <th key={h} className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? <tr><td colSpan={7} className="p-12 text-center text-gray-400">No complaints match your search and filters.</td></tr> : filtered.map(c => (
              <tr key={c.id} onClick={() => navigate(`/complaints/${c.id}`)} className={`cursor-pointer hover:bg-gray-50 border-l-4 ${PRIORITY_STRIPE[c.priority]}`}>
                <td className="px-4 py-3">
                  <p className="font-bold text-gray-900">{c.complaint_type}</p>
                  <p className="text-xs text-gray-400 max-w-sm truncate">{c.description}</p>
                  <p className="text-[10px] text-gray-300 font-mono mt-1">{c.id}</p>
                  {c.status === 'rejected' && <p className="text-xs text-red-600 mt-1 max-w-md"><span className="font-bold">Reason:</span> {c.rejection_reason || 'Not recorded'}</p>}
                </td>
                <td className="px-4 py-3 text-gray-700">{c.customer_name}</td>
                <td className="px-4 py-3"><PriorityBadge priority={c.priority} /></td>
                <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                <td className="px-4 py-3 text-gray-500">{c.assigned_name || '—'}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{timeAgo(c.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  {c.status === 'rejected' ? (
                    <button onClick={e => handleRestore(e, c)} disabled={restoringId === c.id}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg text-white bg-navy-800 hover:bg-navy-900 disabled:opacity-50">
                      {restoringId === c.id ? <Spinner className="w-3.5 h-3.5 border-2 border-white" /> : '↶ Undo'}
                    </button>
                  ) : <span className="text-navy-500 font-bold">View →</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? <div className="card rounded-xl p-10 text-center text-gray-400">No complaints match your search and filters.</div> : filtered.map(c => (
          <div key={c.id} onClick={() => navigate(`/complaints/${c.id}`)} className={`card rounded-xl p-4 border-l-4 ${PRIORITY_STRIPE[c.priority]} cursor-pointer`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-gray-900">{c.complaint_type}</p>
                <p className="text-xs text-gray-500 mt-1">{c.customer_name} · {timeAgo(c.created_at)}</p>
                <p className="text-xs text-gray-400 truncate mt-1">📍 {c.address}</p>
              </div>
              <span className="font-display font-black text-2xl text-navy-800">{c.priority_score}</span>
            </div>
            <div className="flex items-center gap-2 mt-3"><PriorityBadge priority={c.priority}/><StatusBadge status={c.status}/></div>
            {c.status === 'rejected' && (
              <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-xs text-red-700"><span className="font-bold">Reason:</span> {c.rejection_reason || 'Not recorded'}</p>
                <button onClick={e => handleRestore(e, c)} disabled={restoringId === c.id} className="mt-2 text-xs font-bold text-navy-700">↶ Undo Rejection</button>
              </div>
            )}
            <p className="text-xs font-bold text-navy-600 mt-3">View complete details →</p>
          </div>
        ))}
      </div>
    </div>
  )
}
