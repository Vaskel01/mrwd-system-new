import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { useComplaintStore } from '../../store/complaintStore'
import { ErrorBanner, PageLoader, Spinner } from '../../components/ui/Feedback'

const MODULE_CONFIG = {
  commercial: {
    eyebrow: 'Commercial Department',
    title: 'Customer Accounts & Billing',
    description: 'Manage customer-account validation, bulk billing records, and requests to archive closed complaint records.',
    endpoint: '/operations/commercial-bootstrap',
    tabs: [['billing', 'Accounts & Billing'], ['inventory', 'Records & Archival']],
  },
  ecmd: {
    eyebrow: 'Engineering, Construction and Maintenance Department',
    title: 'ECMD Field Operations',
    description: 'Coordinate crews, manpower, shifts, service targets, escalations, equipment, and materials.',
    endpoint: '/operations/ecmd-bootstrap',
    tabs: [['overview', 'Field Oversight'], ['crews', 'Crews & Manpower'], ['schedules', 'Shifts & Targets'], ['inventory', 'Inventory']],
  },
  system: {
    eyebrow: 'System Administration',
    title: 'Departments, Approvals & Governance',
    description: 'Manage department access, staff assignments, independent approvals, archival, and auditable notification delivery.',
    endpoint: '/operations/system-bootstrap',
    tabs: [['overview', 'Approvals & Delivery'], ['crews', 'Departments & Access'], ['inventory', 'Approved Archival']],
  },
}

function titleCase(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

const STAFF_POSITION_LABELS = Object.freeze({
  manager: 'System Supervisor (Manager)',
  supervisor: 'System Supervisor',
  team_leader: 'Team Leader',
  crew_member: 'Maintenance Crew Member',
  commercial_staff: 'Commercial Department Staff',
  department_staff: 'ECMD Staff',
})

function staffPositionLabel(value) {
  return STAFF_POSITION_LABELS[value] || titleCase(value)
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
}

function parseCsv(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim())
  if (lines.length < 2) return []
  const readLine = line => {
    const values = []
    let current = ''
    let quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]
      if (character === '"' && quoted && line[index + 1] === '"') { current += '"'; index += 1 }
      else if (character === '"') quoted = !quoted
      else if (character === ',' && !quoted) { values.push(current.trim()); current = '' }
      else current += character
    }
    values.push(current.trim())
    return values
  }
  const headers = readLine(lines[0]).map(value => value.toLowerCase().replace(/\s+/g, '_'))
  return lines.slice(1).map(line => Object.fromEntries(readLine(line).map((value, index) => [headers[index], value])))
}

function Section({ title, description, action, children }) {
  return <section className="card rounded-xl p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-display font-black text-navy-900">{title}</h2>{description && <p className="mt-1 text-xs text-gray-500">{description}</p>}</div>{action}</div><div className="mt-4">{children}</div></section>
}

function Field({ label, children, className = '' }) {
  return <label className={`block ${className}`}><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-gray-500">{label}</span>{children}</label>
}

