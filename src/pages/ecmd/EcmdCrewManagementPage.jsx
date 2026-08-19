import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { manilaDateYmd } from '../../lib/date'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import { useToastStore } from '../../store/toastStore'

function titleCase(value) { return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase()) }

export default function EcmdCrewManagementPage() {
  const [data, setData] = useState({ crews: [] })
  const [staff, setStaff] = useState([])
  const [departments, setDepartments] = useState([])
  const [templates, setTemplates] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const pushToast = useToastStore(state => state.push)
  const [crewForm, setCrewForm] = useState({ name: '', team_leader_id: '', default_manpower: 3, contact_note: '' })
  const [memberForm, setMemberForm] = useState({ crew_id: '', staff_id: '', crew_role: 'crew_member' })
  const [subForm, setSubForm] = useState({ crew_id: '', replaced_staff_id: '', substitute_staff_id: '', starts_on: manilaDateYmd(), ends_on: '', reason: '' })
  const [templateForm, setTemplateForm] = useState({ label: '', content: '', category: '' })

  const load = useCallback(async () => {
    setError('')
    try {
      const [directory, people, bootstrap, templateResult] = await Promise.all([
        apiFetch('/production/crew-directory'), apiFetch('/users/maintenance-staff'), apiFetch('/operations/ecmd-bootstrap'), apiFetch('/production/maintenance-note-templates'),
      ])
      setData(directory)
      setStaff(people.staff || [])
      setDepartments(bootstrap.departments || [])
      setTemplates(templateResult.templates || [])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const ecmdId = departments.find(item => String(item.code).toUpperCase() === 'ECMD')?.id || departments[0]?.id
  const staffMap = useMemo(() => Object.fromEntries(staff.map(person => [person.id, person])), [staff])
  const run = async (key, action, success) => {
    setBusy(key); setError('')
    try {
      await action(); pushToast(success, 'success'); await load(); return true
    } catch (runError) {
      setError(runError.message); pushToast(runError.message, 'error'); return false
    } finally { setBusy('') }
  }

  if (loading) return <PageLoader label="Loading ECMD crews..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-5 py-6 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gold-400">Engineering, Construction and Maintenance Department (ECMD)</p>
        <h1 className="mt-1 font-display text-2xl font-black text-white sm:text-3xl">Crew Management</h1>
        <p className="mt-1 text-sm text-navy-300">Maintain ECMD crews, crew members, temporary substitutions, and reusable maintenance completion-note templates.</p>
      </div>
      {error && <ErrorBanner message={error} onRetry={load} />}

      <section className="grid gap-4 lg:grid-cols-2">
        {(data.crews || []).map(crew => <article key={crew.id} className="card rounded-xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-display text-lg font-black text-navy-900">{crew.name}</h2><p className="mt-1 text-xs text-gray-500">Team Leader: {crew.leader?.full_name || staffMap[crew.team_leader_id]?.full_name || 'Not assigned'} · Default manpower {crew.default_manpower}</p></div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${crew.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{crew.is_active ? 'ACTIVE' : 'INACTIVE'}</span><button type="button" disabled={Boolean(busy)} onClick={() => run(`crew-status-${crew.id}`, () => apiFetch(`/operations/crews/${crew.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !crew.is_active }) }), crew.is_active ? 'Crew deactivated.' : 'Crew reactivated.')} className="btn-secondary rounded-lg text-[10px]">{busy === `crew-status-${crew.id}` ? 'Saving…' : crew.is_active ? 'Deactivate' : 'Reactivate'}</button></div></div>
          <div className="mt-4"><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Crew Members</p><div className="mt-2 flex flex-wrap gap-2">{(crew.members || []).map(member => <span key={member.id} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-bold text-gray-700"><span className="min-w-0 break-words">{member.staff?.full_name || 'Maintenance Personnel'} · {titleCase(member.crew_role)}</span><button type="button" disabled={Boolean(busy)} onClick={() => run(`member-remove-${member.id}`, () => apiFetch(`/operations/crew-members/${member.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) }), 'Crew member removed.')} className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black text-red-700 hover:bg-red-50" aria-label={`Remove ${member.staff?.full_name || 'Maintenance Personnel'} from ${crew.name}`}>Remove</button></span>)}{!crew.members?.length && <span className="text-xs text-gray-400">No members assigned.</span>}</div></div>
          {crew.substitutions?.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[10px] font-black uppercase text-amber-700">Active Substitutions</p>{crew.substitutions.map(substitution => <div key={substitution.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="break-words font-bold text-amber-900">{substitution.replaced?.full_name} → {substitution.substitute?.full_name}</span><button disabled={Boolean(busy)} onClick={() => run(`end-${substitution.id}`, () => apiFetch(`/production/crew-substitutions/${substitution.id}/end`, { method: 'PATCH', body: JSON.stringify({}) }), 'Temporary substitution ended.')} className="rounded-lg border border-amber-300 px-2 py-1 font-black text-amber-800">{busy === `end-${substitution.id}` ? 'Ending…' : 'End Substitution'}</button><p className="w-full break-words text-amber-700">{substitution.reason}</p></div>)}</div>}
        </article>)}
        {!data.crews?.length && <div className="card lg:col-span-2 rounded-xl p-10 text-center text-sm text-gray-400">No ECMD crews have been created yet.</div>}
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <form onSubmit={async event => { event.preventDefault(); const ok = await run('crew', () => apiFetch('/operations/crews', { method: 'POST', body: JSON.stringify({ ...crewForm, department_id: ecmdId }) }), 'Crew created.'); if (ok) setCrewForm({ name: '', team_leader_id: '', default_manpower: 3, contact_note: '' }) }} className="card rounded-xl p-5"><h2 className="font-display font-black text-navy-900">Create Crew</h2><div className="mt-4 space-y-3"><input required value={crewForm.name} onChange={event => setCrewForm(value => ({ ...value, name: event.target.value }))} className="input-field rounded-lg" placeholder="Crew name" /><select value={crewForm.team_leader_id} onChange={event => setCrewForm(value => ({ ...value, team_leader_id: event.target.value }))} className="input-field rounded-lg"><option value="">Team Leader (optional)</option>{staff.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select><input aria-label="Default manpower" type="number" min="1" max="20" value={crewForm.default_manpower} onChange={event => setCrewForm(value => ({ ...value, default_manpower: Number(event.target.value) }))} className="input-field rounded-lg" /><input value={crewForm.contact_note} onChange={event => setCrewForm(value => ({ ...value, contact_note: event.target.value }))} className="input-field rounded-lg" placeholder="Contact / deployment note" /><button disabled={Boolean(busy)} className="btn-primary w-full rounded-lg">{busy === 'crew' ? 'Creating…' : 'Create Crew'}</button></div></form>

        <form onSubmit={async event => { event.preventDefault(); const ok = await run('member', () => apiFetch('/operations/crew-members', { method: 'POST', body: JSON.stringify(memberForm) }), 'Crew member saved.'); if (ok) setMemberForm(value => ({ ...value, staff_id: '' })) }} className="card rounded-xl p-5"><h2 className="font-display font-black text-navy-900">Add / Update Member</h2><div className="mt-4 space-y-3"><select required value={memberForm.crew_id} onChange={event => setMemberForm(value => ({ ...value, crew_id: event.target.value }))} className="input-field rounded-lg"><option value="">Crew</option>{data.crews.map(crew => <option key={crew.id} value={crew.id}>{crew.name}</option>)}</select><select required value={memberForm.staff_id} onChange={event => setMemberForm(value => ({ ...value, staff_id: event.target.value }))} className="input-field rounded-lg"><option value="">Maintenance Personnel</option>{staff.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select><select value={memberForm.crew_role} onChange={event => setMemberForm(value => ({ ...value, crew_role: event.target.value }))} className="input-field rounded-lg"><option value="crew_member">Maintenance Crew Member</option><option value="team_leader">Team Leader</option><option value="driver">Driver</option><option value="specialist">Specialist</option><option value="helper">Helper</option></select><button disabled={Boolean(busy)} className="btn-primary w-full rounded-lg">{busy === 'member' ? 'Saving…' : 'Save Member'}</button></div></form>

        <form onSubmit={async event => { event.preventDefault(); const ok = await run('substitution', () => apiFetch('/production/crew-substitutions', { method: 'POST', body: JSON.stringify({ ...subForm, ends_on: subForm.ends_on || null }) }), 'Temporary substitution started.'); if (ok) setSubForm(value => ({ ...value, replaced_staff_id: '', substitute_staff_id: '', reason: '' })) }} className="card rounded-xl p-5"><h2 className="font-display font-black text-navy-900">Temporary Substitution</h2><div className="mt-4 space-y-3"><select required value={subForm.crew_id} onChange={event => setSubForm(value => ({ ...value, crew_id: event.target.value }))} className="input-field rounded-lg"><option value="">Crew</option>{data.crews.map(crew => <option key={crew.id} value={crew.id}>{crew.name}</option>)}</select><select required value={subForm.replaced_staff_id} onChange={event => setSubForm(value => ({ ...value, replaced_staff_id: event.target.value }))} className="input-field rounded-lg"><option value="">Personnel being replaced</option>{staff.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select><select required value={subForm.substitute_staff_id} onChange={event => setSubForm(value => ({ ...value, substitute_staff_id: event.target.value }))} className="input-field rounded-lg"><option value="">Substitute personnel</option>{staff.filter(person => person.id !== subForm.replaced_staff_id).map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><input aria-label="Substitution start date" type="date" value={subForm.starts_on} onChange={event => setSubForm(value => ({ ...value, starts_on: event.target.value }))} className="input-field rounded-lg" /><input aria-label="Substitution end date" type="date" value={subForm.ends_on} min={subForm.starts_on} onChange={event => setSubForm(value => ({ ...value, ends_on: event.target.value }))} className="input-field rounded-lg" /></div><textarea required minLength="3" rows="3" value={subForm.reason} onChange={event => setSubForm(value => ({ ...value, reason: event.target.value }))} className="input-field resize-none rounded-lg" placeholder="Substitution reason" /><button disabled={Boolean(busy)} className="btn-primary w-full rounded-lg">{busy === 'substitution' ? 'Starting…' : 'Start Substitution'}</button></div></form>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="card rounded-xl p-5"><div><h2 className="font-display font-black text-navy-900">Maintenance Completion-Note Templates</h2><p className="mt-1 text-xs text-gray-500">Maintenance Personnel can insert these as editable starting points when recording field-work completion notes.</p></div><div className="mt-4 grid gap-3 md:grid-cols-2">{templates.map(template => <article key={template.id} className="rounded-xl border border-gray-200 p-4"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-black text-navy-900">{template.label}</p>{template.category && <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-gold-700">{template.category}</p>}</div><button type="button" disabled={Boolean(busy)} onClick={() => run(`template-${template.id}`, () => apiFetch(`/production/maintenance-note-templates/${template.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) }), 'Template deactivated.')} className="shrink-0 rounded-lg border border-gray-200 px-2 py-1 text-[10px] font-black text-gray-600">Deactivate</button></div><p className="mt-3 break-words text-sm leading-6 text-gray-600">{template.content}</p></article>)}{!templates.length && <p className="md:col-span-2 py-8 text-center text-sm text-gray-400">No active completion-note templates.</p>}</div></div>
        <form onSubmit={async event => { event.preventDefault(); const ok = await run('template', () => apiFetch('/production/maintenance-note-templates', { method: 'POST', body: JSON.stringify(templateForm) }), 'Completion-note template created.'); if (ok) setTemplateForm({ label: '', content: '', category: '' }) }} className="card h-fit rounded-xl p-5"><h2 className="font-display font-black text-navy-900">New Template</h2><div className="mt-4 space-y-3"><input required minLength="2" value={templateForm.label} onChange={event => setTemplateForm(value => ({ ...value, label: event.target.value }))} className="input-field rounded-lg" placeholder="Template label" /><input value={templateForm.category} onChange={event => setTemplateForm(value => ({ ...value, category: event.target.value }))} className="input-field rounded-lg" placeholder="Complaint Type (optional)" /><textarea required minLength="3" rows="5" value={templateForm.content} onChange={event => setTemplateForm(value => ({ ...value, content: event.target.value }))} className="input-field resize-none rounded-lg" placeholder="Editable completion-note text" /><button disabled={Boolean(busy)} className="btn-primary w-full rounded-lg">{busy === 'template' ? 'Saving…' : 'Save Template'}</button></div></form>
      </section>
    </div>
  )
}
