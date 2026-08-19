import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useComplaintStore } from '../../store/complaintStore'
import { useOperationalStore } from '../../store/operationalStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import ComplaintOperationsMap from '../../components/ui/ComplaintOperationsMap'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import ScheduledReportsPanel from '../../components/ui/ScheduledReportsPanel'

const ACTIVE = new Set(['forwarded','assigned','en_route','in_progress','blocked','awaiting_verification'])

function bucketLocation(item) {
  const raw = String(item.zone || item.address || '').trim()
  if (!raw) return 'Unspecified area'
  const parts = raw.split(',').map(part => part.trim()).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 2] : parts[0]
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

  const load = useCallback(() => Promise.all([fetchComplaints(), fetchWorkload(), fetchOperationalReference()]), [fetchComplaints, fetchWorkload, fetchOperationalReference])
  useEffect(() => { load() }, [load])

  const active = useMemo(() => complaints.filter(item => ACTIVE.has(item.status)), [complaints])
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  const completedToday = useMemo(() => complaints.filter(item => {
    if (!['resolved','completed'].includes(item.status)) return false
    const value = item.verified_at || item.completed_at || item.updated_at
    return value && new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) === today
  }), [complaints, today])

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

  const create = async event => {
    event.preventDefault()
    setBusy(true)
    try {
      await createIncident(incidentForm)
      setNotice('Operational incident created and selected complaints grouped.')
      setIncidentOpen(false)
      setIncidentForm({ title: '', description: '', location_text: '', complaint_ids: [] })
      await fetchOperationalReference()
    } catch (createError) {
      setNotice(createError.message)
    } finally { setBusy(false) }
  }

  if (loading && !complaints.length) return <PageLoader label="Loading ECMD field operations..." />

  return <div className="space-y-5">
    <div className="page-band wave-header rounded-2xl px-5 py-6 sm:px-6">
      <p className="text-[11px] font-bold uppercase tracking-widest text-gold-400">ECMD Operations Center</p>
      <div className="mt-1 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="font-display text-2xl font-black text-white sm:text-3xl">Field Operations</h1><p className="mt-1 max-w-3xl text-sm text-navy-300">Daily workload, personnel availability, complaint hotspots, recurring locations, active incidents, and mapped field activity.</p></div><button onClick={() => setIncidentOpen(true)} className="rounded-lg bg-gold-400 px-4 py-2.5 text-xs font-black text-navy-950">Create Incident</button></div>
    </div>

    {(error || operationalError) && <ErrorBanner message={error || operationalError} onRetry={load}/>} 
    {notice && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">{notice}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[
        ['Received / Forwarded', complaints.filter(i => i.status === 'forwarded').length],
        ['Unassigned', complaints.filter(i => i.status === 'forwarded' && !i.assigned_to).length],
        ['In Progress', complaints.filter(i => ['assigned','en_route','in_progress'].includes(i.status)).length],
        ['Awaiting ECMD Verification', complaints.filter(i => i.status === 'awaiting_verification').length],
        ['Resolved Today', completedToday.length],
      ].map(([label,value]) => <div key={label} className="card rounded-xl p-4"><p className="font-display text-3xl font-black text-navy-900">{value}</p><p className="mt-1 text-[11px] font-black uppercase tracking-wide text-gray-500">{label}</p></div>)}
    </section>

    <section className="card rounded-xl p-5">
      <div className="mb-4"><h2 className="font-display font-black text-navy-900">Maintenance Personnel Workload & Availability</h2><p className="mt-1 text-xs text-gray-500">Availability is maintained by each staff account; active-task counts come from current assignments.</p></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{workload.map(person => <div key={person.id} className="rounded-xl border border-gray-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-gray-900">{person.full_name}</p><p className="mt-1 text-xs capitalize text-gray-500">{String(person.availability_status || 'available').replaceAll('_',' ')}</p></div><span className="rounded-lg bg-navy-50 px-2.5 py-1 text-xs font-black text-navy-800">{person.active_tasks} active</span></div>{person.blocked_tasks > 0 && <p className="mt-2 text-xs font-bold text-orange-700">{person.blocked_tasks} blocked task{person.blocked_tasks === 1 ? '' : 's'}</p>}{person.availability_note && <p className="mt-2 text-xs text-gray-500">{person.availability_note}</p>}</div>)}</div>
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <div className="card rounded-xl p-5"><h2 className="font-display font-black text-navy-900">Complaint Hotspots</h2><p className="mt-1 text-xs text-gray-500">Active complaint concentration by reported area/address grouping.</p><div className="mt-4 space-y-2">{hotspotRows.length ? hotspotRows.map(row => <div key={row.area} className="rounded-lg border border-gray-100 bg-gray-50 p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-gray-900">{row.area}</p><span className="rounded-full bg-navy-800 px-2 py-0.5 text-xs font-black text-white">{row.total}</span></div><p className="mt-1 text-[11px] text-gray-500">{row.high} high priority · {row.leak} leak · {row.noWater} no-water/interruption</p></div>) : <p className="py-6 text-center text-sm text-gray-400">No active hotspot data yet.</p>}</div></div>
      <div className="card rounded-xl p-5"><h2 className="font-display font-black text-navy-900">Recurring Locations</h2><p className="mt-1 text-xs text-gray-500">Locations with multiple complaint records, useful for identifying repeat infrastructure problems.</p><div className="mt-4 space-y-2">{recurringLocations.length ? recurringLocations.map(group => <button key={group[0].address} onClick={() => navigate(`/complaints/${group[0].id}`)} className="w-full rounded-lg border border-gray-100 bg-gray-50 p-3 text-left hover:bg-gray-100"><div className="flex items-start justify-between gap-3"><p className="text-sm font-bold text-gray-900">{group[0].address}</p><span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800">{group.length} records</span></div><p className="mt-1 text-[11px] text-gray-500">Latest: {group[0].reference_number}</p></button>) : <p className="py-6 text-center text-sm text-gray-400">No recurring locations found.</p>}</div></div>
    </section>

    <section className="card rounded-xl p-5"><h2 className="font-display font-black text-navy-900">Active Complaint Map</h2><p className="mt-1 text-xs text-gray-500">Operational view of active complaints that include a pinned location.</p><div className="mt-4"><ComplaintOperationsMap complaints={active} onOpen={item => navigate(`/complaints/${item.id}`)}/></div></section>

    <section className="card rounded-xl p-5"><div className="flex items-end justify-between gap-3"><div><h2 className="font-display font-black text-navy-900">Related Complaint Incidents</h2><p className="mt-1 text-xs text-gray-500">Group multiple customer complaints that refer to one leak, interruption, or other shared operational incident.</p></div><button onClick={() => setIncidentOpen(true)} className="btn-secondary rounded-lg text-xs">New Incident</button></div><div className="mt-4 grid gap-3 md:grid-cols-2">{incidents.length ? incidents.map(incident => <div key={incident.id} className="rounded-xl border border-gray-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-gray-900">{incident.title}</p><p className="mt-1 text-xs text-gray-500">{incident.location_text || 'No location label'} · {incident.members?.length || 0} complaint{incident.members?.length === 1 ? '' : 's'}</p></div><span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-black uppercase text-gray-600">{incident.status}</span></div>{incident.description && <p className="mt-2 text-xs text-gray-600">{incident.description}</p>}<div className="mt-3 flex gap-2">{incident.status !== 'resolved' && <button onClick={() => setIncidentStatus(incident.id, incident.status === 'active' ? 'monitoring' : 'active')} className="btn-secondary rounded-lg text-xs">{incident.status === 'active' ? 'Monitor' : 'Set Active'}</button>}{incident.status !== 'resolved' && <button onClick={() => setIncidentStatus(incident.id, 'resolved')} className="rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white">Resolve Incident</button>}</div></div>) : <p className="col-span-2 py-8 text-center text-sm text-gray-400">No operational incidents have been created.</p>}</div></section>

    <ScheduledReportsPanel allowedTypes={['maintenance_workload']} defaultType="maintenance_workload" title="Scheduled Maintenance Workload Reports" description="Automatically generate weekly or monthly Maintenance Personnel workload summaries for ECMD review." />

    {incidentOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4" onMouseDown={() => !busy && setIncidentOpen(false)}><form onSubmit={create} onMouseDown={e => e.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><h2 className="font-display text-xl font-black text-navy-900">Create Operational Incident</h2><p className="mt-1 text-xs text-gray-500">Use this when several customer reports describe the same physical issue.</p><div className="mt-5 space-y-4"><div><label className="mb-1 block text-xs font-black uppercase text-gray-500">Incident Title *</label><input required minLength={3} value={incidentForm.title} onChange={e => setIncidentForm(v => ({...v,title:e.target.value}))} className="input-field rounded-lg" placeholder="Example: Banica mainline leak"/></div><div><label className="mb-1 block text-xs font-black uppercase text-gray-500">Location</label><input value={incidentForm.location_text} onChange={e => setIncidentForm(v => ({...v,location_text:e.target.value}))} className="input-field rounded-lg" placeholder="Barangay / street / landmark"/></div><div><label className="mb-1 block text-xs font-black uppercase text-gray-500">Description</label><textarea rows={3} value={incidentForm.description} onChange={e => setIncidentForm(v => ({...v,description:e.target.value}))} className="input-field resize-none rounded-lg"/></div><div><label className="mb-2 block text-xs font-black uppercase text-gray-500">Complaints to Group</label><div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-2">{active.map(item => <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-gray-50"><input type="checkbox" checked={incidentForm.complaint_ids.includes(item.id)} onChange={e => setIncidentForm(v => ({...v, complaint_ids: e.target.checked ? [...v.complaint_ids,item.id] : v.complaint_ids.filter(id => id !== item.id)}))} className="mt-1"/><span className="min-w-0"><span className="flex flex-wrap items-center gap-2 text-xs font-bold text-gray-900">{item.reference_number}<PriorityBadge priority={item.priority}/><StatusBadge status={item.status}/></span><span className="mt-1 block truncate text-[11px] text-gray-500">{item.complaint_type} · {item.address}</span></span></label>)}</div></div></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setIncidentOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button disabled={busy || incidentForm.title.trim().length < 3} className="btn-primary rounded-lg disabled:opacity-50">{busy ? 'Creating...' : 'Create Incident'}</button></div></form></div>}
  </div>
}
