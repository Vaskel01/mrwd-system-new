import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

export default function ServiceAccountDirectory({ refreshVersion }) {
  const [query, setQuery] = useState('')
  const [accounts, setAccounts] = useState([])
  const [selected, setSelected] = useState(null)
  const [history, setHistory] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      setLoading(true)
      apiFetch(`/service-accounts/directory?q=${encodeURIComponent(query)}`).then(data => {
        if (active) { setAccounts(data.accounts); setError('') }
      }).catch(err => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [query, refreshVersion])
  useEffect(() => {
    if (!selected) return
    let active = true
    apiFetch(`/service-accounts/${selected.id}/history`).then(data => { if (active) setHistory(data) }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [selected])
  return <section className="card rounded-xl p-5 space-y-4">
    <h2 className="font-display font-bold text-navy-900">Service account directory</h2>
    <label className="block text-sm font-bold text-gray-700">Search MRWD account number<input className="input-field mt-1" value={query} onChange={event => setQuery(event.target.value)} placeholder="Keep leading zeros and dashes" /></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <p className="text-xs text-gray-500">{loading ? 'Searching…' : 'Showing up to 50 accounts. Search to narrow the list.'}</p>
    <div className="space-y-2">{accounts.map(account => <button type="button" key={account.id} onClick={() => { setSelected(account); setHistory(null); setError('') }} className="w-full rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50"><span className="block font-bold text-navy-900">{account.account_number} · {account.registered_name}</span><span className="text-sm text-gray-600">{account.service_address || 'Address not recorded'} · {account.linked_profile_id ? 'Customer linked' : 'No customer login linked'}</span></button>)}{!loading && !accounts.length && <p className="text-sm text-gray-500">No matching service accounts. Import the official account list to get started.</p>}</div>
    {selected && <div className="rounded-lg border border-gray-200 p-4 space-y-3"><h3 className="font-bold text-navy-900">{selected.account_number} · Meter {selected.meter_number || 'not recorded'}</h3>{!history ? <p className="text-sm text-gray-500">Loading history…</p> : <>
      <p className="text-sm font-bold text-gray-700">Recent bills</p>
      {history.bills.map(bill => <p key={bill.id} className="text-sm text-gray-600">{bill.billing_period} · ₱{Number(bill.amount_due).toFixed(2)} · {bill.status}</p>)}
      {!history.bills.length && <p className="text-sm text-gray-500">No imported bills for this account.</p>}
      <p className="text-sm font-bold text-gray-700">Recent account-linked complaints</p>
      {history.complaints.map(complaint => <Link key={complaint.id} className="block text-sm font-bold text-brand-700" to={`/complaints/${complaint.id}`}>{complaint.reference_number} →</Link>)}
      {!history.complaints.length && <p className="text-sm text-gray-500">No complaints linked to this account.</p>}
    </>}</div>}
  </section>
}
