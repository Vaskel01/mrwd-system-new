import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'

function StatusPill({ ok, children }) {
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${ok ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{children}</span>
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState(null)
  const [checks, setChecks] = useState([])
  const [archives, setArchives] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState(null)
  const [restoreReason, setRestoreReason] = useState('')
  const [form, setForm] = useState({ backup_type: 'supabase_managed', status: 'verified', notes: '' })

  const load = useCallback(async () => {
    setError('')
    try {
      const [healthResult, backupResult, archiveResult] = await Promise.all([
        apiFetch('/production/system-health'),
        apiFetch('/production/backup-checks'),
        apiFetch('/production/archives'),
      ])
      setHealth(healthResult)
      setChecks(backupResult.checks || [])
      setArchives(archiveResult.archives || [])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const record = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiFetch('/production/backup-checks', { method: 'POST', body: JSON.stringify(form) })
      setForm(value => ({ ...value, notes: '' }))
      await load()
    } catch (recordError) {
      setError(recordError.message)
    } finally {
      setBusy(false)
    }
  }

  const restoreArchive = async () => {
    if (!restoreTarget || restoreReason.trim().length < 3) return
    setBusy(true)
    setError('')
    try {
      await apiFetch(`/production/archive/${restoreTarget.id}/restore`, {
        method: 'POST',
        body: JSON.stringify({ reason: restoreReason.trim() }),
      })
      setRestoreTarget(null)
      setRestoreReason('')
      await load()
    } catch (restoreError) {
      setError(restoreError.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <PageLoader label="Checking system health..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-5 py-6 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gold-400">System Administration</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-black text-white sm:text-3xl">System Health & Recovery</h1>
            <p className="mt-1 text-sm text-navy-300">Operational checks, backup-verification records, archived complaint recovery, and production-readiness status.</p>
          </div>
          <button type="button" onClick={load} className="rounded-lg border border-white/30 px-4 py-2 text-xs font-black text-white hover:bg-white/10">Refresh</button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <div className="card rounded-xl p-4"><div className="flex justify-between gap-2"><p className="text-xs font-black uppercase text-gray-400">API</p><StatusPill ok={health?.api?.status === 'online'}>{health?.api?.status || 'Unknown'}</StatusPill></div><p className="mt-3 font-display text-2xl font-black text-navy-900">{Math.floor((health?.api?.uptime_seconds || 0) / 60)} min</p><p className="text-xs text-gray-500">Current process uptime</p></div>
        <div className="card rounded-xl p-4"><div className="flex justify-between gap-2"><p className="text-xs font-black uppercase text-gray-400">Database</p><StatusPill ok={health?.database?.status === 'online'}>{health?.database?.status || 'Unknown'}</StatusPill></div><p className="mt-3 font-display text-2xl font-black text-navy-900">{health?.database?.latency_ms ?? '—'} ms</p><p className="text-xs text-gray-500">Health-query response</p></div>
        <div className="card rounded-xl p-4"><div className="flex justify-between gap-2"><p className="text-xs font-black uppercase text-gray-400">Storage</p><StatusPill ok={health?.storage?.status === 'online'}>{health?.storage?.status === 'not_checked' ? 'Needs setup' : health?.storage?.status || 'Unknown'}</StatusPill></div><p className="mt-3 font-display text-2xl font-black text-navy-900">{health?.storage?.bucket_count ?? '—'}</p><p className="text-xs text-gray-500">Storage buckets visible to health check</p></div>
        <div className="card rounded-xl p-4"><div className="flex justify-between gap-2"><p className="text-xs font-black uppercase text-gray-400">Staff Auth Admin</p><StatusPill ok={health?.auth_admin?.configured}>{health?.auth_admin?.configured ? 'Ready' : 'Needs setup'}</StatusPill></div><p className="mt-3 font-display text-2xl font-black text-navy-900">{health?.counts?.staff ?? 0}</p><p className="text-xs text-gray-500">Staff accounts</p></div>
        <div className="card rounded-xl p-4"><div className="flex justify-between gap-2"><p className="text-xs font-black uppercase text-gray-400">Scheduled Reports</p><StatusPill ok={health?.scheduled_reports?.configured}>{health?.scheduled_reports?.configured ? 'Ready' : 'Needs setup'}</StatusPill></div><p className="mt-3 font-display text-2xl font-black text-navy-900">{health?.scheduled_reports?.configured ? 'On' : 'Off'}</p><p className="text-xs text-gray-500">Automatic report runner</p></div>
        <div className="card rounded-xl p-4"><div className="flex justify-between gap-2"><p className="text-xs font-black uppercase text-gray-400">Import Attention</p><StatusPill ok={!health?.counts?.import_attention}>{health?.counts?.import_attention ? 'Review' : 'Clear'}</StatusPill></div><p className="mt-3 font-display text-2xl font-black text-navy-900">{health?.counts?.import_attention ?? 0}</p><p className="text-xs text-gray-500">Imports needing review</p></div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.7fr)]">
        <div className="card rounded-xl p-5">
          <h2 className="font-display font-black text-navy-900">Backup Verification Log</h2>
          <p className="mt-1 text-xs text-gray-500">Records MRWD verification of managed backups, logical exports, and restore drills. This register records checks; it does not itself create a database backup.</p>
          <div className="mt-4 space-y-2">
            {checks.map(check => <div key={check.id} className="rounded-lg border border-gray-200 p-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-black text-navy-900">{String(check.backup_type).replaceAll('_', ' ')}</p><StatusPill ok={check.status === 'verified'}>{check.status}</StatusPill></div><p className="mt-1 text-xs text-gray-500">{formatDate(check.checked_at)} · {check.recorder?.full_name || 'System Supervisor'}</p>{check.notes && <p className="mt-2 break-words text-sm text-gray-700">{check.notes}</p>}</div>)}
            {!checks.length && <p className="py-8 text-center text-sm text-gray-400">No verification checks recorded yet.</p>}
          </div>
        </div>

        <form onSubmit={record} className="card h-fit rounded-xl p-5">
          <h2 className="font-display font-black text-navy-900">Record Verification</h2>
          <div className="mt-4 space-y-3">
            <select value={form.backup_type} onChange={event => setForm(value => ({ ...value, backup_type: event.target.value }))} className="input-field rounded-lg"><option value="supabase_managed">Supabase managed backup</option><option value="logical_export">Logical export</option><option value="restore_test">Restore test</option><option value="other">Other</option></select>
            <select value={form.status} onChange={event => setForm(value => ({ ...value, status: event.target.value }))} className="input-field rounded-lg"><option value="verified">Verified</option><option value="warning">Warning</option><option value="failed">Failed</option></select>
            <textarea rows={4} value={form.notes} onChange={event => setForm(value => ({ ...value, notes: event.target.value }))} className="input-field resize-none rounded-lg" placeholder="Verification notes, export location, restore-drill result…" />
            <button disabled={busy} className="btn-primary w-full rounded-lg">{busy ? 'Saving…' : 'Record Check'}</button>
          </div>
        </form>
      </section>

      <section className="card rounded-xl p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="font-display font-black text-navy-900">Archived Complaints</h2><p className="mt-1 text-xs text-gray-500">Archived records are retained and can be restored with an auditable reason.</p></div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-600">{archives.length} archived</span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {archives.map(item => <article key={item.id} className="min-w-0 rounded-xl border border-gray-200 p-4"><div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="break-all font-mono text-[10px] font-black text-gray-400">{item.reference_number}</p><p className="mt-1 line-clamp-2 text-sm font-black text-navy-900">{item.description || 'Archived complaint'}</p><p className="mt-2 text-xs text-gray-500">Archived {formatDate(item.archived_at)}</p>{item.archive_reason && <p className="mt-2 break-words text-xs text-gray-600"><b>Reason:</b> {item.archive_reason}</p>}</div><button type="button" onClick={() => { setRestoreTarget(item); setRestoreReason('') }} className="btn-secondary shrink-0 rounded-lg text-xs">Restore</button></div></article>)}
          {!archives.length && <p className="lg:col-span-2 py-8 text-center text-sm text-gray-400">No archived complaints are currently stored.</p>}
        </div>
      </section>

      <section className="card rounded-xl p-5">
        <h2 className="font-display font-black text-navy-900">Recent Security Signals</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {(health?.recent_security_events || []).map(event => <div key={event.id} className="rounded-lg border border-gray-200 p-3"><div className="flex justify-between gap-2"><p className="break-words text-xs font-black text-navy-900">{String(event.event_type).replaceAll('_', ' ')}</p><StatusPill ok={event.success}>{event.success ? 'Success' : 'Failed'}</StatusPill></div><p className="mt-1 break-all text-[11px] text-gray-500">{event.actor_email || 'Unknown account'} · {formatDate(event.created_at)}</p></div>)}
        </div>
      </section>

      {restoreTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"><h2 className="font-display text-lg font-black text-navy-900">Restore archived complaint?</h2><p className="mt-1 text-sm text-gray-500">{restoreTarget.reference_number} will return to normal complaint visibility. The restore action is logged.</p><label className="mt-4 block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-gray-500">Restore Reason *</span><textarea autoFocus rows={3} value={restoreReason} onChange={event => setRestoreReason(event.target.value)} className="input-field resize-none rounded-lg" placeholder="Why is this record being restored?" /></label><div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={() => { setRestoreTarget(null); setRestoreReason('') }} className="btn-secondary rounded-lg">Cancel</button><button type="button" disabled={busy || restoreReason.trim().length < 3} onClick={restoreArchive} className="btn-primary rounded-lg disabled:opacity-50">{busy ? 'Restoring…' : 'Restore Complaint'}</button></div></div></div>}
    </div>
  )
}
