import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const updatePassword = useAuthStore(s => s.updatePassword)
  const signOut = useAuthStore(s => s.signOut)
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => { if (mounted) setReady(Boolean(data.session)) })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted && (event === 'PASSWORD_RECOVERY' || session)) setReady(true)
    })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  const submit = async event => {
    event.preventDefault(); setError('')
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true)
    try {
      await updatePassword(password)
      signOut()
      setDone(true)
      window.setTimeout(() => navigate('/login', { replace: true }), 1800)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10 bg-[#f4f7fb]">
      <div className="w-full max-w-md card rounded-2xl overflow-hidden">
        <div className="page-band wave-header px-6 py-7"><p className="text-gold-400 text-[11px] font-bold uppercase tracking-widest">Account Recovery</p><h1 className="font-display font-black text-white text-2xl mt-1">Set a new password</h1></div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {!ready && !done && <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">Open this page using the reset link from your email. The recovery session may take a moment to load.</div>}
          {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
          {done ? <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800 font-bold">Password updated. Redirecting to sign in…</div> : <>
            <div><label className="block text-sm font-semibold text-gray-700 mb-2">New password</label><input name="new_password" aria-label="New password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="input-field rounded-lg" /></div>
            <div><label className="block text-sm font-semibold text-gray-700 mb-2">Confirm password</label><input name="confirm_password" aria-label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className="input-field rounded-lg" /></div>
            <button disabled={!ready || loading} className="btn-primary rounded-lg w-full disabled:opacity-50">{loading ? 'Updating…' : 'Update Password'}</button>
          </>}
          <p className="text-center text-sm"><Link to="/login" className="font-bold text-brand-700">Back to sign in</Link></p>
        </form>
      </div>
    </div>
  )
}
