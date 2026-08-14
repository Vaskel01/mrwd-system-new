import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import { ErrorBanner, PageLoader, Spinner } from '../../components/ui/Feedback'
import { isPasswordValid } from '../../lib/passwordPolicy'
import { PasswordStrengthMeter } from '../../lib/passwordPolicy.jsx'

export default function ProfilePage() {
  const currentUser = useAuthStore(s => s.user)
  const updateStoredUser = useAuthStore(s => s.updateStoredUser)
  const changeAccountPassword = useAuthStore(s => s.changePassword)
  const [profile, setProfile] = useState(null)
  const [fullName, setFullName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [serviceAddress, setServiceAddress] = useState('')
  const [barangay, setBarangay] = useState('')
  const [availability, setAvailability] = useState('available')
  const [note, setNote] = useState('')
  const [until, setUntil] = useState('')
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [smsNotifications, setSmsNotifications] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const effectiveRole = profile?.role || currentUser?.role

  const applyProfile = useCallback(user => {
    setProfile(user)
    setFullName(user.full_name || '')
    setAccountNumber(user.account_number || '')
    setPhone(user.phone || '')
    setServiceAddress(user.service_address || '')
    setBarangay(user.barangay || '')
    setAvailability(user.availability_status || 'available')
    setNote(user.availability_note || '')
    setUntil(user.availability_until ? new Date(user.availability_until).toISOString().slice(0, 16) : '')
    setEmailNotifications(user.email_notifications_enabled !== false)
    setSmsNotifications(user.sms_notifications_enabled === true)
  }, [])

  useEffect(() => {
    apiFetch('/users/me').then(({ user }) => {
      applyProfile(user)
    }).catch(err => setError(err.message)).finally(() => setLoading(false))
  }, [applyProfile])

  const save = async event => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('')
    try {
      const profileResult = await apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify({
        full_name: fullName,
        account_number: effectiveRole === 'customer' ? accountNumber : undefined,
        phone: effectiveRole === 'customer' ? phone : undefined,
        service_address: effectiveRole === 'customer' ? serviceAddress : undefined,
        barangay: effectiveRole === 'customer' ? barangay : undefined,
        availability_status: effectiveRole === 'maintenance_personnel' ? availability : undefined,
        availability_note: effectiveRole === 'maintenance_personnel' ? note : undefined,
        availability_until: effectiveRole === 'maintenance_personnel' && until ? new Date(until).toISOString() : null,
      }) })
      const preferencesResult = await apiFetch('/users/me/notification-preferences', { method: 'PATCH', body: JSON.stringify({
        email_enabled: emailNotifications,
        sms_enabled: smsNotifications,
      }) })
      const user = { ...profileResult.user, ...preferencesResult.user }
      applyProfile(user)
      updateStoredUser({ ...currentUser, ...user })
      setMessage(user.account_validation_status === 'mismatch'
        ? 'Profile saved, but the account number still needs review.'
        : 'Profile and notification preferences saved.')
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  const changePassword = async event => {
    event.preventDefault()
    setPasswordError('')
    setPasswordMessage('')
    if (!currentPassword) return setPasswordError('Enter your current password.')
    if (!isPasswordValid(newPassword)) return setPasswordError('Use at least 8 characters with at least one letter and one number.')
    if (newPassword !== confirmPassword) return setPasswordError('New passwords do not match.')

    setChangingPassword(true)
    try {
      const result = await changeAccountPassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordMessage(result.message || 'Password changed successfully.')
    } catch (err) {
      setPasswordError(err.message)
    } finally {
      setChangingPassword(false)
    }
  }

  if (loading) return <PageLoader label="Loading your profile..." />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl px-6 py-6"><p className="text-gold-400 text-[11px] font-bold uppercase tracking-widest">Account Center</p><h1 className="font-display font-black text-white text-2xl sm:text-3xl mt-1">My Profile</h1><p className="text-navy-300 text-sm mt-1">Keep your account and contact information up to date.</p></div>
      {error && <ErrorBanner message={error} />}
      {message && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">{message}</div>}
      <form onSubmit={save} className="card rounded-xl p-5 sm:p-6 space-y-5 max-w-2xl">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Full Name</label><input name="profilepage-full-name-1" aria-label="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} className="input-field rounded-lg" required minLength={2} /></div>
          <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Email</label><input name="profilepage-email-2" aria-label="Email" value={profile?.email || ''} className="input-field rounded-lg bg-gray-50" disabled /></div>
          <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Role</label><input name="profilepage-role-3" aria-label="Role" value={profile?.role === 'maintenance_personnel' ? 'Maintenance Personnel' : profile?.role === 'admin' ? 'Administrator' : 'Customer'} className="input-field rounded-lg bg-gray-50" disabled /></div>
          <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Member Since</label><input aria-label="Member Since" value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not available'} className="input-field rounded-lg bg-gray-50" disabled /></div>
        </div>
        {effectiveRole === 'customer' && <div className="border-t border-gray-100 pt-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display font-bold text-navy-900">Customer Information</h2><p className="text-xs text-gray-400 mt-1">Used to identify your service account and reported location.</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${profile?.account_validation_status === 'verified' ? 'bg-green-50 text-green-700' : profile?.account_validation_status === 'mismatch' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>Account {String(profile?.account_validation_status || 'unverified').replace('_', ' ')}</span></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Account Number</label><input aria-label="Account Number" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="input-field rounded-lg" placeholder="MRWD account number" /></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Phone Number</label><input aria-label="Phone Number" type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="input-field rounded-lg" placeholder="09XX XXX XXXX" /></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Barangay</label><input aria-label="Barangay" value={barangay} onChange={e => setBarangay(e.target.value)} className="input-field rounded-lg" placeholder="Barangay" /></div>
            <div className="sm:col-span-2"><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Service Address</label><textarea aria-label="Service Address" rows={3} value={serviceAddress} onChange={e => setServiceAddress(e.target.value)} className="input-field rounded-lg resize-none" placeholder="House number, street, subdivision, barangay, city" /></div>
          </div>
        </div>}
        {effectiveRole === 'maintenance_personnel' && <div className="border-t border-gray-100 pt-5 space-y-4">
          <div><h2 className="font-display font-bold text-navy-900">Work Availability</h2><p className="text-xs text-gray-400 mt-1">Admins see this before assigning tasks.</p></div>
          <div className="grid sm:grid-cols-2 gap-4"><div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Status</label><select name="profilepage-availability-4" aria-label="Availability" value={availability} onChange={e => setAvailability(e.target.value)} className="input-field rounded-lg"><option value="available">Available</option><option value="busy">Busy</option><option value="on_leave">On Leave</option><option value="off_duty">Off Duty</option></select></div><div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Until (optional)</label><input name="profilepage-until-5" aria-label="Until" type="datetime-local" value={until} onChange={e => setUntil(e.target.value)} className="input-field rounded-lg" /></div></div>
          <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Availability Note</label><textarea name="profilepage-example-field-inspection-until-3-pm-6" aria-label="Example: Field inspection until 3 PM" rows={3} value={note} onChange={e => setNote(e.target.value)} className="input-field rounded-lg resize-none" placeholder="Example: Field inspection until 3 PM" /></div>
        </div>}
        <div className="border-t border-gray-100 pt-5 space-y-4">
          <div><h2 className="font-display font-bold text-navy-900">Notification Channels</h2><p className="mt-1 text-xs text-gray-400">In-app notifications remain available. External messages are queued once MRWD connects an approved provider.</p></div>
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 p-3"><input type="checkbox" checked={emailNotifications} onChange={event => setEmailNotifications(event.target.checked)} className="h-4 w-4 accent-navy-800" /><span><strong className="block text-sm text-navy-900">Email notifications</strong><span className="text-xs text-gray-500">Use the email address on this account.</span></span></label>
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 p-3"><input type="checkbox" checked={smsNotifications} onChange={event => setSmsNotifications(event.target.checked)} className="h-4 w-4 accent-navy-800" /><span><strong className="block text-sm text-navy-900">SMS notifications</strong><span className="text-xs text-gray-500">Requires a saved phone number and an MRWD-approved SMS provider.</span></span></label>
        </div>
        <div className="flex justify-end"><button disabled={saving} className="btn-primary rounded-lg disabled:opacity-50">{saving ? <><Spinner className="w-4 h-4 border-2 border-white" /> Saving…</> : 'Save Profile'}</button></div>
      </form>

      <form onSubmit={changePassword} className="card rounded-xl p-5 sm:p-6 space-y-4 max-w-2xl">
        <div>
          <h2 className="font-display font-bold text-navy-900">Password & Security</h2>
          <p className="text-xs text-gray-500 mt-1">Change your password without leaving your account.</p>
        </div>
        {passwordError && <ErrorBanner message={passwordError} />}
        {passwordMessage && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">{passwordMessage}</div>}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Current Password</label>
            <input aria-label="Current Password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="input-field rounded-lg" required />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">New Password</label>
            <input aria-label="New Password" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} className="input-field rounded-lg" required />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Confirm New Password</label>
            <input aria-label="Confirm New Password" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="input-field rounded-lg" required />
          </div>
        </div>
        <PasswordStrengthMeter password={newPassword} />
        <div className="flex justify-end">
          <button disabled={changingPassword} className="btn-secondary rounded-lg disabled:opacity-50">
            {changingPassword ? <><Spinner className="w-4 h-4 border-2 border-navy-700" /> Updating…</> : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  )
}
