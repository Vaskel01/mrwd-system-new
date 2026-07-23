import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import Pagination from '../../components/ui/Pagination'

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
        <span className="block text-[11px] text-gray-400 mt-0.5">{profile.email}</span>
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
                  className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-500"
                  title={String(item)}
                >
                  {UUID_PATTERN.test(String(item)) ? shortId(item) : String(item)}
                </span>
              ))}
              {value.length > 4 && (
                <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-500">
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
    return <span className="text-gray-400">No additional details</span>
  }

  return (
    <dl className="space-y-2 min-w-[230px]">
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[112px_minmax(0,1fr)] gap-2 items-start">
          <dt className="font-bold text-gray-500 leading-5">{detailLabel(key)}</dt>
          <dd className="min-w-0 leading-5 break-words">
            <DetailValue detailKey={key} value={value} profileDirectory={profileDirectory} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState([])
  const [profileDirectory, setProfileDirectory] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 15

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiFetch('/audit?limit=500')
      setLogs(response.logs || [])
      setProfileDirectory(response.profiles || {})
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

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

  useEffect(() => setPage(1), [search])

  const shown = filtered.slice((page - 1) * pageSize, page * pageSize)

  if (loading && logs.length === 0) return <PageLoader label="Loading audit history..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-6 py-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-widest">Admin · Accountability</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl mt-1">Audit Log</h1>
            <p className="text-navy-300 text-sm mt-1">Who performed each important complaint, task, and staff action.</p>
          </div>
          <p className="font-display font-black text-5xl text-gold-400">{filtered.length}</p>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="card rounded-xl p-4">
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          className="input-field rounded-lg"
          placeholder="Search actor, action, complaint ID, staff member, or details..."
        />
      </div>

      <div className="card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="bg-gray-50 border-b-2 border-gray-200 text-left">
                {['Date', 'Actor', 'Action', 'Record', 'Details'].map(header => (
                  <th key={header} className="px-4 py-3 text-xs font-black text-gray-400 uppercase">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-gray-400">No audit entries match.</td>
                </tr>
              ) : shown.map(item => (
                <tr key={item.id} className="align-top hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-4 text-xs text-gray-500 whitespace-nowrap">{formatDate(item.created_at)}</td>
                  <td className="px-4 py-4 font-bold text-gray-900">{item.actor_name || 'System'}</td>
                  <td className="px-4 py-4">
                    <span className="inline-flex rounded-full bg-navy-50 text-navy-700 px-2.5 py-1 text-xs font-bold">
                      {label(item.action)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-xs">
                    <p className="font-bold text-gray-700 capitalize">{item.entity_type}</p>
                    <p className="font-mono text-gray-400 mt-1" title={item.entity_id || ''}>
                      {item.entity_id ? shortId(item.entity_id) : 'Multiple records'}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-xs max-w-lg">
                    <DetailsCell details={item.details} profileDirectory={profileDirectory} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        label="audit entries"
      />
    </div>
  )
}
