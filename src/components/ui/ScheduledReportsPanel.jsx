import { useEffect, useMemo, useState } from 'react'
import { useProductionStore } from '../../store/productionStore'
import { ErrorBanner } from './Feedback'

function pretty(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

export default function ScheduledReportsPanel({
  allowedTypes,
  defaultType,
  title = 'Scheduled reports',
  description = 'Create recurring reports and review recent runs.',
}) {
  const schedules = useProductionStore(state => state.reportSchedules)
  const runs = useProductionStore(state => state.reportRuns)
  const load = useProductionStore(state => state.loadReportSchedules)
  const create = useProductionStore(state => state.createReportSchedule)
  const runNow = useProductionStore(state => state.runReportSchedule)
  const remove = useProductionStore(state => state.deleteReportSchedule)
  const types = useMemo(() => allowedTypes?.length ? allowedTypes : [defaultType], [allowedTypes, defaultType])
  const [form, setForm] = useState({ name: '', report_type: defaultType || types[0], cadence: 'weekly' })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { load().catch(errorValue => setError(errorValue.message)) }, [load])
  const visibleSchedules = schedules.filter(item => types.includes(item.report_type))
  const visibleRuns = runs.filter(item => types.includes(item.report_type)).slice(0, 8)

  const submit = async event => {
    event.preventDefault()
    if (!form.name.trim()) return
    setBusy('create'); setError('')
    try {
      await create({ ...form, name: form.name.trim(), filters: {} })
      setForm(value => ({ ...value, name: '' }))
    } catch (submitError) { setError(submitError.message) }
    finally { setBusy('') }
  }

  const act = async (key, action) => {
    setBusy(key); setError('')
    try { await action() } catch (actionError) { setError(actionError.message) }
    finally { setBusy('') }
  }

  return (
    <section className="card rounded-xl p-5 sm:p-6">
      <div className="max-w-2xl">
        <h2 className="font-display text-lg font-black text-navy-900">{title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-gray-500">{description}</p>
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(180px,.9fr)_minmax(140px,.7fr)_auto] xl:items-end">
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-gray-600">Schedule name</span>
          <input required minLength="2" value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} className="input-field rounded-lg" placeholder="Example: Weekly complaint summary" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-gray-600">Report</span>
          <select value={form.report_type} onChange={event => setForm(value => ({ ...value, report_type: event.target.value }))} className="input-field rounded-lg">
            {types.map(type => <option key={type} value={type}>{pretty(type)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-gray-600">Frequency</span>
          <select value={form.cadence} onChange={event => setForm(value => ({ ...value, cadence: event.target.value }))} className="input-field rounded-lg">
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <button disabled={Boolean(busy)} className="btn-primary min-h-10 rounded-lg px-4">{busy === 'create' ? 'Saving…' : 'Save schedule'}</button>
      </form>

      {error && <div className="mt-4"><ErrorBanner message={error} /></div>}

      <div className="mt-7 grid gap-7 xl:grid-cols-2">
        <div>
          <h3 className="text-sm font-black text-navy-900">Scheduled reports</h3>
          <p className="mt-1 text-xs leading-5 text-gray-500">Run a report now, or let the saved schedule run automatically.</p>
          <div className="mt-3 space-y-2">
            {visibleSchedules.map(item => (
              <div key={item.id} className="rounded-xl border border-gray-200 p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-black text-navy-900">{item.name}</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">{pretty(item.report_type)} · {pretty(item.cadence)}{item.next_run_at ? ` · Next run ${new Date(item.next_run_at).toLocaleString('en-PH')}` : ''}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={Boolean(busy)} onClick={() => act(`run-${item.id}`, () => runNow(item.id))} className="btn-secondary rounded-lg text-xs">{busy === `run-${item.id}` ? 'Running…' : 'Run now'}</button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => act(`delete-${item.id}`, () => remove(item.id))} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-700">Delete</button>
                  </div>
                </div>
              </div>
            ))}
            {!visibleSchedules.length && <p className="rounded-xl border border-dashed border-gray-200 px-4 py-7 text-center text-sm text-gray-500">No scheduled reports yet.</p>}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-black text-navy-900">Recent report runs</h3>
          <p className="mt-1 text-xs leading-5 text-gray-500">Review the latest generated reports and their status.</p>
          <div className="mt-3 space-y-2">
            {visibleRuns.map(item => (
              <div key={item.id} className="rounded-xl bg-gray-50 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black text-gray-800">{pretty(item.report_type)} · {item.row_count} records</p>
                  <span className={`rounded-full px-2 py-1 text-xs font-black uppercase ${item.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{item.status || 'ready'}</span>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">{new Date(item.generated_at).toLocaleString('en-PH')}</p>
              </div>
            ))}
            {!visibleRuns.length && <p className="rounded-xl border border-dashed border-gray-200 px-4 py-7 text-center text-sm text-gray-500">No report runs yet.</p>}
          </div>
        </div>
      </div>
    </section>
  )
}
