import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useComplaintStore } from '../../store/complaintStore'
import { StatusBadge } from '../../components/ui/Badges'
import { PageLoader, ErrorBanner } from '../../components/ui/Feedback'
import Pagination from '../../components/ui/Pagination'
import AppIcon from '../../components/ui/AppIcon'
import RefreshNotice from '../../components/ui/RefreshNotice'
import SearchField from '../../components/ui/SearchField'
import { useComplaintListRefresh } from '../../hooks/useComplaintRefresh'
import { STATUS_VISUAL_TOKENS } from '../../config/uiTokens'
import { STATUS_LABELS } from '../../config/terminology'
import { readWorkspacePreferences, writeWorkspacePreferences } from '../../lib/workspacePreferences'

function timeAgo(iso) {
  const difference = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(difference / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const STATUS_CONFIG = {
  pending: { bar: 10, color: STATUS_VISUAL_TOKENS.pending, icon: 'clock', label: STATUS_LABELS.pending, message: 'Your complaint is waiting for Commercial Services review.' },
  forwarded: { bar: 25, color: STATUS_VISUAL_TOKENS.forwarded, icon: 'assignment', label: STATUS_LABELS.forwarded, message: 'NSCCCD reviewed your complaint and sent it to WDLCD under ECMD for field work.' },
  assigned: { bar: 35, color: STATUS_VISUAL_TOKENS.assigned, icon: 'assignment', label: STATUS_LABELS.assigned, message: 'Maintenance Personnel has been assigned to your complaint.' },
  en_route: { bar: 75, color: STATUS_VISUAL_TOKENS.en_route, icon: 'tool', label: STATUS_LABELS.en_route, message: 'Maintenance Personnel is working on this complaint.' },
  in_progress: { bar: 75, color: STATUS_VISUAL_TOKENS.in_progress, icon: 'tool', label: STATUS_LABELS.in_progress, message: 'Maintenance Personnel is working on this complaint.' },
  awaiting_verification: { bar: 100, color: STATUS_VISUAL_TOKENS.resolved, icon: 'check', label: STATUS_LABELS.resolved, message: 'Maintenance Personnel completed the field work and resolved the complaint.' },
  resolved: { bar: 100, color: STATUS_VISUAL_TOKENS.resolved, icon: 'check', label: STATUS_LABELS.resolved, message: 'Maintenance Personnel completed the field work and resolved the complaint.' },
  completed: { bar: 100, color: STATUS_VISUAL_TOKENS.completed, icon: 'check', label: STATUS_LABELS.completed, message: 'The complaint has been resolved.' },
  rejected: { bar: 100, color: STATUS_VISUAL_TOKENS.rejected, icon: 'alert', label: STATUS_LABELS.rejected, message: 'This complaint was rejected by the Commercial Services Department.' },
  cancelled: { bar: 100, color: STATUS_VISUAL_TOKENS.cancelled, icon: 'document', label: STATUS_LABELS.cancelled, message: 'You cancelled this complaint before assignment.' },
  blocked: { bar: 75, color: STATUS_VISUAL_TOKENS.blocked, icon: 'alert', label: STATUS_LABELS.blocked, message: 'Maintenance Personnel asked WDLCD for help.' },
}

export default function MyComplaintsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialPreferences = useMemo(() => readWorkspacePreferences('customer_complaints'), [])
  const user = useAuthStore(state => state.user)
  const allComplaints = useComplaintStore(state => state.complaints)
  const complaints = useMemo(() => allComplaints.filter(complaint => complaint.customer_id === user?.id), [allComplaints, user?.id])
  const loading = useComplaintStore(state => state.loading)
  const error = useComplaintStore(state => state.error)
  const fetchComplaints = useComplaintStore(state => state.fetchComplaints)
  const [filter, setFilter] = useState(() => searchParams.get('status') || initialPreferences.status || 'all')
  const [search, setSearch] = useState(() => searchParams.get('q') || initialPreferences.q || '')
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page')) || 1))
  const pageSize = 8

  useEffect(() => { fetchComplaints() }, [fetchComplaints])
  useEffect(() => {
    const next = {}
    if (filter !== 'all') next.status = filter
    if (search.trim()) next.q = search.trim()
    if (page > 1) next.page = String(page)
    setSearchParams(next, { replace: true })
  }, [filter, search, page, setSearchParams])

  useEffect(() => {
    writeWorkspacePreferences('customer_complaints', { status: filter, q: search })
  }, [filter, search])

  const { updatesAvailable, refreshNow } = useComplaintListRefresh(complaints, fetchComplaints)
  const counts = {
    all: complaints.length,
    pending: complaints.filter(complaint => complaint.status === 'pending').length,
    active: complaints.filter(complaint => ['forwarded', 'assigned', 'en_route', 'in_progress', 'blocked'].includes(complaint.status)).length,
    resolved: complaints.filter(complaint => ['awaiting_verification', 'resolved', 'completed'].includes(complaint.status)).length,
    rejected: complaints.filter(complaint => complaint.status === 'rejected').length,
    cancelled: complaints.filter(complaint => complaint.status === 'cancelled').length,
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return complaints.filter(complaint => {
      const matchesStatus = filter === 'all'
        || (filter === 'active' ? ['forwarded', 'assigned', 'en_route', 'in_progress', 'blocked'].includes(complaint.status)
          : filter === 'resolved' ? ['awaiting_verification', 'resolved', 'completed'].includes(complaint.status)
          : complaint.status === filter)
      const matchesSearch = !query || [complaint.reference_number, complaint.complaint_type, complaint.description, complaint.address, complaint.status, complaint.assigned_name, complaint.rejection_reason]
        .some(value => String(value || '').toLowerCase().includes(query))
      return matchesStatus && matchesSearch
    })
  }, [complaints, filter, search])

  const effectivePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)))
  const paged = filtered.slice((effectivePage - 1) * pageSize, effectivePage * pageSize)
  if (loading && complaints.length === 0) return <PageLoader label="Loading your complaints…" />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header page-header">
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-gold-400 text-xs font-bold uppercase tracking-[.15em] mb-1.5">Customer account</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl">My complaints</h1>
            <p className="text-navy-300 text-sm mt-1">View the latest status and full history of each complaint.</p>
          </div>
          <div className="flex items-center gap-4">
            <p className="font-display font-black text-5xl leading-none text-gold-400">{complaints.length}</p>
            <button onClick={() => navigate('/customer/submit')} className="rounded-lg bg-gold-400 hover:bg-gold-300 text-navy-900 font-black px-4 py-2.5 text-sm shadow-sm">Submit a complaint</button>
          </div>
        </div>
      </div>

      {error && complaints.length === 0 ? <ErrorBanner message={error} onRetry={fetchComplaints} /> : null}
      <RefreshNotice visible={updatesAvailable} onRefresh={refreshNow} />

      {complaints.length > 0 ? (
        <div className="qol-filter-bar card rounded-xl p-4 space-y-3">
          <div><p className="mb-1.5 text-xs font-bold text-gray-600">Search</p><SearchField value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} onClear={() => { setSearch(''); setPage(1) }} placeholder="Reference, complaint type, description, address, or status" /></div>
          <div className="flex gap-2 flex-wrap">
            {[['all', 'All'], ['pending', STATUS_LABELS.pending], ['active', 'Active'], ['resolved', STATUS_LABELS.resolved], ['rejected', STATUS_LABELS.rejected], ['cancelled', STATUS_LABELS.cancelled]].map(([value, label]) => (
              <button key={value} onClick={() => { setFilter(value); setPage(1) }} aria-pressed={filter === value} className={`filter-chip rounded-full px-4 py-2 text-sm font-semibold ${filter === value ? 'bg-navy-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {label} <span className="ml-1 font-bold">{counts[value]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {complaints.length === 0 ? (
        <div className="card rounded-xl p-16 text-center">
          <AppIcon name="clipboard" className="w-14 h-14 mx-auto mb-4 text-navy-300" />
          <h2 className="font-display font-bold text-navy-800 text-xl">No complaints yet</h2>
          <p className="text-sm text-gray-500 mt-2 mb-5">Once you submit a complaint, its status and updates will appear here.</p>
          <button onClick={() => navigate('/customer/submit')} className="btn-primary rounded-lg">Submit a complaint</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card rounded-xl p-10 text-center text-gray-500">No complaints match your search or selected status.</div>
      ) : (
        <section aria-label="Customer complaint tracker" className="space-y-3">
          <div className="card rounded-xl px-4 py-4 sm:px-5">
            <h2 className="font-display font-black text-navy-900">Complaint tracker</h2>
            <p className="mt-0.5 text-xs text-gray-500">Each complaint shows its current status and progress in one row.</p>
          </div>

          {paged.map(complaint => {
            const config = STATUS_CONFIG[complaint.status] || STATUS_CONFIG.pending
            const isResolved = ['resolved', 'completed'].includes(complaint.status)
            return (
              <article key={complaint.id} className="qol-clickable-row card overflow-hidden rounded-xl">
                <div className="h-1 bg-navy-700" aria-hidden="true" />
                <div className="grid min-w-0 gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2 lg:block">
                      <div><h3 className="break-words font-display text-base font-black text-navy-900">{complaint.complaint_type}</h3><p className="mt-1 font-mono text-xs font-bold text-gray-500">{complaint.reference_number}</p></div>
                      <span className="shrink-0 text-xs font-bold text-gray-500 lg:mt-2 lg:inline-block">Updated {timeAgo(complaint.updated_at || complaint.created_at)}</span>
                    </div>
                    <p className="mt-3 line-clamp-2 break-words text-sm leading-6 text-gray-600">{complaint.description}</p>
                    <p className="mt-2 flex min-w-0 items-start gap-1.5 text-xs text-gray-500"><AppIcon name="location" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="break-words">{complaint.address || 'No address recorded'}</span></p>
                  </div>

                  <div className="min-w-0 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><StatusBadge status={complaint.status} /><span className="text-xs font-black text-gray-600">{config.bar}%</span></div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-label={`${config.label} progress`} aria-valuenow={config.bar} aria-valuemin="0" aria-valuemax="100"><div className="h-full" style={{ width: `${config.bar}%`, background: config.color }} /></div>
                    <p className="mt-2 text-xs leading-5 text-gray-600">{config.message}</p>
                    {complaint.status === 'rejected' ? <p className="mt-2 text-xs leading-5 text-red-700"><span className="font-black">Reason: </span>{complaint.rejection_reason || 'No reason was recorded.'}</p> : null}
                  </div>

                  <button type="button" onClick={() => navigate(`/complaints/${complaint.id}`)} className="btn-primary w-full rounded-lg whitespace-nowrap lg:w-auto">
                    {isResolved ? 'Review resolution' : 'View timeline'}
                  </button>
                </div>
              </article>
            )
          })}

          <div className="card rounded-xl p-4"><Pagination page={effectivePage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} label="complaints" embedded /></div>
        </section>
      )}
    </div>
  )
}
