import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useComplaintStore } from '../../store/complaintStore'
import { useStaffStore } from '../../store/staffStore'
import { useAuthStore } from '../../store/authStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { PageLoader, EmptyState } from '../../components/ui/Feedback'
import AppIcon from '../../components/ui/AppIcon'

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }
const RANGE_LABELS = {
  today: 'Today',
  week: 'This Week',
  all: 'All Time',
}

function startOfDay(date = new Date()) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function startOfWeek(date = new Date()) {
  const result = startOfDay(date)
  const day = result.getDay()
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1))
  return result
}

function timeAgo(iso) {
  const elapsed = Math.max(0, Date.now() - new Date(iso).getTime())
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function StatCard({ label, value, color }) {
  return (
    <div className="card rounded-xl p-4 text-left">
      <p className={`font-display text-3xl font-black ${color}`}>{value}</p>
      <p className="mt-1 text-xs font-bold text-gray-500">{label}</p>
    </div>
  )
}

function AttentionReason({ complaint }) {
  if (complaint.status === 'blocked') return <span className="text-orange-700">Needs administrator attention</span>
  if (!complaint.assigned_to && complaint.status === 'pending') return <span className="text-amber-700">Waiting for assignment</span>
  if (complaint.priority === 'high') return <span className="text-red-700">High-priority complaint</span>
  return null
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const complaints = useComplaintStore(state => state.complaints)
  const loading = useComplaintStore(state => state.loading)
  const fetchComplaints = useComplaintStore(state => state.fetchComplaints)
  const staff = useStaffStore(state => state.staff)
  const fetchStaff = useStaffStore(state => state.fetchStaff)
  const [range, setRange] = useState('today')

  useEffect(() => {
    fetchComplaints()
    fetchStaff()
  }, [fetchComplaints, fetchStaff])

  const now = new Date()
  const todayStart = startOfDay(now)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  const todayFiled = complaints.filter(item => {
    const filed = new Date(item.created_at)
    return filed >= todayStart && filed < tomorrowStart
  }).length
  const yesterdayFiled = complaints.filter(item => {
    const filed = new Date(item.created_at)
    return filed >= yesterdayStart && filed < todayStart
  }).length
  const dailyDelta = todayFiled - yesterdayFiled
  const dailyTrend = dailyDelta === 0
    ? `${todayFiled} filed today, the same as yesterday`
    : `${todayFiled} filed today, ${Math.abs(dailyDelta)} ${dailyDelta > 0 ? 'more' : 'fewer'} than yesterday`

  const rangeStart = range === 'today'
    ? todayStart
    : range === 'week'
      ? startOfWeek(now)
      : null
  const scopedComplaints = rangeStart
    ? complaints.filter(item => new Date(item.created_at) >= rangeStart)
    : complaints

  const total = scopedComplaints.length
  const inProgress = scopedComplaints.filter(item => ['assigned', 'en_route', 'in_progress', 'blocked'].includes(item.status)).length
  const completed = scopedComplaints.filter(item => item.status === 'completed').length
  const high = scopedComplaints.filter(item => item.priority === 'high').length
  const resolveRate = total > 0 ? Math.round((completed / total) * 100) : 0
  const unassigned = complaints.filter(item => !item.assigned_to && item.status === 'pending').length

  const activeTechnicians = staff.filter(account =>
    account.role === 'maintenance_personnel' && account.is_active !== false
  )
  const availableTechnicians = activeTechnicians.filter(account =>
    String(account.availability_status || 'available').toLowerCase() === 'available'
  )

  const needsAttention = useMemo(() => complaints
    .filter(item =>
      item.status === 'blocked'
      || (!item.assigned_to && item.status === 'pending')
      || (item.priority === 'high' && !['completed', 'rejected', 'cancelled'].includes(item.status))
    )
    .sort((a, b) => {
      const rank = item => {
        if (item.priority === 'high' && !item.assigned_to && item.status === 'pending') return 0
        if (item.status === 'blocked') return 1
        if (!item.assigned_to && item.status === 'pending') return 2
        return 3
      }
      return rank(a) - rank(b)
        || (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
        || new Date(a.created_at) - new Date(b.created_at)
    })
    .slice(0, 5), [complaints])

  const attentionIds = useMemo(() => new Set(needsAttention.map(item => item.id)), [needsAttention])
  const recentlyFiled = useMemo(() => [...complaints]
    .filter(item => !attentionIds.has(item.id))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5), [complaints, attentionIds])

  if (loading && complaints.length === 0) {
    return <PageLoader label="Loading dashboard..." />
  }

  return (
    <div className="space-y-6">
      <div className="page-band wave-header relative overflow-hidden rounded-2xl px-6 py-7">
        <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-gold-400">Administrator Command Center</p>
            <h1 className="font-display text-3xl font-black leading-tight text-white">
              Good day, <span className="text-gold-400">{user?.full_name?.split(' ')[0]}</span>
            </h1>
            <p className="mt-1 text-sm text-navy-300">
              {new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-white">
              <AppIcon name="chart" className="h-4 w-4 text-gold-400" />
              {dailyTrend}
            </p>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <p className="font-display text-5xl font-black leading-none text-gold-400">{resolveRate}%</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wider text-navy-300">
              resolved · {RANGE_LABELS[range]}
            </p>
          </div>
        </div>
      </div>

      <section
        className={`overflow-hidden rounded-2xl border shadow-sm ${
          unassigned > 0
            ? 'border-amber-300 bg-gradient-to-r from-amber-50 via-white to-blue-50'
            : 'border-green-200 bg-gradient-to-r from-green-50 via-white to-blue-50'
        }`}
        aria-label="Dispatch readiness"
      >
        <div className="grid gap-4 px-5 py-5 lg:grid-cols-[1.35fr_1fr_auto] lg:items-center">
          <div className="flex items-start gap-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${unassigned > 0 ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
              <AppIcon name={unassigned > 0 ? 'assignment' : 'check'} className="h-5 w-5" />
            </div>
            <div>
              <p className={`font-display text-lg font-black ${unassigned > 0 ? 'text-amber-950' : 'text-green-900'}`}>
                {unassigned > 0
                  ? `${unassigned} complaint${unassigned === 1 ? '' : 's'} need assignment`
                  : 'Dispatch queue is clear'}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {unassigned > 0
                  ? 'Assign the oldest urgent reports first to prevent avoidable delays.'
                  : 'All pending complaints currently have a Maintenance Personnel assignment.'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white bg-white/80 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Maintenance availability</p>
            <p className="mt-1 font-display text-2xl font-black text-navy-900">
              {availableTechnicians.length} <span className="text-base text-gray-400">of {activeTechnicians.length}</span>
            </p>
            <p className="text-xs text-gray-500">available now for assignment</p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/admin/assign')}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-navy-800 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-navy-900"
          >
            Open Dispatch
            <AppIcon name="external" className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section aria-labelledby="dashboard-overview-title" className="space-y-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 id="dashboard-overview-title" className="font-display text-lg font-black text-navy-900">Operational overview</h2>
            <p className="text-xs text-gray-500">Current status of complaints filed within the selected period.</p>
          </div>
          <div className="inline-flex w-full rounded-xl border border-gray-200 bg-white p-1 sm:w-auto" aria-label="Dashboard date range">
            {Object.entries(RANGE_LABELS).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRange(value)}
                aria-pressed={range === value}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-black transition-colors sm:flex-none ${
                  range === value
                    ? 'bg-navy-800 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-navy-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Filed" value={total} color="text-navy-800" />
          <StatCard label="In Progress" value={inProgress} color="text-brand-600" />
          <StatCard label="High Priority" value={high} color="text-red-600" />
          <StatCard label="Completed" value={completed} color="text-green-600" />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <section className="card overflow-hidden rounded-xl" aria-labelledby="needs-attention-title">
          <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-br from-gray-50 to-white px-5 py-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="h-4 w-1 rounded-full bg-red-500" />
                <h2 id="needs-attention-title" className="text-xs font-black uppercase tracking-widest text-gray-600">Needs Attention</h2>
              </div>
              <p className="mt-1 pl-3.5 text-xs text-gray-400">Urgent, unassigned, and blocked complaints ordered for triage.</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin/complaints')}
              className="text-xs font-bold text-navy-600 transition-colors hover:text-navy-900"
            >
              View All
            </button>
          </div>

          {needsAttention.length === 0 ? (
            <EmptyState
              icon={<AppIcon name="check" className="h-9 w-9" />}
              title="Nothing requires immediate attention"
              description="Urgent, blocked, and unassigned complaints will appear here."
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {needsAttention.map(complaint => (
                <button
                  key={complaint.id}
                  type="button"
                  onClick={() => navigate(`/complaints/${complaint.id}`)}
                  className="grid w-full gap-3 px-5 py-4 text-left transition-colors hover:bg-navy-50/40 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-gray-900">{complaint.complaint_type}</p>
                      <PriorityBadge priority={complaint.priority} />
                    </div>
                    <p className="mt-1 truncate text-xs text-gray-500">{complaint.customer_name} · {complaint.address}</p>
                    <p className="mt-1 font-mono text-[10px] font-bold text-gray-400">{complaint.reference_number}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <div className="text-left sm:text-right">
                      <p className="text-[11px] font-bold"><AttentionReason complaint={complaint} /></p>
                      <p className="mt-1 text-[10px] text-gray-400">{timeAgo(complaint.created_at)}</p>
                    </div>
                    <StatusBadge status={complaint.status} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card overflow-hidden rounded-xl" aria-labelledby="recently-filed-title">
          <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-br from-gray-50 to-white px-5 py-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="h-4 w-1 rounded-full bg-gold-500" />
                <h2 id="recently-filed-title" className="text-xs font-black uppercase tracking-widest text-gray-600">Recently Filed</h2>
              </div>
              <p className="mt-1 pl-3.5 text-xs text-gray-400">Latest reports not already listed for immediate attention.</p>
            </div>
          </div>

          {recentlyFiled.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              No additional recent complaints.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentlyFiled.map(complaint => (
                <button
                  key={complaint.id}
                  type="button"
                  onClick={() => navigate(`/complaints/${complaint.id}`)}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50"
                >
                  <div className={`h-9 w-1 shrink-0 rounded-full ${
                    complaint.priority === 'high'
                      ? 'bg-red-500'
                      : complaint.priority === 'medium'
                        ? 'bg-amber-400'
                        : 'bg-green-400'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-900">{complaint.complaint_type}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{complaint.customer_name}</p>
                    <p className="mt-1 font-mono text-[10px] font-bold text-gray-400">{complaint.reference_number}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-lg font-black text-navy-800">{complaint.priority_score ?? '—'}<span className="ml-0.5 text-[10px] text-gray-400">/100</span></p>
                    <p className="text-[10px] text-gray-400">{timeAgo(complaint.created_at)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
