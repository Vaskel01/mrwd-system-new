import { useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuthStore } from '../../store/authStore'
import AppIcon from '../../components/ui/AppIcon'
import { homeForUser } from '../../lib/accessControl'

const schema = z.object({
  email:    z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

function LoginWaveArtwork() {
  return (
    <div className="login-wave-art" aria-hidden="true">
      <div className="login-wave-parallax">
        <svg className="login-wave-layer login-wave-back" viewBox="0 0 1200 320" preserveAspectRatio="none">
          <path d="M0 90C145 28 270 32 410 96s272 62 425 4 248-51 365 3v217H0Z" fill="currentColor" />
        </svg>
        <svg className="login-wave-layer login-wave-middle" viewBox="0 0 1200 320" preserveAspectRatio="none">
          <path d="M0 150c170-65 312-58 470 5s298 55 438-7 220-42 292 1v171H0Z" fill="currentColor" />
        </svg>
        <svg className="login-wave-layer login-wave-front" viewBox="0 0 1200 320" preserveAspectRatio="none">
          <path d="M0 218c154-51 293-43 443 8s302 47 452-4 236-36 305-3v101H0Z" fill="currentColor" />
          <path className="login-wave-crest" d="M0 218c154-51 293-43 443 8s302 47 452-4 236-36 305-3" fill="none" />
        </svg>
      </div>
      <svg className="login-wave-impact" viewBox="0 0 300 320" preserveAspectRatio="none">
        <path
          className="login-wave-impact-body"
          d="M0 264c70-36 130-40 182-14 33 17 61 9 82-15 18-21 27-47 23-73 9 10 13 25 13 42v116H0Z"
        />
        <path
          className="login-wave-impact-undertow"
          d="M0 294c80-36 145-34 194-12 36 16 71 5 106-31v69H0Z"
        />
        <path
          className="login-wave-impact-foam-fill"
          d="M199 218c18 8 34 5 46-6 3-10 12-16 22-13 3-11 12-18 22-15-1-10 3-19 11-24v31c-6 7-8 17-6 28-10-1-18 5-21 16-10-4-20 1-25 11-17 8-34 0-49-28Z"
        />
        <path className="login-wave-impact-spray" d="M275 129c5-9 13-11 18-5 3 5-1 12-8 16-7 4-13 0-10-11Z" />
        <path className="login-wave-impact-spray" d="M292 145c3-6 7-7 10-3 2 4 0 8-5 10-5 2-8-1-5-7Z" />
        <path className="login-wave-impact-spray" d="M254 146c3-7 10-9 14-4 3 5 0 10-6 13-6 3-10-1-8-9Z" />
      </svg>
    </div>
  )
}

export default function LoginPage() {
  const infoPanelRef = useRef(null)
  const navigate = useNavigate()
  const signIn   = useAuthStore(s => s.signIn)
  const loading  = useAuthStore(s => s.loading)
  const [error, setError] = useState('')
  const [showPass, setShowPass] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  })

  const onSubmit = async ({ email, password }) => {
    setError('')
    try {
      const result = await signIn(email, password)
      if (result.mfaPending) return navigate('/mfa', { replace: true })
      if (result.mfaEnrollmentRequired) return navigate('/profile?setup-mfa=1', { replace: true })
      navigate(homeForUser(result.user), { replace: true })
    } catch (err) {
      setError(err.message)
    }
  }

  const handlePanelPointerMove = event => {
    if (event.pointerType && event.pointerType !== 'mouse') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const panel = infoPanelRef.current
    if (!panel) return

    const bounds = panel.getBoundingClientRect()
    const horizontal = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
    const vertical = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))

    panel.style.setProperty('--login-wave-x', `${(horizontal - 0.5) * 18}px`)
    panel.style.setProperty('--login-wave-y', `${(vertical - 0.5) * 8}px`)
  }

  const resetPanelPointer = () => {
    const panel = infoPanelRef.current
    if (!panel) return
    panel.style.setProperty('--login-wave-x', '0px')
    panel.style.setProperty('--login-wave-y', '0px')
  }


  return (
    <div className="min-h-screen flex font-sans">

      {/* ── Left panel ── */}
      <div
        ref={infoPanelRef}
        onPointerMove={handlePanelPointerMove}
        onPointerLeave={resetPanelPointer}
        className="auth-info-panel hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col justify-between p-12 page-band"
      >
        <LoginWaveArtwork />

        {/* Logo */}
        <Link to="/" className="relative flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-4.97 5.06-7 8.36-7 11a7 7 0 0014 0c0-2.64-2.03-5.94-7-11z"/>
            </svg>
          </div>
          <div>
            <p className="text-white font-display font-bold text-sm leading-none">Metro Roxas Water District Complaint System</p>
            <p className="text-gold-300 text-xs mt-0.5">Roxas City, Capiz</p>
          </div>
        </Link>

        {/* Center content */}
        <div className="relative">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-gold-300 animate-pulse" />
            <span className="text-gold-300 text-xs font-medium">System is online</span>
          </div>
          <h1 className="font-display font-extrabold text-white text-5xl leading-tight mb-5">
            Your water<br/>
            concerns<br/>
            <span className="text-gold-300">matter.</span>
          </h1>
          <p className="text-gold-300 text-lg leading-relaxed max-w-sm">
            Report water service problems, follow complaint updates, and view important MRWD information in one place.
          </p>

          {/* Feature list */}
          <div className="mt-8 space-y-3">
            {[
              { icon: 'document', text: 'Report a water service problem' },
              { icon: 'refresh', text: 'Track each complaint from review to resolution' },
              { icon: 'announcement', text: 'Read current service advisories' },
              { icon: 'droplet', text: 'View your billing information' },
            ].map((f, i) => (
              <div key={i} className="auth-feature-row flex items-center gap-3">
                <div className="auth-feature-icon w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center text-sm shrink-0">
                  <AppIcon name={f.icon} className="w-4 h-4 text-white" />
                </div>
                <span className="text-gold-300 text-sm font-medium">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom quote */}
        <div className="relative bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
          <p className="text-white/90 text-sm leading-relaxed">
            Customers can submit complaints, follow updates, read service advisories, and view billing information from one account.
          </p>
        </div>
      </div>

      {/* ── Right panel (form) ── */}
      <div className="flex-1 flex items-center justify-center px-5 py-10" style={{ background: '#f4f7fb' }}>
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <Link to="/" className="flex lg:hidden items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-navy-800 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-4.97 5.06-7 8.36-7 11a7 7 0 0014 0c0-2.64-2.03-5.94-7-11z"/>
              </svg>
            </div>
            <span className="font-display font-bold text-gray-900 text-sm">Metro Roxas Water District Complaint System</span>
          </Link>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="font-display font-extrabold text-gray-900 text-2xl sm:text-3xl mb-2">Sign in to your account</h2>
            <p className="text-gray-500 text-base">Enter your email and password to continue.</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3.5">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                </svg>
              </div>
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email address</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"/>
                  </svg>
                </span>
                <input aria-label="Email" type="email" placeholder="you@example.com" autoComplete="email"
                  {...register('email')}
                  className={`input-field pl-10 ${errors.email ? 'input-error' : ''}`}
                />
              </div>
              {errors.email && <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                </span>
                <input aria-label="Password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register('password')}
                  className={`input-field pl-10 pr-11 ${errors.password ? 'input-error' : ''}`}
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600 transition-colors"
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  aria-pressed={showPass}>
                  {showPass
                    ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                    : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  }
                </button>
              </div>
              {errors.password && <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.password.message}</p>}
              <div className="text-right mt-2"><Link to="/forgot-password" className="text-xs font-bold text-brand-700 hover:underline">Forgot password?</Link></div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full btn-primary flex items-center justify-center gap-2 py-3 text-base mt-2">
              {loading
                ? <><div className="w-5 h-5 border-2 border-white border-t-transparent  animate-spin"/>Signing in...</>
                : 'Sign in'
              }
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Need an account? <Link to="/register" className="text-brand-600 font-semibold hover:underline">Sign up</Link>
          </p>

        </div>
      </div>
    </div>
  )
}
