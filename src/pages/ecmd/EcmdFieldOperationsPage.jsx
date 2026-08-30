import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useComplaintStore } from '../../store/complaintStore'
import { useOperationalStore } from '../../store/operationalStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import ComplaintOperationsMap from '../../components/ui/ComplaintOperationsMap'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import ScheduledReportsPanel from '../../components/ui/ScheduledReportsPanel'
import Dialog from '../../components/ui/Dialog'
import AppIcon from '../../components/ui/AppIcon'
import {
  AnalyticsKpi,
  AnalyticsSectionHeading,
  AnalyticsSignal,
  DistributionBar,
  RankedBarList,
} from '../../components/analytics/AnalyticsPrimitives'

const ACTIVE = new Set(['forwarded','assigned','en_route','in_progress','blocked','awaiting_verification'])

function bucketLocation(item) {
  const raw = String(item.zone || item.address || '').trim()
  if (!raw) return 'Unspecified area'
  const parts = raw.split(',').map(part => part.trim()).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 2] : parts[0]
}

function percent(value, total) {
  return total ? Math.round(value / total * 100) : 0
}

function formatDuration(hours) {
  if (hours == null) return '—'
  if (hours < 24) return `${Math.round(hours)}h`
  return `${(hours / 24).toFixed(hours < 240 ? 1 : 0)}d`
}

