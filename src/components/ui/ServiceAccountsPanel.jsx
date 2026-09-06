import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

export default function ServiceAccountsPanel({ selected = '', onSelect }) {
  const [accounts, setAccounts] = useState([])
  const [requests, setRequests] = useState([])
  const [number, setNumber] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => apiFetch('/service-accounts').then(data => {
      setError('')
      setAccounts(data.accounts)
      setRequests(data.requests)
    }).catch(err => setError(err.message)).finally(() => setLoading(false)), [])
  useEffect(() => { load() }, [load])
  const account = accounts.find(item => item.id === selected)
  const submit = async event => {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      await apiFetch('/service-accounts/requests', { method: 'POST', body: JSON.stringify({ account_number: number, note }) })
      setNumber(''); setNote('')
      setMessage('Request sent to Commercial Services. Billing access becomes available after ownership is verified.')
      await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <section className="card rounded-xl p-5 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-display font-bold text-navy-900">My service accounts</h2><p className="mt-1 text-sm text-gray-500">Link each MRWD service connection once to see its bills and file complaints.</p></div>
      <button type="button" onClick={load} disabled={loading} className="btn-secondary">{loading ? 'Checking…' : 'Refresh accounts'}</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {accounts.length > 0 ? <>
      <label className="block text-sm font-bold text-gray-700">Service account
        <select className="input-field mt-2" value={selected} onChange={event => onSelect?.(event.target.value, accounts.find(item => item.id === event.target.value))}>
          <option value="">All linked accounts</option>
          {accounts.map(item => <option key={item.id} value={item.id}>{item.account_number} — {item.service_address || item.registered_name}</option>)}
        </select>
      </label>
      {account && <div className="rounded-lg border border-gray-200 p-4 space-y-2 text-sm">
        <p className="font-bold text-navy-900">{account.registered_name} · {account.account_number}</p>
        <p className="text-gray-600">{account.service_address || 'Service address not recorded'} · Meter: {account.meter_number || 'Not recorded'}</p>
        <Link className="inline-block font-bold text-brand-700" to={`/customer/my-complaints?account=${encodeURIComponent(account.id)}`}>View my complaints for this account →</Link>
      </div>}
    </> : !loading && <p className="text-sm text-gray-600">No verified service accounts yet. You can still submit a complaint while your link request is reviewed.</p>}
    <details className="rounded-lg border border-gray-200 p-4">
      <summary className="cursor-pointer text-sm font-bold text-navy-900">Link another service account</summary>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block text-sm font-bold text-gray-700">MRWD account number
          <input className="input-field mt-1" value={number} onChange={event => setNumber(event.target.value)} maxLength={80} required autoComplete="off" placeholder="Enter exactly as printed on your bill" />
        </label>
        <label className="block text-sm font-bold text-gray-700">Your relationship to this account
          <textarea className="input-field mt-1" value={note} onChange={event => setNote(event.target.value)} minLength={5} maxLength={1000} required placeholder="For example: registered account holder or authorized household member. Do not enter passwords or payment details." />
        </label>
        <p className="text-xs text-gray-500">Commercial Services will verify ownership against official records. Entering an account number alone does not grant access.</p>
        <button disabled={busy} className="btn-primary">{busy ? 'Sending…' : 'Request account link'}</button>
      </form>
    </details>
    {requests.length > 0 && <div className="space-y-2"><h3 className="text-sm font-bold text-gray-700">Link requests</h3>{requests.map(item => <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-700"><span className="font-mono">{item.account_number}</span><span>{item.status === 'pending' ? 'Pending ownership review' : item.status === 'approved' ? 'Approved' : 'Not approved — contact Commercial Services'}</span></div>)}</div>}
  </section>
}
