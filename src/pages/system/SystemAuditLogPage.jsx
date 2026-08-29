import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import Pagination from '../../components/ui/Pagination'
import SearchField from '../../components/ui/SearchField'
import ScheduledReportsPanel from '../../components/ui/ScheduledReportsPanel'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const DETAIL_LABELS = {
  assigned_to: 'Assigned to',
  previous_assignee: 'Previous assignee',
  notes: 'Assignment notes',
  reason: 'Reason',
  complaint_type: 'Complaint type',
  complaint_ids: 'Complaints affected',
  status: 'New status',
  rating: 'Customer rating',
  updated: 'Successfully classified',
  failed: 'Failed classifications',
  role: 'Staff role',
  email: 'Email address',
  availability_status: 'Availability status',
  resolution_notes: 'Resolution notes',
  materials_used: 'Materials used',
  previous_status: 'Previous status',
  new_status: 'New status',
  previous_score: 'Previous score',
  previous_priority: 'Previous priority',
  previous_was_overridden: 'Previous override active',
  algorithm_score: 'Suggested priority score',
  new_score: 'New priority score',
  new_priority: 'New priority',
}

const PROFILE_DETAIL_KEYS = new Set([
  'assigned_to',
  'previous_assignee',
  'assigned_staff_id',
  'staff_id',
  'user_id',
])

function formatDate(value) {
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function label(value) {
  return String(value || '')
    .replaceAll('.', ' › ')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
}

function actionSeverity(action = '') {
  if (/(deleted|deactivated|priority_overridden|rejected|cancelled|password_changed)/i.test(action)) return 'high'
  if (/(reassigned|restored|blocked|unable|reset_requested|updated)/i.test(action)) return 'review'
  return 'routine'
}

function actionClass(action) {
  const severity = actionSeverity(action)
  if (severity === 'high') return 'border border-red-200 bg-red-50 text-red-700'
  if (severity === 'review') return 'border border-amber-200 bg-amber-50 text-amber-800'
  return 'border border-navy-100 bg-navy-50 text-navy-700'
}

function detailLabel(key) {
  return DETAIL_LABELS[key] || label(key)
}

function normalizeDetails(details) {
  if (!details) return {}
  if (typeof details === 'object' && !Array.isArray(details)) return details
  if (typeof details !== 'string') return { value: details }

  try {
    const parsed = JSON.parse(details)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : { value: parsed }
  } catch {
    return { value: details }
  }
}

function shortId(value) {
  const text = String(value)
  return `${text.slice(0, 8)}…${text.slice(-4)}`
}

function readableStatus(value) {
  return label(String(value || '').replaceAll('-', '_'))
}

function ProfileValue({ profileId, profileDirectory }) {
  const profile = profileDirectory[profileId]

  if (!profile) {
    return (
      <span className="font-mono text-[11px] text-gray-500" title={profileId}>
        {shortId(profileId)}
      </span>
    )
  }

  return (
    <span>
      <span className="font-bold text-gray-800">{profile.full_name || profile.email || 'Unknown staff member'}</span>
      {profile.email && profile.full_name && (
        <span className="block text-[11px] text-gray-500 mt-0.5">{profile.email}</span>
      )}
    </span>
  )
}

function DetailValue({ detailKey, value, profileDirectory }) {
  if (PROFILE_DETAIL_KEYS.has(detailKey) && typeof value === 'string' && UUID_PATTERN.test(value)) {
    return <ProfileValue profileId={value} profileDirectory={profileDirectory} />
  }

  if (Array.isArray(value)) {
    if (detailKey === 'complaint_ids') {
      return (
        <div>
          <span className="font-bold text-gray-800">
            {value.length} complaint{value.length === 1 ? '' : 's'}
          </span>
          {value.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {value.slice(0, 4).map(item => (
                <span
                  key={String(item)}
                  className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500"
                  title={String(item)}
                >
                  {UUID_PATTERN.test(String(item)) ? shortId(item) : String(item)}
                </span>
              ))}
              {value.length > 4 && (
                <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-bold text-gray-500">
                  +{value.length - 4} more
                </span>
              )}
            </div>
          )}
        </div>
      )
    }

    return <span className="text-gray-700">{value.map(item => String(item)).join(', ')}</span>
  }

  if (value && typeof value === 'object') {
    return (
      <div className="space-y-1">
        {Object.entries(value).map(([nestedKey, nestedValue]) => (
          <p key={nestedKey}>
            <span className="font-bold text-gray-600">{detailLabel(nestedKey)}:</span>{' '}
            <span className="text-gray-700">{String(nestedValue)}</span>
          </p>
        ))}
      </div>
    )
  }

  if (typeof value === 'boolean') {
    return <span className="font-semibold text-gray-700">{value ? 'Yes' : 'No'}</span>
  }

  if (detailKey === 'rating' && Number.isFinite(Number(value))) {
    return <span className="font-bold text-gold-600">{'★'.repeat(Number(value))} {value}/5</span>
  }

  if (detailKey.includes('status') || detailKey === 'role') {
    return <span className="font-semibold text-gray-700">{readableStatus(value)}</span>
  }

  if (typeof value === 'string' && UUID_PATTERN.test(value)) {
    return (
      <span className="font-mono text-[11px] text-gray-500" title={value}>
        {shortId(value)}
      </span>
    )
  }

  return <span className="text-gray-700">{String(value)}</span>
}

