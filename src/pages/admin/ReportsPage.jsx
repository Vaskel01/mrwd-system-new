import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { useComplaintStore } from '../../store/complaintStore'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'

function titleCase(value) {
  return String(value || 'Unknown').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function escapeCsv(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function BarList({ data, total }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1])
  return <div className="space-y-3">{entries.length === 0 ? <p className="text-sm text-gray-400">No data yet.</p> : entries.map(([label, count]) => <div key={label}><div className="flex justify-between text-xs mb-1"><span className="font-bold text-gray-700">{titleCase(label)}</span><span className="text-gray-400">{count}</span></div><div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-brand-500 rounded-full" style={{ width: `${total ? Math.max(3, count / total * 100) : 0}%` }} /></div></div>)}</div>
}

export default function ReportsPage() {
  const complaints = useComplaintStore(s => s.complaints)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [result] = await Promise.all([apiFetch('/reports/summary'), fetchComplaints()])
      setData(result)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const csvRows = useMemo(() => complaints.map(item => [
    item.id, item.complaint_type, item.customer_name, item.status, item.priority,
    item.assigned_name || '', item.address, item.created_at, item.completed_at || '', item.description,
  ]), [complaints])

  const exportCsv = () => {
    const headers = ['Reference ID', 'Category', 'Customer', 'Status', 'Priority', 'Technician', 'Address', 'Filed', 'Completed', 'Description']
    const content = [headers, ...csvRows].map(row => row.map(escapeCsv).join(',')).join('\n')
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = `mrwd-complaints-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url)
  }

  if (loading && !data) return <PageLoader label="Preparing reports..." />
  const summary = data?.summary || {}

  return (
    <div className="space-y-5 report-print-area">
      <div className="page-band wave-header rounded-2xl px-5 sm:px-6 py-6 no-print">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-widest">Admin · Analytics</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl mt-1">Reports & Exports</h1>
            <p className="text-navy-300 text-sm mt-1">Complaint volume, resolution performance, workload, and satisfaction.</p>
          </div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
            <button onClick={exportCsv} className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-white text-navy-800 text-xs font-black">Export CSV</button>
            <button onClick={() => window.print()} className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-white/40 text-white text-xs font-black">Print / Save PDF</button>
          </div>
        </div>
      </div>
      <div className="hidden print:block"><h1 className="font-display font-black text-2xl">Metro Roxas Water District Complaint Report</h1><p className="text-sm text-gray-500">Generated {new Date().toLocaleString('en-PH')}</p></div>
      {error && <ErrorBanner message={error} onRetry={load} />}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Total Complaints', summary.total ?? 0, 'text-navy-900'], ['Active Cases', summary.active ?? 0, 'text-brand-700'], ['Completed', summary.completed ?? 0, 'text-green-700'], ['Average Rating', summary.average_rating ? `${summary.average_rating}/5` : '—', 'text-amber-600']].map(([label, value, color]) => <div key={label} className="card rounded-xl p-4"><p className={`font-display font-black text-3xl ${color}`}>{value}</p><p className="text-xs font-bold text-gray-500 mt-1">{label}</p></div>)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-4">By Status</h2><BarList data={data?.by_status} total={summary.total} /></div>
        <div className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-4">By Category</h2><BarList data={data?.by_category} total={summary.total} /></div>
        <div className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-4">By Priority</h2><BarList data={data?.by_priority} total={summary.total} /></div>
      </div>
      <div className="card rounded-xl p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div><h2 className="font-display font-bold text-navy-900">Operational Measures</h2><p className="text-xs text-gray-400 mt-1">Calculated from completed complaints and customer feedback.</p></div>
          <div className="text-sm text-gray-600 break-words"><b>{summary.average_resolution_hours ?? '—'}</b> average resolution hours · <b>{summary.feedback_count ?? 0}</b> feedback responses</div>
        </div>

        <div className="hidden lg:block overflow-hidden rounded-lg border border-gray-100 p-2">
          <table className="w-full table-fixed text-sm">
            <thead><tr className="bg-gray-50 border-b-2 border-gray-200 text-left">{['Technician', 'Availability', 'Active', 'Completed', 'Total', 'Completion Rate'].map(item => <th key={item} className="px-3 py-3 text-xs font-black text-gray-400 uppercase">{item}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">{(data?.technician_workload || []).map(person => <tr key={person.id}><td className="px-3 py-3 font-bold text-gray-900 truncate">{person.name}{!person.is_active && <span className="ml-2 text-[10px] text-red-600">INACTIVE</span>}</td><td className="px-3 py-3 capitalize text-gray-600 truncate">{titleCase(person.availability_status)}</td><td className="px-3 py-3">{person.active}</td><td className="px-3 py-3">{person.completed}</td><td className="px-3 py-3">{person.total}</td><td className="px-3 py-3 pr-5 font-bold text-navy-800">{person.completion_rate}%</td></tr>)}</tbody>
          </table>
        </div>

        <div className="lg:hidden space-y-3">
          {(data?.technician_workload || []).length === 0 ? <p className="text-sm text-gray-400">No technician workload data yet.</p> : (data?.technician_workload || []).map(person => (
            <div key={person.id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">{person.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{titleCase(person.availability_status)}{!person.is_active ? ' · Inactive' : ''}</p>
                </div>
                <span className="text-lg font-black text-navy-800">{person.completion_rate}%</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="rounded-lg bg-gray-50 p-2 text-center"><p className="font-black text-navy-800">{person.active}</p><p className="text-[10px] uppercase text-gray-400">Active</p></div>
                <div className="rounded-lg bg-gray-50 p-2 text-center"><p className="font-black text-green-700">{person.completed}</p><p className="text-[10px] uppercase text-gray-400">Completed</p></div>
                <div className="rounded-lg bg-gray-50 p-2 text-center"><p className="font-black text-gray-700">{person.total}</p><p className="text-[10px] uppercase text-gray-400">Total</p></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
