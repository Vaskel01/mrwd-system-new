import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'

function RequestRow({ request, onReviewed }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const review = async approve => {
    setBusy(true); setError('')
    try {
      await apiFetch(`/service-accounts/requests/${request.id}/review`, { method: 'POST', body: JSON.stringify({ approve, note }) })
      onReviewed()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <div className="rounded-lg border border-gray-200 p-4 space-y-3">
    <p className="font-bold text-navy-900">{request.account_number} · {request.customer?.full_name || 'Customer'}</p>
    <p className="text-sm text-gray-600">{request.customer?.email} · {request.customer?.phone || 'No contact number recorded'}</p>
    <p className="text-sm text-gray-700 break-words">{request.ownership_note}</p>
    <label className="block text-sm font-bold text-gray-700">Verification method or rejection reason
      <textarea className="input-field mt-1" value={note} onChange={event => setNote(event.target.value)} maxLength={1000} placeholder="Record how you independently confirmed ownership or authorization using MRWD records." />
    </label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || note.trim().length < 5} onClick={() => review(true)} className="btn-primary">Approve verified owner</button><button type="button" disabled={busy || note.trim().length < 5} onClick={() => review(false)} className="btn-secondary">Reject request</button></div>
  </div>
}

export default function ServiceAccountReview({ onReviewed }) {
  const [requests, setRequests] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = useCallback(() => apiFetch('/service-accounts/review')
    .then(data => { setRequests(data.requests); setError('') })
    .catch(err => setError(err.message)).finally(() => setLoading(false)), [])
  useEffect(() => { load() }, [load])
  return <section className="card rounded-xl p-5 space-y-4">
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-display font-bold text-navy-900">Service account ownership requests</h2><p className="mt-1 text-sm text-gray-500">Import the official account list, then verify the requester using MRWD records before approving billing access.</p></div><button type="button" className="btn-secondary" disabled={loading} onClick={load}>Refresh requests</button></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loading ? <p className="text-sm text-gray-500">Loading requests…</p> : !requests.length && !error ? <p className="text-sm text-gray-500">No pending ownership requests.</p> : requests.map(request => <RequestRow key={request.id} request={request} onReviewed={() => { load(); onReviewed?.() }} />)}
  </section>
}
