import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { departmentModule } from '../../config/departmentModules'
import { useComplaintStore } from '../../store/complaintStore'
import { useProductionStore } from '../../store/productionStore'
import AppIcon from '../../components/ui/AppIcon'
import { EmptyState, ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import PageHeader from '../../components/ui/PageHeader'
import MetricCard from '../../components/ui/MetricCard'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'

const CLOSED_STATUSES = new Set(['resolved', 'completed', 'cancelled', 'rejected', 'merged'])

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
          ['Pending Review', pendingReview.length, 'New complaints waiting for NSCCCD review and routing.', 'clipboard', '/commercial/complaints?status=pending'],
          ['Sent to WDLCD', forwarded.length, 'Complaints already handed off and waiting for WDLCD assignment.', 'assignment', '/commercial/complaints?status=forwarded'],
          ['Billing-related', withBillingConcern.length, 'Complaints involving billing, account, or payment concerns.', 'billing', '/commercial/complaints?q=billing'],
          ['Resolved today', resolvedToday.length, 'Complaints verified and resolved today.', 'check', '/commercial/complaints?status=resolved'],
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
        attentionTitle: 'Needs NSCCCD attention',
        attentionDescription: 'New, reopened, or High-priority complaints needing NSCCCD review or customer follow-up.',
      }
    }

    const readyForDispatch = complaints.filter(item => item.status === 'forwarded' && !item.assigned_to)
    const activeFieldWork = complaints.filter(item => ['assigned', 'en_route', 'in_progress', 'blocked'].includes(item.status))
    const awaitingVerification = complaints.filter(item => item.status === 'awaiting_verification')
    const resolvedToday = complaints.filter(item => ['resolved', 'completed'].includes(item.status) && isToday(item.verified_at || item.updated_at))

    return {
      cards: [
        ['Ready to assign', readyForDispatch.length, 'NSCCCD-reviewed complaints ready for WDLCD assignment.', 'assignment', '/ecmd/dispatch?queue=forwarded'],
        ['Active field work', activeFieldWork.length, 'Complaints currently assigned or being handled in the field.', 'tool', '/ecmd/dispatch?queue=field_work'],
        ['Waiting for WDLCD verification', awaitingVerification.length, 'Complaints with completed field work awaiting WDLCD verification.', 'alert', '/ecmd/dispatch?queue=verification'],
        ['Resolved today', resolvedToday.length, 'Complaints verified and resolved by WDLCD today.', 'check', '/ecmd/dispatch?queue=resolved'],
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
      attentionTitle: 'Needs WDLCD attention',
      attentionDescription: 'Complaints that are waiting for verification, blocked, ready to assign, or high priority.',
    }
  }, [complaints, moduleKey])

  const typeBreakdown = useMemo(() => {
    const counts = new Map()
    complaints.filter(item => !CLOSED_STATUSES.has(item.status)).forEach(item => {
      const label = complaintTitle(item)
      counts.set(label, (counts.get(label) || 0) + 1)
    })
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [complaints])
  const maxTypeCount = Math.max(1, ...typeBreakdown.map(([, count]) => count))

  if (!config) return <ErrorBanner message="Department dashboard configuration was not found." />
  if (loading && complaints.length === 0) return <PageLoader label={`Loading ${config.shortName} dashboard...`} />

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={config.name}
        title={`${config.shortName} overview`}
        description={config.description}
        actions={<button type="button" onClick={fetchComplaints} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-sm font-bold text-white hover:bg-white/10"><AppIcon name="refresh" className="h-4 w-4" />Refresh</button>}
      />

      {error && <ErrorBanner message={error} onRetry={fetchComplaints} />}

      <section className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4" aria-label={`${config.shortName} complaint statistics`}>
        {dashboard.cards.map(([label, value, detail, icon, to]) => (
          <MetricCard key={label} label={label} value={value} detail={detail} icon={icon} onClick={to ? () => navigate(to) : undefined} />
        ))}
      </section>

      <section className="card rounded-xl p-5" aria-labelledby="complaint-mix-title">
        <h2 id="complaint-mix-title" className="font-display text-lg font-black text-navy-900">Active complaints by type</h2>
        <p className="mt-1 text-sm text-gray-500">A quick view of the most common active complaint types in this workspace.</p>
        {typeBreakdown.length === 0 ? (
          <div className="mt-4"><EmptyState title="No active complaint data" description="This chart will appear when active complaints are available." /></div>
        ) : (
          <div className="mt-5 space-y-4">
            {typeBreakdown.map(([label, count]) => (
              <div key={label}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="font-bold text-gray-700">{label}</span><span className="font-black text-navy-900">{count}</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${label}: ${count} active complaints`}>
                  <div className="h-full rounded-full bg-navy-700" style={{ width: `${Math.max(6, count / maxTypeCount * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {[['Watched complaints', watched, 'Complaints you saved for quick follow-up.'], ['Recently viewed', recent, 'Complaints you opened recently.']].map(([title, items, description]) => (
          <div key={title} className="card overflow-hidden rounded-xl">
            <div className="border-b border-gray-100 px-5 py-4"><h2 className="font-display font-black text-navy-900">{title}</h2><p className="mt-1 text-xs text-gray-500">{description}</p></div>
            {items.length === 0 ? <div className="p-4"><EmptyState title={title === 'Watched complaints' ? 'No watched complaints' : 'No recent complaints'} description={title === 'Watched complaints' ? 'Watch a complaint to keep it here for quick follow-up.' : 'Complaints you open will appear here for quick access.'} /></div> : <div className="divide-y divide-gray-100">{items.slice(0,5).map(item => <button key={item.id} type="button" onClick={() => navigate(`/complaints/${item.id}`)} className="flex w-full min-w-0 items-center justify-between gap-3 px-5 py-3 text-left hover:bg-gray-50"><span className="min-w-0"><span className="block truncate text-sm font-black text-navy-900">{complaintTitle(item)}</span><span className="mt-0.5 block truncate font-mono text-xs text-gray-500">{item.reference_number}</span></span><StatusBadge status={item.status}/></button>)}</div>}
          </div>
        ))}
      </section>

      <section className="card overflow-hidden rounded-xl">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-display font-black text-navy-900">{dashboard.attentionTitle}</h2>
          <p className="mt-1 text-xs text-gray-500">{dashboard.attentionDescription}</p>
        </div>

        {dashboard.attention.length === 0 ? (
          <div className="p-4"><EmptyState icon={<AppIcon name="check" className="h-10 w-10" />} title="Nothing needs immediate attention" description="There are no urgent workflow items in this queue right now." /></div>
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
                  <p className="mt-1 font-mono text-xs font-bold text-gray-500">{item.reference_number}</p>
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
