import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import { ErrorBanner, PageLoader, Spinner } from '../../components/ui/Feedback'
import { isPasswordValid } from '../../lib/passwordPolicy'
import { PasswordStrengthMeter } from '../../lib/passwordPolicy.jsx'
import { staffAccessLabel } from '../../config/terminology'


function authenticatorQrSource(value) {
  if (!value) return ''
  const qr = String(value).trim()
  if (qr.startsWith('data:image/')) return qr
  if (qr.startsWith('<svg')) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`
  return qr
}

export default function ProfilePage() {
  const currentUser = useAuthStore(s => s.user)
  const updateStoredUser = useAuthStore(s => s.updateStoredUser)
  const changeAccountPassword = useAuthStore(s => s.changePassword)
  const getMfaStatus = useAuthStore(s => s.getMfaStatus)
  const enrollMfa = useAuthStore(s => s.enrollMfa)
  const verifyMfa = useAuthStore(s => s.verifyMfa)
  const unenrollMfa = useAuthStore(s => s.unenrollMfa)
  const signOutOtherSessions = useAuthStore(s => s.signOutOtherSessions)
  const [searchParams] = useSearchParams()
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
  const [mfaStatus, setMfaStatus] = useState(null)
  const [mfaEnrollment, setMfaEnrollment] = useState(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaBusy, setMfaBusy] = useState(false)
  const [mfaQrFailed, setMfaQrFailed] = useState(false)
  const [mfaSecretCopied, setMfaSecretCopied] = useState(false)
  const [securityMessage, setSecurityMessage] = useState('')
  const [securityError, setSecurityError] = useState('')

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

  useEffect(() => {
    if (!currentUser || currentUser.role === 'customer') return
    getMfaStatus().then(setMfaStatus).catch(() => {})
  }, [currentUser, getMfaStatus])

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
      const refreshed = await apiFetch('/users/me')
      if (refreshed?.user) { applyProfile(refreshed.user); updateStoredUser(refreshed.user) }
      setPasswordMessage(result.message || 'Password changed successfully.')
    } catch (err) {
      setPasswordError(err.message)
    } finally {
      setChangingPassword(false)
    }
  }

  const beginMfaEnrollment = async () => {
    setSecurityError(''); setSecurityMessage(''); setMfaBusy(true)
    try {
      const enrollment = await enrollMfa('MRWD System Supervisor')
      setMfaEnrollment(enrollment)
      setMfaCode('')
      setMfaQrFailed(false)
      setMfaSecretCopied(false)
    }
    catch (err) { setSecurityError(err.message) } finally { setMfaBusy(false) }
  }

  const confirmMfaEnrollment = async () => {
    if (!mfaEnrollment?.id) return
    if (!/^\d{6}$/.test(mfaCode)) return setSecurityError('Enter the 6-digit authenticator code.')
    setMfaBusy(true); setSecurityError('')
    try {
      await verifyMfa(mfaEnrollment.id, mfaCode)
      setMfaEnrollment(null); setMfaCode(''); setMfaQrFailed(false); setMfaSecretCopied(false); setMfaStatus(await getMfaStatus())
      setSecurityMessage('Authenticator verification is now enabled for this account.')
    } catch (err) { setSecurityError(err.message) } finally { setMfaBusy(false) }
  }

  const removeMfa = async factorId => {
    if (!window.confirm('Remove this authenticator from your account?')) return
    setMfaBusy(true); setSecurityError('')
    try { await unenrollMfa(factorId); setMfaStatus(await getMfaStatus()); setSecurityMessage('Authenticator removed.') }
    catch (err) { setSecurityError(err.message) } finally { setMfaBusy(false) }
  }

  const logoutOtherSessions = async () => {
    setMfaBusy(true); setSecurityError('')
    try { await signOutOtherSessions(); setSecurityMessage('Other sessions have been logged out.') }
    catch (err) { setSecurityError(err.message) } finally { setMfaBusy(false) }
  }

  if (loading) return <PageLoader label="Loading your profile…" />

  return (
    <div className="space-y-5">
      <div className="page-band wave-header page-header"><p className="text-gold-400 text-xs font-bold uppercase tracking-widest">Account</p><h1 className="mt-1 text-white">My profile</h1><p>Update your personal details, availability, notifications, password, and account security.</p></div>
      {(profile?.must_change_password || searchParams.get('change-password') === '1') && <div className="max-w-2xl rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="font-black text-amber-900">Create a new password</p><p className="mt-1 text-sm text-amber-800">You signed in with a temporary password. Create a new password before using your staff workspace.</p></div>}
      {(profile?.mfa_required && searchParams.get('setup-mfa') === '1') && <div className="max-w-2xl rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="font-black text-blue-900">Set up two-step verification</p><p className="mt-1 text-sm text-blue-700">Set up an authenticator app before opening System Administration.</p></div>}
      {error && <ErrorBanner message={error} />}
      {message && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">{message}</div>}
      <form onSubmit={save} className="card rounded-xl p-5 sm:p-6 space-y-5 max-w-2xl">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Full name</label><input name="profilepage-full-name-1" aria-label="Full name" value={fullName} onChange={e => setFullName(e.target.value)} className="input-field rounded-lg" required minLength={2} /></div>
          <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Email</label><input name="profilepage-email-2" aria-label="Email" value={profile?.email || ''} className="input-field rounded-lg bg-gray-50" disabled /></div>
          <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Access</label><input name="profilepage-role-3" aria-label="Access" value={staffAccessLabel(profile)} className="input-field rounded-lg bg-gray-50" disabled /></div>
          <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Member since</label><input aria-label="Member since" value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not available'} className="input-field rounded-lg bg-gray-50" disabled /></div>
        </div>
        {effectiveRole === 'customer' && <div className="border-t border-gray-100 pt-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display font-bold text-navy-900">Customer information</h2><p className="text-xs text-gray-500 mt-1">These details help MRWD match your account and service location.</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${profile?.account_validation_status === 'verified' ? 'bg-green-50 text-green-700' : profile?.account_validation_status === 'mismatch' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>Account {String(profile?.account_validation_status || 'unverified').replace('_', ' ')}</span></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Account number</label><input aria-label="Account number" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="input-field rounded-lg" placeholder="MRWD account number" /></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Phone number</label><input aria-label="Phone number" type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="input-field rounded-lg" placeholder="09XX XXX XXXX" /></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Barangay</label><input aria-label="Barangay" value={barangay} onChange={e => setBarangay(e.target.value)} className="input-field rounded-lg" placeholder="Barangay" /></div>
            <div className="sm:col-span-2"><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Service address</label><textarea aria-label="Service address" rows={3} value={serviceAddress} onChange={e => setServiceAddress(e.target.value)} className="input-field rounded-lg resize-none" placeholder="House number, street, subdivision, barangay, city" /></div>
          </div>
        </div>}
        {effectiveRole === 'maintenance_personnel' && <div className="border-t border-gray-100 pt-5 space-y-4">
          <div><h2 className="font-display font-bold text-navy-900">Work availability</h2><p className="text-xs text-gray-500 mt-1">ECMD staff can see your availability before assigning field work.</p></div>
          <div className="grid sm:grid-cols-2 gap-4"><div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Status</label><select name="profilepage-availability-4" aria-label="Availability" value={availability} onChange={e => setAvailability(e.target.value)} className="input-field rounded-lg"><option value="available">Available</option><option value="busy">Busy</option><option value="on_leave">On Leave</option><option value="off_duty">Off Duty</option></select></div><div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Until (optional)</label><input name="profilepage-until-5" aria-label="Until" type="datetime-local" value={until} onChange={e => setUntil(e.target.value)} className="input-field rounded-lg" /></div></div>
          <div><label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Availability note</label><textarea name="profilepage-example-field-inspection-until-3-pm-6" aria-label="Example: Field inspection until 3 PM" rows={3} value={note} onChange={e => setNote(e.target.value)} className="input-field rounded-lg resize-none" placeholder="Example: Field inspection until 3 PM" /></div>
        </div>}
        <div className="border-t border-gray-100 pt-5 space-y-4">
          <div><h2 className="font-display font-bold text-navy-900">Notification settings</h2><p className="mt-1 text-xs text-gray-500">In-app notifications are always available. Email or SMS requires an approved MRWD messaging provider.</p></div>
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 p-3"><input type="checkbox" checked={emailNotifications} onChange={event => setEmailNotifications(event.target.checked)} className="h-4 w-4 accent-navy-800" /><span><strong className="block text-sm text-navy-900">Email</strong><span className="text-xs text-gray-500">Send notifications to the email address on this account.</span></span></label>
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 p-3"><input type="checkbox" checked={smsNotifications} onChange={event => setSmsNotifications(event.target.checked)} className="h-4 w-4 accent-navy-800" /><span><strong className="block text-sm text-navy-900">SMS</strong><span className="text-xs text-gray-500">Requires a saved phone number and an approved MRWD SMS provider.</span></span></label>
        </div>
        <div className="flex justify-end"><button disabled={saving} className="btn-primary rounded-lg disabled:opacity-50">{saving ? <><Spinner className="w-4 h-4 border-2 border-white" /> Saving…</> : 'Save Profile'}</button></div>
      </form>

      <form onSubmit={changePassword} className="card rounded-xl p-5 sm:p-6 space-y-4 max-w-2xl">
        <div>
          <h2 className="font-display font-bold text-navy-900">Password</h2>
          <p className="text-xs text-gray-500 mt-1">Change the password you use to sign in.</p>
        </div>
        {passwordError && <ErrorBanner message={passwordError} />}
        {passwordMessage && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">{passwordMessage}</div>}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Current password</label>
            <input aria-label="Current password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="input-field rounded-lg" required />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">New password</label>
            <input aria-label="New password" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} className="input-field rounded-lg" required />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Confirm new password</label>
            <input aria-label="Confirm new password" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="input-field rounded-lg" required />
          </div>
        </div>
        <PasswordStrengthMeter password={newPassword} />
        <div className="flex justify-end">
          <button disabled={changingPassword} className="btn-secondary rounded-lg disabled:opacity-50">
            {changingPassword ? <><Spinner className="w-4 h-4 border-2 border-navy-700" /> Updating…</> : 'Change Password'}
          </button>
        </div>
      </form>

      {effectiveRole !== 'customer' && <section className="card max-w-2xl rounded-xl p-5 sm:p-6 space-y-4">
        <div><h2 className="font-display font-bold text-navy-900">Sessions & two-step verification</h2><p className="mt-1 text-xs text-gray-500">Manage authenticator verification and sign out sessions on other browsers or devices.</p></div>
        {securityError && <ErrorBanner message={securityError}/>} 
        {securityMessage && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">{securityMessage}</div>}
        <div className="rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-black text-navy-900">Authenticator app</p><p className="mt-1 text-xs text-gray-500">{profile?.mfa_required ? 'Required for System Supervisor access.' : 'Optional additional protection for this staff account.'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${(mfaStatus?.factors?.totp || []).some(item => item.status === 'verified') ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{(mfaStatus?.factors?.totp || []).some(item => item.status === 'verified') ? 'Enabled' : 'Not enabled'}</span></div>
          {(mfaStatus?.factors?.totp || []).filter(item => item.status === 'verified').map(item => <div key={item.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 p-3"><div><p className="text-xs font-black text-gray-800">{item.friendly_name || 'MRWD Authenticator'}</p><p className="text-xs text-gray-500">Authenticator connected</p></div><button type="button" disabled={mfaBusy} onClick={() => removeMfa(item.id)} className="btn-secondary rounded-lg text-xs">Remove</button></div>)}
          {!(mfaStatus?.factors?.totp || []).some(item => item.status === 'verified') && !mfaEnrollment && <button type="button" onClick={beginMfaEnrollment} disabled={mfaBusy} className="btn-primary mt-3 rounded-lg text-xs">Set up authenticator</button>}
          {mfaEnrollment && <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-black text-blue-900">Scan the QR code</p>
            <p className="mt-1 text-xs text-blue-700">Scan with Google Authenticator, Microsoft Authenticator, 1Password, or another compatible authenticator app.</p>
            {authenticatorQrSource(mfaEnrollment.totp?.qr_code) && !mfaQrFailed ? (
              <img
                className="mx-auto my-4 h-48 w-48 rounded-lg border border-blue-100 bg-white p-2"
                alt="Authenticator QR code"
                src={authenticatorQrSource(mfaEnrollment.totp?.qr_code)}
                onError={() => setMfaQrFailed(true)}
              />
            ) : (
              <div className="my-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">The QR code could not be displayed. Use the setup key below to add MRWD manually.</div>
            )}
            {mfaEnrollment.totp?.secret && <details className="mb-4 rounded-lg border border-blue-100 bg-white p-3" open={mfaQrFailed}>
              <summary className="cursor-pointer text-xs font-black text-navy-900">Can’t scan it? Use the setup key</summary>
              <p className="mt-2 text-xs text-gray-500">Choose manual setup in your authenticator app, then enter this key.</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-gray-50 px-3 py-2 text-xs font-bold text-navy-900">{mfaEnrollment.totp.secret}</code>
                <button type="button" className="btn-secondary rounded-lg text-xs" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(mfaEnrollment.totp.secret)
                    setMfaSecretCopied(true)
                  } catch {
                    setSecurityError('Clipboard access is blocked. Select and copy the setup key manually.')
                  }
                }}>{mfaSecretCopied ? 'Copied' : 'Copy Setup Key'}</button>
              </div>
            </details>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <input inputMode="numeric" autoComplete="one-time-code" aria-label="6-digit verification code" maxLength={6} value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))} className="input-field rounded-lg text-center font-mono tracking-[0.25em]" placeholder="000000"/>
              <button type="button" onClick={confirmMfaEnrollment} disabled={mfaBusy || mfaCode.length !== 6} className="btn-primary rounded-lg disabled:opacity-50">Verify</button>
            </div>
          </div>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-4"><div><p className="text-sm font-black text-navy-900">Other sessions</p><p className="mt-1 text-xs text-gray-500">Keep this device signed in and sign out your account on other browsers or devices.</p></div><button type="button" disabled={mfaBusy} onClick={logoutOtherSessions} className="btn-secondary rounded-lg text-xs">Sign out other sessions</button></div>
      </section>}
    </div>
  )
}
