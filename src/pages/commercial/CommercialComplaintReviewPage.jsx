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
import BulkActionBar from '../../components/ui/BulkActionBar'
import { PRIORITY_LABELS, STATUS_LABELS } from '../../config/terminology'
import BulkActionPreviewDialog from '../../components/ui/BulkActionPreviewDialog'
import ComplaintFocusPanel from '../../components/ui/ComplaintFocusPanel'
import { readWorkspacePreferences, writeWorkspacePreferences } from '../../lib/workspacePreferences'

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

export default function CommercialComplaintReviewPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialPreferences = useMemo(() => readWorkspacePreferences('commercial_complaints'), [])
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
  const [bulkPreviewOpen, setBulkPreviewOpen] = useState(false)
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get('status') || initialPreferences.status || 'pending')
  const [filterPriority, setFilterPriority] = useState(() => searchParams.get('priority') || initialPreferences.priority || 'all')
  const [search, setSearch] = useState(() => searchParams.get('q') || initialPreferences.q || '')
  const [sortBy, setSortBy] = useState(() => {
    const storedSort = searchParams.get('sort') || initialPreferences.sort
    return storedSort === 'priority_date' ? 'priority_oldest' : storedSort || 'priority_oldest'
  })
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page')) || 1))
  const [focusedId, setFocusedId] = useState(() => searchParams.get('focus') || '')
  const pageSize = 10

  useEffect(() => { fetchComplaints() }, [fetchComplaints])
  useEffect(() => {
    const next = {}
    if (filterStatus !== 'pending') next.status = filterStatus
    if (filterPriority !== 'all') next.priority = filterPriority
    if (search.trim()) next.q = search.trim()
    if (sortBy !== 'priority_oldest') next.sort = sortBy
    if (page > 1) next.page = String(page)
    if (focusedId) next.focus = focusedId
    setSearchParams(next, { replace: true })
  }, [filterStatus, filterPriority, search, sortBy, page, focusedId, setSearchParams])

  useEffect(() => {
    writeWorkspacePreferences('commercial_complaints', { status: filterStatus, priority: filterPriority, q: search, sort: sortBy })
  }, [filterStatus, filterPriority, search, sortBy])

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

  const applySavedView = view => { setFilterStatus(view.status || 'pending'); setFilterPriority(view.priority || 'all'); setSearch(view.q || ''); setSortBy(view.sort || 'priority_oldest'); setPage(1); setFocusedId('') }
  const toggleSelected = id => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  const previewBulk = () => {
    if (!selected.length) return
    if (['priority','request_archive'].includes(bulkChoice) && bulkReason.trim().length < 3) {
      setBulkMessage('Enter a reason for this bulk action.')
      return
    }
    setBulkMessage('')
    setBulkPreviewOpen(true)
  }
  const runBulk = async () => {
    if (!selected.length) return
    setBulkBusy(true); setBulkMessage('')
    try {
      const extra = bulkChoice === 'priority' ? { priority: bulkPriority, reason: bulkReason } : bulkChoice === 'request_archive' ? { reason: bulkReason } : bulkChoice === 'forward_to_ecmd' ? { handoff_note: bulkReason || undefined } : {}
      const result = await bulkAction(selected, bulkChoice, extra)
      const rows = result.results || []
      const succeeded = rows.filter(row => row.ok)
      const failed = rows.filter(row => !row.ok)
      setBulkMessage(failed.length ? `${succeeded.length} updated; ${failed.length} skipped. ${failed[0]?.error || ''}` : `${succeeded.length} complaint${succeeded.length === 1 ? '' : 's'} updated.`)
      setSelected(failed.map(row => row.id))
      if (!failed.length) setBulkReason('')
      await fetchComplaints()
      setBulkPreviewOpen(false)
    } catch (err) { setBulkMessage(err.message); setBulkPreviewOpen(false) } finally { setBulkBusy(false) }
  }

  const effectivePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)))
  const paged = filtered.slice((effectivePage - 1) * pageSize, effectivePage * pageSize)
  const focusedComplaint = paged.find(complaint => complaint.id === focusedId) || paged[0] || null
  const selectedComplaints = complaints.filter(complaint => selected.includes(complaint.id))
  const allPageSelected = paged.length > 0 && paged.every(complaint => selected.includes(complaint.id))
  const bulkActionLabel = {
    forward_to_ecmd: 'Send to WDLCD',
    priority: `Change priority to ${PRIORITY_LABELS[bulkPriority]}`,
    watch: 'Add to watchlist',
    request_archive: 'Request archive',
  }[bulkChoice]
  const bulkActionDescription = bulkChoice === 'forward_to_ecmd'
    ? 'The selected complaints will leave the Commercial Services review queue and become available for WDLCD dispatch.'
    : bulkChoice === 'priority'
      ? `The selected complaints will use ${PRIORITY_LABELS[bulkPriority]} priority. The recorded reason will remain in the activity history.`
      : bulkChoice === 'request_archive'
        ? 'A System Supervisor will need to review the archive request before records are archived.'
        : 'The selected complaints will be added to your personal watchlist.'
  const bulkWarning = bulkChoice === 'forward_to_ecmd'
    ? 'Confirm that every selected complaint contains field work and has enough location detail for dispatch.'
    : bulkChoice === 'priority'
      ? 'Apply one priority only when the same reason is valid for every selected complaint.'
      : ''

  const togglePageSelection = () => {
    const pageIds = paged.map(complaint => complaint.id)
    setSelected(current => allPageSelected
      ? current.filter(id => !pageIds.includes(id))
      : [...new Set([...current, ...pageIds])])
  }
  if (loading && complaints.length === 0) return <PageLoader label="Loading complaints..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header page-header">
        <div className="relative flex items-end justify-between">
          <div>
            <p className="text-gold-400 text-xs font-bold uppercase tracking-[.15em] mb-1.5">Commercial Services Department</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl">Review complaints</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-navy-300">Check new complaints, confirm the details and priority, then send field-related complaints to WDLCD.</p>
          </div>
          <div className="text-right">
            <p className="font-display text-5xl font-black leading-none text-gold-400">{filtered.length}</p>
            <p className="text-navy-300 text-xs uppercase tracking-wider">matching · {complaints.length} total</p>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchComplaints} />}
      <RefreshNotice visible={updatesAvailable} onRefresh={refreshNow} label="Complaint records changed since this page was loaded." />
      <SavedViewsBar moduleKey="commercial_complaints" filters={{ status: filterStatus, priority: filterPriority, q: search, sort: sortBy }} onApply={applySavedView} />

      <div className="qol-filter-bar card rounded-xl p-4 sm:p-5">
        <div className="mb-4">
          <h2 className="font-display text-sm font-black text-navy-900">Find complaints</h2>
          <p className="mt-1 text-xs leading-5 text-gray-500">Search by complaint details, then narrow the list by priority or status.</p>
        </div>
        <SearchField value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} onClear={() => { setSearch(''); setPage(1) }} placeholder="Reference, complaint type, customer, address, or assigned personnel" />
        <div className="mt-3 grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 lg:grid-cols-4 lg:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-gray-600">Priority</span>
            <select name="allcomplaintspage-filter-priority-2" value={filterPriority} onChange={e => { setFilterPriority(e.target.value); setPage(1) }} className="input-field rounded-lg text-sm">
              <option value="all">All priorities</option>
              {['high', 'medium', 'low'].map(priority => <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-gray-600">Status</span>
            <select name="allcomplaintspage-filter-status-3" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }} className="input-field rounded-lg text-sm">
              <option value="all">All statuses</option>
              {['pending', 'forwarded', 'assigned', 'in_progress', 'blocked', 'awaiting_verification', 'resolved', 'rejected', 'cancelled', 'merged'].map(status => (
                <option key={status} value={status}>{STATUS_LABELS[status]}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-gray-600">Sort</span>
            <select name="allcomplaintspage-sort-by-4" value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1) }} className="input-field rounded-lg text-sm">
              <option value="priority_oldest">Priority, then oldest</option>
              <option value="score">Highest priority score</option>
              <option value="priority">Priority, then score</option>
              <option value="type">Complaint type A–Z</option>
              <option value="date">Newest submitted</option>
              <option value="oldest">Oldest submitted</option>
            </select>
          </label>
          <button type="button" onClick={() => { setFilterStatus('pending'); setFilterPriority('all'); setSearch(''); setSortBy('priority_oldest'); setPage(1) }} className="btn-secondary filter-action rounded-lg text-sm">Clear filters</button>
        </div>
      </div>

      <BulkActionBar count={selected.length} message={bulkMessage} onClear={() => setSelected([])}>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-gray-600">Action</span>
          <select value={bulkChoice} onChange={e => setBulkChoice(e.target.value)} className="input-field rounded-lg text-sm">
            <option value="forward_to_ecmd">Send to WDLCD</option>
            <option value="priority">Change priority</option>
            <option value="watch">Add to watchlist</option>
            <option value="request_archive">Request archive</option>
          </select>
        </label>
        {bulkChoice === 'priority' ? (
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-gray-600">New priority</span>
            <select value={bulkPriority} onChange={e => setBulkPriority(e.target.value)} className="input-field rounded-lg text-sm">
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label>
        ) : null}
        {['forward_to_ecmd','priority','request_archive'].includes(bulkChoice) ? (
          <label className="block sm:col-span-2 xl:col-span-1">
            <span className="mb-1.5 block text-xs font-bold text-gray-600">{bulkChoice === 'forward_to_ecmd' ? 'Handoff note' : 'Reason'}</span>
            <input value={bulkReason} onChange={e => setBulkReason(e.target.value)} className="input-field rounded-lg text-sm" placeholder={bulkChoice === 'forward_to_ecmd' ? 'Optional note for WDLCD' : 'Required reason'} />
          </label>
        ) : null}
        <button type="button" disabled={bulkBusy} onClick={previewBulk} className="btn-primary rounded-lg disabled:opacity-50">Review action</button>
      </BulkActionBar>

      {bulkMessage && !selected.length ? <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900" role="status">{bulkMessage}</div> : null}

      <section className="card overflow-hidden rounded-xl" aria-label="Complaint review workspace">
        <div className="grid min-w-0 xl:grid-cols-[minmax(340px,0.86fr)_minmax(430px,1.14fr)]">
          <div className="min-w-0 border-b border-gray-100 xl:border-b-0 xl:border-r">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-5">
              <div>
                <h2 className="font-display font-black text-navy-900">Review queue</h2>
                <p className="mt-0.5 text-xs text-gray-500">Select an item to review it without leaving the queue.</p>
              </div>
              <button type="button" onClick={togglePageSelection} disabled={!paged.length} className="btn-secondary rounded-lg px-3 py-2 text-xs disabled:opacity-50">{allPageSelected ? 'Clear page' : 'Select page'}</button>
            </div>

            <div className="focus-queue-list divide-y divide-gray-100">
              {paged.map(c => (
                <article key={c.id} className={`focus-queue-row border-l-4 ${PRIORITY_STRIPE[c.priority]}`} data-active={focusedComplaint?.id === c.id}>
                  <div className="flex items-start gap-3 p-4">
                    <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelected(c.id)} aria-label={`Select ${c.reference_number}`} className="mt-1 h-4 w-4 shrink-0 accent-navy-800" />
                    <button type="button" onClick={() => setFocusedId(c.id)} className="min-w-0 flex-1 text-left" aria-current={focusedComplaint?.id === c.id ? 'true' : undefined}>
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0"><p className="break-words text-sm font-black text-gray-900">{c.complaint_type}</p><p className="mt-1 font-mono text-xs font-bold text-gray-500">{c.reference_number}</p></div>
                        <span className="shrink-0 font-display text-lg font-black text-navy-800" aria-label={`Priority score ${c.priority_score} out of 100`}>{c.priority_score}</span>
                      </div>
                      <p className="mt-2 line-clamp-1 break-words text-xs font-bold text-gray-700">{c.customer_name || 'Customer'}</p>
                      <p className="mt-1 flex min-w-0 items-start gap-1 text-xs text-gray-500"><AppIcon name="location" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="line-clamp-2 break-words">{c.address || 'No address recorded'}</span></p>
                      <div className="mt-3 flex flex-wrap items-center gap-2"><PriorityBadge priority={c.priority} /><StatusBadge status={c.status} /><span className="text-xs font-bold text-gray-500">{timeAgo(c.created_at)}</span></div>
                    </button>
                  </div>
                </article>
              ))}
              {!paged.length ? <div className="px-5 py-14 text-center"><p className="text-sm font-bold text-gray-600">No complaints match this view.</p><p className="mt-1 text-xs text-gray-500">Clear the filters or choose another saved view.</p></div> : null}
            </div>

            <div className="border-t border-gray-100 p-4">
              <Pagination page={effectivePage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} label="complaints" embedded />
            </div>
          </div>

          <ComplaintFocusPanel
            complaint={focusedComplaint}
            mode="commercial"
            onOpen={complaint => navigate(`/complaints/${complaint.id}`)}
            primaryAction={focusedComplaint?.status === 'pending' ? {
              label: 'Send to WDLCD',
              onClick: () => { setSelected([focusedComplaint.id]); setBulkChoice('forward_to_ecmd'); setBulkReason(''); setBulkPreviewOpen(true) },
            } : null}
          />
        </div>
      </section>

      <BulkActionPreviewDialog
        open={bulkPreviewOpen}
        title="Review Commercial Services action"
        actionLabel={bulkActionLabel}
        description={bulkActionDescription}
        complaints={selectedComplaints}
        warning={bulkWarning}
        loading={bulkBusy}
        onConfirm={runBulk}
        onCancel={() => !bulkBusy && setBulkPreviewOpen(false)}
      />
    </div>
  )
}