function DetailsCell({ details, profileDirectory }) {
  const entries = Object.entries(normalizeDetails(details)).filter(([, value]) => {
    if (value === null || value === undefined || value === '') return false
    if (Array.isArray(value) && value.length === 0) return false
    return true
  })

  if (entries.length === 0) {
    return <span className="text-gray-500">No additional details</span>
  }

  return (
    <dl className="min-w-0 space-y-2">
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-1 sm:grid-cols-[112px_minmax(0,1fr)] gap-1 sm:gap-2 items-start">
          <dt className="font-bold text-gray-500 leading-5">{detailLabel(key)}</dt>
          <dd className="min-w-0 leading-5 break-words">
            <DetailValue detailKey={key} value={value} profileDirectory={profileDirectory} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function SystemAuditLogPage() {
  const [logs, setLogs] = useState([])
  const [profileDirectory, setProfileDirectory] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [mode, setMode] = useState('audit')
  const [actorFilter, setActorFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [securityEvents, setSecurityEvents] = useState([])
  const [securityTotal, setSecurityTotal] = useState(0)
  const [eventType, setEventType] = useState('')
  const [eventSuccess, setEventSuccess] = useState('all')
  const pageSize = 25

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) })
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      if (mode === 'security') {
        if (actorFilter.trim()) params.set('actor', actorFilter.trim())
        if (eventType.trim()) params.set('event_type', eventType.trim())
        if (eventSuccess !== 'all') params.set('success', eventSuccess)
        const response = await apiFetch(`/production/security-events?${params}`)
        setSecurityEvents(response.events || [])
        setSecurityTotal(response.pagination?.total || 0)
      } else {
        if (actorFilter.trim()) params.set('actor', actorFilter.trim())
        if (actionFilter.trim()) params.set('action', actionFilter.trim())
        if (entityFilter) params.set('entity_type', entityFilter)
        const response = await apiFetch(`/audit?${params}`)
        setLogs(response.logs || [])
        setProfileDirectory(response.profiles || {})
        setTotal(response.pagination?.total || 0)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, fromDate, toDate, mode, actorFilter, actionFilter, entityFilter, eventType, eventSuccess])

  useEffect(() => {
    const timer = window.setTimeout(load, 180)
    return () => window.clearTimeout(timer)
  }, [load])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return logs

    return logs.filter(item => {
      const details = normalizeDetails(item.details)
      const relatedNames = Object.entries(details)
        .filter(([key, value]) => PROFILE_DETAIL_KEYS.has(key) && typeof value === 'string')
        .map(([, value]) => profileDirectory[value]?.full_name || profileDirectory[value]?.email || '')

      return [
        item.actor_name,
        item.action,
        item.entity_type,
        item.entity_id,
        JSON.stringify(details),
        ...relatedNames,
      ].some(value => String(value || '').toLowerCase().includes(query))
    })
  }, [logs, profileDirectory, search])

  const effectivePage = page
  const shown = filtered
  const visibleTotal = mode === 'security' ? securityTotal : total

  if (loading && logs.length === 0 && securityEvents.length === 0) return <PageLoader label="Loading audit history..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-5 sm:px-6 py-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-widest">System Administration</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl mt-1">Activity & security log</h1>
            <p className="text-navy-300 text-sm mt-1">Review important complaint, staff, sign-in, export, approval, and security activity.</p>
          </div>
          <p className="font-display font-black text-4xl sm:text-5xl text-gold-400 shrink-0">{visibleTotal}</p>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="card grid gap-2 rounded-xl p-2 sm:grid-cols-2" role="tablist" aria-label="Log type">
        <button type="button" role="tab" aria-selected={mode === 'audit'} onClick={() => { setMode('audit'); setPage(1); setSearch('') }} className={`filter-chip rounded-lg px-4 py-2.5 text-sm font-black ${mode === 'audit' ? 'bg-navy-800 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Activity log</button>
        <button type="button" role="tab" aria-selected={mode === 'security'} onClick={() => { setMode('security'); setPage(1); setSearch('') }} className={`filter-chip rounded-lg px-4 py-2.5 text-sm font-black ${mode === 'security' ? 'bg-navy-800 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Security events</button>
      </div>

      <div className="qol-filter-bar card rounded-xl p-4 space-y-3">
        <SearchField value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} onClear={() => { setSearch(''); setPage(1) }} placeholder={mode === 'security' ? 'Filter the loaded security events by email, event type or details…' : 'Filter the loaded audit page by actor, action, record or details…'} />
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4 gap-2">
          <div><label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-gray-500">Person or email</label><input value={actorFilter} onChange={event => { setActorFilter(event.target.value); setPage(1) }} className="input-field rounded-lg" placeholder="Name or email" /></div>
          {mode === 'audit' ? <>
            <div><label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-gray-500">Action</label><input value={actionFilter} onChange={event => { setActionFilter(event.target.value); setPage(1) }} className="input-field rounded-lg" placeholder="e.g. complaint, staff, export" /></div>
            <div><label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-gray-500">Record type</label><select value={entityFilter} onChange={event => { setEntityFilter(event.target.value); setPage(1) }} className="input-field rounded-lg"><option value="">All record types</option><option value="complaint">Complaint</option><option value="maintenance_task">Maintenance Task</option><option value="profile">Staff Account</option><option value="announcement">Announcement</option><option value="report_schedule">Report Schedule</option><option value="system_backup_check">Backup Check</option></select></div>
          </> : <>
            <div><label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-gray-500">Event type</label><input value={eventType} onChange={event => { setEventType(event.target.value); setPage(1) }} className="input-field rounded-lg" placeholder="e.g. auth.login" /></div>
            <div><label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-gray-500">Result</label><select value={eventSuccess} onChange={event => { setEventSuccess(event.target.value); setPage(1) }} className="input-field rounded-lg"><option value="all">All results</option><option value="true">Successful</option><option value="false">Failed</option></select></div>
          </>}
        </div>
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] gap-2">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1.5">From</label>
            <input type="date" value={fromDate} max={toDate || undefined} onChange={event => { setFromDate(event.target.value); setPage(1) }} className="input-field rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1.5">To</label>
            <input type="date" value={toDate} min={fromDate || undefined} onChange={event => { setToDate(event.target.value); setPage(1) }} className="input-field rounded-lg" />
          </div>
          <button type="button" onClick={() => { setFromDate(''); setToDate(''); setSearch(''); setActorFilter(''); setActionFilter(''); setEntityFilter(''); setEventType(''); setEventSuccess('all'); setPage(1) }} className="btn-secondary rounded-lg self-end">Clear filters</button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
          <span>Showing {mode === 'security' ? securityEvents.length : logs.length} of {visibleTotal} {mode === 'security' ? 'security events' : 'activity entries'}. Use the filters to narrow server-side history.</span>
          <span><b className="text-red-700">Sensitive</b> · <b className="text-amber-700">Review</b> · <b className="text-navy-700">Routine</b></span>
        </div>
      </div>

      {mode === 'security' ? <>
        <div className="space-y-3">
          {(securityEvents.filter(item => { const q = search.trim().toLowerCase(); return !q || [item.actor_email, item.event_type, JSON.stringify(item.details || {})].some(value => String(value || '').toLowerCase().includes(q)) })).map(item => (
            <article key={item.id} className="card rounded-xl p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-words font-black text-navy-900">{label(item.event_type)}</p><span className={`rounded-full px-2 py-1 text-xs font-black ${item.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{item.success ? 'SUCCESS' : 'FAILED'}</span></div><p className="mt-1 break-all text-xs text-gray-500">{item.actor_email || 'Unknown / pre-authentication event'}</p></div><p className="shrink-0 text-xs text-gray-500">{formatDate(item.created_at)}</p></div>
              {item.details && Object.keys(item.details).length > 0 && <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs"><DetailsCell details={item.details} profileDirectory={profileDirectory}/></div>}
            </article>
          ))}
          {securityEvents.length === 0 && <div className="card rounded-xl p-10 text-center text-gray-500">No security events match the current filters.</div>}
        </div>
        <Pagination page={effectivePage} pageSize={pageSize} total={securityTotal} onPageChange={setPage} label="security events" />
      </> : <>

      <div className="hidden xl:block card rounded-xl overflow-hidden p-2">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
            <col className="w-[36%]" />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200 text-left">
              {['Date', 'Actor', 'Action', 'Record', 'Details'].map(header => (
                <th key={header} className="px-3 py-3 text-xs font-black text-gray-500 uppercase">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.length === 0 ? (
              <tr><td colSpan={5} className="p-12 text-center text-gray-500">No activity entries match the current filters.</td></tr>
            ) : shown.map(item => (
              <tr key={item.id} className="align-top hover:bg-gray-50/70 transition-colors">
                <td className="px-3 py-4 text-xs text-gray-500">{formatDate(item.created_at)}</td>
                <td className="px-3 py-4 font-bold text-gray-900 break-words">{item.actor_name || 'System'}</td>
                <td className="px-3 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${actionClass(item.action)}`}>{label(item.action)}</span></td>
                <td className="px-3 py-4 text-xs"><p className="font-bold text-gray-700 capitalize break-words">{item.entity_type}</p><p className="font-mono text-gray-500 mt-1" title={item.entity_id || ''}>{item.entity_id ? shortId(item.entity_id) : 'Multiple records'}</p></td>
                <td className="px-3 py-4 pr-5 text-xs"><DetailsCell details={item.details} profileDirectory={profileDirectory} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="xl:hidden space-y-3">
        {shown.length === 0 ? (
          <div className="card rounded-xl p-10 text-center text-gray-500">No activity entries match the current filters.</div>
        ) : shown.map(item => (
          <article key={item.id} className="card rounded-xl p-4 space-y-3">
            <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-gray-900 break-words">{item.actor_name || 'System'}</p>
                <p className="text-xs text-gray-500 mt-1">{formatDate(item.created_at)}</p>
              </div>
              <span className={`self-start shrink-0 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${actionClass(item.action)}`}>{label(item.action)}</span>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-black uppercase tracking-wider text-gray-500">Record</p>
              <p className="font-bold text-gray-700 capitalize mt-1 break-words">{item.entity_type}</p>
              <p className="font-mono text-[11px] text-gray-500 mt-1 break-all">{item.entity_id ? item.entity_id : 'Multiple records'}</p>
            </div>
            <div className="text-xs overflow-hidden">
              <p className="text-xs font-black uppercase tracking-wider text-gray-500 mb-2">Details</p>
              <DetailsCell details={item.details} profileDirectory={profileDirectory} />
            </div>
          </article>
        ))}
      </div>

      <Pagination
        page={effectivePage}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        label="activity entries"
      />
      </>}
      <ScheduledReportsPanel allowedTypes={['audit_summary']} defaultType="audit_summary" title="Scheduled activity summaries" description="Create recurring activity summaries. Detailed security events remain available in the log above." />
    </div>
  )
}
