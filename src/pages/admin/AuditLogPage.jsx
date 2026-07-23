import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import Pagination from '../../components/ui/Pagination'

function formatDate(value) { return new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) }
function label(value) { return String(value || '').replaceAll('.', ' › ').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) }

export default function AuditLogPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 15
  const load = async () => { setLoading(true); setError(''); try { const { logs } = await apiFetch('/audit?limit=500'); setLogs(logs || []) } catch (err) { setError(err.message) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])
  const filtered = useMemo(() => { const q = search.trim().toLowerCase(); return logs.filter(item => !q || [item.actor_name, item.action, item.entity_type, item.entity_id, JSON.stringify(item.details)].some(value => String(value || '').toLowerCase().includes(q))) }, [logs, search])
  useEffect(() => setPage(1), [search])
  const shown = filtered.slice((page - 1) * pageSize, page * pageSize)

  if (loading && logs.length === 0) return <PageLoader label="Loading audit history..." />
  return <div className="space-y-5"><div className="page-band wave-header rounded-2xl px-6 py-6"><div className="flex items-end justify-between"><div><p className="text-gold-400 text-[11px] font-bold uppercase tracking-widest">Admin · Accountability</p><h1 className="font-display font-black text-white text-2xl sm:text-3xl mt-1">Audit Log</h1><p className="text-navy-300 text-sm mt-1">Who performed each important complaint, task, and staff action.</p></div><p className="font-display font-black text-5xl text-gold-400">{filtered.length}</p></div></div>{error && <ErrorBanner message={error} onRetry={load} />}<div className="card rounded-xl p-4"><input value={search} onChange={e => setSearch(e.target.value)} className="input-field rounded-lg" placeholder="Search actor, action, complaint ID, or details..." /></div><div className="card rounded-xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[880px] text-sm"><thead><tr className="bg-gray-50 border-b-2 border-gray-200 text-left">{['Date', 'Actor', 'Action', 'Record', 'Details'].map(h => <th key={h} className="px-4 py-3 text-xs font-black text-gray-400 uppercase">{h}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{shown.length === 0 ? <tr><td colSpan={5} className="p-12 text-center text-gray-400">No audit entries match.</td></tr> : shown.map(item => <tr key={item.id}><td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(item.created_at)}</td><td className="px-4 py-3 font-bold text-gray-900">{item.actor_name || 'System'}</td><td className="px-4 py-3"><span className="rounded-full bg-navy-50 text-navy-700 px-2.5 py-1 text-xs font-bold">{label(item.action)}</span></td><td className="px-4 py-3 text-xs"><p className="font-bold text-gray-700 capitalize">{item.entity_type}</p><p className="font-mono text-gray-400 mt-1">{item.entity_id || '—'}</p></td><td className="px-4 py-3 text-xs text-gray-500 max-w-sm break-words">{Object.keys(item.details || {}).length ? JSON.stringify(item.details) : '—'}</td></tr>)}</tbody></table></div></div><Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} label="audit entries" /></div>
}
