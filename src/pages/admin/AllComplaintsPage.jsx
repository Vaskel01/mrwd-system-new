import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useComplaintStore } from '../../store/complaintStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { PageLoader, ErrorBanner } from '../../components/ui/Feedback'
import Pagination from '../../components/ui/Pagination'
import AppIcon from '../../components/ui/AppIcon'
import RefreshNotice from '../../components/ui/RefreshNotice'
import SearchField from '../../components/ui/SearchField'
import { useComplaintListRefresh } from '../../hooks/useComplaintRefresh'
import SavedViewsBar from '../../components/ui/SavedViewsBar'
import { useProductionStore } from '../../store/productionStore'

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

const TABLE_ACTION_CLASS = 'inline-flex max-w-full items-center justify-center whitespace-nowrap rounded-lg bg-navy-800 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-navy-900 disabled:opacity-50'

export default function AllComplaintsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const complaints = useComplaintStore(s => s.complaints)
  const loading = useComplaintStore(s => s.loading)
  const error = useComplaintStore(s => s.error)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)
  const bulkAction = useProductionStore(s => s.bulkAction)
  const [selected, setSelected] = useState([])
  const [bulkChoice, setBulkChoice] = useState('forward_to_ecmd')
  const [bulkPriority, setBulkPriority] = useState('medium')
  const [bulkReason, setBulkReason] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMessage, setBulkMessage] = useState('')
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get('status') || 'pending')
  const [filterPriority, setFilterPriority] = useState(() => searchParams.get('priority') || 'all')
  const [search, setSearch] = useState(() => searchParams.get('q') || '')
  const [sortBy, setSortBy] = useState(() => {
    const storedSort = searchParams.get('sort')
    return storedSort === 'priority_date' ? 'priority_oldest' : storedSort || 'priority_oldest'
  })
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page')) || 1))
  const pageSize = 12

  useEffect(() => { fetchComplaints() }, [fetchComplaints])
  useEffect(() => {
    const next = {}
    if (filterStatus !== 'pending') next.status = filterStatus
    if (filterPriority !== 'all') next.priority = filterPriority
    if (search.trim()) next.q = search.trim()
    if (sortBy !== 'priority_oldest') next.sort = sortBy
    if (page > 1) next.page = String(page)
    setSearchParams(next, { replace: true })
  }, [filterStatus, filterPriority, search, sortBy, page, setSearchParams])

  const { updatesAvailable, refreshNow } = useComplaintListRefresh(complaints, fetchComplaints)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return complaints
      .filter(c => filterStatus === 'all' ||
        (filterStatus === 'in_progress' ? ['en_route', 'in_progress'].includes(c.status) : c.status === filterStatus))
      .filter(c => filterPriority === 'all' || c.priority === filterPriority)
      .filter(c => !query || [
        c.reference_number, c.complaint_type, c.description, c.customer_name,
        c.address, c.assigned_name, c.status, c.rejection_reason,
      ].some(value => String(value || '').toLowerCase().includes(query)))
      .sort((a, b) => sortBy === 'priority_oldest'
        ? PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || new Date(a.created_at) - new Date(b.created_at)
        : sortBy === 'score'
        ? b.priority_score - a.priority_score || new Date(b.created_at) - new Date(a.created_at)
        : sortBy === 'priority'
          ? PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.priority_score - a.priority_score
          : sortBy === 'type'
            ? a.complaint_type.localeCompare(b.complaint_type) || b.priority_score - a.priority_score
            : sortBy === 'oldest'
              ? new Date(a.created_at) - new Date(b.created_at)
              : new Date(b.created_at) - new Date(a.created_at))
  }, [complaints, filterStatus, filterPriority, search, sortBy])

  const applySavedView = view => { setFilterStatus(view.status || 'pending'); setFilterPriority(view.priority || 'all'); setSearch(view.q || ''); setSortBy(view.sort || 'priority_oldest'); setPage(1) }
  const toggleSelected = id => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  const runBulk = async () => {
    if (!selected.length) return
    if (['priority','request_archive'].includes(bulkChoice) && bulkReason.trim().length < 3) return setBulkMessage('Enter a reason for this bulk action.')
    setBulkBusy(true); setBulkMessage('')
    try {
      const extra = bulkChoice === 'priority' ? { priority: bulkPriority, reason: bulkReason } : bulkChoice === 'request_archive' ? { reason: bulkReason } : bulkChoice === 'forward_to_ecmd' ? { handoff_note: bulkReason || undefined } : {}
      const result = await bulkAction(selected, bulkChoice, extra)
      const rows = result.results || []
      const succeeded = rows.filter(row => row.ok)
      const failed = rows.filter(row => !row.ok)
      setBulkMessage(failed.length ? `${succeeded.length} updated; ${failed.length} skipped. ${failed[0]?.error || ''}` : `${succeeded.length} complaint(s) updated.`)
      setSelected(failed.map(row => row.id))
      if (!failed.length) setBulkReason('')
      await fetchComplaints()
    } catch (err) { setBulkMessage(err.message) } finally { setBulkBusy(false) }
  }

  const effectivePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)))
  const paged = filtered.slice((effectivePage - 1) * pageSize, effectivePage * pageSize)
  if (loading && complaints.length === 0) return <PageLoader label="Loading complaints..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl overflow-hidden px-4 sm:px-6 py-5 sm:py-6 relative">
        <div className="relative flex items-end justify-between">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Commercial Services Department</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl">Complaint Review</h1>
          </div>
          <div className="text-right">
            <p className="font-display font-black text-5xl leading-none" style={{ color: '#e6b020' }}>{filtered.length}</p>
            <p className="text-navy-300 text-[11px] uppercase tracking-wider">shown / {complaints.length}</p>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchComplaints} />}
      <RefreshNotice visible={updatesAvailable} onRefresh={refreshNow} label="Complaint records changed since this page was loaded." />
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <AppIcon name="search" className="mt-0.5 h-5 w-5 shrink-0 text-navy-700" />
          <div>
            <p className="font-display font-bold text-navy-900">Records and review</p>
            <p className="mt-1 text-sm text-gray-600">Use this page to verify complaint information, review classification results, and complete Commercial Services Department actions. ECMD handles dispatch and field work on its separate pages.</p>
          </div>
        </div>
      </div>

      <SavedViewsBar moduleKey="commercial_complaints" filters={{ status: filterStatus, priority: filterPriority, q: search, sort: sortBy }} onApply={applySavedView} />

      <div className="qol-filter-bar card rounded-xl p-4 space-y-3">
        <SearchField value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} onClear={() => { setSearch(''); setPage(1) }} placeholder="Search reference, complaint type, customer, address, status or Maintenance Personnel…" />
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2 lg:grid-cols-4">
          <select name="allcomplaintspage-filter-priority-2" aria-label="Filter Priority" value={filterPriority} onChange={e => { setFilterPriority(e.target.value); setPage(1) }} className="input-field rounded-lg text-sm">
            <option value="all">Any Priority</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
          <select name="allcomplaintspage-filter-status-3" aria-label="Filter Status" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }} className="input-field rounded-lg text-sm">
            <option value="all">Any Status</option>
            <option value="pending">Pending Review</option>
            <option value="forwarded">Forwarded to ECMD</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="blocked">Needs Attention</option>
            <option value="awaiting_verification">Awaiting ECMD Verification</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
            <option value="merged">Merged</option>
          </select>
          <select name="allcomplaintspage-sort-by-4" aria-label="Sort By" value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1) }} className="input-field rounded-lg text-sm">
            <option value="priority_oldest">Priority, Oldest First</option>
            <option value="score">Highest Score</option>
            <option value="priority">Priority, Highest Score</option>
            <option value="type">Complaint Type A–Z</option>
            <option value="date">Newest Submitted</option>
            <option value="oldest">Oldest Submitted</option>
          </select>
          <button type="button" onClick={() => { setFilterStatus('pending'); setFilterPriority('all'); setSearch(''); setSortBy('priority_oldest'); setPage(1) }} className="btn-secondary rounded-lg text-sm">Clear Filters</button>
        </div>
      </div>

      {selected.length > 0 && <div className="card rounded-xl border-2 border-navy-200 bg-navy-50/40 p-4"><div className="flex flex-wrap items-center gap-3"><p className="text-sm font-black text-navy-900">{selected.length} selected</p><select value={bulkChoice} onChange={e => setBulkChoice(e.target.value)} className="input-field min-h-9 w-auto rounded-lg py-1.5 text-xs"><option value="forward_to_ecmd">Forward to ECMD</option><option value="priority">Change Priority</option><option value="watch">Add to Watchlist</option><option value="request_archive">Request Archive</option></select>{bulkChoice === 'priority' && <select value={bulkPriority} onChange={e => setBulkPriority(e.target.value)} className="input-field min-h-9 w-auto rounded-lg py-1.5 text-xs"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>}{['forward_to_ecmd','priority','request_archive'].includes(bulkChoice) && <input value={bulkReason} onChange={e => setBulkReason(e.target.value)} className="input-field min-h-9 min-w-[220px] flex-1 rounded-lg py-1.5 text-xs" placeholder={bulkChoice === 'forward_to_ecmd' ? 'Optional handoff note…' : 'Reason required…'}/>}<button type="button" disabled={bulkBusy} onClick={runBulk} className="btn-primary min-h-9 rounded-lg py-1.5 text-xs">{bulkBusy?'Applying…':'Apply'}</button><button type="button" onClick={() => setSelected([])} className="btn-secondary min-h-9 rounded-lg py-1.5 text-xs">Clear Selection</button></div>{bulkMessage&&<p className="mt-2 text-xs font-bold text-navy-700">{bulkMessage}</p>}</div>}

      <div className="hidden xl:block card rounded-xl overflow-hidden p-2">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[31%]" />
            <col className="w-[13%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[9%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead><tr className="border-b-2 border-gray-200 bg-gray-50 text-left">
            {['Complaint', 'Customer', 'Priority', 'Status', 'Assigned', 'Submitted', 'Action'].map(h => <th key={h} className="px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? <tr><td colSpan={7} className="p-12 text-center text-gray-400">No complaints match your search and filters.</td></tr> : paged.map(c => (
              <tr key={c.id} onClick={() => navigate(`/complaints/${c.id}`)} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') navigate(`/complaints/${c.id}`) }} className={`qol-clickable-row hover:bg-gray-50 border-l-4 ${PRIORITY_STRIPE[c.priority]} ${c.priority === 'high' && c.status === 'pending' ? 'bg-red-50/60' : ''}`}>
                <td className="px-4 py-3">
                  <div className="mb-2 flex items-center gap-2"><input type="checkbox" checked={selected.includes(c.id)} onClick={event => event.stopPropagation()} onChange={() => toggleSelected(c.id)} aria-label={`Select ${c.reference_number}`} className="h-4 w-4 accent-navy-800"/><span className="text-[10px] font-black uppercase text-gray-400">Select</span></div>
                  <p className="font-bold text-gray-900 break-words">{c.complaint_type}</p>
                  <p className="text-xs text-gray-400 line-clamp-2 break-words">{c.description}</p>
                  <p className="text-[10px] text-gray-500 font-mono font-bold mt-1 break-all">{c.reference_number}</p>
                  {c.status === 'rejected' && <p className="text-xs text-red-600 mt-1 break-words"><span className="font-bold">Reason:</span> {c.rejection_reason || 'Not recorded'}</p>}
                </td>
                <td className="px-4 py-3 text-gray-700 break-words">{c.customer_name}</td>
                <td className="px-4 py-3"><PriorityBadge priority={c.priority} /></td>
                <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                <td className="px-4 py-3 text-gray-500"><p className="break-words">{c.assigned_name || '—'}</p>{c.assigned_at && <p className="text-[10px] text-gray-400 mt-1">{new Date(c.assigned_at).toLocaleDateString('en-PH')}</p>}</td>
                <td className="px-4 py-3 text-gray-400 text-xs break-words">{timeAgo(c.created_at)}</td>
                <td className="px-4 py-3 pr-5">
                  <button onClick={event => { event.stopPropagation(); navigate(`/complaints/${c.id}`) }} className={TABLE_ACTION_CLASS}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="xl:hidden space-y-3">
        {filtered.length === 0 ? <div className="card rounded-xl p-10 text-center text-gray-400">No complaints match your search and filters.</div> : paged.map(c => (
          <div key={c.id} onClick={() => navigate(`/complaints/${c.id}`)} className={`card rounded-xl p-4 border-l-4 ${PRIORITY_STRIPE[c.priority]} cursor-pointer`}>
            <div className="mb-2 flex items-center gap-2"><input type="checkbox" checked={selected.includes(c.id)} onClick={event => event.stopPropagation()} onChange={() => toggleSelected(c.id)} className="h-4 w-4 accent-navy-800"/><span className="text-[10px] font-black uppercase text-gray-400">Select for bulk action</span></div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-gray-900">{c.complaint_type}</p>
                <p className="text-[10px] text-gray-500 font-mono font-bold mt-1">{c.reference_number}</p>
                <p className="text-xs text-gray-500 mt-1">{c.customer_name} · {timeAgo(c.created_at)}</p>
                <p className="text-xs text-gray-400 line-clamp-2 break-words mt-1 inline-flex items-center gap-1"><AppIcon name="location" className="w-3.5 h-3.5" />{c.address}</p>
              </div>
              <span className="font-display font-black text-2xl text-navy-800" aria-label={`Priority score ${c.priority_score} out of 100`}>{c.priority_score}</span>
            </div>
            <div className="flex items-center gap-2 mt-3"><PriorityBadge priority={c.priority}/><StatusBadge status={c.status}/></div>
            {c.status === 'rejected' && (
              <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-xs text-red-700"><span className="font-bold">Reason:</span> {c.rejection_reason || 'Not recorded'}</p>
              </div>
            )}
            <p className="text-xs font-bold text-navy-600 mt-3">View complete details →</p>
          </div>
        ))}
      </div>

      <Pagination page={effectivePage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} label="complaints" />
    </div>
  )
}
