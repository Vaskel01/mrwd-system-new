import { useState } from 'react'
import { useComplaintStore } from '../../store/complaintStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function AllComplaintsPage() {
  const complaints = useComplaintStore(s => s.complaints)
  const [filterStatus,   setFilterStatus]   = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = complaints
    .filter(c => filterStatus   === 'all' || c.status   === filterStatus)
    .filter(c => filterPriority === 'all' || c.priority === filterPriority)
    .filter(c =>
      search === '' ||
      c.complaint_type.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      c.customer_name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => b.priority_score - a.priority_score)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All Complaints</h1>
        <p className="text-gray-500 text-sm mt-0.5">Sorted by priority score (highest first)</p>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-5 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search complaints..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field max-w-xs"
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field w-auto">
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="input-field w-auto">
          <option value="all">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <span className="text-sm text-gray-400 ml-auto">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Complaint</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Priority</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">No complaints found.</td>
              </tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3.5">
                  <div className="font-medium text-gray-900">{c.complaint_type}</div>
                  <div className="text-xs text-gray-400 truncate max-w-xs">{c.description.slice(0, 60)}...</div>
                </td>
                <td className="px-4 py-3.5 text-gray-600">{c.customer_name}</td>
                <td className="px-4 py-3.5"><PriorityBadge priority={c.priority}/></td>
                <td className="px-4 py-3.5 font-semibold text-gray-700">{c.priority_score}</td>
                <td className="px-4 py-3.5"><StatusBadge status={c.status}/></td>
                <td className="px-4 py-3.5 text-gray-400 text-xs">{timeAgo(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
