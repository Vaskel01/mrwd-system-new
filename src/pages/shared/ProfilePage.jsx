import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import { ErrorBanner, PageLoader, Spinner } from '../../components/ui/Feedback'

export default function ProfilePage() {
  const currentUser = useAuthStore(s => s.user)
  const updateStoredUser = useAuthStore(s => s.updateStoredUser)
  const [profile, setProfile] = useState(null)
  const [fullName, setFullName] = useState('')
  const [availability, setAvailability] = useState('available')
  const [note, setNote] = useState('')
  const [until, setUntil] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    apiFetch('/users/me').then(({ user }) => {
      setProfile(user); setFullName(user.full_name || '')
      setAvailability(user.availability_status || 'available')
      setNote(user.availability_note || '')
      setUntil(user.availability_until ? new Date(user.availability_until).toISOString().slice(0, 16) : '')
    }).catch(err => setError(err.message)).finally(() => setLoading(false))
  }, [])

  const save = async event => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('')
    try {
      const { user } = await apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify({
        full_name: fullName,
        availability_status: currentUser?.role === 'maintenance_personnel' ? availability : undefined,
        availability_note: currentUser?.role === 'maintenance_personnel' ? note : undefined,
        availability_until: currentUser?.role === 'maintenance_personnel' && until ? new Date(until).toISOString() : null,
      }) })
      setProfile(user); updateStoredUser({ ...currentUser, ...user }); setMessage('Profile updated.')
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  if (loading) return <PageLoader label="Loading your profile..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-6 py-6"><p className="text-gold-400 text-[11px] font-bold uppercase tracking-widest">Account Center</p><h1 className="font-display font-black text-white text-2xl sm:text-3xl mt-1">My Profile</h1><p className="text-navy-300 text-sm mt-1">Keep your name and work availability up to date.</p></div>
      {error && <ErrorBanner message={error} />}
      {message && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">{message}</div>}
      <form onSubmit={save} className="card rounded-xl p-5 sm:p-6 space-y-5 max-w-2xl">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Full Name</label><input value={fullName} onChange={e => setFullName(e.target.value)} className="input-field rounded-lg" required minLength={2} /></div>
          <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Email</label><input value={profile?.email || ''} className="input-field rounded-lg bg-gray-50" disabled /></div>
          <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Role</label><input value={(profile?.role || '').replace('_personnel', '').replace('_', ' ')} className="input-field rounded-lg bg-gray-50 capitalize" disabled /></div>
        </div>
        {currentUser?.role === 'maintenance_personnel' && <div className="border-t border-gray-100 pt-5 space-y-4">
          <div><h2 className="font-display font-bold text-navy-900">Work Availability</h2><p className="text-xs text-gray-400 mt-1">Admins see this before assigning tasks.</p></div>
          <div className="grid sm:grid-cols-2 gap-4"><div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Status</label><select value={availability} onChange={e => setAvailability(e.target.value)} className="input-field rounded-lg"><option value="available">Available</option><option value="busy">Busy</option><option value="on_leave">On Leave</option><option value="off_duty">Off Duty</option></select></div><div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Until (optional)</label><input type="datetime-local" value={until} onChange={e => setUntil(e.target.value)} className="input-field rounded-lg" /></div></div>
          <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Availability Note</label><textarea rows={3} value={note} onChange={e => setNote(e.target.value)} className="input-field rounded-lg resize-none" placeholder="Example: Field inspection until 3 PM" /></div>
        </div>}
        <div className="flex justify-end"><button disabled={saving} className="btn-primary rounded-lg disabled:opacity-50">{saving ? <><Spinner className="w-4 h-4 border-2 border-white" /> Saving…</> : 'Save Profile'}</button></div>
      </form>
    </div>
  )
}
