import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'

const audienceLabel = value => ({
  commercial: 'Commercial Services',
  ecmd: 'ECMD',
  maintenance: 'Maintenance Personnel',
  all_staff: 'All staff',
  customer: 'Customers',
  all: 'Everyone',
}[value] || value)

const EMPTY_FORM = {
  title: '',
  content: '',
  category: 'general',
  audience: 'all_staff',
  is_important: false,
  active_until: '',
}

function Field({ label, children }) {
  return (
    <label className="block text-xs font-bold text-gray-600">
      {label}
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

export default function SystemAnnouncementsPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const load = useCallback(async () => {
    setError('')
    try {
      const result = await apiFetch('/announcements?include_expired=true')
      setItems(result.announcements || [])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const payload = {
        ...form,
        active_until: form.active_until ? new Date(form.active_until).toISOString() : null,
      }
      await apiFetch(editing ? `/announcements/${editing.id}` : '/announcements', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })
      setEditing(null)
      setForm(EMPTY_FORM)
      await load()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setBusy(false)
    }
  }

  const edit = announcement => {
    setEditing(announcement)
    setForm({
      title: announcement.title || '',
      content: announcement.content || '',
      category: announcement.category || 'general',
      audience: announcement.audience || 'all_staff',
      is_important: Boolean(announcement.is_important),
      active_until: announcement.active_until ? new Date(announcement.active_until).toISOString().slice(0, 16) : '',
    })
  }

  const remove = async announcement => {
    if (!window.confirm(`Delete “${announcement.title}”?`)) return
    await apiFetch(`/announcements/${announcement.id}`, { method: 'DELETE' })
    await load()
  }

  const cancelEdit = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  if (loading) return <PageLoader label="Loading staff announcements..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-5 py-6 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gold-400">System Administration</p>
        <h1 className="mt-1 font-display text-2xl font-black text-white sm:text-3xl">Staff announcements</h1>
        <p className="mt-1 text-sm text-navy-300">Publish notices for staff groups or customers. Customer service advisories are still managed by Commercial Services.</p>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <form onSubmit={save} className="card h-fit rounded-xl p-5 xl:sticky xl:top-5">
          <h2 className="font-display font-black text-navy-900">{editing ? 'Edit announcement' : 'Create announcement'}</h2>
          <p className="mt-1 text-xs text-gray-500">Choose who should see the notice and how long it should remain active.</p>
          <div className="mt-4 space-y-4">
            <Field label="Title">
              <input required minLength="5" value={form.title} onChange={event => setForm(value => ({ ...value, title: event.target.value }))} className="input-field rounded-lg" placeholder="Short, specific title" />
            </Field>
            <Field label="Audience">
              <select value={form.audience} onChange={event => setForm(value => ({ ...value, audience: event.target.value }))} className="input-field rounded-lg">
                <option value="commercial">Commercial Services</option>
                <option value="ecmd">ECMD</option>
                <option value="maintenance">Maintenance Personnel</option>
                <option value="all_staff">All staff</option>
                <option value="customer">Customers</option>
                <option value="all">Everyone</option>
              </select>
            </Field>
            <Field label="Category">
              <select value={form.category} onChange={event => setForm(value => ({ ...value, category: event.target.value }))} className="input-field rounded-lg">
                <option value="general">General</option>
                <option value="maintenance">Maintenance</option>
                <option value="advisory">Advisory</option>
                <option value="billing">Billing</option>
                <option value="interruption">Service interruption</option>
              </select>
            </Field>
            <Field label="Message">
              <textarea required minLength="20" rows="6" value={form.content} onChange={event => setForm(value => ({ ...value, content: event.target.value }))} className="input-field resize-none rounded-lg" placeholder="Write the information people need to know." />
            </Field>
            <Field label="Show until">
              <input type="datetime-local" value={form.active_until} onChange={event => setForm(value => ({ ...value, active_until: event.target.value }))} className="input-field rounded-lg" />
            </Field>
            <label className="flex items-center gap-2 text-xs font-bold text-gray-700">
              <input type="checkbox" checked={form.is_important} onChange={event => setForm(value => ({ ...value, is_important: event.target.checked }))} />
              Pin as important
            </label>
            <div className="flex gap-2">
              <button disabled={busy} className="btn-primary flex-1 rounded-lg">{busy ? 'Saving…' : editing ? 'Save changes' : 'Publish announcement'}</button>
              {editing && <button type="button" onClick={cancelEdit} className="btn-secondary rounded-lg">Cancel</button>}
            </div>
          </div>
        </form>

        <section className="space-y-3" aria-label="Published announcements">
          {items.map(announcement => (
            <article key={announcement.id} className="card rounded-xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-navy-50 px-2 py-1 text-xs font-black uppercase text-navy-700">{audienceLabel(announcement.audience || 'customer')}</span>
                    {announcement.is_important && <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-black uppercase text-amber-700">Important</span>}
                    {announcement.is_expired && <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-black uppercase text-gray-600">Expired</span>}
                  </div>
                  <h2 className="mt-2 font-display text-lg font-black text-navy-900">{announcement.title}</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-600">{announcement.content}</p>
                  <p className="mt-3 text-[11px] text-gray-500">Published by {announcement.created_by_name} · {new Date(announcement.created_at).toLocaleString('en-PH')}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => edit(announcement)} className="btn-secondary rounded-lg text-xs">Edit</button>
                  <button type="button" onClick={() => remove(announcement)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-700">Delete</button>
                </div>
              </div>
            </article>
          ))}
          {!items.length && <div className="card rounded-xl p-10 text-center"><h2 className="font-display font-bold text-navy-900">No announcements yet</h2><p className="mt-1 text-sm text-gray-500">Create a notice when staff or customers need an update.</p></div>}
        </section>
      </div>
    </div>
  )
}
