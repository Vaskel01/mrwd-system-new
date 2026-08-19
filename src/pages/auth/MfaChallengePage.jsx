import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { homeForUser } from '../../lib/accessControl'
import { ErrorBanner, Spinner } from '../../components/ui/Feedback'

export default function MfaChallengePage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const getMfaStatus = useAuthStore(s => s.getMfaStatus)
  const verifyMfa = useAuthStore(s => s.verifyMfa)
  const [factors, setFactors] = useState([])
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    if (!user) return
    getMfaStatus().then(({ factors: result, aal }) => {
      if (aal?.currentLevel === 'aal2') return navigate(homeForUser(user), { replace: true })
      const verified = (result?.totp || []).filter(item => item.status === 'verified')
      setFactors(verified)
      if (!verified.length && user.mfa_required) navigate('/profile?setup-mfa=1', { replace: true })
    }).catch(err => setError(err.message)).finally(() => setLoading(false))
  }, [getMfaStatus, navigate, user])

  const factor = useMemo(() => factors[0], [factors])
  if (!user) return <Navigate to="/login" replace />

  const submit = async event => {
    event.preventDefault(); setError('')
    if (!factor) return setError('No verified authenticator is enrolled on this account.')
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from your authenticator app.')
    setVerifying(true)
    try {
      await verifyMfa(factor.id, code.trim())
      navigate(homeForUser(user), { replace: true })
    } catch (err) { setError(err.message) } finally { setVerifying(false) }
  }

  return <div className="min-h-screen bg-[#f4f7fb] px-4 py-12 flex items-center justify-center">
    <div className="w-full max-w-md card rounded-2xl p-6 sm:p-8">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-navy-800 text-white">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>
      </div>
      <h1 className="font-display text-2xl font-black text-navy-900">Verify your identity</h1>
      <p className="mt-2 text-sm leading-6 text-gray-500">System Supervisor access is protected with two-step verification. Enter the current 6-digit code from your authenticator app.</p>
      {error && <div className="mt-5"><ErrorBanner message={error}/></div>}
      {loading ? <div className="mt-6 flex items-center gap-2 text-sm text-gray-500"><Spinner className="h-4 w-4 border-2 border-navy-600"/> Loading security factors…</div> :
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div><label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500">Authenticator code</label><input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g,'').slice(0,6))} className="input-field rounded-lg text-center font-mono text-2xl tracking-[0.35em]" placeholder="000000"/></div>
          <button disabled={verifying} className="btn-primary w-full rounded-lg disabled:opacity-50">{verifying ? 'Verifying…' : 'Verify & Continue'}</button>
        </form>}
    </div>
  </div>
}
