import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { manilaDateYmd } from '../../lib/date'
import { ErrorBanner, Spinner } from './Feedback'

function today() {
  return manilaDateYmd()
}

export default function TaskResourcesPanel({ complaintId }) {
  const [resources, setResources] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [manpower, setManpower] = useState({ personnel_count: 1, hours_worked: 0, work_date: today(), notes: '' })
  const [usage, setUsage] = useState({ inventory_item_id: '', quantity: '', notes: '' })

  const fetchResources = () => apiFetch(`/operations/tasks/${complaintId}/resources`)
    .then(setResources)
    .catch(loadError => setError(loadError.message))

  useEffect(() => {
    let active = true
    apiFetch(`/operations/tasks/${complaintId}/resources`)
      .then(result => { if (active) setResources(result) })
      .catch(loadError => { if (active) setError(loadError.message) })
    return () => { active = false }
  }, [complaintId])

  const inventoryMap = useMemo(() => Object.fromEntries((resources?.inventory || []).map(item => [item.id, item])), [resources])

  const submit = async (kind, body) => {
    setBusy(kind)
    setError('')
    try {
      await apiFetch(`/operations/tasks/${complaintId}/${kind === 'manpower' ? 'manpower' : 'inventory-usage'}`, {
        method: 'POST', body: JSON.stringify(body),
      })
      await fetchResources()
      if (kind === 'manpower') setManpower({ personnel_count: 1, hours_worked: 0, work_date: today(), notes: '' })
      else setUsage({ inventory_item_id: '', quantity: '', notes: '' })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="card rounded-xl p-5 no-print" aria-labelledby="resources-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="resources-title" className="font-display font-bold text-navy-900">Crew, Manpower & Materials</h2><p className="mt-1 text-xs text-gray-500">Record field resources used for this assignment.</p></div>
        <Link to={`/maintenance-reports/${complaintId}`} className="btn-secondary rounded-lg text-xs">Official Report</Link>
      </div>
      {error && <div className="mt-3"><ErrorBanner message={error} onRetry={fetchResources} /></div>}
      {!resources ? <div className="flex justify-center py-6"><Spinner className="h-5 w-5 border-2 border-navy-700" /></div> : <>
        <div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs"><span className="font-black text-navy-900">Assigned crew:</span> {resources.crew?.name || 'No crew assigned'}</div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <form onSubmit={event => { event.preventDefault(); submit('manpower', manpower) }} className="rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-gray-500">Manpower Entry</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs font-bold text-gray-600">Personnel<input required type="number" min="1" value={manpower.personnel_count} onChange={event => setManpower(value => ({ ...value, personnel_count: event.target.value }))} className="input-field mt-1 rounded-lg" /></label>
              <label className="text-xs font-bold text-gray-600">Hours<input required type="number" min="0" step="0.25" value={manpower.hours_worked} onChange={event => setManpower(value => ({ ...value, hours_worked: event.target.value }))} className="input-field mt-1 rounded-lg" /></label>
              <label className="col-span-2 text-xs font-bold text-gray-600">Work Date<input required type="date" value={manpower.work_date} onChange={event => setManpower(value => ({ ...value, work_date: event.target.value }))} className="input-field mt-1 rounded-lg" /></label>
              <label className="col-span-2 text-xs font-bold text-gray-600">Notes<textarea rows={2} value={manpower.notes} onChange={event => setManpower(value => ({ ...value, notes: event.target.value }))} className="input-field mt-1 resize-none rounded-lg" /></label>
            </div>
            <button disabled={busy === 'manpower'} className="btn-primary mt-3 w-full rounded-lg text-xs">Record Manpower</button>
          </form>

          <form onSubmit={event => { event.preventDefault(); submit('inventory', usage) }} className="rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-gray-500">Equipment / Material Usage</p>
            <div className="mt-3 space-y-2">
              <label className="text-xs font-bold text-gray-600">Inventory Item<select required value={usage.inventory_item_id} onChange={event => setUsage(value => ({ ...value, inventory_item_id: event.target.value }))} className="input-field mt-1 rounded-lg"><option value="">Select available item</option>{resources.inventory.map(item => <option key={item.id} value={item.id}>{item.name} · {item.quantity_on_hand} {item.unit} available</option>)}</select></label>
              <label className="text-xs font-bold text-gray-600">Quantity<input required type="number" min="0.01" step="0.01" value={usage.quantity} onChange={event => setUsage(value => ({ ...value, quantity: event.target.value }))} className="input-field mt-1 rounded-lg" /></label>
              <label className="text-xs font-bold text-gray-600">Notes<textarea rows={2} value={usage.notes} onChange={event => setUsage(value => ({ ...value, notes: event.target.value }))} className="input-field mt-1 resize-none rounded-lg" /></label>
            </div>
            <button disabled={busy === 'inventory'} className="btn-primary mt-3 w-full rounded-lg text-xs">Record Usage</button>
          </form>
        </div>

        {(resources.manpower.length > 0 || resources.usage.length > 0) && <details className="mt-4 rounded-lg border border-gray-200"><summary className="cursor-pointer px-4 py-3 text-sm font-bold text-navy-800">Recorded resource history</summary><div className="space-y-3 border-t p-4 text-xs">{resources.manpower.map(item => <p key={item.id}><strong>{item.work_date}:</strong> {item.personnel_count} personnel, {item.hours_worked} hours{item.notes ? ` — ${item.notes}` : ''}</p>)}{resources.usage.map(item => <p key={item.id}><strong>{inventoryMap[item.inventory_item_id]?.name || 'Inventory item'}:</strong> {item.quantity} {inventoryMap[item.inventory_item_id]?.unit || ''}{item.notes ? ` — ${item.notes}` : ''}</p>)}</div></details>}
      </>}
    </section>
  )
}
