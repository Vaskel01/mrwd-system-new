import { useEffect, useMemo, useState } from 'react'
import { useProductionStore } from '../../store/productionStore'
import { ErrorBanner } from './Feedback'

function pretty(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

export default function ScheduledReportsPanel({
  allowedTypes,
  defaultType,
  title = 'Scheduled Reports',
  description = 'Generate recurring operational summaries and keep their run history.',
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
    <section className="card rounded-xl p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="font-display font-black text-navy-900">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>
        </div>
        <form onSubmit={submit} className="grid w-full gap-2 sm:grid-cols-2 lg:max-w-2xl lg:grid-cols-[minmax(0,1.4fr)_minmax(150px,.8fr)_minmax(120px,.65fr)_auto]">
          <input required minLength="2" value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} className="input-field rounded-lg" placeholder="Schedule name" />
          <select value={form.report_type} onChange={event => setForm(value => ({ ...value, report_type: event.target.value }))} className="input-field rounded-lg">{types.map(type => <option key={type} value={type}>{pretty(type)}</option>)}</select>
          <select value={form.cadence} onChange={event => setForm(value => ({ ...value, cadence: event.target.value }))} className="input-field rounded-lg"><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
          <button disabled={Boolean(busy)} className="btn-primary rounded-lg px-4">{busy === 'create' ? 'Saving…' : 'Save'}</button>
        </form>
      </div>
      {error && <div className="mt-4"><ErrorBanner message={error} /></div>}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Active Definitions</p>
          <div className="mt-2 space-y-2">
            {visibleSchedules.map(item => <div key={item.id} className="rounded-xl border border-gray-200 p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-black text-navy-900">{item.name}</p><p className="mt-1 text-xs text-gray-500">{pretty(item.report_type)} · {pretty(item.cadence)}{item.next_run_at ? ` · next ${new Date(item.next_run_at).toLocaleString('en-PH')}` : ''}</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => act(`run-${item.id}`, () => runNow(item.id))} className="btn-secondary rounded-lg text-xs">{busy === `run-${item.id}` ? 'Running…' : 'Run Now'}</button><button type="button" disabled={Boolean(busy)} onClick={() => act(`delete-${item.id}`, () => remove(item.id))} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-700">Delete</button></div></div></div>)}
            {!visibleSchedules.length && <p className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">No schedules for this module yet.</p>}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Recent Generated Runs</p>
          <div className="mt-2 space-y-2">
            {visibleRuns.map(item => <div key={item.id} className="rounded-xl bg-gray-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-gray-800">{pretty(item.report_type)} · {item.row_count} records</p><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${item.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{item.status || 'ready'}</span></div><p className="mt-1 text-[11px] text-gray-400">{new Date(item.generated_at).toLocaleString('en-PH')}</p></div>)}
            {!visibleRuns.length && <p className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">No generated runs yet.</p>}
          </div>
        </div>
      </div>
    </section>
  )
}
