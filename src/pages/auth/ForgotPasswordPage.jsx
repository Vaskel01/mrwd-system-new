import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

export default function ForgotPasswordPage() {
  const requestPasswordReset = useAuthStore(s => s.requestPasswordReset)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const submit = async event => {
    event.preventDefault()
    setLoading(true); setError(''); setMessage('')
    try {
      const result = await requestPasswordReset(email.trim().toLowerCase())
      setMessage(result.message || 'Check your email for the reset link.')
    } catch (err) {
      setError(err.message)
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10 bg-[#f4f7fb]">
      <div className="w-full max-w-md card rounded-2xl overflow-hidden">
        <div className="page-band wave-header px-6 py-7"><p className="text-gold-400 text-[11px] font-bold uppercase tracking-widest">Account Recovery</p><h1 className="font-display font-black text-white text-2xl mt-1">Forgot your password?</h1><p className="text-navy-300 text-sm mt-2">We will email you a secure reset link.</p></div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
          {message && <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">{message}</div>}
          <div><label className="block text-sm font-semibold text-gray-700 mb-2">Email address</label><input name="email" aria-label="Email address" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input-field rounded-lg" placeholder="you@example.com" /></div>
          <button disabled={loading || !email.trim()} className="btn-primary rounded-lg w-full disabled:opacity-50">{loading ? 'Sending…' : 'Send Reset Link'}</button>
          <p className="text-center text-sm text-gray-500"><Link to="/login" className="font-bold text-brand-700">← Back to sign in</Link></p>
        </form>
      </div>
    </div>
  )
}
