import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { addDaysYmd, manilaDateYmd, manilaMonthRange } from '../../lib/date'
import { useComplaintStore } from '../../store/complaintStore'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'

function titleCase(value) {
  return String(value || 'Unknown').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function escapeCsv(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function thisMonthRange() {
  return manilaMonthRange()
}


function BarList({ data, total }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1])
  return <div className="space-y-3">{entries.length === 0 ? <p className="text-sm text-gray-500">No data yet.</p> : entries.map(([label, count]) => <div key={label}><div className="flex justify-between text-xs mb-1"><span className="font-bold text-gray-700">{titleCase(label)}</span><span className="text-gray-500">{count}</span></div><div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-brand-500 rounded-full" style={{ width: `${total ? Math.max(3, count / total * 100) : 0}%` }} /></div></div>)}</div>
}

export default function CommercialReportsPage() {
  const complaints = useComplaintStore(s => s.complaints)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [initialRange] = useState(() => thisMonthRange())
  const [fromDate, setFromDate] = useState(initialRange.from)
  const [toDate, setToDate] = useState(initialRange.to)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate })
      const [result] = await Promise.all([apiFetch(`/reports/summary?${params}`), fetchComplaints()])
      setData(result)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }
  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ from: fromDate, to: toDate })
    Promise.all([apiFetch(`/reports/summary?${params}`), fetchComplaints()])
      .then(([result]) => {
        if (active) setData(result)
      })
      .catch(err => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [fetchComplaints, fromDate, toDate])

  const scopedComplaints = useMemo(() => complaints.filter(item => {
    const filed = new Date(item.created_at)
    const from = new Date(`${fromDate}T00:00:00`)
    const to = new Date(`${toDate}T23:59:59.999`)
    return filed >= from && filed <= to
  }), [complaints, fromDate, toDate])

  const csvRows = useMemo(() => scopedComplaints.map(item => [
    item.reference_number, item.complaint_type, item.customer_name, item.status, item.priority,
    item.assigned_name || '', item.address, item.created_at, item.completed_at || '', item.description,
  ]), [scopedComplaints])

  const exportCsv = () => {
    const headers = ['Complaint Reference', 'Complaint Type', 'Customer', 'Status', 'Priority', 'Maintenance Personnel', 'Address', 'Submitted', 'Resolved', 'Description']
    const content = [headers, ...csvRows].map(row => row.map(escapeCsv).join(',')).join('\n')
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = `mrwd-complaints-${fromDate}-to-${toDate}.csv`; link.click(); URL.revokeObjectURL(url)
  }

  const selectPreset = preset => {
    const today = manilaDateYmd()
    if (preset === 'month') {
      const range = thisMonthRange()
      setFromDate(range.from)
      setToDate(range.to)
      return
    }
    if (preset === '30days') {
      setFromDate(addDaysYmd(today, -29))
      setToDate(today)
      return
    }
    if (preset === 'quarter') {
      const [year, month] = today.split('-').map(Number)
      const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1
      setFromDate(`${year}-${String(quarterStartMonth).padStart(2, '0')}-01`)
      setToDate(today)
    }
  }

  if (loading && !data) return <PageLoader label="Preparing reports…" />
  const summary = data?.summary || {}

  return (
    <div className="space-y-5 report-print-area">
      <div className="page-band wave-header rounded-2xl px-5 sm:px-6 py-6 no-print">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-widest">Commercial Services Department</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl mt-1">Complaint reports</h1>
            <p className="text-navy-300 text-sm mt-1">Review complaint volume, outcomes, resolution activity, and customer feedback.</p>
          </div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
            <button onClick={exportCsv} className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-white text-navy-800 text-xs font-black">Export CSV</button>
            <button onClick={() => window.print()} className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-white/40 text-white text-xs font-black">Print or save as PDF</button>
          </div>
        </div>
      </div>
      <div className="hidden print:block"><h1 className="font-display font-black text-2xl">Metro Roxas Water District Complaint Report</h1><p className="text-sm text-gray-500">Generated {new Date().toLocaleString('en-PH')}</p></div>
      {error && <ErrorBanner message={error} onRetry={load} />}
      <div className="card rounded-xl p-4 no-print">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 flex-1">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1.5">From</label>
              <input type="date" value={fromDate} max={toDate} onChange={event => setFromDate(event.target.value)} className="input-field rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1.5">To</label>
              <input type="date" value={toDate} min={fromDate} onChange={event => setToDate(event.target.value)} className="input-field rounded-lg" />
            </div>
          </div>
          <div className="grid w-full grid-cols-1 min-[420px]:grid-cols-3 gap-2 lg:w-auto">
            <button type="button" onClick={() => selectPreset('month')} className="btn-secondary min-w-0 rounded-lg px-2 text-xs">This month</button>
            <button type="button" onClick={() => selectPreset('30days')} className="btn-secondary min-w-0 rounded-lg px-2 text-xs">Last 30 days</button>
            <button type="button" onClick={() => selectPreset('quarter')} className="btn-secondary min-w-0 rounded-lg px-2 text-xs">This quarter</button>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">All charts and exports below use the selected submission-date range.</p>
      </div>
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Total Complaints', summary.total ?? 0, 'text-navy-900'], ['Active Complaints', summary.active ?? 0, 'text-brand-700'], ['Resolved', summary.resolved ?? summary.completed ?? 0, 'text-green-700'], ['Average Rating', summary.average_rating ? `${summary.average_rating}/5` : '—', 'text-amber-600']].map(([label, value, color]) => <div key={label} className="card rounded-xl p-4"><p className={`font-display font-black text-3xl ${color}`}>{value}</p><p className="text-xs font-bold text-gray-500 mt-1">{label}</p></div>)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-4">Complaints by status</h2><BarList data={data?.by_status} total={summary.total} /></div>
        <div className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-4">Complaints by type</h2><BarList data={data?.by_category} total={summary.total} /></div>
        <div className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-4">Complaints by priority</h2><BarList data={data?.by_priority} total={summary.total} /></div>
      </div>
      <div className="card rounded-xl p-4 sm:p-5">
        <div className="mb-4"><h2 className="font-display font-bold text-navy-900">Monthly activity</h2><p className="mt-1 text-xs text-gray-500">Compare complaints submitted with complaints verified as resolved by ECMD.</p></div>
        <div className="min-w-0 overflow-hidden rounded-lg border border-gray-100">
          <table className="w-full table-fixed text-left text-sm">
            <thead><tr className="border-b-2 border-gray-200 bg-gray-50"><th className="px-3 py-3 text-[11px] font-black uppercase text-gray-500">Month</th><th className="px-3 py-3 text-[11px] font-black uppercase text-gray-500">Submitted</th><th className="px-3 py-3 text-[11px] font-black uppercase text-gray-500">Resolved</th><th className="px-3 py-3 text-[11px] font-black uppercase text-gray-500">Change in open complaints</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{data?.monthly_summary?.length ? data.monthly_summary.map(item => <tr key={item.month}><td className="px-3 py-3 break-words font-bold text-navy-900">{new Date(`${item.month}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</td><td className="px-3 py-3">{item.filed}</td><td className="px-3 py-3 text-green-700">{item.completed}</td><td className="px-3 py-3">{item.filed - item.completed}</td></tr>) : <tr><td colSpan="4" className="p-6 text-center text-gray-500">No complaint activity in this period.</td></tr>}</tbody>
          </table>
        </div>
      </div>
      <div className="card rounded-xl p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div><h2 className="font-display font-bold text-navy-900">Resolution and feedback summary</h2><p className="text-xs text-gray-500 mt-1">Calculated from resolved complaints and submitted customer feedback.</p></div>
          <div className="text-sm text-gray-600 break-words"><b>{summary.feedback_count ?? 0}</b> feedback responses · <b>{summary.average_rating ?? '—'}</b> average rating</div>
        </div>

        <p className="text-sm text-gray-600">Maintenance workload and availability are shown in ECMD Field Operations.</p>
      </div>
    </div>
  )
}
