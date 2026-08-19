import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { departmentModule } from '../../config/departmentModules'
import { useComplaintStore } from '../../store/complaintStore'
import { useProductionStore } from '../../store/productionStore'
import AppIcon from '../../components/ui/AppIcon'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'

const CLOSED_STATUSES = new Set(['resolved', 'completed', 'cancelled', 'rejected', 'merged'])

function StatCard({ label, value, detail, icon, onClick }) {
  const Component = onClick ? 'button' : 'div'
  return (
    <Component type={onClick ? 'button' : undefined} onClick={onClick} className={`card w-full rounded-xl p-4 text-left ${onClick ? 'transition hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-navy-300' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-3xl font-black text-navy-900">{value}</p>
          <p className="mt-1 text-xs font-black uppercase tracking-wider text-gray-500">{label}</p>
          <p className="mt-1 text-[11px] leading-4 text-gray-400">{detail}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
          <AppIcon name={icon} className="h-5 w-5" />
        </div>
      </div>
    </Component>
  )
}

function complaintTitle(item) {
  return item.complaint_type || item.category_name || 'Complaint'
}

export default function DepartmentDashboardPage({ moduleKey }) {
  const config = departmentModule(moduleKey)
  const navigate = useNavigate()
  const complaints = useComplaintStore(state => state.complaints)
  const loading = useComplaintStore(state => state.loading)
  const error = useComplaintStore(state => state.error)
  const fetchComplaints = useComplaintStore(state => state.fetchComplaints)
  const watched = useProductionStore(state => state.watched)
  const recent = useProductionStore(state => state.recent)
  const loadWatched = useProductionStore(state => state.loadWatched)
  const loadRecent = useProductionStore(state => state.loadRecent)

  useEffect(() => {
    fetchComplaints()
    Promise.allSettled([loadWatched(), loadRecent()])
  }, [fetchComplaints, loadWatched, loadRecent])

  const dashboard = useMemo(() => {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    const isToday = value => value && new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) === todayKey

    if (moduleKey === 'commercial') {
      const pendingReview = complaints.filter(item => item.status === 'pending')
      const forwarded = complaints.filter(item => item.status === 'forwarded')
      const reopened = complaints.filter(item => item.reopened_at && !CLOSED_STATUSES.has(item.status))
      const withBillingConcern = complaints.filter(item => {
        const type = String(item.complaint_type || '').toLowerCase()
        return type.includes('bill') || type.includes('account') || type.includes('payment')
      })
      const resolvedToday = complaints.filter(item => ['resolved', 'completed'].includes(item.status) && isToday(item.verified_at || item.updated_at))

      return {
        cards: [
          ['Pending Review', pendingReview.length, 'New complaints waiting for Commercial Services review and routing.', 'clipboard', '/commercial/complaints?status=pending'],
          ['Forwarded to ECMD', forwarded.length, 'Complaints already handed off and waiting for field dispatch.', 'assignment', '/commercial/complaints?status=forwarded'],
          ['Billing-related', withBillingConcern.length, 'Complaints involving billing, account, or payment concerns.', 'billing', '/commercial/complaints?q=billing'],
          ['Resolved Today', resolvedToday.length, 'Complaints verified and resolved today.', 'check', '/commercial/complaints?status=resolved'],
        ],
        attention: [...complaints]
          .filter(item => item.status === 'pending' || reopened.includes(item) || (item.priority === 'high' && !CLOSED_STATUSES.has(item.status)))
          .sort((a, b) => {
            const reopenedRank = item => item.reopened_at && !CLOSED_STATUSES.has(item.status) ? 0 : 1
            const pendingRank = item => item.status === 'pending' ? 0 : 1
            const highRank = item => item.priority === 'high' ? 0 : 1
            return reopenedRank(a) - reopenedRank(b)
              || pendingRank(a) - pendingRank(b)
              || highRank(a) - highRank(b)
              || new Date(a.created_at) - new Date(b.created_at)
          })
          .slice(0, 6),
        attentionTitle: 'Needs Commercial Attention',
        attentionDescription: 'New, reopened, or High-priority complaints needing Commercial review or customer follow-up.',
      }
    }

    const readyForDispatch = complaints.filter(item => item.status === 'forwarded' && !item.assigned_to)
    const activeFieldWork = complaints.filter(item => ['assigned', 'en_route', 'in_progress', 'blocked'].includes(item.status))
    const awaitingVerification = complaints.filter(item => item.status === 'awaiting_verification')
    const resolvedToday = complaints.filter(item => ['resolved', 'completed'].includes(item.status) && isToday(item.verified_at || item.updated_at))

    return {
      cards: [
        ['Dispatch Queue', readyForDispatch.length, 'Commercial-validated complaints ready for ECMD assignment.', 'assignment', '/ecmd/dispatch?queue=forwarded'],
        ['Active Field Work', activeFieldWork.length, 'Complaints currently assigned or being handled in the field.', 'tool', '/ecmd/dispatch?queue=field_work'],
        ['Awaiting ECMD Verification', awaitingVerification.length, 'Complaints with completed field work awaiting ECMD verification.', 'alert', '/ecmd/dispatch?queue=verification'],
        ['Resolved Today', resolvedToday.length, 'Complaints verified and resolved by ECMD today.', 'check', '/ecmd/dispatch?queue=resolved'],
      ],
      attention: [...complaints]
        .filter(item => item.status === 'blocked' || item.status === 'awaiting_verification' || (item.status === 'forwarded' && !item.assigned_to) || (item.priority === 'high' && !CLOSED_STATUSES.has(item.status)))
        .sort((a, b) => {
          const verifyRank = item => item.status === 'awaiting_verification' ? 0 : 1
          const blockedRank = item => item.status === 'blocked' ? 0 : 1
          const unassignedRank = item => item.status === 'forwarded' && !item.assigned_to ? 0 : 1
          const highRank = item => item.priority === 'high' ? 0 : 1
          return verifyRank(a) - verifyRank(b)
            || blockedRank(a) - blockedRank(b)
            || unassignedRank(a) - unassignedRank(b)
            || highRank(a) - highRank(b)
            || new Date(a.created_at) - new Date(b.created_at)
        })
        .slice(0, 6),
      attentionTitle: 'Needs ECMD Attention',
      attentionDescription: 'Complaints awaiting verification, blocked in the field, ready for dispatch, or High priority.',
    }
  }, [complaints, moduleKey])

  if (!config) return <ErrorBanner message="Department dashboard configuration was not found." />
  if (loading && complaints.length === 0) return <PageLoader label={`Loading ${config.shortName} dashboard...`} />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-5 py-6 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gold-400">{config.name}</p>
        <div className="mt-1 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-2xl font-black text-white sm:text-3xl">{config.shortName} Dashboard</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-navy-300">{config.description}</p>
          </div>
          <button
            type="button"
            onClick={fetchComplaints}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-xs font-black text-white hover:bg-white/10"
          >
            <AppIcon name="refresh" className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchComplaints} />}

      <section className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4" aria-label={`${config.shortName} complaint statistics`}>
        {dashboard.cards.map(([label, value, detail, icon, to]) => (
          <StatCard key={label} label={label} value={value} detail={detail} icon={icon} onClick={to ? () => navigate(to) : undefined} />
        ))}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-black text-navy-900">Department Modules</h2>
          <p className="text-xs text-gray-500">Complaint-system tools available to {config.shortName}.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {config.links.map(link => (
            <button
              key={link.to}
              type="button"
              onClick={() => navigate(link.to)}
              className="card group rounded-xl p-5 text-left transition hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700 group-hover:bg-navy-800 group-hover:text-white">
                  <AppIcon name={link.icon} className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-black text-navy-900">{link.label}</h3>
                  <p className="mt-1 text-xs leading-5 text-gray-500">{link.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {[['Watched Complaints', watched, 'Complaints you pinned for quick follow-up.'], ['Recently Viewed', recent, 'Your most recently opened complaint records.']].map(([title, items, description]) => (
          <div key={title} className="card overflow-hidden rounded-xl">
            <div className="border-b border-gray-100 px-5 py-4"><h2 className="font-display font-black text-navy-900">{title}</h2><p className="mt-1 text-xs text-gray-500">{description}</p></div>
            {items.length === 0 ? <p className="px-5 py-8 text-center text-sm text-gray-400">Nothing here yet.</p> : <div className="divide-y divide-gray-100">{items.slice(0,5).map(item => <button key={item.id} type="button" onClick={() => navigate(`/complaints/${item.id}`)} className="flex w-full min-w-0 items-center justify-between gap-3 px-5 py-3 text-left hover:bg-gray-50"><span className="min-w-0"><span className="block truncate text-sm font-black text-navy-900">{complaintTitle(item)}</span><span className="mt-0.5 block truncate font-mono text-[10px] text-gray-400">{item.reference_number}</span></span><StatusBadge status={item.status}/></button>)}</div>}
          </div>
        ))}
      </section>

      <section className="card overflow-hidden rounded-xl">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-display font-black text-navy-900">{dashboard.attentionTitle}</h2>
          <p className="mt-1 text-xs text-gray-500">{dashboard.attentionDescription}</p>
        </div>

        {dashboard.attention.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">No complaint records currently require immediate department attention.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {dashboard.attention.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/complaints/${item.id}`)}
                className="grid w-full gap-3 px-5 py-4 text-left hover:bg-gray-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-gray-900">{complaintTitle(item)}</p>
                    <PriorityBadge priority={item.priority} />
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">{item.customer_name || 'Customer'} · {item.address || 'No address'}</p>
                  <p className="mt-1 font-mono text-[10px] font-bold text-gray-400">{item.reference_number}</p>
                </div>
                <StatusBadge status={item.status} />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
