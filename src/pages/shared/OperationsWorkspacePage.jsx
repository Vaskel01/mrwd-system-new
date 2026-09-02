import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useComplaintStore } from '../../store/complaintStore'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import { availabilityLabel, departmentDisplayName, divisionDisplayName, TERMS } from '../../config/terminology'
import { useToastStore } from '../../store/toastStore'

const MODULE_CONFIG = {
  commercial: {
    eyebrow: 'Commercial Services Department',
    title: TERMS.ACCOUNTS_BILLING,
    description: 'Manage customer accounts and billing records, check import files, and request archives for closed complaints.',
    endpoint: '/operations/commercial-bootstrap',
    tabs: [['billing', TERMS.ACCOUNTS_BILLING], ['inventory', 'Records & archives']],
  },
  ecmd: {
    eyebrow: 'Engineering, Construction and Maintenance Department (ECMD)',
    title: 'WDLCD resources',
    description: 'Manage WDLCD crews, shifts, staff availability, equipment, materials, and field resources under ECMD.',
    endpoint: '/operations/ecmd-bootstrap',
    tabs: [['overview', 'Field overview'], ['crews', 'Crews & staffing'], ['schedules', 'Shifts'], ['inventory', 'Equipment & materials']],
  },
  system: {
    eyebrow: 'System Administration',
    title: 'Departments, divisions & approvals',
    description: 'Manage departments, divisions, staff assignments, approvals, archived records, and message delivery.',
    endpoint: '/operations/system-bootstrap',
    tabs: [['overview', 'Approvals & messages'], ['crews', 'Departments & access'], ['inventory', 'Archived records']],
  },
}