export default function EcmdFieldOperationsPage() {
  const navigate = useNavigate()
  const complaints = useComplaintStore(state => state.complaints)
  const loading = useComplaintStore(state => state.loading)
  const error = useComplaintStore(state => state.error)
  const fetchComplaints = useComplaintStore(state => state.fetchComplaints)
  const workload = useOperationalStore(state => state.workload)
  const incidents = useOperationalStore(state => state.incidents)
  const operationalError = useOperationalStore(state => state.error)
  const fetchWorkload = useOperationalStore(state => state.fetchWorkload)
  const fetchOperationalReference = useOperationalStore(state => state.fetchOperationalReference)
  const createIncident = useOperationalStore(state => state.createIncident)
  const setIncidentStatus = useOperationalStore(state => state.setIncidentStatus)

  const [incidentOpen, setIncidentOpen] = useState(false)
  const [incidentForm, setIncidentForm] = useState({ title: '', description: '', location_text: '', complaint_ids: [] })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [windowDays, setWindowDays] = useState(30)
  const [analysisNow, setAnalysisNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    const result = await Promise.all([fetchComplaints(), fetchWorkload(), fetchOperationalReference()])
    setAnalysisNow(Date.now())
    return result
  }, [fetchComplaints, fetchWorkload, fetchOperationalReference])
  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const active = useMemo(() => complaints.filter(item => ACTIVE.has(item.status)), [complaints])
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  const completedToday = useMemo(() => complaints.filter(item => {
    if (!['resolved','completed'].includes(item.status)) return false
    const value = item.verified_at || item.completed_at || item.updated_at
    return value && new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) === today
  }), [complaints, today])

  const analytics = useMemo(() => {
    const now = analysisNow
    const cutoff = now - windowDays * 864e5
    const periodIntake = complaints.filter(item => new Date(item.created_at).getTime() >= cutoff)
    const periodResolved = complaints.filter(item => {
      if (!['resolved', 'completed'].includes(item.status)) return false
      const completedAt = item.verified_at || item.completed_at || item.updated_at
      return completedAt && new Date(completedAt).getTime() >= cutoff
    })
    const durations = periodResolved.map(item => {
      const start = new Date(item.created_at).getTime()
      const end = new Date(item.verified_at || item.completed_at || item.updated_at).getTime()
      return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 36e5 : null
    }).filter(value => value != null)
    const aging = { '0–1 day': 0, '2–3 days': 0, '4–7 days': 0, '8+ days': 0 }
    for (const item of active) {
      const days = Math.max(0, (now - new Date(item.created_at).getTime()) / 864e5)
      if (days < 2) aging['0–1 day'] += 1
      else if (days < 4) aging['2–3 days'] += 1
      else if (days < 8) aging['4–7 days'] += 1
      else aging['8+ days'] += 1
    }
    const typeCounts = new Map()
    for (const item of periodIntake) {
      const label = item.complaint_type || 'Unknown'
      typeCounts.set(label, (typeCounts.get(label) || 0) + 1)
    }
    const availableStaff = workload.filter(person => String(person.availability_status || 'available') === 'available').length
    const assignedTasks = workload.reduce((sum, person) => sum + Number(person.active_tasks || 0), 0)
    return {
      intake: periodIntake.length,
      resolved: periodResolved.length,
      closureRatio: percent(periodResolved.length, periodIntake.length),
      averageResolutionHours: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
      ready: complaints.filter(item => item.status === 'forwarded' && !item.assigned_to).length,
      activeField: complaints.filter(item => ['assigned', 'en_route', 'in_progress'].includes(item.status)).length,
      blocked: complaints.filter(item => item.status === 'blocked').length,
      verification: complaints.filter(item => item.status === 'awaiting_verification').length,
      highActive: active.filter(item => item.priority === 'high').length,
      oldestDays: active.reduce((oldest, item) => Math.max(oldest, Math.floor(Math.max(0, now - new Date(item.created_at).getTime()) / 864e5)), 0),
      aging,
      availableStaff,
      assignedTasks,
      overloadedStaff: workload.filter(person => Number(person.active_tasks || 0) >= 4).length,
      typeCounts: [...typeCounts].map(([label, value]) => ({ label, value })),
    }
  }, [active, analysisNow, complaints, windowDays, workload])

  const hotspotRows = useMemo(() => {
    const map = new Map()
    for (const item of active) {
      const area = bucketLocation(item)
      const current = map.get(area) || { area, total: 0, high: 0, leak: 0, noWater: 0 }
      current.total += 1
      if (item.priority === 'high') current.high += 1
      const type = String(item.complaint_type || '').toLowerCase()
      if (type.includes('leak')) current.leak += 1
      if (type.includes('water') && (type.includes('no') || type.includes('interruption'))) current.noWater += 1
      map.set(area, current)
    }
    return [...map.values()].sort((a,b) => b.total - a.total).slice(0, 8)
  }, [active])

  const recurringLocations = useMemo(() => {
    const groups = {}
    for (const item of complaints) {
      const key = String(item.address || '').trim().toLowerCase()
      if (!key) continue
      ;(groups[key] ||= []).push(item)
    }
    return Object.values(groups).filter(group => group.length >= 2).sort((a,b) => b.length-a.length).slice(0,8)
  }, [complaints])

  const incidentSummary = useMemo(() => ({
    active: incidents.filter(item => item.status === 'active').length,
    monitoring: incidents.filter(item => item.status === 'monitoring').length,
    resolved: incidents.filter(item => item.status === 'resolved').length,
  }), [incidents])

  const create = async event => {
    event.preventDefault()
    setBusy(true)
    try {
      await createIncident(incidentForm)
      setNotice('Incident created and selected complaints grouped.')
      setIncidentOpen(false)
      setIncidentForm({ title: '', description: '', location_text: '', complaint_ids: [] })
      await fetchOperationalReference()
    } catch (createError) {
      setNotice(createError.message)
    } finally { setBusy(false) }
  }

  if (loading && !complaints.length) return <PageLoader label="Loading ECMD field operations…" />

  return <div className="space-y-5">
    <header className="page-band wave-header rounded-2xl px-5 py-6 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-widest text-gold-400">ECMD · WDLCD</p>
      <div className="mt-1 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><h1 className="font-display text-2xl font-black text-white sm:text-3xl">Field operations analytics</h1><p className="mt-1 max-w-3xl text-sm text-navy-300">Balance the active queue, staff capacity, complaint aging, area demand, incidents, and completed field work.</p></div>
        <div className="flex flex-col gap-2 min-[420px]:flex-row">
          <div className="flex rounded-lg border border-white/30 p-1" aria-label="Performance window">
            {[7, 30, 90].map(days => <button key={days} type="button" aria-pressed={windowDays === days} onClick={() => setWindowDays(days)} className={`filter-chip min-h-9 rounded-md px-3 text-xs font-black ${windowDays === days ? 'bg-white text-navy-900' : 'text-white hover:bg-white/10'}`}>{days} days</button>)}
          </div>
          <button onClick={() => setIncidentOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gold-400 px-4 py-2.5 text-xs font-black text-navy-950"><AppIcon name="alert" className="h-4 w-4" />Create incident</button>
        </div>
      </div>
    </header>

    {(error || operationalError) && <ErrorBanner message={error || operationalError} onRetry={load}/>} 
    {notice && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">{notice}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label="Field operations indicators">
      <AnalyticsKpi label="Ready to assign" value={analytics.ready} detail="Reviewed, not yet assigned" icon="assignment" accent={analytics.ready ? 'amber' : 'green'} />
      <AnalyticsKpi label="Active field work" value={analytics.activeField} detail={`${analytics.assignedTasks} staff assignments`} icon="tool" accent="blue" />
      <AnalyticsKpi label="Blocked" value={analytics.blocked} detail="Needs coordination or support" icon="alert" accent={analytics.blocked ? 'red' : 'green'} />
      <AnalyticsKpi label="For verification" value={analytics.verification} detail="Field work marked complete" icon="clipboard" accent={analytics.verification ? 'amber' : 'green'} />
      <AnalyticsKpi label={`Resolved · ${windowDays}d`} value={analytics.resolved} detail={`${analytics.closureRatio}% of period intake`} icon="check" accent="green" />
      <AnalyticsKpi label="Resolved today" value={completedToday.length} detail={`${formatDuration(analytics.averageResolutionHours)} avg. resolution`} icon="clock" />
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <div className="card rounded-xl p-5">
        <AnalyticsSectionHeading eyebrow="Queue health" title="Current work pipeline and aging" description="Current backlog is shown regardless of the selected performance window." />
        <div className="mt-5"><DistributionBar total={active.length} items={[
          { label: 'Ready', value: analytics.ready, accent: 'amber' },
          { label: 'In field', value: analytics.activeField, accent: 'blue' },
          { label: 'Blocked', value: analytics.blocked, accent: 'red' },
          { label: 'Verification', value: analytics.verification, accent: 'green' },
        ]} /></div>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div><p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500">Age of active complaints</p><RankedBarList items={analytics.aging} total={active.length} maxItems={4} /></div>
          <div className="space-y-2.5">
            <AnalyticsSignal tone={analytics.highActive ? 'urgent' : 'good'} icon={analytics.highActive ? 'alert' : 'check'} title={analytics.highActive ? `${analytics.highActive} active High-priority case${analytics.highActive === 1 ? '' : 's'}` : 'No High-priority active work'} detail={analytics.highActive ? 'Confirm assignment and remove blockers before lower-priority work.' : 'No unresolved High-priority complaint is currently in the ECMD queue.'} />
            <AnalyticsSignal tone={analytics.oldestDays >= 4 ? 'watch' : 'good'} icon="clock" title={`Oldest active case: ${analytics.oldestDays} day${analytics.oldestDays === 1 ? '' : 's'}`} detail={analytics.oldestDays >= 4 ? 'Review aging cases for access, material, assignment, or verification delays.' : 'The current active queue is within the four-day review threshold.'} />
            <AnalyticsSignal tone={analytics.overloadedStaff ? 'watch' : 'good'} icon="users" title={analytics.overloadedStaff ? `${analytics.overloadedStaff} heavily loaded staff member${analytics.overloadedStaff === 1 ? '' : 's'}` : 'No staff member has four or more active tasks'} detail="Use workload together with availability and task complexity before reassigning work." />
          </div>
        </div>
      </div>

      <div className="card rounded-xl p-5">
        <AnalyticsSectionHeading eyebrow={`${windowDays}-day performance`} title="Intake and field throughput" description="Closures are compared with new complaint intake for the selected window." />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-gray-500">New intake</p><p className="mt-2 text-2xl font-black text-navy-900">{analytics.intake}</p></div>
          <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-gray-500">Field closures</p><p className="mt-2 text-2xl font-black text-green-700">{analytics.resolved}</p></div>
          <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-gray-500">Closures / intake</p><p className="mt-2 text-2xl font-black text-navy-900">{analytics.closureRatio}%</p></div>
          <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-gray-500">Avg. resolution</p><p className="mt-2 text-2xl font-black text-navy-900">{formatDuration(analytics.averageResolutionHours)}</p></div>
        </div>
        <div className="mt-5"><p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500">Incoming work by type</p><RankedBarList items={analytics.typeCounts} total={analytics.intake} maxItems={5} /></div>
      </div>
    </section>

    <section className="card rounded-xl p-5">
      <AnalyticsSectionHeading eyebrow="Capacity" title="Workload and availability" description="Active assignments are a capacity signal, not a measure of task difficulty or staff performance." aside={<span className="rounded-full bg-green-100 px-3 py-1.5 text-xs font-black text-green-800">{analytics.availableStaff}/{workload.length} available</span>} />
      <div className="mt-5 grid gap-5 lg:grid-cols-[.75fr_1.25fr]">
        <div><RankedBarList items={workload.map(person => ({ label: person.full_name, value: Number(person.active_tasks || 0), accent: Number(person.active_tasks || 0) >= 4 ? 'amber' : 'blue' }))} total={analytics.assignedTasks} emptyLabel="No active staff workload is available." /></div>
        <div className="grid gap-3 md:grid-cols-2">{workload.map(person => <article key={person.id} className="rounded-xl border border-gray-200 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-bold text-gray-900">{person.full_name}</p><p className="mt-1 text-xs capitalize text-gray-500">{String(person.availability_status || 'available').replaceAll('_',' ')}</p></div><span className="shrink-0 rounded-lg bg-navy-50 px-2.5 py-1 text-xs font-black text-navy-800">{person.active_tasks} task{person.active_tasks === 1 ? '' : 's'}</span></div>{person.blocked_tasks > 0 ? <p className="mt-2 text-xs font-bold text-orange-700">{person.blocked_tasks} blocked task{person.blocked_tasks === 1 ? '' : 's'}</p> : null}{person.availability_note ? <p className="mt-2 text-xs leading-5 text-gray-500">{person.availability_note}</p> : null}</article>)}</div>
      </div>
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <div className="card rounded-xl p-5"><h2 className="font-display font-black text-navy-900">Complaint hotspots</h2><p className="mt-1 text-xs text-gray-500">Areas with several active complaints.</p><div className="mt-4 space-y-2">{hotspotRows.length ? hotspotRows.map(row => <div key={row.area} className="rounded-lg border border-gray-100 bg-gray-50 p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-gray-900">{row.area}</p><span className="rounded-full bg-navy-800 px-2 py-0.5 text-xs font-black text-white">{row.total}</span></div><p className="mt-1 text-xs text-gray-500">{row.high} high priority · {row.leak} leak · {row.noWater} no water / interruption</p></div>) : <p className="py-6 text-center text-sm text-gray-500">No active complaint hotspots yet.</p>}</div></div>
      <div className="card rounded-xl p-5"><h2 className="font-display font-black text-navy-900">Recurring locations</h2><p className="mt-1 text-xs text-gray-500">Locations with repeated complaints that may point to an ongoing infrastructure problem.</p><div className="mt-4 space-y-2">{recurringLocations.length ? recurringLocations.map(group => <button key={group[0].address} onClick={() => navigate(`/complaints/${group[0].id}`)} className="w-full rounded-lg border border-gray-100 bg-gray-50 p-3 text-left hover:bg-gray-100"><div className="flex items-start justify-between gap-3"><p className="text-sm font-bold text-gray-900">{group[0].address}</p><span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800">{group.length} records</span></div><p className="mt-1 text-xs text-gray-500">Latest: {group[0].reference_number}</p></button>) : <p className="py-6 text-center text-sm text-gray-500">No recurring complaint locations found.</p>}</div></div>
    </section>

    <section className="card rounded-xl p-5"><h2 className="font-display font-black text-navy-900">Active complaint map</h2><p className="mt-1 text-xs text-gray-500">Map of active complaints with saved locations.</p><div className="mt-4"><ComplaintOperationsMap complaints={active} onOpen={item => navigate(`/complaints/${item.id}`)}/></div></section>

    <section className="card rounded-xl p-5">
      <AnalyticsSectionHeading title="Complaint incidents" description="Group complaints that describe the same leak, interruption, or other shared field issue." aside={<button onClick={() => setIncidentOpen(true)} className="btn-secondary rounded-lg text-xs">Create incident</button>} />
      <div className="mt-4"><DistributionBar total={incidents.length} items={[
        { label: 'Active', value: incidentSummary.active, accent: 'red' },
        { label: 'Monitoring', value: incidentSummary.monitoring, accent: 'amber' },
        { label: 'Resolved', value: incidentSummary.resolved, accent: 'green' },
      ]} emptyLabel="No complaint incidents have been created." /></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">{incidents.length ? incidents.map(incident => <article key={incident.id} className="rounded-xl border border-gray-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-gray-900">{incident.title}</p><p className="mt-1 text-xs text-gray-500">{incident.location_text || 'No location label'} · {incident.members?.length || 0} complaint{incident.members?.length === 1 ? '' : 's'}</p></div><span className="rounded bg-gray-100 px-2 py-1 text-xs font-black uppercase text-gray-600">{incident.status}</span></div>{incident.description ? <p className="mt-2 text-xs text-gray-600">{incident.description}</p> : null}<div className="mt-3 flex gap-2">{incident.status !== 'resolved' ? <button onClick={() => setIncidentStatus(incident.id, incident.status === 'active' ? 'monitoring' : 'active')} className="btn-secondary rounded-lg text-xs">{incident.status === 'active' ? 'Monitor' : 'Set active'}</button> : null}{incident.status !== 'resolved' ? <button onClick={() => setIncidentStatus(incident.id, 'resolved')} className="rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white">Resolve incident</button> : null}</div></article>) : <p className="col-span-2 py-8 text-center text-sm text-gray-500">No complaint incidents have been created.</p>}</div>
    </section>

    <ScheduledReportsPanel allowedTypes={['maintenance_workload']} defaultType="maintenance_workload" title="Scheduled workload reports" description="Create weekly or monthly Maintenance Personnel workload reports." />

    <Dialog open={incidentOpen} title="Create complaint incident" description="Use an incident when several complaints describe the same field issue." onClose={() => !busy && setIncidentOpen(false)} closeDisabled={busy} maxWidth="max-w-2xl">
      <form onSubmit={create}>
        <div className="space-y-4">
          <label className="block" htmlFor="incident-title"><span className="mb-1.5 block text-xs font-bold text-gray-600">Incident title <span aria-hidden="true">*</span></span><input id="incident-title" required minLength={3} value={incidentForm.title} onChange={event => setIncidentForm(value => ({ ...value, title: event.target.value }))} className="input-field rounded-lg" placeholder="Example: Banica mainline leak" /></label>
          <label className="block" htmlFor="incident-location"><span className="mb-1.5 block text-xs font-bold text-gray-600">Location</span><input id="incident-location" value={incidentForm.location_text} onChange={event => setIncidentForm(value => ({ ...value, location_text: event.target.value }))} className="input-field rounded-lg" placeholder="Barangay, street, or landmark" /></label>
          <label className="block" htmlFor="incident-description"><span className="mb-1.5 block text-xs font-bold text-gray-600">Description</span><textarea id="incident-description" rows={3} value={incidentForm.description} onChange={event => setIncidentForm(value => ({ ...value, description: event.target.value }))} className="input-field resize-none rounded-lg" /></label>
          <fieldset>
            <legend className="mb-2 text-xs font-bold text-gray-600">Complaints to include</legend>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-2">
              {active.map(item => <label key={item.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-gray-50"><input type="checkbox" checked={incidentForm.complaint_ids.includes(item.id)} onChange={event => setIncidentForm(value => ({ ...value, complaint_ids: event.target.checked ? [...value.complaint_ids, item.id] : value.complaint_ids.filter(id => id !== item.id) }))} className="mt-1 h-5 w-5 accent-navy-800" /><span className="min-w-0"><span className="flex flex-wrap items-center gap-2 text-xs font-bold text-gray-900">{item.reference_number}<PriorityBadge priority={item.priority}/><StatusBadge status={item.status}/></span><span className="mt-1 block truncate text-xs text-gray-500">{item.complaint_type} · {item.address}</span></span></label>)}
            </div>
          </fieldset>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => setIncidentOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button disabled={busy || incidentForm.title.trim().length < 3} className="btn-primary rounded-lg disabled:opacity-50">{busy ? 'Creating…' : 'Create incident'}</button></div>
      </form>
    </Dialog>
  </div>
}
