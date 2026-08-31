import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import { EmptyState, ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import PageHeader from '../../components/ui/PageHeader'
import AppIcon from '../../components/ui/AppIcon'
import {
  AnalyticsKpi,
  AnalyticsSectionHeading,
  AnalyticsSignal,
  AnalyticsTable,
  DistributionBar,
  RankedBarList,
} from '../../components/analytics/AnalyticsPrimitives'

function titleCase(value) {
  return String(value || 'Unknown').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

function percent(value, total) {
  return total ? Math.round(value / total * 100) : 0
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

export default function SystemDashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [analysisNow, setAnalysisNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await apiFetch('/operations/system-bootstrap'))
      setAnalysisNow(Date.now())
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const analytics = useMemo(() => {
    const staff = data?.staff || []
    const departments = data?.departments || []
    const approvals = data?.approvals || []
    const archives = data?.archives || []
    const deliveries = data?.notification_deliveries || []
    const activeStaff = staff.filter(account => account.is_active !== false)
    const departmentMap = Object.fromEntries(departments.map(item => [item.id, item]))
    const departmentCounts = new Map(departments.map(item => [item.name || item.code || 'Unknown department', 0]))
    const roleCounts = new Map()
    for (const account of activeStaff) {
      const department = departmentMap[account.department_id]
      const departmentLabel = department?.name || department?.code || (account.role === 'maintenance_personnel' ? 'Maintenance Personnel' : 'Unassigned department')
      departmentCounts.set(departmentLabel, (departmentCounts.get(departmentLabel) || 0) + 1)
      const roleLabel = account.role === 'maintenance_personnel' ? 'Maintenance Personnel' : titleCase(account.staff_position || 'Administrative staff')
      roleCounts.set(roleLabel, (roleCounts.get(roleLabel) || 0) + 1)
    }
    const pendingApprovals = approvals.filter(item => item.status === 'pending')
    const agedApprovals = pendingApprovals.filter(item => analysisNow - new Date(item.created_at).getTime() >= 48 * 36e5)
    const decidedApprovals = approvals.filter(item => ['approved', 'rejected'].includes(item.status))
    const approved = decidedApprovals.filter(item => item.status === 'approved').length
    const rejectedApprovals = decidedApprovals.length - approved
    const cancelledApprovals = approvals.filter(item => item.status === 'cancelled').length
    const sentDeliveries = deliveries.filter(item => item.status === 'sent').length
    const failedDeliveries = deliveries.filter(item => item.status === 'failed').length
    const cancelledDeliveries = deliveries.filter(item => item.status === 'cancelled').length
    const emailDeliveries = deliveries.filter(item => item.channel === 'email').length
    const smsDeliveries = deliveries.filter(item => item.channel === 'sms').length
    const deliveryAttempts = sentDeliveries + failedDeliveries
    const archivesLast30 = archives.filter(item => analysisNow - new Date(item.archived_at).getTime() <= 30 * 864e5).length
    const unstaffedDepartments = departments.filter(item => (departmentCounts.get(item.name || item.code || 'Unknown department') || 0) === 0)
    const recentActivity = [
      ...approvals.map(item => ({
        id: `approval-${item.id}`,
        type: 'Approval request',
        subject: titleCase(item.request_type),
        status: titleCase(item.status),
        at: item.reviewed_at || item.created_at,
      })),
      ...archives.map(item => ({
        id: `archive-${item.id}`,
        type: 'Archived record',
        subject: titleCase(item.entity_type),
        status: 'Archived',
        at: item.archived_at,
      })),
    ].sort((left, right) => new Date(right.at) - new Date(left.at)).slice(0, 8)

    return {
      staff: staff.length,
      activeStaff: activeStaff.length,
      inactiveStaff: staff.length - activeStaff.length,
      unassignedStaff: activeStaff.filter(account => account.role === 'admin' && !account.department_id).length,
      maintenanceAvailable: activeStaff.filter(account => account.role === 'maintenance_personnel' && String(account.availability_status || 'available') === 'available').length,
      maintenanceTotal: activeStaff.filter(account => account.role === 'maintenance_personnel').length,
      pendingApprovals: pendingApprovals.length,
      agedApprovals: agedApprovals.length,
      approvedApprovals: approved,
      rejectedApprovals,
      cancelledApprovals,
      approvalRate: percent(approved, decidedApprovals.length),
      archivesLast30,
      sentDeliveries,
      failedDeliveries,
      cancelledDeliveries,
      emailDeliveries,
      smsDeliveries,
      pendingDeliveries: deliveries.filter(item => ['pending', 'processing'].includes(item.status)).length,
      deliverySuccessRate: percent(sentDeliveries, deliveryAttempts),
      departmentCounts: [...departmentCounts].map(([label, value]) => ({ label, value })),
      roleCounts: [...roleCounts].map(([label, value]) => ({ label, value })),
      unstaffedDepartments,
      recentActivity,
      totalDeliveries: deliveries.length,
      totalApprovals: approvals.length,
    }
  }, [analysisNow, data])

  if (loading && !data) return <PageLoader label="Loading system analytics…" />

  const governanceSignals = [
    analytics.agedApprovals > 0
      ? { tone: 'urgent', icon: 'alert', title: `${analytics.agedApprovals} approval${analytics.agedApprovals === 1 ? '' : 's'} waiting over 48 hours`, detail: 'Review the request reason and affected record before the queue grows.' }
      : { tone: 'good', icon: 'check', title: 'Approval queue is within 48 hours', detail: 'No pending approval has crossed the governance review threshold.' },
    analytics.failedDeliveries > 0
      ? { tone: 'urgent', icon: 'bell', title: `${analytics.failedDeliveries} failed notification deliver${analytics.failedDeliveries === 1 ? 'y' : 'ies'}`, detail: 'Open System Health to inspect provider readiness and the latest delivery errors.' }
      : { tone: 'good', icon: 'bell', title: 'No failed notification deliveries', detail: 'The latest delivery records contain no failed email or SMS attempt.' },
    analytics.unstaffedDepartments.length > 0
      ? { tone: 'watch', icon: 'users', title: `${analytics.unstaffedDepartments.length} department${analytics.unstaffedDepartments.length === 1 ? '' : 's'} without active staff`, detail: analytics.unstaffedDepartments.map(item => item.name || item.code).join(', ') }
      : { tone: 'good', icon: 'users', title: 'Every department has active staff coverage', detail: 'Department assignment coverage is complete for the current staff roster.' },
  ]

  const activityColumns = [
    { key: 'type', label: 'Activity', className: 'font-bold text-navy-900' },
    { key: 'subject', label: 'Record' },
    { key: 'status', label: 'Outcome', render: row => <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-black text-gray-700">{row.status}</span> },
    { key: 'at', label: 'Recorded', render: row => formatDate(row.at) },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System Supervisor"
        title="System governance analytics"
        description={`Welcome, ${user?.full_name?.split(' ')[0] || 'Supervisor'}. Monitor staffing coverage, approvals, records governance, and notification delivery health.`}
        actions={<button type="button" onClick={load} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-sm font-bold text-white hover:bg-white/10"><AppIcon name="refresh" className="h-4 w-4" />Refresh</button>}
      />

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      <section className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-6" aria-label="System governance indicators">
        <AnalyticsKpi label="Active staff" value={analytics.activeStaff} detail={`${analytics.inactiveStaff} inactive account${analytics.inactiveStaff === 1 ? '' : 's'}`} icon="users" />
        <AnalyticsKpi label="Unassigned staff" value={analytics.unassignedStaff} detail="Admin accounts without a department" icon="user" accent={analytics.unassignedStaff ? 'amber' : 'green'} />
        <AnalyticsKpi label="Pending approvals" value={analytics.pendingApprovals} detail={`${analytics.agedApprovals} older than 48h`} icon="clipboard" accent={analytics.agedApprovals ? 'red' : analytics.pendingApprovals ? 'amber' : 'green'} />
        <AnalyticsKpi label="Approval rate" value={`${analytics.approvalRate}%`} detail="Approved among decided requests" icon="check" accent="green" />
        <AnalyticsKpi label="Delivery success" value={`${analytics.deliverySuccessRate}%`} detail={`${analytics.failedDeliveries} failed · ${analytics.pendingDeliveries} pending`} icon="bell" accent={analytics.failedDeliveries ? 'red' : 'blue'} />
        <AnalyticsKpi label="Archives · 30d" value={analytics.archivesLast30} detail="Records archived with oversight" icon="document" accent="blue" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <div className="card rounded-xl p-5">
          <AnalyticsSectionHeading eyebrow="Workforce" title="Staff coverage and account health" description="Coverage counts include active staff accounts only; inactive accounts remain visible in the headline for cleanup." />
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div><p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500">By department</p><RankedBarList items={analytics.departmentCounts} total={analytics.activeStaff} /></div>
            <div><p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500">By staff function</p><RankedBarList items={analytics.roleCounts} total={analytics.activeStaff} /></div>
          </div>
          <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-black uppercase tracking-wider text-gray-500">Maintenance availability</p><p className="mt-1 text-sm text-gray-600">Current availability status from field accounts.</p></div><p className="text-xl font-black text-navy-900">{analytics.maintenanceAvailable}/{analytics.maintenanceTotal}</p></div>
            <div className="mt-3"><DistributionBar total={analytics.maintenanceTotal} items={[
              { label: 'Available', value: analytics.maintenanceAvailable, accent: 'green' },
              { label: 'Not available', value: Math.max(0, analytics.maintenanceTotal - analytics.maintenanceAvailable), accent: 'amber' },
            ]} /></div>
          </div>
        </div>

        <div className="card rounded-xl p-5">
          <AnalyticsSectionHeading eyebrow="Oversight signals" title="What needs a supervisor decision" description="Signals prioritize delayed governance work, delivery failures, and staffing coverage gaps." />
          <div className="mt-5 space-y-3">{governanceSignals.map(signal => <AnalyticsSignal key={signal.title} {...signal} />)}</div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => navigate('/system/departments-access')} className="btn-secondary min-h-11 rounded-lg text-xs">Review approvals</button>
            <button type="button" onClick={() => navigate('/system/health')} className="btn-secondary min-h-11 rounded-lg text-xs">Open system health</button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="card rounded-xl p-5">
          <AnalyticsSectionHeading eyebrow="Governance" title="Approval request outcomes" description="The latest 50 requests returned by the system governance feed." />
          <div className="mt-5"><DistributionBar total={analytics.totalApprovals} items={[
            { label: 'Pending', value: analytics.pendingApprovals, accent: 'amber' },
            { label: 'Approved', value: analytics.approvedApprovals, accent: 'green' },
            { label: 'Rejected', value: analytics.rejectedApprovals, accent: 'red' },
            { label: 'Cancelled', value: analytics.cancelledApprovals, accent: 'navy' },
          ]} emptyLabel="No approval requests have been recorded." /></div>
          {analytics.pendingApprovals > 0 ? <button type="button" onClick={() => navigate('/system/departments-access')} className="mt-5 flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left"><span><span className="block text-sm font-black text-amber-900">{analytics.pendingApprovals} request{analytics.pendingApprovals === 1 ? '' : 's'} awaiting review</span><span className="mt-0.5 block text-xs text-amber-700">Open the approval queue to inspect reasons and affected records.</span></span><span className="text-xs font-black text-amber-900">Review</span></button> : <div className="mt-5"><EmptyState icon={<AppIcon name="check" className="h-10 w-10" />} title="Approval queue is clear" description="There are no requests waiting for a System Supervisor decision." /></div>}
        </div>

        <div className="card rounded-xl p-5">
          <AnalyticsSectionHeading eyebrow="Notifications" title="External delivery status" description="Email and SMS delivery records from the latest system feed." />
          <div className="mt-5"><DistributionBar total={analytics.totalDeliveries} items={[
            { label: 'Sent', value: analytics.sentDeliveries, accent: 'green' },
            { label: 'Pending / processing', value: analytics.pendingDeliveries, accent: 'blue' },
            { label: 'Failed', value: analytics.failedDeliveries, accent: 'red' },
            { label: 'Cancelled', value: analytics.cancelledDeliveries, accent: 'navy' },
          ]} emptyLabel="No external notification deliveries have been recorded." /></div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-gray-500">Email records</p><p className="mt-2 text-2xl font-black text-navy-900">{analytics.emailDeliveries}</p></div>
            <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-gray-500">SMS records</p><p className="mt-2 text-2xl font-black text-navy-900">{analytics.smsDeliveries}</p></div>
          </div>
        </div>
      </section>

      <section className="card rounded-xl p-4 sm:p-5">
        <AnalyticsSectionHeading eyebrow="Recent governance activity" title="Approvals and archive actions" description="A concise audit-oriented view; open the full activity log for complete event details." aside={<button type="button" onClick={() => navigate('/system/audit-log')} className="btn-secondary rounded-lg text-xs">Open activity log</button>} />
        <div className="mt-4"><AnalyticsTable columns={activityColumns} rows={analytics.recentActivity} rowKey={row => row.id} emptyLabel="No recent approval or archive activity is available." /></div>
      </section>

      <p className="px-1 text-xs leading-5 text-gray-500">These summaries use the bounded governance records returned by the system bootstrap endpoint. Use the dedicated staff, approval, health, and audit pages for complete record-level decisions.</p>
    </div>
  )
}
