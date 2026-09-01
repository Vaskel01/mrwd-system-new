import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { addDaysYmd, manilaDateYmd, manilaMonthRange } from '../../lib/date'
import { useComplaintStore } from '../../store/complaintStore'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import AppIcon from '../../components/ui/AppIcon'
import {
  AnalyticsKpi,
  AnalyticsKpiRail,
  AnalyticsSectionHeading,
  AnalyticsSignal,
  AnalyticsTable,
  DistributionBar,
  DonutChart,
  RankedBarList,
  TimeSeriesChart,
} from '../../components/analytics/AnalyticsPrimitives'

const ACTIVE_STATUSES = new Set(['forwarded', 'assigned', 'en_route', 'in_progress', 'blocked', 'awaiting_verification'])
const RESOLVED_STATUSES = new Set(['resolved', 'completed'])

function titleCase(value) {
  return String(value || 'Unknown').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function escapeCsv(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function percent(value, total) {
  return total ? Math.round(value / total * 100) : 0
}

function hoursBetween(start, end) {
  const duration = new Date(end) - new Date(start)
  return Number.isFinite(duration) && duration >= 0 ? duration / 36e5 : null
}

function formatDuration(hours) {
  if (hours == null) return '—'
  if (hours < 24) return `${Math.round(hours)}h`
  return `${(hours / 24).toFixed(hours < 240 ? 1 : 0)}d`
}

function bucketLocation(item) {
  const raw = String(item.zone || item.address || '').trim()
  if (!raw) return 'Unspecified area'
  const parts = raw.split(',').map(part => part.trim()).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 2] : parts[0]
}

function monthLabel(value) {
  return new Date(`${value}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
}

function shortDate(value) {
  return new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
}

export default function CommercialReportsPage() {
  const complaints = useComplaintStore(state => state.complaints)
  const fetchComplaints = useComplaintStore(state => state.fetchComplaints)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [initialRange] = useState(() => manilaMonthRange())
  const [fromDate, setFromDate] = useState(initialRange.from)
  const [toDate, setToDate] = useState(initialRange.to)
  const [analysisNow, setAnalysisNow] = useState(() => Date.now())

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate })
      const [result] = await Promise.all([apiFetch(`/reports/summary?${params}`), fetchComplaints()])
      setData(result)
      setAnalysisNow(Date.now())
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ from: fromDate, to: toDate })
    Promise.all([apiFetch(`/reports/summary?${params}`), fetchComplaints()])
      .then(([result]) => { if (active) { setData(result); setAnalysisNow(Date.now()) } })
      .catch(loadError => { if (active) setError(loadError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [fetchComplaints, fromDate, toDate])

  const scopedComplaints = useMemo(() => complaints.filter(item => {
    const filed = new Date(item.created_at)
    const from = new Date(`${fromDate}T00:00:00`)
    const to = new Date(`${toDate}T23:59:59.999`)
    return filed >= from && filed <= to
  }), [complaints, fromDate, toDate])

  const analytics = useMemo(() => {
    const now = analysisNow
    const resolved = scopedComplaints.filter(item => RESOLVED_STATUSES.has(item.status))
    const active = scopedComplaints.filter(item => ACTIVE_STATUSES.has(item.status))
    const resolutionHours = resolved
      .map(item => hoursBetween(item.created_at, item.verified_at || item.completed_at || item.updated_at))
      .filter(value => value != null)
    const averageResolutionHours = resolutionHours.length
      ? resolutionHours.reduce((sum, value) => sum + value, 0) / resolutionHours.length
      : null
    const aging = { '0–1 day': 0, '2–3 days': 0, '4–7 days': 0, '8+ days': 0 }
    for (const item of active) {
      const days = Math.max(0, (now - new Date(item.created_at).getTime()) / 864e5)
      if (days < 2) aging['0–1 day'] += 1
      else if (days < 4) aging['2–3 days'] += 1
      else if (days < 8) aging['4–7 days'] += 1
      else aging['8+ days'] += 1
    }
    const locationCounts = new Map()
    for (const item of scopedComplaints) {
      const label = bucketLocation(item)
      locationCounts.set(label, (locationCounts.get(label) || 0) + 1)
    }
    const oldestActiveDays = active.reduce((oldest, item) =>
      Math.max(oldest, Math.floor(Math.max(0, now - new Date(item.created_at).getTime()) / 864e5)), 0)

    return {
      total: scopedComplaints.length,
      resolved: resolved.length,
      active: active.length,
      pending: scopedComplaints.filter(item => item.status === 'pending').length,
      rejected: scopedComplaints.filter(item => item.status === 'rejected').length,
      cancelled: scopedComplaints.filter(item => item.status === 'cancelled').length,
      highPriority: scopedComplaints.filter(item => item.priority === 'high').length,
      highPriorityActive: active.filter(item => item.priority === 'high').length,
      reopened: scopedComplaints.filter(item => item.reopened_at).length,
      classifierReview: scopedComplaints.filter(item => item.classification_mismatch || item.classification_multi_issue).length,
      resolutionRate: percent(resolved.length, scopedComplaints.length),
      averageResolutionHours,
      oldestActiveDays,
      aging,
      locations: [...locationCounts].map(([label, value]) => ({ label, value })),
    }
  }, [analysisNow, scopedComplaints])

  const summary = data?.summary || {}
  const feedbackCoverage = percent(summary.feedback_count || 0, analytics.resolved)
  const csvRows = useMemo(() => scopedComplaints.map(item => [
    item.reference_number, item.complaint_type, item.customer_name, item.status, item.priority,
    item.assigned_name || '', item.address, item.created_at, item.completed_at || '', item.description,
  ]), [scopedComplaints])

  const monthlyRows = useMemo(() => (data?.monthly_summary || []).map(item => ({
    ...item,
    label: monthLabel(item.month),
    completionRate: percent(item.completed, item.filed),
    backlogChange: item.filed - item.completed,
  })).reverse(), [data])
  const activityTrend = useMemo(() => {
    const start = new Date(`${fromDate}T00:00:00+08:00`).getTime()
    const end = new Date(`${toDate}T23:59:59.999+08:00`).getTime()
    const span = Math.max(864e5, end - start + 1)
    const spanDays = Math.max(1, Math.ceil(span / 864e5))
    const bucketCount = Math.min(10, spanDays)
    const bucketWidth = span / bucketCount
    const points = Array.from({ length: bucketCount }, (_, index) => ({
      label: shortDate(start + (index + 0.5) * bucketWidth),
      filed: 0,
      completed: 0,
    }))
    const addEvent = (value, key) => {
      const timestamp = new Date(value).getTime()
      if (!Number.isFinite(timestamp) || timestamp < start || timestamp > end) return
      const index = Math.min(bucketCount - 1, Math.floor((timestamp - start) / bucketWidth))
      points[index][key] += 1
    }
    for (const item of complaints) {
      addEvent(item.created_at, 'filed')
      if (RESOLVED_STATUSES.has(item.status)) addEvent(item.verified_at || item.completed_at || item.updated_at, 'completed')
    }
    return { points, intervalDays: Math.max(1, Math.round(spanDays / bucketCount)) }
  }, [complaints, fromDate, toDate])

  const exportCsv = () => {
    const headers = ['Complaint Reference', 'Complaint Type', 'Customer', 'Status', 'Priority', 'Maintenance Personnel', 'Address', 'Submitted', 'Resolved', 'Description']
    const content = [headers, ...csvRows].map(row => row.map(escapeCsv).join(',')).join('\n')
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mrwd-complaints-${fromDate}-to-${toDate}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const selectPreset = preset => {
    const today = manilaDateYmd()
    if (preset === 'month') {
      const range = manilaMonthRange()
      setFromDate(range.from)
      setToDate(range.to)
    } else if (preset === '30days') {
      setFromDate(addDaysYmd(today, -29))
      setToDate(today)
    } else if (preset === 'quarter') {
      const [year, month] = today.split('-').map(Number)
      const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1
      setFromDate(`${year}-${String(quarterStartMonth).padStart(2, '0')}-01`)
      setToDate(today)
    }
  }

  if (loading && !data) return <PageLoader label="Preparing complaint analytics…" />

  const signals = [
    analytics.highPriorityActive > 0
      ? { title: `${analytics.highPriorityActive} active High-priority complaint${analytics.highPriorityActive === 1 ? '' : 's'}`, detail: 'Review routing and customer follow-up before lower-priority work.', tone: 'urgent', icon: 'alert' }
      : { title: 'No active High-priority backlog', detail: 'The selected period has no unresolved High-priority complaints.', tone: 'good', icon: 'check' },
    analytics.oldestActiveDays >= 4
      ? { title: `Oldest active complaint is ${analytics.oldestActiveDays} days old`, detail: 'Check for blocked work, missing customer information, or delayed verification.', tone: 'watch', icon: 'clock' }
      : { title: 'Active complaints are recent', detail: 'No active complaint in this period is older than four days.', tone: 'good', icon: 'clock' },
    analytics.classifierReview > 0
      ? { title: `${analytics.classifierReview} categorization review${analytics.classifierReview === 1 ? '' : 's'}`, detail: 'These complaints contain a type mismatch or multiple supported issues.', tone: 'info', icon: 'clipboard' }
      : { title: 'No categorization exceptions', detail: 'No type mismatch or multi-issue evidence was recorded in this period.', tone: 'good', icon: 'check' },
  ]

  const monthlyColumns = [
    { key: 'label', label: 'Month', className: 'font-bold text-navy-900' },
    { key: 'filed', label: 'Submitted', className: 'font-black text-navy-900' },
    { key: 'completed', label: 'Resolved', className: 'font-black text-green-700' },
    { key: 'completionRate', label: 'Resolved / submitted', render: row => `${row.completionRate}%` },
    { key: 'backlogChange', label: 'Backlog movement', render: row => <span className={row.backlogChange > 0 ? 'font-bold text-amber-700' : 'font-bold text-green-700'}>{row.backlogChange > 0 ? '+' : ''}{row.backlogChange}</span> },
  ]

  return (
    <div className="report-print-area space-y-5">
      <header className="page-band wave-header page-header no-print">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gold-400">Commercial Services · NSCCCD</p>
            <h1 className="mt-1 font-display text-2xl font-black text-white sm:text-3xl">Complaint analytics</h1>
            <p className="mt-1 max-w-3xl text-sm text-navy-300">Understand demand, customer impact, workflow outcomes, and the exceptions that need follow-up.</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button onClick={exportCsv} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-xs font-black text-navy-800"><AppIcon name="download" className="h-4 w-4" />Export CSV</button>
            <button onClick={() => window.print()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/40 px-4 py-2.5 text-xs font-black text-white hover:bg-white/10"><AppIcon name="document" className="h-4 w-4" />Print report</button>
          </div>
        </div>
      </header>

      <div className="hidden print:block"><h1 className="font-display text-2xl font-black">Metro Roxas Water District Complaint Analytics</h1><p className="text-sm text-gray-500">{fromDate} to {toDate} · Generated {new Date().toLocaleString('en-PH')}</p></div>
      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      <section className="card rounded-xl p-4 no-print" aria-label="Analytics date range">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="grid flex-1 grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <label className="block text-xs font-black uppercase tracking-wider text-gray-500">From<input type="date" value={fromDate} max={toDate} onChange={event => setFromDate(event.target.value)} className="input-field mt-1.5 rounded-lg" /></label>
            <label className="block text-xs font-black uppercase tracking-wider text-gray-500">To<input type="date" value={toDate} min={fromDate} onChange={event => setToDate(event.target.value)} className="input-field mt-1.5 rounded-lg" /></label>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 lg:w-auto" aria-label="Quick date ranges">
            {[['month', 'This month'], ['30days', 'Last 30 days'], ['quarter', 'This quarter']].map(([value, label]) => <button key={value} type="button" onClick={() => selectPreset(value)} className="btn-secondary min-w-0 rounded-lg px-2 text-xs">{label}</button>)}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500"><span>Submission-date basis · Manila time</span><span className="font-bold text-navy-700">{analytics.total} complaint{analytics.total === 1 ? '' : 's'} in scope</span></div>
      </section>

      <AnalyticsKpiRail ariaLabel="Complaint performance indicators">
        <AnalyticsKpi label="Complaints" value={analytics.total} detail={`${analytics.pending} awaiting initial review`} icon="clipboard" />
        <AnalyticsKpi label="Resolution rate" value={`${analytics.resolutionRate}%`} detail={`${analytics.resolved} resolved in period`} icon="check" accent="green" />
        <AnalyticsKpi label="Active backlog" value={analytics.active} detail={`${analytics.oldestActiveDays}d oldest active`} icon="assignment" accent={analytics.oldestActiveDays >= 4 ? 'amber' : 'blue'} />
        <AnalyticsKpi label="High priority" value={analytics.highPriority} detail={`${analytics.highPriorityActive} still active`} icon="alert" accent={analytics.highPriorityActive ? 'red' : 'green'} />
        <AnalyticsKpi label="Avg. resolution" value={formatDuration(analytics.averageResolutionHours)} detail="Submission to completion" icon="clock" accent="blue" />
        <AnalyticsKpi label="Customer rating" value={summary.average_rating ? `${summary.average_rating}/5` : '—'} detail={`${summary.feedback_count || 0} responses · ${feedbackCoverage}% coverage`} icon="star" accent="amber" />
      </AnalyticsKpiRail>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <div className="card rounded-xl p-5">
          <AnalyticsSectionHeading eyebrow="Workflow health" title="Complaint flow and aging" description="See how much work is still moving through the service process and how long active complaints have been waiting." />
          <div className="mt-5"><DistributionBar total={analytics.total} items={[
            { label: 'Resolved', value: analytics.resolved, accent: 'green' },
            { label: 'Active', value: analytics.active, accent: 'blue' },
            { label: 'Pending review', value: analytics.pending, accent: 'amber' },
            { label: 'Rejected / cancelled', value: analytics.rejected + analytics.cancelled, accent: 'red' },
          ]} /></div>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div><p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500">Active complaint age</p><RankedBarList items={analytics.aging} total={analytics.active} maxItems={4} /></div>
            <div className="space-y-2.5">{signals.map(signal => <AnalyticsSignal key={signal.title} {...signal} />)}</div>
          </div>
        </div>

        <div className="card rounded-xl p-5">
          <AnalyticsSectionHeading eyebrow="Customer experience" title="Resolution and feedback quality" description="Feedback is useful only when enough resolved complaints receive a response." />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-gray-500">Feedback coverage</p><p className="mt-2 text-2xl font-black text-navy-900">{feedbackCoverage}%</p><p className="mt-1 text-xs text-gray-500">of resolved complaints</p></div>
            <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-gray-500">Reopened</p><p className="mt-2 text-2xl font-black text-navy-900">{analytics.reopened}</p><p className="mt-1 text-xs text-gray-500">in selected period</p></div>
          </div>
          <div className="mt-4">
            {feedbackCoverage < 30 && analytics.resolved > 0
              ? <AnalyticsSignal tone="watch" icon="feedback" title="Feedback coverage is limited" detail="Use the rating cautiously and encourage feedback after verified resolution." />
              : <AnalyticsSignal tone="good" icon="feedback" title="Customer feedback is represented" detail={analytics.resolved ? 'Coverage is sufficient for a directional customer-service signal.' : 'Feedback will appear after complaints are resolved.'} />}
          </div>
          <dl className="mt-4 divide-y divide-gray-100 text-sm">
            <div className="flex justify-between gap-3 py-3"><dt className="text-gray-500">Rejected complaints</dt><dd className="font-black text-navy-900">{analytics.rejected}</dd></div>
            <div className="flex justify-between gap-3 py-3"><dt className="text-gray-500">Customer cancellations</dt><dd className="font-black text-navy-900">{analytics.cancelled}</dd></div>
            <div className="flex justify-between gap-3 py-3"><dt className="text-gray-500">Classification review flags</dt><dd className="font-black text-navy-900">{analytics.classifierReview}</dd></div>
          </dl>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <div className="card rounded-xl p-5"><AnalyticsSectionHeading title="Complaint demand" description="Most reported complaint types." /><div className="mt-5"><RankedBarList items={Object.entries(data?.by_category || {}).map(([label, value]) => ({ label, value }))} total={analytics.total} /></div></div>
        <div className="card rounded-xl p-5"><AnalyticsSectionHeading title="Priority mix" description="Urgency assigned after complaint review." /><div className="mt-5"><DonutChart items={Object.entries(data?.by_priority || {}).map(([label, value]) => ({ label: titleCase(label), value, accent: label === 'high' ? 'red' : label === 'medium' ? 'amber' : 'green' }))} total={analytics.total} centerLabel="Complaints" ariaLabel="Complaint priority distribution" /></div></div>
        <div className="card rounded-xl p-5"><AnalyticsSectionHeading title="Areas generating demand" description="Locations are grouped from the submitted zone or address." /><div className="mt-5"><RankedBarList items={analytics.locations} total={analytics.total} /></div></div>
      </section>

      <section className="card rounded-xl p-4 sm:p-5">
        <AnalyticsSectionHeading eyebrow="Trend" title="Complaint activity" description={`Submitted and resolved events are plotted across the selected range in ${activityTrend.intervalDays}-day intervals.`} aside={<span className="rounded-full bg-navy-50 px-3 py-1.5 text-xs font-black text-navy-800">Oldest to latest</span>} />
        <div className="mt-5"><TimeSeriesChart data={activityTrend.points} series={[{ key: 'filed', label: 'Submitted', accent: 'blue' }, { key: 'completed', label: 'Resolved', accent: 'green' }]} ariaLabel="Submitted and resolved complaint trend for the selected date range" emptyLabel="No complaint activity falls within this period." /></div>
        <details className="analytics-details mt-5 rounded-xl border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-black text-navy-900">View monthly figures and backlog movement</summary>
          <div className="border-t border-gray-200 p-3"><AnalyticsTable columns={monthlyColumns} rows={monthlyRows} rowKey={row => row.month} emptyLabel="No complaint activity falls within this period." /></div>
        </details>
      </section>

      <p className="px-1 text-xs leading-5 text-gray-500">Analytics are decision-support summaries based on the selected complaint submission range. A low-volume period can produce unstable rates; open the complaint review queue before making case-level decisions.</p>
    </div>
  )
}
