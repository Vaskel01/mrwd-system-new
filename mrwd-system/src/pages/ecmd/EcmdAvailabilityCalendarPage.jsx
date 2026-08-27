import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { addDaysYmd, manilaDateYmd } from '../../lib/date'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'

const stateLabel = value => ({
  available: 'Available',
  busy: 'Busy',
  on_leave: 'On leave',
  off_duty: 'Off duty',
}[value] || value)

function Field({ label, children }) {
  return (
    <label className="block text-xs font-bold text-gray-600">
      {label}
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

export default function EcmdAvailabilityCalendarPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [days, setDays] = useState(14)
  const [form, setForm] = useState({
    staff_id: '',
    shift_date: manilaDateYmd(),
    starts_at: '08:00',
    ends_at: '17:00',
    shift_status: 'scheduled',
    notes: '',
  })

  const load = useCallback(async () => {
    setError('')
    try {
      setData(await apiFetch(`/production/availability-calendar?days=${days}`))
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const dates = useMemo(() => {
    if (!data) return []
    const result = []
    for (let date = data.from; date && date <= data.to; date = addDaysYmd(date, 1)) result.push(date)
    return result
  }, [data])

  const save = async event => {
    event.preventDefault()
    setBusy(true)
    try {
      await apiFetch('/operations/schedules', { method: 'POST', body: JSON.stringify(form) })
      await load()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <PageLoader label="Loading Maintenance Personnel availability..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-5 py-6 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gold-400">Engineering, Construction and Maintenance Department (ECMD)</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-black text-white sm:text-3xl">Availability calendar</h1>
            <p className="mt-1 text-sm text-navy-300">Check who is available and review scheduled shifts before assigning field work.</p>
          </div>
          <label className="text-xs font-bold text-navy-200">
            Show
            <select
              value={days}
              onChange={event => { setLoading(true); setDays(Number(event.target.value)) }}
              className="ml-2 rounded-lg border border-white/30 bg-navy-800 px-3 py-2 text-xs font-black text-white"
            >
              <option value="7">Next 7 days</option>
              <option value="14">Next 14 days</option>
              <option value="30">Next 30 days</option>
            </select>
          </label>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-3" aria-label="Maintenance Personnel schedules">
          {(data?.staff || []).map(person => (
            <article key={person.id} className="card rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display font-black text-navy-900">{person.full_name}</h2>
                  <p className="mt-1 text-xs text-gray-500">Current availability: {stateLabel(person.availability_status)}</p>
                </div>
                <span className="rounded-full bg-navy-50 px-2 py-1 text-xs font-black uppercase text-navy-700">
                  {String(person.staff_position || 'Maintenance Personnel').replaceAll('_', ' ')}
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {dates.map(date => {
                  const schedule = (data.schedules || []).find(item => item.staff_id === person.id && item.shift_date === date)
                  return (
                    <div key={date} className={`rounded-lg border p-2.5 ${schedule ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}>
                      <p className="text-xs font-black uppercase text-gray-500">{new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                      <p className="mt-1 text-xs font-bold text-gray-700">{schedule ? `${schedule.starts_at.slice(0, 5)}–${schedule.ends_at.slice(0, 5)}` : 'No shift scheduled'}</p>
                      {schedule && <p className="text-xs text-blue-700">{stateLabel(schedule.shift_status)}</p>}
                    </div>
                  )
                })}
              </div>
            </article>
          ))}
          {!data?.staff?.length && <div className="card rounded-xl p-10 text-center text-sm text-gray-500">No Maintenance Personnel are available to schedule.</div>}
        </section>

        <form onSubmit={save} className="card h-fit rounded-xl p-5 xl:sticky xl:top-5">
          <h2 className="font-display font-black text-navy-900">Add or update shift</h2>
          <p className="mt-1 text-xs text-gray-500">Save a shift for one Maintenance Personnel account.</p>
          <div className="mt-4 space-y-4">
            <Field label="Maintenance Personnel">
              <select required value={form.staff_id} onChange={event => setForm(value => ({ ...value, staff_id: event.target.value }))} className="input-field rounded-lg">
                <option value="">Choose a person</option>
                {(data?.staff || []).map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}
              </select>
            </Field>
            <Field label="Shift date">
              <input type="date" required value={form.shift_date} onChange={event => setForm(value => ({ ...value, shift_date: event.target.value }))} className="input-field rounded-lg" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start time"><input type="time" value={form.starts_at} onChange={event => setForm(value => ({ ...value, starts_at: event.target.value }))} className="input-field rounded-lg" /></Field>
              <Field label="End time"><input type="time" value={form.ends_at} onChange={event => setForm(value => ({ ...value, ends_at: event.target.value }))} className="input-field rounded-lg" /></Field>
            </div>
            <Field label="Shift status">
              <select value={form.shift_status} onChange={event => setForm(value => ({ ...value, shift_status: event.target.value }))} className="input-field rounded-lg">
                <option value="scheduled">Scheduled</option>
                <option value="available">Available</option>
                <option value="on_leave">On leave</option>
                <option value="off_duty">Off duty</option>
              </select>
            </Field>
            <Field label="Shift note">
              <textarea rows={3} value={form.notes} onChange={event => setForm(value => ({ ...value, notes: event.target.value }))} className="input-field resize-none rounded-lg" placeholder="Optional note about this shift" />
            </Field>
            <button disabled={busy} className="btn-primary w-full rounded-lg">{busy ? 'Saving…' : 'Save shift'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
