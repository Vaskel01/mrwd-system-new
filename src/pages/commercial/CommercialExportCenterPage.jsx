import { useEffect, useMemo, useState } from 'react'
import { useComplaintStore } from '../../store/complaintStore'
import { useProductionStore } from '../../store/productionStore'
import { apiFetch } from '../../lib/api'
import { manilaDateYmd } from '../../lib/date'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import { priorityLabel, statusLabel, STATUS_LABELS, TERMS } from '../../config/terminology'

const esc = value => `"${String(value ?? '').replaceAll('"', '""')}"`
const today = () => manilaDateYmd()

function formatReportType(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
}

export default function CommercialExportCenterPage() {
  const complaints = useComplaintStore(state => state.complaints)
  const fetchComplaints = useComplaintStore(state => state.fetchComplaints)
  const schedules = useProductionStore(state => state.reportSchedules)
  const runs = useProductionStore(state => state.reportRuns)
  const loadSchedules = useProductionStore(state => state.loadReportSchedules)
  const createSchedule = useProductionStore(state => state.createReportSchedule)
  const runSchedule = useProductionStore(state => state.runReportSchedule)
  const deleteSchedule = useProductionStore(state => state.deleteReportSchedule)

  const [filters, setFilters] = useState({ from: '', to: today(), status: 'all', priority: 'all', q: '' })
  const [schedule, setSchedule] = useState({ name: 'Weekly Complaint Summary', report_type: 'complaint_summary', cadence: 'weekly' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([fetchComplaints(), loadSchedules()])
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [fetchComplaints, loadSchedules])

  const scoped = useMemo(() => complaints.filter(complaint => {
    const submitted = new Date(complaint.created_at || complaint.submitted_at)
    if (filters.from && submitted < new Date(`${filters.from}T00:00:00`)) return false
    if (filters.to && submitted > new Date(`${filters.to}T23:59:59.999`)) return false
    if (filters.status !== 'all' && complaint.status !== filters.status) return false
    if (filters.priority !== 'all' && complaint.priority !== filters.priority) return false

    const query = filters.q.trim().toLowerCase()
    return !query || [
      complaint.reference_number,
      complaint.complaint_type,
      complaint.customer_name,
      complaint.address,
      complaint.zone,
    ].some(value => String(value || '').toLowerCase().includes(query))
  }), [complaints, filters])

  const exportCsv = async () => {
    setError('')
    try {
      await apiFetch('/production/exports/log', {
        method: 'POST',
        body: JSON.stringify({ export_type: 'complaint_export', format: 'csv', row_count: scoped.length, filters }),
      })

      const headers = [TERMS.REFERENCE_NUMBER, 'Complaint type', 'Customer', 'Priority', 'Status', 'Address', 'Barangay/Zone', 'Assigned Maintenance Personnel', 'Submitted', 'Resolved']
      const rows = scoped.map(complaint => [
        complaint.reference_number,
        complaint.complaint_type,
        complaint.customer_name,
        priorityLabel(complaint.priority),
        statusLabel(complaint.status),
        complaint.address,
        complaint.zone,
        complaint.assigned_name,
        complaint.created_at,
        complaint.completed_at || complaint.verified_at || '',
      ])
      const blob = new Blob([[headers, ...rows].map(row => row.map(esc).join(',')).join('\n')], { type: 'text/csv' })
      const anchor = document.createElement('a')
      anchor.href = URL.createObjectURL(blob)
      anchor.download = `mrwd-complaint-export-${today()}.csv`
      anchor.click()
      URL.revokeObjectURL(anchor.href)
    } catch (err) {
      setError(err.message)
    }
  }

  const addSchedule = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await createSchedule({ ...schedule, filters })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <PageLoader label="Loading exports and schedules…" />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header page-header">
        <p className="text-xs font-bold uppercase tracking-widest text-gold-400">Commercial Services Department</p>
        <h1 className="mt-1 font-display text-2xl font-black text-white sm:text-3xl">{TERMS.EXPORTS_SCHEDULES}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-navy-300">Filter complaint records, export the results, or save the same filters as a recurring report.</p>
      </div>

      {error && <ErrorBanner message={error} />}

      <section className="card rounded-xl p-5 sm:p-6">
        <div className="max-w-2xl">
          <h2 className="font-display text-lg font-black text-navy-900">Choose records to export</h2>
          <p className="mt-1.5 text-sm leading-6 text-gray-500">Use one or more filters. The count below updates to show how many complaints will be included.</p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-gray-600">From date</span>
            <input type="date" value={filters.from} onChange={event => setFilters(value => ({ ...value, from: event.target.value }))} className="input-field rounded-lg" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-gray-600">To date</span>
            <input type="date" value={filters.to} onChange={event => setFilters(value => ({ ...value, to: event.target.value }))} className="input-field rounded-lg" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-gray-600">Status</span>
            <select value={filters.status} onChange={event => setFilters(value => ({ ...value, status: event.target.value }))} className="input-field rounded-lg">
              <option value="all">All statuses</option>
              {['pending', 'forwarded', 'assigned', 'in_progress', 'resolved', 'rejected', 'cancelled', 'merged'].map(status => (
                <option key={status} value={status}>{STATUS_LABELS[status]}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-gray-600">Priority</span>
            <select value={filters.priority} onChange={event => setFilters(value => ({ ...value, priority: event.target.value }))} className="input-field rounded-lg">
              <option value="all">All priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-gray-600">Search</span>
            <input value={filters.q} onChange={event => setFilters(value => ({ ...value, q: event.target.value }))} className="input-field rounded-lg" placeholder="Reference, type, customer, or area" />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-gray-100 pt-5">
          <div>
            <p className="font-display text-3xl font-black text-navy-900">{scoped.length}</p>
            <p className="mt-1 text-sm text-gray-500">complaints match these filters</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportCsv} className="btn-primary rounded-lg">Export CSV</button>
            <button onClick={() => window.print()} className="btn-secondary rounded-lg">Print or save as PDF</button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="card rounded-xl p-5 sm:p-6">
          <h2 className="font-display text-lg font-black text-navy-900">Scheduled reports</h2>
          <p className="mt-1.5 text-sm leading-6 text-gray-500">Run a saved report now or wait for its next scheduled run.</p>

          <div className="mt-4 space-y-3">
            {schedules.map(item => (
              <div key={item.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="font-black text-navy-900">{item.name}</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">{formatReportType(item.report_type)} · {item.cadence} · {item.next_run_at ? `Next run ${new Date(item.next_run_at).toLocaleString('en-PH')}` : 'No next run scheduled'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => runSchedule(item.id)} className="btn-secondary rounded-lg text-xs">Run now</button>
                    <button onClick={() => deleteSchedule(item.id)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-700">Delete</button>
                  </div>
                </div>
              </div>
            ))}
            {!schedules.length && <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">No scheduled reports yet.</p>}
          </div>

          <h3 className="mt-7 text-sm font-black text-navy-900">Recent report runs</h3>
          <div className="mt-3 space-y-2">
            {runs.slice(0, 10).map(item => (
              <div key={item.id} className="rounded-lg bg-gray-50 p-3 text-xs">
                <p className="font-black text-gray-800">{formatReportType(item.report_type)} · {item.row_count} records</p>
                <p className="mt-1 text-gray-500">{new Date(item.generated_at).toLocaleString('en-PH')}</p>
              </div>
            ))}
            {!runs.length && <p className="text-sm text-gray-500">No report runs yet.</p>}
          </div>
        </div>

        <form onSubmit={addSchedule} className="card h-fit rounded-xl p-5 sm:p-6">
          <h2 className="font-display text-lg font-black text-navy-900">Create a schedule</h2>
          <p className="mt-1.5 text-sm leading-6 text-gray-500">This schedule will use the export filters shown above.</p>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-gray-600">Schedule name</span>
              <input required minLength="2" value={schedule.name} onChange={event => setSchedule(value => ({ ...value, name: event.target.value }))} className="input-field rounded-lg" placeholder="Example: Weekly complaint summary" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-gray-600">Report</span>
              <select value={schedule.report_type} onChange={event => setSchedule(value => ({ ...value, report_type: event.target.value }))} className="input-field rounded-lg">
                <option value="complaint_summary">Complaint Summary</option>
                <option value="complaint_export">Complaint Export</option>
                <option value="customer_satisfaction">Customer Satisfaction</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-gray-600">Frequency</span>
              <select value={schedule.cadence} onChange={event => setSchedule(value => ({ ...value, cadence: event.target.value }))} className="input-field rounded-lg">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <button disabled={busy} className="btn-primary w-full rounded-lg">{busy ? 'Saving…' : 'Save schedule'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