export default function OperationsPage({ module = 'system' }) {
  const moduleConfig = MODULE_CONFIG[module] || MODULE_CONFIG.system
  const [tab, setTab] = useState(moduleConfig.tabs[0][0])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const complaints = useComplaintStore(state => state.complaints)
  const fetchComplaints = useComplaintStore(state => state.fetchComplaints)

  const load = async () => {
    setError('')
    try {
      const result = await apiFetch(moduleConfig.endpoint)
      setData(result)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    Promise.all([apiFetch(moduleConfig.endpoint), fetchComplaints()])
      .then(([result]) => {
        if (active) setData(result)
      })
      .catch(loadError => {
        if (active) setError(loadError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [fetchComplaints, moduleConfig.endpoint])

  const run = async (key, action, success) => {
    setBusy(key); setError(''); setMessage('')
    try {
      await action()
      setMessage(success)
      await load()
      return true
    } catch (actionError) {
      setError(actionError.message)
      return false
    } finally {
      setBusy('')
    }
  }

  const staffMap = useMemo(() => Object.fromEntries((data?.staff || []).map(person => [person.id, person])), [data])
  const departmentMap = useMemo(() => Object.fromEntries((data?.departments || []).map(item => [item.id, item])), [data])
  const crewMap = useMemo(() => Object.fromEntries((data?.crews || []).map(item => [item.id, item])), [data])
  const complaintMap = useMemo(() => Object.fromEntries(complaints.map(item => [item.id, item])), [complaints])

  if (loading && !data) return <PageLoader label="Loading operations center..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-5 py-6 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gold-400">{moduleConfig.eyebrow}</p>
        <h1 className="mt-1 font-display text-2xl font-black text-white sm:text-3xl">{moduleConfig.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-navy-300">{moduleConfig.description}</p>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {message && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">{message}</div>}

      <div className="card grid grid-cols-1 gap-2 rounded-xl p-2 min-[420px]:grid-cols-2 lg:grid-cols-5" role="tablist" aria-label="Operations sections">
        {moduleConfig.tabs.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`min-h-10 rounded-lg px-3 py-2 text-xs font-black ${tab === value ? 'bg-navy-800 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{label}</button>)}
      </div>

      {tab === 'overview' && <OverviewTab data={data} busy={busy} run={run} complaintMap={complaintMap} staffMap={staffMap} module={module} />}
      {tab === 'crews' && <CrewsTab data={data} busy={busy} run={run} staffMap={staffMap} departmentMap={departmentMap} module={module} />}
      {tab === 'schedules' && <SchedulesTab data={data} busy={busy} run={run} staffMap={staffMap} />}
      {tab === 'billing' && <BillingTab data={data} busy={busy} run={run} />}
      {tab === 'inventory' && <InventoryTab data={data} busy={busy} run={run} complaints={complaints} staffMap={staffMap} crewMap={crewMap} module={module} />}
    </div>
  )
}

function OverviewTab({ data, busy, run, complaintMap, staffMap, module }) {
  const openEscalations = data?.escalations || []
  const pendingApprovals = (data?.approvals || []).filter(item => item.status === 'pending')
  const pendingDeliveries = (data?.notification_deliveries || []).filter(item => item.status === 'pending').length
  const maintenancePersonnel = (data?.staff || []).filter(item => item.role === 'maintenance_personnel')
  const complaintRecords = Object.values(complaintMap || {})
  const overviewCards = module === 'ecmd'
    ? [['Open Escalations', openEscalations.length, 'text-red-700'], ['Active Crews', (data?.crews || []).filter(item => item.is_active).length, 'text-navy-900']]
    : [['Pending Approvals', pendingApprovals.length, 'text-amber-700'], ['External Messages Queued', pendingDeliveries, 'text-brand-700']]
  return <div className="space-y-5">
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
      {overviewCards.map(([label, value, color]) => <div key={label} className="card rounded-xl p-4"><p className={`font-display text-3xl font-black ${color}`}>{value}</p><p className="mt-1 text-xs font-bold text-gray-500">{label}</p></div>)}
    </div>

    {module === 'ecmd' && <Section title="Maintenance Personnel Availability" description="Availability and active assignment counts are operational ECMD information.">
      {maintenancePersonnel.length === 0 ? <p className="text-sm text-gray-500">No Maintenance Personnel accounts are assigned to ECMD.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{maintenancePersonnel.map(person => {
        const activeTasks = complaintRecords.filter(complaint => complaint.assigned_to === person.id && ['assigned', 'en_route', 'in_progress', 'blocked'].includes(complaint.status)).length
        return <div key={person.id} className="rounded-xl border border-gray-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-navy-900">{person.full_name}</p><p className="mt-1 text-xs text-gray-500">{activeTasks} active assignment{activeTasks === 1 ? '' : 's'}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${person.availability_status === 'available' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>{titleCase(person.availability_status || 'available')}</span></div></div>
      })}</div>}
    </Section>}

    {module === 'ecmd' && <Section title="Overdue High-priority Escalation" description="Compares active High-priority complaints with the ECMD-defined resolution target." action={<button disabled={busy === 'scan'} onClick={() => run('scan', () => apiFetch('/operations/escalations/scan', { method: 'POST' }), 'High-priority service targets scanned.')} className="btn-primary rounded-lg">{busy === 'scan' ? <Spinner className="h-4 w-4 border-2 border-white" /> : 'Scan Now'}</button>}>
      {openEscalations.length === 0 ? <p className="text-sm text-gray-500">No open overdue escalations.</p> : <div className="space-y-3">{openEscalations.map(item => <div key={item.id} className="rounded-xl border border-red-200 bg-red-50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-black text-red-900">{complaintMap[item.complaint_id]?.reference_number || 'Complaint'} · {titleCase(item.severity)}</p><p className="mt-1 text-xs text-red-700">{item.reason}</p><p className="mt-1 text-[10px] text-red-500">Target: {formatDate(item.due_at)}</p></div><div className="flex gap-2"><button onClick={() => run(`escalation-${item.id}`, () => apiFetch(`/operations/escalations/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'acknowledged' }) }), 'Escalation acknowledged.')} className="btn-secondary rounded-lg text-xs">Acknowledge</button><button onClick={() => run(`resolve-${item.id}`, () => apiFetch(`/operations/escalations/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) }), 'Escalation resolved.')} className="btn-primary rounded-lg text-xs">Resolve</button></div></div></div>)}</div>}
    </Section>}

    {module === 'system' && <Section title="Independent System Supervisor Approval" description="The requester cannot approve their own request. Archival requires a separate System Supervisor.">
      {pendingApprovals.length === 0 ? <p className="text-sm text-gray-500">No approval requests are awaiting review.</p> : <div className="space-y-3">{pendingApprovals.map(item => <div key={item.id} className="rounded-xl border border-gray-200 p-4"><p className="text-sm font-black text-navy-900">{titleCase(item.request_type)}</p><p className="mt-1 text-xs text-gray-600">{item.reason}</p><p className="mt-1 text-[10px] text-gray-400">Requested by {staffMap[item.requested_by]?.full_name || 'Department Staff'} · {formatDate(item.created_at)}</p><div className="mt-3 flex gap-2"><button onClick={() => run(`approve-${item.id}`, () => apiFetch(`/operations/approvals/${item.id}`, { method: 'PATCH', body: JSON.stringify({ decision: 'approved' }) }), 'Request approved.')} className="rounded-lg bg-green-600 px-3 py-2 text-xs font-black text-white">Approve</button><button onClick={() => run(`reject-${item.id}`, () => apiFetch(`/operations/approvals/${item.id}`, { method: 'PATCH', body: JSON.stringify({ decision: 'rejected' }) }), 'Request rejected.')} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700">Reject</button></div></div>)}</div>}
    </Section>}

    {module === 'system' && <Section title="Email and SMS Delivery Queue" description="In-app notifications are queued automatically for each user's enabled channels.">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><p className="font-black">Provider connection required</p><p className="mt-1 text-xs">The system now creates auditable email/SMS delivery jobs. Actual sending remains disabled until MRWD supplies an approved email/SMS provider, sender identity, credentials, consent rules, and budget.</p></div>
    </Section>}
  </div>
}

function CrewsTab({ data, busy, run, staffMap, departmentMap, module }) {
  const [crew, setCrew] = useState({ name: '', department_id: '', team_leader_id: '', default_manpower: 1 })
  const [member, setMember] = useState({ crew_id: '', staff_id: '', crew_role: 'crew_member', manpower_units: 1 })
  const [assignment, setAssignment] = useState({ staff_id: '', department_id: '', staff_position: '', supervisor_id: '' })
  const maintenance = (data?.staff || []).filter(item => item.role === 'maintenance_personnel' && item.is_active)
  const supervisors = (data?.staff || []).filter(item => ['manager', 'supervisor', 'team_leader'].includes(item.staff_position) || item.role === 'admin')
  const selectedAssignmentStaff = (data?.staff || []).find(item => item.id === assignment.staff_id)
  const selectedAssignmentDepartment = (data?.departments || []).find(item => item.id === assignment.department_id)
  const assignmentPositionOptions = selectedAssignmentStaff?.role === 'maintenance_personnel'
    ? ['team_leader', 'crew_member']
    : selectedAssignmentDepartment?.code === 'COMMERCIAL'
      ? ['commercial_staff']
      : selectedAssignmentDepartment?.code === 'ECMD'
        ? ['department_staff']
        : ['manager', 'supervisor']
  return <div className="space-y-5">
    {module === 'system' && <Section title="Department Responsibilities" description="Commercial manages customer and billing records; ECMD coordinates engineering and field work.">
      <div className="grid gap-3 md:grid-cols-2">{(data?.departments || []).map(item => <div key={item.id} className="rounded-xl border border-gray-200 p-4"><p className="font-black text-navy-900">{item.name}</p><p className="mt-1 text-xs text-gray-600">{item.responsibilities}</p></div>)}</div>
    </Section>}

    {module === 'ecmd' && <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Create ECMD Crew" description="Assign a team leader and expected manpower.">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); run('crew', () => apiFetch('/operations/crews', { method: 'POST', body: JSON.stringify(crew) }), 'Crew created.').then(ok => ok && setCrew({ name: '', department_id: '', team_leader_id: '', default_manpower: 1 })) }}>
          <Field label="Crew Name"><input required value={crew.name} onChange={event => setCrew(value => ({ ...value, name: event.target.value }))} className="input-field rounded-lg" /></Field>
          <Field label="Department"><select required value={crew.department_id} onChange={event => setCrew(value => ({ ...value, department_id: event.target.value }))} className="input-field rounded-lg"><option value="">Select department</option>{(data?.departments || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Team Leader"><select value={crew.team_leader_id} onChange={event => setCrew(value => ({ ...value, team_leader_id: event.target.value }))} className="input-field rounded-lg"><option value="">Assign later</option>{maintenance.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></Field>
          <Field label="Default Manpower"><input type="number" min="1" required value={crew.default_manpower} onChange={event => setCrew(value => ({ ...value, default_manpower: event.target.value }))} className="input-field rounded-lg" /></Field>
          <button disabled={busy === 'crew'} className="btn-primary rounded-lg sm:col-span-2">Create Crew</button>
        </form>
      </Section>

      <Section title="Add Crew Member" description="Record team roles and manpower units.">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); run('member', () => apiFetch('/operations/crew-members', { method: 'POST', body: JSON.stringify(member) }), 'Crew member saved.') }}>
          <Field label="Crew"><select required value={member.crew_id} onChange={event => setMember(value => ({ ...value, crew_id: event.target.value }))} className="input-field rounded-lg"><option value="">Select crew</option>{(data?.crews || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Maintenance Personnel"><select required value={member.staff_id} onChange={event => setMember(value => ({ ...value, staff_id: event.target.value }))} className="input-field rounded-lg"><option value="">Select staff</option>{maintenance.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></Field>
          <Field label="Crew Role"><select value={member.crew_role} onChange={event => setMember(value => ({ ...value, crew_role: event.target.value }))} className="input-field rounded-lg">{['team_leader', 'crew_member', 'driver', 'specialist', 'helper'].map(item => <option key={item} value={item}>{titleCase(item)}</option>)}</select></Field>
          <Field label="Manpower Units"><input type="number" min="0.25" step="0.25" value={member.manpower_units} onChange={event => setMember(value => ({ ...value, manpower_units: event.target.value }))} className="input-field rounded-lg" /></Field>
          <button disabled={busy === 'member'} className="btn-primary rounded-lg sm:col-span-2">Save Member</button>
        </form>
      </Section>
    </div>}

    {module === 'system' && <Section title="Staff Department & Access" description="Designate Commercial Department Staff, ECMD Staff, Team Leaders, Maintenance Crew members, and System Supervisors. Department assignment determines the available pages.">
      <form className="grid gap-3 md:grid-cols-4" onSubmit={event => { event.preventDefault(); run('assignment', () => apiFetch('/operations/staff-assignment', { method: 'POST', body: JSON.stringify(assignment) }), 'Staff assignment updated.') }}>
        <Field label="Staff"><select required value={assignment.staff_id} onChange={event => { const staff = (data?.staff || []).find(item => item.id === event.target.value); setAssignment({ staff_id: event.target.value, department_id: staff?.department_id || '', staff_position: staff?.staff_position || '', supervisor_id: staff?.supervisor_id || '' }) }} className="input-field rounded-lg"><option value="">Select staff</option>{(data?.staff || []).map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></Field>
        <Field label="Department"><select value={assignment.department_id} onChange={event => setAssignment(value => ({ ...value, department_id: event.target.value, staff_position: '' }))} className="input-field rounded-lg"><option value="">System Administration</option>{(data?.departments || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Access Designation"><select required value={assignment.staff_position} onChange={event => setAssignment(value => ({ ...value, staff_position: event.target.value }))} className="input-field rounded-lg"><option value="">Select access</option>{assignmentPositionOptions.map(item => <option key={item} value={item}>{staffPositionLabel(item)}</option>)}</select></Field>
        <Field label="Reports To"><select value={assignment.supervisor_id} onChange={event => setAssignment(value => ({ ...value, supervisor_id: event.target.value }))} className="input-field rounded-lg"><option value="">None</option>{supervisors.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></Field>
        <button disabled={busy === 'assignment'} className="btn-primary rounded-lg md:col-span-4">Save Assignment</button>
      </form>
      <p className="mt-3 text-xs text-gray-500">Commercial Department Staff receive only Commercial pages; ECMD Staff receive only ECMD pages; System Supervisors use System Administration. Maintenance Personnel can be designated as a Team Leader or Maintenance Crew Member within ECMD.</p>
    </Section>}

    {module === 'ecmd' && <Section title="Current Crews">
      <div className="grid gap-3 md:grid-cols-2">{(data?.crews || []).map(item => { const members = (data?.crew_members || []).filter(memberItem => memberItem.crew_id === item.id); return <div key={item.id} className="rounded-xl border border-gray-200 p-4"><div className="flex justify-between gap-3"><div><p className="font-black text-navy-900">{item.name}</p><p className="text-xs text-gray-500">{departmentMap[item.department_id]?.name || 'Department'} · Default manpower {item.default_manpower}</p></div><span className="rounded-full bg-green-50 px-2 py-1 text-[10px] font-black text-green-700">{item.is_active ? 'ACTIVE' : 'INACTIVE'}</span></div><p className="mt-3 text-xs font-bold text-gray-700">Team Leader: {staffMap[item.team_leader_id]?.full_name || 'Not assigned'}</p><div className="mt-2 flex flex-wrap gap-1.5">{members.map(memberItem => <span key={memberItem.id} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-bold text-gray-600">{staffMap[memberItem.staff_id]?.full_name || 'Staff'} · {titleCase(memberItem.crew_role)}</span>)}</div></div> })}</div>
    </Section>}
  </div>
}

function SchedulesTab({ data, busy, run, staffMap }) {
  const [schedule, setSchedule] = useState({ staff_id: '', shift_date: '', starts_at: '08:00', ends_at: '17:00', shift_status: 'scheduled', notes: '' })
  const [targets, setTargets] = useState(() => Object.fromEntries((data?.service_targets || []).map(item => [item.priority, item])))
  return <div className="space-y-5">
    <Section title="Staff Shift Schedule" description="Availability now reflects both the profile status and scheduled shifts.">
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={event => { event.preventDefault(); run('schedule', () => apiFetch('/operations/schedules', { method: 'POST', body: JSON.stringify(schedule) }), 'Shift schedule saved.') }}>
        <Field label="Staff"><select required value={schedule.staff_id} onChange={event => setSchedule(value => ({ ...value, staff_id: event.target.value }))} className="input-field rounded-lg"><option value="">Select staff</option>{(data?.staff || []).filter(item => item.role === 'maintenance_personnel').map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></Field>
        <Field label="Date"><input required type="date" value={schedule.shift_date} onChange={event => setSchedule(value => ({ ...value, shift_date: event.target.value }))} className="input-field rounded-lg" /></Field>
        <Field label="Start"><input required type="time" value={schedule.starts_at} onChange={event => setSchedule(value => ({ ...value, starts_at: event.target.value }))} className="input-field rounded-lg" /></Field>
        <Field label="End"><input required type="time" value={schedule.ends_at} onChange={event => setSchedule(value => ({ ...value, ends_at: event.target.value }))} className="input-field rounded-lg" /></Field>
        <Field label="Status"><select value={schedule.shift_status} onChange={event => setSchedule(value => ({ ...value, shift_status: event.target.value }))} className="input-field rounded-lg">{['scheduled', 'available', 'busy', 'on_leave', 'off_duty'].map(item => <option key={item} value={item}>{titleCase(item)}</option>)}</select></Field>
        <button disabled={busy === 'schedule'} className="btn-primary rounded-lg sm:col-span-2 lg:col-span-5">Save Shift</button>
      </form>
      <div className="mt-5 space-y-2">{(data?.schedules || []).map(item => <div key={item.id} className="flex flex-col gap-1 rounded-lg border border-gray-200 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"><span className="font-black text-navy-900">{staffMap[item.staff_id]?.full_name || 'Staff'}</span><span>{item.shift_date} · {item.starts_at.slice(0,5)}–{item.ends_at.slice(0,5)} · {titleCase(item.shift_status)}</span></div>)}</div>
    </Section>

    <Section title="ECMD-defined Service Targets" description="Targets drive overdue High-priority escalation and are retained in the audit log.">
      <div className="grid gap-3 lg:grid-cols-3">{['high', 'medium', 'low'].map(priority => { const value = targets[priority] || { priority, acknowledgment_hours: '', resolution_hours: '', escalation_hours: '' }; return <form key={priority} className="rounded-xl border border-gray-200 p-4" onSubmit={event => { event.preventDefault(); run(`target-${priority}`, () => apiFetch('/operations/service-targets', { method: 'POST', body: JSON.stringify(value) }), `${titleCase(priority)} service target updated.`) }}><p className="font-display font-black text-navy-900">{titleCase(priority)} Priority</p><div className="mt-3 grid grid-cols-3 gap-2"><Field label="Acknowledge"><input type="number" min="0.25" step="0.25" value={value.acknowledgment_hours} onChange={event => setTargets(current => ({ ...current, [priority]: { ...value, acknowledgment_hours: event.target.value } }))} className="input-field rounded-lg" /></Field><Field label="Resolve"><input type="number" min="0.25" step="0.25" value={value.resolution_hours} onChange={event => setTargets(current => ({ ...current, [priority]: { ...value, resolution_hours: event.target.value } }))} className="input-field rounded-lg" /></Field><Field label="Escalate"><input type="number" min="0.25" step="0.25" value={value.escalation_hours} onChange={event => setTargets(current => ({ ...current, [priority]: { ...value, escalation_hours: event.target.value } }))} className="input-field rounded-lg" /></Field></div><p className="mt-2 text-[10px] text-gray-400">Values are in hours.</p><button className="btn-secondary mt-3 w-full rounded-lg text-xs">Save {titleCase(priority)}</button></form> })}</div>
    </Section>
  </div>
}

function BillingTab({ data, busy, run }) {
  const [accountFile, setAccountFile] = useState(null)
  const [billingFile, setBillingFile] = useState(null)
  const importFile = async (kind, file) => {
    if (!file) throw new Error('Select a CSV file first.')
    const rows = parseCsv(await file.text())
    if (!rows.length) throw new Error('The CSV file does not contain any data rows.')
    return apiFetch(kind === 'accounts' ? '/operations/accounts/import' : '/operations/billing/import', {
      method: 'POST', body: JSON.stringify(kind === 'accounts' ? { rows } : { filename: file.name, rows }),
    })
  }
  return <div className="space-y-5">
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Customer Account Registry" description="Enables automatic account-number validation in My Profile.">
        <div className="rounded-lg bg-gray-50 p-3 font-mono text-[10px] text-gray-600">account_number, registered_name, service_address, barangay, meter_number, is_active</div>
        <input type="file" accept=".csv,text/csv" onChange={event => setAccountFile(event.target.files?.[0] || null)} className="input-field mt-3 rounded-lg" />
        <button disabled={!accountFile || busy === 'account-import'} onClick={() => run('account-import', () => importFile('accounts', accountFile), 'Customer account registry imported.')} className="btn-primary mt-3 w-full rounded-lg">Import Account Registry</button>
        <p className="mt-3 text-xs text-gray-500">{data?.account_registry?.length || 0} registry accounts are currently visible.</p>
      </Section>

      <Section title="Bulk Billing Import" description="Validates account numbers, then inserts or updates each customer's billing period.">
        <div className="rounded-lg bg-gray-50 p-3 font-mono text-[10px] text-gray-600">account_number, billing_period, previous_reading, current_reading, consumption, amount_due, due_date, status</div>
        <input type="file" accept=".csv,text/csv" onChange={event => setBillingFile(event.target.files?.[0] || null)} className="input-field mt-3 rounded-lg" />
        <button disabled={!billingFile || busy === 'billing-import'} onClick={() => run('billing-import', () => importFile('billing', billingFile), 'Billing file processed. Review the batch results below.')} className="btn-primary mt-3 w-full rounded-lg">Import Billing CSV</button>
      </Section>
    </div>

    <Section title="Recent Billing Imports">
      {(data?.billing_batches || []).length === 0 ? <p className="text-sm text-gray-500">No billing files have been imported.</p> : <div className="space-y-2">{data.billing_batches.map(item => <div key={item.id} className="grid gap-1 rounded-lg border border-gray-200 p-3 text-xs sm:grid-cols-4"><span className="font-black text-navy-900">{item.filename}</span><span>{item.imported_count}/{item.row_count} imported</span><span className={item.failed_count ? 'font-bold text-red-700' : 'text-green-700'}>{item.failed_count} failed</span><span>{formatDate(item.created_at)}</span></div>)}</div>}
    </Section>
  </div>
}

function InventoryTab({ data, busy, run, complaints, staffMap, module }) {
  const [item, setItem] = useState({ sku: '', name: '', category: 'material', unit: 'piece', quantity_on_hand: 0, reorder_level: 0, location: '' })
  const [adjustment, setAdjustment] = useState({ id: '', quantity_delta: '', reason: '' })
  const [archive, setArchive] = useState({ complaint_id: '', reason: '' })
  const closed = complaints.filter(complaint => ['completed', 'rejected', 'cancelled'].includes(complaint.status) && !complaint.archived_at)
  const approvedArchives = (data?.approvals || []).filter(approval => approval.request_type === 'archive_complaint' && approval.status === 'approved')
  return <div className="space-y-5">
    {module === 'ecmd' && <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Equipment & Material Inventory" description="Stock usage can be linked directly to maintenance tasks.">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); run('inventory', () => apiFetch('/operations/inventory', { method: 'POST', body: JSON.stringify(item) }), 'Inventory item saved.').then(ok => ok && setItem({ sku: '', name: '', category: 'material', unit: 'piece', quantity_on_hand: 0, reorder_level: 0, location: '' })) }}>
          <Field label="SKU"><input required value={item.sku} onChange={event => setItem(value => ({ ...value, sku: event.target.value }))} className="input-field rounded-lg" /></Field>
          <Field label="Item Name"><input required value={item.name} onChange={event => setItem(value => ({ ...value, name: event.target.value }))} className="input-field rounded-lg" /></Field>
          <Field label="Category"><input value={item.category} onChange={event => setItem(value => ({ ...value, category: event.target.value }))} className="input-field rounded-lg" /></Field>
          <Field label="Unit"><input value={item.unit} onChange={event => setItem(value => ({ ...value, unit: event.target.value }))} className="input-field rounded-lg" /></Field>
          <Field label="Opening Stock"><input type="number" min="0" step="0.01" value={item.quantity_on_hand} onChange={event => setItem(value => ({ ...value, quantity_on_hand: event.target.value }))} className="input-field rounded-lg" /></Field>
          <Field label="Reorder Level"><input type="number" min="0" step="0.01" value={item.reorder_level} onChange={event => setItem(value => ({ ...value, reorder_level: event.target.value }))} className="input-field rounded-lg" /></Field>
          <button className="btn-primary rounded-lg sm:col-span-2">Save Inventory Item</button>
        </form>
      </Section>

      <Section title="Stock Adjustment" description="Every adjustment requires a reason and creates an audit and stock-ledger record.">
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); run('adjust', () => apiFetch(`/operations/inventory/${adjustment.id}/adjust`, { method: 'POST', body: JSON.stringify(adjustment) }), 'Stock adjusted.') }}>
          <Field label="Inventory Item"><select required value={adjustment.id} onChange={event => setAdjustment(value => ({ ...value, id: event.target.value }))} className="input-field rounded-lg"><option value="">Select item</option>{(data?.inventory || []).map(value => <option key={value.id} value={value.id}>{value.sku} · {value.name} ({value.quantity_on_hand} {value.unit})</option>)}</select></Field>
          <Field label="Quantity Change"><input required type="number" step="0.01" value={adjustment.quantity_delta} onChange={event => setAdjustment(value => ({ ...value, quantity_delta: event.target.value }))} className="input-field rounded-lg" placeholder="Use a negative number to deduct" /></Field>
          <Field label="Reason"><textarea required minLength={5} rows={3} value={adjustment.reason} onChange={event => setAdjustment(value => ({ ...value, reason: event.target.value }))} className="input-field resize-none rounded-lg" /></Field>
          <button disabled={busy === 'adjust'} className="btn-primary w-full rounded-lg">Record Adjustment</button>
        </form>
      </Section>
    </div>}

    {module === 'ecmd' && <Section title="Current Inventory">
      <div className="grid gap-3 md:grid-cols-2">{(data?.inventory || []).map(value => <div key={value.id} className={`rounded-xl border p-4 ${Number(value.quantity_on_hand) <= Number(value.reorder_level) ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}><div className="flex justify-between gap-3"><div><p className="font-black text-navy-900">{value.name}</p><p className="text-xs text-gray-500">{value.sku} · {value.category}</p></div><p className="font-display text-xl font-black text-navy-900">{value.quantity_on_hand} <span className="text-xs font-normal text-gray-500">{value.unit}</span></p></div>{Number(value.quantity_on_hand) <= Number(value.reorder_level) && <p className="mt-2 text-xs font-bold text-red-700">At or below reorder level ({value.reorder_level}).</p>}</div>)}</div>
    </Section>}

    {module !== 'ecmd' && <Section title={module === 'commercial' ? 'Closed-record Archival Requests' : 'Approved Complaint Archival'} description="Closed complaint records require approval from a different System Supervisor before archival.">
      {module === 'commercial' && <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={event => { event.preventDefault(); run('archive-request', () => apiFetch('/operations/archive-requests', { method: 'POST', body: JSON.stringify(archive) }), 'Archival request submitted for independent approval.') }}>
        <Field label="Closed Complaint"><select required value={archive.complaint_id} onChange={event => setArchive(value => ({ ...value, complaint_id: event.target.value }))} className="input-field rounded-lg"><option value="">Select complaint</option>{closed.map(value => <option key={value.id} value={value.id}>{value.reference_number} · {value.complaint_type}</option>)}</select></Field>
        <Field label="Archival Reason"><input required minLength={5} value={archive.reason} onChange={event => setArchive(value => ({ ...value, reason: event.target.value }))} className="input-field rounded-lg" /></Field>
        <button className="btn-secondary self-end rounded-lg">Request Approval</button>
      </form>}
      {module === 'system' && (approvedArchives.length > 0 ? <div className="space-y-2"><p className="text-xs font-black uppercase text-gray-500">Approved and ready</p>{approvedArchives.map(approval => <div key={approval.id} className="flex flex-col gap-2 rounded-lg border border-green-200 bg-green-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-black text-green-900">{complaints.find(item => item.id === approval.entity_id)?.reference_number || 'Complaint'}</p><p className="text-xs text-green-700">Approved by {staffMap[approval.reviewed_by]?.full_name || 'backup reviewer'}</p></div><button onClick={() => run(`archive-${approval.id}`, () => apiFetch(`/operations/archive/${approval.entity_id}`, { method: 'POST', body: JSON.stringify({ approval_id: approval.id }) }), 'Complaint archived.')} className="rounded-lg bg-green-700 px-3 py-2 text-xs font-black text-white">Archive Record</button></div>)}</div> : <p className="text-sm text-gray-500">No approved archival requests are ready.</p>)}
      <p className="mt-4 text-xs text-gray-500">Archived records remain in the database and audit history; they are removed from active operational lists rather than permanently deleted.</p>
    </Section>}
  </div>
}
