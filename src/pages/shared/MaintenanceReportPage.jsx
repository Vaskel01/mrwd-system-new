import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'

function displayDate(value, includeTime = false) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleString('en-PH', includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' })
}

function titleCase(value) {
  return String(value || 'Not recorded').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

function Detail({ label, value }) {
  return <div><p className="text-[10px] font-black uppercase tracking-wider text-gray-500">{label}</p><p className="mt-1 text-sm font-semibold text-navy-950">{value || 'Not recorded'}</p></div>
}

export default function MaintenanceReportPage() {
  const { id } = useParams()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    setError('')
    apiFetch(`/operations/maintenance-report/${id}`)
      .then(setReport)
      .catch(loadError => setError(loadError.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let active = true
    apiFetch(`/operations/maintenance-report/${id}`)
      .then(result => { if (active) setReport(result) })
      .catch(loadError => { if (active) setError(loadError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id])

  const totals = useMemo(() => ({
    personnel: (report?.manpower || []).reduce((sum, item) => sum + Number(item.personnel_count || 0), 0),
    hours: (report?.manpower || []).reduce((sum, item) => sum + Number(item.hours_worked || 0), 0),
  }), [report])

  if (loading) return <PageLoader label="Preparing official maintenance report..." />
  if (error || !report) return <ErrorBanner message={error || 'Report data is unavailable.'} onRetry={load} />

  const complaint = report.complaint || {}
  const task = report.task || {}

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link to={`/complaints/${id}`} className="btn-secondary rounded-lg">Back to Complaint</Link>
        <button type="button" onClick={() => window.print()} className="btn-primary rounded-lg">Print Official Report</button>
      </div>

      <article className="bg-white p-5 text-navy-950 shadow-card print:shadow-none sm:p-8" aria-label="Official maintenance report">
        <header className="border-b-2 border-navy-900 pb-5 text-center">
          <p className="text-xs font-black uppercase tracking-[0.2em]">Metro Roxas Water District</p>
          <h1 className="mt-2 font-display text-2xl font-black">Official Maintenance Accomplishment Report</h1>
          <p className="mt-1 text-xs text-gray-500">Roxas City, Capiz</p>
        </header>

        <section className="mt-5 grid gap-4 border-b border-gray-200 pb-5 sm:grid-cols-3">
          <Detail label="Report Number" value={report.report_number} />
          <Detail label="Complaint Reference" value={complaint.reference_number} />
          <Detail label="Generated" value={displayDate(report.generated_at, true)} />
        </section>

        <section className="mt-5">
          <h2 className="font-display text-base font-black">Complaint and Assignment</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Customer" value={complaint.customer_name || complaint.resident_name} />
            <Detail label="Category" value={complaint.complaint_type} />
            <Detail label="Priority" value={titleCase(complaint.priority)} />
            <Detail label="Location" value={complaint.address} />
            <Detail label="Assigned Personnel" value={complaint.assigned_name || complaint.assigned_to_name || task.assigned_to_name} />
            <Detail label="Assigned Crew" value={report.crew?.name || 'No crew assigned'} />
            <Detail label="Assigned On" value={displayDate(complaint.assigned_at || task.assigned_at, true)} />
            <Detail label="Completed On" value={displayDate(complaint.completed_at || task.completed_at, true)} />
            <Detail label="Status" value={titleCase(complaint.status)} />
          </div>
          <div className="mt-4 rounded-lg border border-gray-200 p-4">
            <Detail label="Reported Concern" value={complaint.description} />
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-base font-black">Work Performed</h2>
          <div className="mt-3 rounded-lg border border-gray-200 p-4 text-sm leading-6">
            {task.completion_notes || complaint.completion_notes || task.work_notes || 'No completion narrative has been recorded.'}
          </div>
        </section>

        <section className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-display text-base font-black">Manpower Record</h2>
            <p className="text-xs text-gray-500">Recorded personnel: {totals.personnel} · Labor hours: {totals.hours}</p>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-left text-xs">
              <thead><tr className="bg-gray-50"><th className="border p-2">Date</th><th className="border p-2">Personnel</th><th className="border p-2">Hours</th><th className="border p-2">Notes</th></tr></thead>
              <tbody>{report.manpower?.length ? report.manpower.map(item => <tr key={item.id}><td className="border p-2">{displayDate(item.work_date)}</td><td className="border p-2">{item.personnel_count}</td><td className="border p-2">{item.hours_worked}</td><td className="border p-2">{item.notes || '—'}</td></tr>) : <tr><td className="border p-3 text-center text-gray-500" colSpan="4">No manpower entries recorded.</td></tr>}</tbody>
            </table>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-base font-black">Equipment and Materials Used</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-left text-xs">
              <thead><tr className="bg-gray-50"><th className="border p-2">SKU</th><th className="border p-2">Item</th><th className="border p-2">Quantity</th><th className="border p-2">Notes</th></tr></thead>
              <tbody>{report.inventory_usage?.length ? report.inventory_usage.map(item => <tr key={item.id}><td className="border p-2">{item.item?.sku || '—'}</td><td className="border p-2">{item.item?.name || 'Inventory item'}</td><td className="border p-2">{item.quantity} {item.item?.unit || ''}</td><td className="border p-2">{item.notes || '—'}</td></tr>) : <tr><td className="border p-3 text-center text-gray-500" colSpan="4">No inventory usage recorded.</td></tr>}</tbody>
            </table>
          </div>
        </section>

        <section className="mt-12 grid gap-10 text-center sm:grid-cols-3">
          <div><div className="border-b border-navy-900 pb-8" /><p className="mt-2 text-xs font-bold">Prepared by</p><p className="text-[10px] text-gray-500">{report.prepared_by?.name}</p></div>
          <div><div className="border-b border-navy-900 pb-8" /><p className="mt-2 text-xs font-bold">Team Leader / Supervisor</p></div>
          <div><div className="border-b border-navy-900 pb-8" /><p className="mt-2 text-xs font-bold">System Supervisor Approval</p></div>
        </section>
      </article>
    </div>
  )
}