function titleCase(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

const STAFF_POSITION_LABELS = Object.freeze({
  manager: `${TERMS.SYSTEM_SUPERVISOR} (Manager)`,
  supervisor: TERMS.SYSTEM_SUPERVISOR,
  team_leader: 'Team leader',
  crew_member: 'Maintenance Crew Member',
  commercial_staff: TERMS.COMMERCIAL_STAFF,
  department_staff: TERMS.ECMD_STAFF,
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
  return <section className="card min-w-0 overflow-hidden rounded-xl p-4 sm:p-5"><div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h2 className="font-display font-black text-navy-900">{title}</h2>{description && <p className="mt-1 text-xs text-gray-500">{description}</p>}</div>{action}</div><div className="mt-4">{children}</div></section>
}

function Field({ label, children, className = '' }) {
  return <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-gray-500">{label}</span>{children}</label>
}

export default function OperationsWorkspacePage({ module = 'system' }) {
  const moduleConfig = MODULE_CONFIG[module] || MODULE_CONFIG.system
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab')
  const [tab, setTab] = useState(() => moduleConfig.tabs.some(([value]) => value === initialTab) ? initialTab : moduleConfig.tabs[0][0])
  const pushToast = useToastStore(state => state.push)
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
    const next = {}
    if (tab !== moduleConfig.tabs[0][0]) next.tab = tab
    setSearchParams(next, { replace: true })
  }, [tab, moduleConfig.tabs, setSearchParams])

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
      pushToast(success, 'success')
      await load()
      return true
    } catch (actionError) {
      setError(actionError.message)
      pushToast(actionError.message, 'error')
      return false
    } finally {
      setBusy('')
    }
  }

  const staffMap = useMemo(() => Object.fromEntries((data?.staff || []).map(person => [person.id, person])), [data])
  const divisionMap = useMemo(() => Object.fromEntries((data?.divisions || []).map(item => [item.id, item])), [data])
  const departmentMap = useMemo(() => Object.fromEntries((data?.departments || []).map(item => [item.id, item])), [data])
  const crewMap = useMemo(() => Object.fromEntries((data?.crews || []).map(item => [item.id, item])), [data])
  const complaintMap = useMemo(() => Object.fromEntries(complaints.map(item => [item.id, item])), [complaints])

  if (loading && !data) return <PageLoader label="Loading workspace…" />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header page-header">
        <p className="text-xs font-bold uppercase tracking-widest text-gold-400">{moduleConfig.eyebrow}</p>
        <h1 className="mt-1 font-display text-2xl font-black text-white sm:text-3xl">{moduleConfig.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-navy-300">{moduleConfig.description}</p>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {message && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">{message}</div>}

      <div className="card grid grid-cols-1 gap-2 rounded-xl p-2 min-[420px]:grid-cols-2 lg:grid-cols-5" role="tablist" aria-label="Workspace sections">
        {moduleConfig.tabs.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`filter-chip min-h-11 rounded-lg px-3 py-2 text-xs font-black ${tab === value ? 'bg-navy-800 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{label}</button>)}
      </div>

      {tab === 'overview' && <OverviewTab data={data} busy={busy} run={run} complaintMap={complaintMap} staffMap={staffMap} module={module} />}
      {tab === 'crews' && <CrewsTab data={data} busy={busy} run={run} staffMap={staffMap} departmentMap={departmentMap} divisionMap={divisionMap} module={module} />}
      {tab === 'schedules' && <SchedulesTab data={data} busy={busy} run={run} staffMap={staffMap} />}
      {tab === 'billing' && <BillingTab data={data} busy={busy} run={run} />}
      {tab === 'inventory' && <InventoryTab data={data} busy={busy} run={run} complaints={complaints} staffMap={staffMap} crewMap={crewMap} module={module} />}
    </div>
  )
}

function OverviewTab({ data, run, complaintMap, staffMap, module }) {
  const pendingApprovals = (data?.approvals || []).filter(item => item.status === 'pending')
  const pendingDeliveries = (data?.notification_deliveries || []).filter(item => item.status === 'pending').length
  const maintenancePersonnel = (data?.staff || []).filter(item => item.role === 'maintenance_personnel')
  const complaintRecords = Object.values(complaintMap || {})
  const overviewCards = module === 'ecmd'
    ? [['Maintenance Personnel', maintenancePersonnel.length, 'text-brand-700'], ['Active crews', (data?.crews || []).filter(item => item.is_active).length, 'text-navy-900']]
    : [['Pending approvals', pendingApprovals.length, 'text-amber-700'], ['Messages waiting to send', pendingDeliveries, 'text-brand-700']]
  return <div className="space-y-5">
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
      {overviewCards.map(([label, value, color]) => <div key={label} className="card rounded-xl p-4"><p className={`font-display text-3xl font-black ${color}`}>{value}</p><p className="mt-1 text-xs font-bold text-gray-500">{label}</p></div>)}
    </div>

    {module === 'ecmd' && <Section title="Maintenance availability" description="Check who is available and how many active assignments each person has.">
      {maintenancePersonnel.length === 0 ? <p className="text-sm text-gray-500">No Maintenance Personnel are assigned to WDLCD yet.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{maintenancePersonnel.map(person => {
        const activeTasks = complaintRecords.filter(complaint => complaint.assigned_to === person.id && ['assigned', 'en_route', 'in_progress', 'blocked'].includes(complaint.status)).length
        return <div key={person.id} className="rounded-xl border border-gray-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-navy-900">{person.full_name}</p><p className="mt-1 text-xs text-gray-500">{activeTasks} active assignment{activeTasks === 1 ? '' : 's'}</p></div><span className={`rounded-full px-2 py-1 text-xs font-black uppercase ${person.availability_status === 'available' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>{availabilityLabel(person.availability_status || 'available')}</span></div></div>
      })}</div>}
    </Section>}

    {module === 'system' && <Section title="Approval requests" description="A System Supervisor cannot approve their own request. Archive requests require a different System Supervisor.">
      {pendingApprovals.length === 0 ? <p className="text-sm text-gray-500">No approval requests need review.</p> : <div className="space-y-3">{pendingApprovals.map(item => <div key={item.id} className="rounded-xl border border-gray-200 p-4"><p className="text-sm font-black text-navy-900">{titleCase(item.request_type)}</p><p className="mt-1 text-xs text-gray-600">{item.reason}</p><p className="mt-1 text-xs text-gray-500">Requested by {staffMap[item.requested_by]?.full_name || 'Staff Member'} · {formatDate(item.created_at)}</p><div className="mt-3 flex gap-2"><button onClick={() => run(`approve-${item.id}`, () => apiFetch(`/operations/approvals/${item.id}`, { method: 'PATCH', body: JSON.stringify({ decision: 'approved' }) }), 'Request approved.')} className="rounded-lg bg-green-600 px-3 py-2 text-xs font-black text-white">Approve</button><button onClick={() => run(`reject-${item.id}`, () => apiFetch(`/operations/approvals/${item.id}`, { method: 'PATCH', body: JSON.stringify({ decision: 'rejected' }) }), 'Request rejected.')} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700">Reject</button></div></div>)}</div>}
    </Section>}

    {module === 'system' && <Section title="Email and SMS queue" description="External messages are added to the queue based on each user’s notification settings.">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><p className="font-black">Email/SMS provider not connected</p><p className="mt-1 text-xs">Messages are recorded in the queue, but they will not be sent until MRWD connects an approved email or SMS provider.</p></div>
    </Section>}
  </div>
}

function CrewsTab({ data, busy, run, staffMap, departmentMap, divisionMap, module }) {
  const [crew, setCrew] = useState({ name: '', department_id: '', division_id: '', team_leader_id: '', default_manpower: 1 })
  const [member, setMember] = useState({ crew_id: '', staff_id: '', crew_role: 'crew_member', manpower_units: 1 })
  const [assignment, setAssignment] = useState({ staff_id: '', department_id: '', division_id: '', staff_position: '', supervisor_id: '' })
  const maintenance = (data?.staff || []).filter(item => item.role === 'maintenance_personnel' && item.is_active)
  const supervisors = (data?.staff || []).filter(item => ['manager', 'supervisor', 'team_leader'].includes(item.staff_position) || item.role === 'admin')
  const selectedAssignmentStaff = (data?.staff || []).find(item => item.id === assignment.staff_id)
  const selectedAssignmentDepartment = (data?.departments || []).find(item => item.id === assignment.department_id)
  const availableDivisions = (data?.divisions || []).filter(item => item.department_id === assignment.department_id && item.is_active !== false)
  const assignmentPositionOptions = selectedAssignmentStaff?.role === 'maintenance_personnel'
    ? ['team_leader', 'crew_member']
    : selectedAssignmentDepartment?.code === 'COMMERCIAL'
      ? ['commercial_staff']
      : selectedAssignmentDepartment?.code === 'ECMD'
        ? ['department_staff']
        : ['manager', 'supervisor']
  return <div className="space-y-5">
    {module === 'system' && <Section title="Department responsibilities" description="Commercial Services manages customer and billing records. ECMD manages field work and maintenance resources.">
      <div className="grid gap-3 md:grid-cols-2">{(data?.departments || []).map(item => <div key={item.id} className="rounded-xl border border-gray-200 p-4"><p className="font-black text-navy-900">{departmentDisplayName(item)}</p><p className="mt-1 text-xs text-gray-600">{item.responsibilities}</p></div>)}</div>
    </Section>}

    {module === 'ecmd' && <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Create ECMD crew" description="Add a crew name, optional team leader, and default crew size.">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); run('crew', () => apiFetch('/operations/crews', { method: 'POST', body: JSON.stringify(crew) }), 'Crew created.').then(ok => ok && setCrew({ name: '', department_id: '', division_id: '', team_leader_id: '', default_manpower: 1 })) }}>
          <Field label="Crew name"><input required value={crew.name} onChange={event => setCrew(value => ({ ...value, name: event.target.value }))} className="input-field rounded-lg" /></Field>
          <Field label="Department"><select required value={crew.department_id} onChange={event => { const departmentId = event.target.value; const division = (data?.divisions || []).find(item => item.department_id === departmentId && item.code === 'WDLCD'); setCrew(value => ({ ...value, department_id: departmentId, division_id: division?.id || '' })) }} className="input-field rounded-lg"><option value="">Select department</option>{(data?.departments || []).map(item => <option key={item.id} value={item.id}>{departmentDisplayName(item)}</option>)}</select></Field>
          <Field label="Division"><select required value={crew.division_id} onChange={event => setCrew(value => ({ ...value, division_id: event.target.value }))} className="input-field rounded-lg"><option value="">Select division</option>{(data?.divisions || []).filter(item => item.department_id === crew.department_id).map(item => <option key={item.id} value={item.id}>{divisionDisplayName(item)}</option>)}</select></Field>
          <Field label="Team leader"><select value={crew.team_leader_id} onChange={event => setCrew(value => ({ ...value, team_leader_id: event.target.value }))} className="input-field rounded-lg"><option value="">Assign later</option>{maintenance.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></Field>
          <Field label="Default crew size"><input type="number" min="1" required value={crew.default_manpower} onChange={event => setCrew(value => ({ ...value, default_manpower: event.target.value }))} className="input-field rounded-lg" /></Field>
          <button disabled={busy === 'crew'} className="btn-primary rounded-lg sm:col-span-2">Create crew</button>
        </form>
      </Section>

      <Section title="Add crew member" description="Choose a crew, staff member, role, and work share.">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); run('member', () => apiFetch('/operations/crew-members', { method: 'POST', body: JSON.stringify(member) }), 'Crew member saved.') }}>
          <Field label="Crew"><select required value={member.crew_id} onChange={event => setMember(value => ({ ...value, crew_id: event.target.value }))} className="input-field rounded-lg"><option value="">Select crew</option>{(data?.crews || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Maintenance Personnel"><select required value={member.staff_id} onChange={event => setMember(value => ({ ...value, staff_id: event.target.value }))} className="input-field rounded-lg"><option value="">Select staff</option>{maintenance.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></Field>
          <Field label="Crew role"><select value={member.crew_role} onChange={event => setMember(value => ({ ...value, crew_role: event.target.value }))} className="input-field rounded-lg">{['team_leader', 'crew_member', 'driver', 'specialist', 'helper'].map(item => <option key={item} value={item}>{titleCase(item)}</option>)}</select></Field>
          <Field label="Work share (1 = one person)"><input type="number" min="0.25" step="0.25" value={member.manpower_units} onChange={event => setMember(value => ({ ...value, manpower_units: event.target.value }))} className="input-field rounded-lg" /></Field>
          <button disabled={busy === 'member'} className="btn-primary rounded-lg sm:col-span-2">Save member</button>
        </form>
      </Section>
    </div>}

    {module === 'system' && <Section title="Staff department and access" description="Assign each staff member to the correct department, division, and access level. This controls which workspace they can open.">
      <form className="grid gap-3 md:grid-cols-5" onSubmit={event => { event.preventDefault(); run('assignment', () => apiFetch('/operations/staff-assignment', { method: 'POST', body: JSON.stringify(assignment) }), 'Staff assignment updated.') }}>
        <Field label="Staff"><select required value={assignment.staff_id} onChange={event => { const staff = (data?.staff || []).find(item => item.id === event.target.value); setAssignment({ staff_id: event.target.value, department_id: staff?.department_id || '', division_id: staff?.division_id || '', staff_position: staff?.staff_position || '', supervisor_id: staff?.supervisor_id || '' }) }} className="input-field rounded-lg"><option value="">Select staff</option>{(data?.staff || []).map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></Field>
        <Field label="Department"><select value={assignment.department_id} onChange={event => setAssignment(value => { const departmentId = event.target.value; const department = (data?.departments || []).find(item => item.id === departmentId); const expectedCode = department?.code === 'COMMERCIAL' ? 'NSCCCD' : department?.code === 'ECMD' ? 'WDLCD' : null; const division = (data?.divisions || []).find(item => item.department_id === departmentId && item.code === expectedCode); return ({ ...value, department_id: departmentId, division_id: division?.id || '', staff_position: '' }) })} className="input-field rounded-lg"><option value="">System Administration</option>{(data?.departments || []).map(item => <option key={item.id} value={item.id}>{departmentDisplayName(item)}</option>)}</select></Field>
        <Field label="Division"><select value={assignment.division_id} onChange={event => setAssignment(value => ({ ...value, division_id: event.target.value }))} className="input-field rounded-lg" disabled={!assignment.department_id}><option value="">{assignment.department_id ? 'Select division' : 'Not applicable'}</option>{availableDivisions.map(item => <option key={item.id} value={item.id}>{divisionDisplayName(item)}</option>)}</select></Field>
        <Field label="Access level"><select required value={assignment.staff_position} onChange={event => setAssignment(value => ({ ...value, staff_position: event.target.value }))} className="input-field rounded-lg"><option value="">Select access</option>{assignmentPositionOptions.map(item => <option key={item} value={item}>{staffPositionLabel(item)}</option>)}</select></Field>
        <Field label="Reports to"><select value={assignment.supervisor_id} onChange={event => setAssignment(value => ({ ...value, supervisor_id: event.target.value }))} className="input-field rounded-lg"><option value="">None</option>{supervisors.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></Field>
        <button disabled={busy === 'assignment'} className="btn-primary rounded-lg md:col-span-5">Save assignment</button>
      </form>
      <p className="mt-3 text-xs text-gray-500">Commercial Services Staff belong to NSCCCD. ECMD Staff and Maintenance Personnel belong to WDLCD. System Supervisors remain outside operational departments and divisions.</p>
    </Section>}

    {module === 'ecmd' && <Section title="Current crews">
      <div className="grid gap-3 md:grid-cols-2">{(data?.crews || []).map(item => { const members = (data?.crew_members || []).filter(memberItem => memberItem.crew_id === item.id); return <div key={item.id} className="rounded-xl border border-gray-200 p-4"><div className="flex justify-between gap-3"><div><p className="font-black text-navy-900">{item.name}</p><p className="text-xs text-gray-500">{divisionDisplayName(divisionMap[item.division_id])} · {departmentDisplayName(departmentMap[item.department_id])} · Default crew size {item.default_manpower}</p></div><span className="rounded-full bg-green-50 px-2 py-1 text-xs font-black text-green-700">{item.is_active ? 'ACTIVE' : 'INACTIVE'}</span></div><p className="mt-3 text-xs font-bold text-gray-700">Team leader: {staffMap[item.team_leader_id]?.full_name || 'Not assigned'}</p><div className="mt-2 flex flex-wrap gap-1.5">{members.map(memberItem => <span key={memberItem.id} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-bold text-gray-600">{staffMap[memberItem.staff_id]?.full_name || 'Staff'} · {titleCase(memberItem.crew_role)}</span>)}</div></div> })}</div>
    </Section>}
  </div>
}

function SchedulesTab({ data, busy, run, staffMap }) {
  const [schedule, setSchedule] = useState({ staff_id: '', shift_date: '', starts_at: '08:00', ends_at: '17:00', shift_status: 'scheduled', notes: '' })
  return <div className="space-y-5">
    <Section title="Staff shifts" description="Scheduled shifts are shown together with each person’s current availability.">
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={event => { event.preventDefault(); run('schedule', () => apiFetch('/operations/schedules', { method: 'POST', body: JSON.stringify(schedule) }), 'Shift schedule saved.') }}>
        <Field label="Staff"><select required value={schedule.staff_id} onChange={event => setSchedule(value => ({ ...value, staff_id: event.target.value }))} className="input-field rounded-lg"><option value="">Select staff</option>{(data?.staff || []).filter(item => item.role === 'maintenance_personnel').map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></Field>
        <Field label="Date"><input required type="date" value={schedule.shift_date} onChange={event => setSchedule(value => ({ ...value, shift_date: event.target.value }))} className="input-field rounded-lg" /></Field>
        <Field label="Start"><input required type="time" value={schedule.starts_at} onChange={event => setSchedule(value => ({ ...value, starts_at: event.target.value }))} className="input-field rounded-lg" /></Field>
        <Field label="End"><input required type="time" value={schedule.ends_at} onChange={event => setSchedule(value => ({ ...value, ends_at: event.target.value }))} className="input-field rounded-lg" /></Field>
        <Field label="Status"><select value={schedule.shift_status} onChange={event => setSchedule(value => ({ ...value, shift_status: event.target.value }))} className="input-field rounded-lg">{['scheduled', 'available', 'busy', 'on_leave', 'off_duty'].map(item => <option key={item} value={item}>{availabilityLabel(item)}</option>)}</select></Field>
        <button disabled={busy === 'schedule'} className="btn-primary rounded-lg sm:col-span-2 lg:col-span-5">Save shift</button>
      </form>
      <div className="mt-5 space-y-2">{(data?.schedules || []).map(item => <div key={item.id} className="flex flex-col gap-1 rounded-lg border border-gray-200 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"><span className="font-black text-navy-900">{staffMap[item.staff_id]?.full_name || 'Staff'}</span><span>{item.shift_date} · {item.starts_at.slice(0,5)}–{item.ends_at.slice(0,5)} · {titleCase(item.shift_status)}</span></div>)}</div>
    </Section>


  </div>
}

function BillingTab({ data, busy, run }) {
  const [accountFile, setAccountFile] = useState(null)
  const [billingFile, setBillingFile] = useState(null)
  const [previews, setPreviews] = useState({ accounts: null, billing: null })
  const [validationBusy, setValidationBusy] = useState('')
  const [validationError, setValidationError] = useState('')

  const rowsForFile = async file => {
    if (!file) throw new Error('Select a CSV file first.')
    const rows = parseCsv(await file.text())
    if (!rows.length) throw new Error('The CSV file does not contain any data rows.')
    return rows
  }

  const validateFile = async (kind, file) => {
    setValidationBusy(kind)
    setValidationError('')
    try {
      const rows = await rowsForFile(file)
      const preview = await apiFetch(kind === 'accounts' ? '/operations/accounts/validate-import' : '/operations/billing/validate-import', {
        method: 'POST', body: JSON.stringify({ rows }),
      })
      setPreviews(value => ({ ...value, [kind]: preview }))
    } catch (error) {
      setValidationError(error.message)
      setPreviews(value => ({ ...value, [kind]: null }))
    } finally {
      setValidationBusy('')
    }
  }

  const importFile = async (kind, file) => {
    const rows = await rowsForFile(file)
    return apiFetch(kind === 'accounts' ? '/operations/accounts/import' : '/operations/billing/import', {
      method: 'POST', body: JSON.stringify(kind === 'accounts' ? { rows } : { filename: file.name, rows }),
    })
  }

  const downloadErrors = (kind, preview) => {
    const rows = preview?.errors || []
    if (!rows.length) return
    const keys = [...new Set(rows.flatMap(row => Object.keys(row)))]
    const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
    const csv = [keys, ...rows.map(row => keys.map(key => row[key] ?? ''))].map(row => row.map(escape).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${kind}-import-errors.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const previewCard = (kind, preview) => preview && (
    <div className={`mt-3 rounded-xl border p-3 ${preview.invalid_count ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div><p className="font-black text-gray-900">{preview.total}</p><p className="text-gray-500">Rows</p></div>
        <div><p className="font-black text-green-700">{preview.valid_count}</p><p className="text-gray-500">Valid</p></div>
        <div><p className={`font-black ${preview.invalid_count ? 'text-red-700' : 'text-gray-500'}`}>{preview.invalid_count}</p><p className="text-gray-500">Invalid</p></div>
        {kind === 'accounts' ? <div><p className="font-black text-navy-800">{preview.new_count} new · {preview.update_count} update</p><p className="text-gray-500">Account list changes</p></div> : <div><p className="font-black text-navy-800">{preview.can_import ? 'Ready' : 'Fix file'}</p><p className="text-gray-500">Import result</p></div>}
      </div>
      {preview.errors?.length > 0 && <div className="mt-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-red-800">Issues found</p><button type="button" onClick={() => downloadErrors(kind, preview)} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-black text-red-700">Download error rows</button></div><div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">{preview.errors.slice(0, 12).map((item, index) => <p key={`${item.row}-${index}`} className="break-words text-xs text-red-800"><b>Row {item.row}:</b> {item.error}</p>)}</div>{preview.errors.length > 12 && <p className="mt-1 text-xs text-red-600">+{preview.errors.length - 12} more issue(s) in the downloadable file.</p>}</div>}
    </div>
  )

  return <div className="space-y-5">
    {validationError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{validationError}</div>}
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Customer account list" description="Check the file before import. Invalid rows must be fixed before the customer account list is updated.">
        <div className="max-w-full break-all rounded-lg bg-gray-50 p-3 font-mono text-xs leading-5 text-gray-600">account_number, registered_name, service_address, barangay, meter_number, is_active</div>
        <input type="file" accept=".csv,text/csv" onChange={event => { setAccountFile(event.target.files?.[0] || null); setPreviews(value => ({ ...value, accounts: null })) }} className="input-field mt-3 min-w-0 max-w-full rounded-lg" />
        <div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" disabled={!accountFile || validationBusy === 'accounts'} onClick={() => validateFile('accounts', accountFile)} className="btn-secondary rounded-lg">{validationBusy === 'accounts' ? 'Validating…' : 'Validate file'}</button><button type="button" disabled={!accountFile || !previews.accounts?.can_import || busy === 'account-import'} onClick={async () => { const ok = await run('account-import', () => importFile('accounts', accountFile), 'Customer account list imported.'); if (ok) setPreviews(value => ({ ...value, accounts: null })) }} className="btn-primary rounded-lg disabled:opacity-50">Import validated list</button></div>
        {previewCard('accounts', previews.accounts)}
        <p className="mt-3 text-xs text-gray-500">{data?.account_registry?.length || 0} customer accounts are currently visible.</p>
      </Section>

      <Section title="Billing import" description="Check customer links, duplicate billing periods, dates, and amounts before importing any billing records.">
        <div className="max-w-full break-all rounded-lg bg-gray-50 p-3 font-mono text-xs leading-5 text-gray-600">account_number, billing_period, previous_reading, current_reading, consumption, amount_due, due_date, status</div>
        <input type="file" accept=".csv,text/csv" onChange={event => { setBillingFile(event.target.files?.[0] || null); setPreviews(value => ({ ...value, billing: null })) }} className="input-field mt-3 min-w-0 max-w-full rounded-lg" />
        <div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" disabled={!billingFile || validationBusy === 'billing'} onClick={() => validateFile('billing', billingFile)} className="btn-secondary rounded-lg">{validationBusy === 'billing' ? 'Validating…' : 'Validate file'}</button><button type="button" disabled={!billingFile || !previews.billing?.can_import || busy === 'billing-import'} onClick={async () => { const ok = await run('billing-import', () => importFile('billing', billingFile), 'Billing file processed. Review the batch results below.'); if (ok) setPreviews(value => ({ ...value, billing: null })) }} className="btn-primary rounded-lg disabled:opacity-50">Import validated billing</button></div>
        {previewCard('billing', previews.billing)}
      </Section>
    </div>

    <Section title="Recent billing imports">
      {(data?.billing_batches || []).length === 0 ? <p className="text-sm text-gray-500">No billing files have been imported.</p> : <div className="space-y-2">{data.billing_batches.map(item => <div key={item.id} className="grid min-w-0 gap-2 rounded-lg border border-gray-200 p-3 text-xs sm:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]"><span className="min-w-0 break-all font-black text-navy-900">{item.filename}</span><span>{item.imported_count}/{item.row_count} imported</span><span className={item.failed_count ? 'font-bold text-red-700' : 'text-green-700'}>{item.failed_count} failed</span><span>{formatDate(item.created_at)}</span></div>)}</div>}
    </Section>
  </div>
}

function InventoryTab({ data, busy, run, complaints, staffMap, module }) {
  const [item, setItem] = useState({ sku: '', name: '', category: 'material', unit: 'piece', quantity_on_hand: 0, reorder_level: 0, location: '' })
  const [adjustment, setAdjustment] = useState({ id: '', quantity_delta: '', reason: '' })
  const [archive, setArchive] = useState({ complaint_id: '', reason: '' })
  const closed = complaints.filter(complaint => ['resolved', 'completed', 'rejected', 'cancelled'].includes(complaint.status) && !complaint.archived_at)
  const approvedArchives = (data?.approvals || []).filter(approval => approval.request_type === 'archive_complaint' && approval.status === 'approved')
  return <div className="space-y-5">
    {module === 'ecmd' && <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Equipment and materials" description="Track available materials and record stock used for maintenance work.">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); run('inventory', () => apiFetch('/operations/inventory', { method: 'POST', body: JSON.stringify(item) }), 'Inventory item saved.').then(ok => ok && setItem({ sku: '', name: '', category: 'material', unit: 'piece', quantity_on_hand: 0, reorder_level: 0, location: '' })) }}>
          <Field label="SKU"><input required value={item.sku} onChange={event => setItem(value => ({ ...value, sku: event.target.value }))} className="input-field rounded-lg" /></Field>
          <Field label="Item name"><input required value={item.name} onChange={event => setItem(value => ({ ...value, name: event.target.value }))} className="input-field rounded-lg" /></Field>
          <Field label="Category"><input value={item.category} onChange={event => setItem(value => ({ ...value, category: event.target.value }))} className="input-field rounded-lg" /></Field>
          <Field label="Unit"><input value={item.unit} onChange={event => setItem(value => ({ ...value, unit: event.target.value }))} className="input-field rounded-lg" /></Field>
          <Field label="Opening stock"><input type="number" min="0" step="0.01" value={item.quantity_on_hand} onChange={event => setItem(value => ({ ...value, quantity_on_hand: event.target.value }))} className="input-field rounded-lg" /></Field>
          <Field label="Reorder level"><input type="number" min="0" step="0.01" value={item.reorder_level} onChange={event => setItem(value => ({ ...value, reorder_level: event.target.value }))} className="input-field rounded-lg" /></Field>
          <button className="btn-primary rounded-lg sm:col-span-2">Save item</button>
        </form>
      </Section>

      <Section title="Adjust stock" description="Enter a reason for every stock change. The system records each adjustment in the activity and inventory history.">
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); run('adjust', () => apiFetch(`/operations/inventory/${adjustment.id}/adjust`, { method: 'POST', body: JSON.stringify(adjustment) }), 'Stock adjusted.') }}>
          <Field label="Inventory item"><select required value={adjustment.id} onChange={event => setAdjustment(value => ({ ...value, id: event.target.value }))} className="input-field rounded-lg"><option value="">Select item</option>{(data?.inventory || []).map(value => <option key={value.id} value={value.id}>{value.sku} · {value.name} ({value.quantity_on_hand} {value.unit})</option>)}</select></Field>
          <Field label="Quantity change"><input required type="number" step="0.01" value={adjustment.quantity_delta} onChange={event => setAdjustment(value => ({ ...value, quantity_delta: event.target.value }))} className="input-field rounded-lg" placeholder="Use a negative number to reduce stock." /></Field>
          <Field label="Reason"><textarea required minLength={5} rows={3} value={adjustment.reason} onChange={event => setAdjustment(value => ({ ...value, reason: event.target.value }))} className="input-field resize-none rounded-lg" /></Field>
          <button disabled={busy === 'adjust'} className="btn-primary w-full rounded-lg">Save adjustment</button>
        </form>
      </Section>
    </div>}

    {module === 'ecmd' && <Section title="Available equipment and materials">
      <div className="grid gap-3 md:grid-cols-2">{(data?.inventory || []).map(value => <div key={value.id} className={`rounded-xl border p-4 ${Number(value.quantity_on_hand) <= Number(value.reorder_level) ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}><div className="flex justify-between gap-3"><div><p className="font-black text-navy-900">{value.name}</p><p className="text-xs text-gray-500">{value.sku} · {value.category}</p></div><p className="font-display text-xl font-black text-navy-900">{value.quantity_on_hand} <span className="text-xs font-normal text-gray-500">{value.unit}</span></p></div>{Number(value.quantity_on_hand) <= Number(value.reorder_level) && <p className="mt-2 text-xs font-bold text-red-700">At or below reorder level ({value.reorder_level}).</p>}</div>)}</div>
    </Section>}

    {module !== 'ecmd' && <Section title={module === 'commercial' ? 'Archive requests for closed complaints' : 'Approved complaint archives'} description="A closed complaint can be archived only after a different System Supervisor approves the request.">
      {module === 'commercial' && <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={event => { event.preventDefault(); run('archive-request', () => apiFetch('/operations/archive-requests', { method: 'POST', body: JSON.stringify(archive) }), 'Archive request submitted for review.') }}>
        <Field label="Closed complaint"><select required value={archive.complaint_id} onChange={event => setArchive(value => ({ ...value, complaint_id: event.target.value }))} className="input-field rounded-lg"><option value="">Select complaint</option>{closed.map(value => <option key={value.id} value={value.id}>{value.reference_number} · {value.complaint_type}</option>)}</select></Field>
        <Field label="Archive reason"><input required minLength={5} value={archive.reason} onChange={event => setArchive(value => ({ ...value, reason: event.target.value }))} className="input-field rounded-lg" /></Field>
        <button className="btn-secondary self-end rounded-lg">Request approval</button>
      </form>}
      {module === 'system' && (approvedArchives.length > 0 ? <div className="space-y-2"><p className="text-xs font-black uppercase text-gray-500">Approved and ready</p>{approvedArchives.map(approval => <div key={approval.id} className="flex flex-col gap-2 rounded-lg border border-green-200 bg-green-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-black text-green-900">{complaints.find(item => item.id === approval.entity_id)?.reference_number || 'Complaint'}</p><p className="text-xs text-green-700">Approved by {staffMap[approval.reviewed_by]?.full_name || 'another System Supervisor'}</p></div><button onClick={() => run(`archive-${approval.id}`, () => apiFetch(`/operations/archive/${approval.entity_id}`, { method: 'POST', body: JSON.stringify({ approval_id: approval.id }) }), 'Complaint archived.')} className="rounded-lg bg-green-700 px-3 py-2 text-xs font-black text-white">Archive complaint</button></div>)}</div> : <p className="text-sm text-gray-500">No approved archive requests are ready.</p>)}
      <p className="mt-4 text-xs text-gray-500">Archived complaints stay in the database and activity history. They are hidden from active work lists, not permanently deleted.</p>
    </Section>}
  </div>
}
