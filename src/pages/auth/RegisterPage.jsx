import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuthStore } from '../../store/authStore'

const schema = z.object({
  full_name: z.string().min(2, 'Enter your full name'),
  email:     z.string().email('Enter a valid email address'),
  password:  z.string().min(6, 'Password must be at least 6 characters'),
  confirm:   z.string(),
}).refine(data => data.password === data.confirm, {
  message: "Passwords don't match",
  path: ['confirm'],
})

function LeafPattern() {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-10" viewBox="0 0 400 600" xmlns="http://www.w3.org/2000/svg">
      {[
        [60,  80,  40], [180, 140, 55], [80,  260, 35],
        [300, 80,  45], [240, 220, 50], [140, 380, 40],
        [320, 340, 38], [60,  460, 52], [260, 480, 43],
        [180, 540, 36], [340, 540, 47],
      ].map(([cx, cy, r], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={r * 0.6} ry={r} fill="white"
          transform={`rotate(${i * 30} ${cx} ${cy})`} />
      ))}
    </svg>
  )
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const signUp    = useAuthStore(s => s.signUp)
  const loading   = useAuthStore(s => s.loading)
  const [error, setError] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  })

  const onSubmit = async ({ full_name, email, password }) => {
    setError('')
    try {
      const result = await signUp(full_name, email, password)
      if (result.requiresEmailConfirmation) {
        setConfirmSent(true)
      } else {
        navigate('/customer/submit', { replace: true })
      }
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-screen flex font-sans">

      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col justify-between p-12 page-band">
        <LeafPattern />

        <Link to="/" className="relative flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-4.97 5.06-7 8.36-7 11a7 7 0 0014 0c0-2.64-2.03-5.94-7-11z"/>
            </svg>
          </div>
          <div>
            <p className="text-white font-display font-bold text-sm leading-none">Metro Roxas Water District CMS</p>
            <p className="text-gold-300 text-xs mt-0.5">Roxas City, Capiz</p>
          </div>
        </Link>

        <div className="relative">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-gold-300 animate-pulse" />
            <span className="text-gold-300 text-xs font-medium">System is online</span>
          </div>
          <h1 className="font-display font-extrabold text-white text-5xl leading-tight mb-5">
            Join in<br/>
            under a<br/>
            <span className="text-gold-300">minute.</span>
          </h1>
          <p className="text-gold-300 text-lg leading-relaxed max-w-sm">
            Create your account to start reporting issues and tracking your water service.
          </p>

          <div className="mt-8 space-y-3">
            {[
              { icon: '📝', text: 'Submit complaints in minutes' },
              { icon: '⚡', text: 'Faster complaint routing and updates' },
              { icon: '📢', text: 'Real-time announcements' },
              { icon: '💧', text: 'View your billing statement' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center text-sm shrink-0">
                  {f.icon}
                </div>
                <span className="text-gold-300 text-sm font-medium">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
          <p className="text-white/90 text-sm italic leading-relaxed">
            "We built this system so every resident can easily reach us — no more long lines, no more lost reports."
          </p>
          <p className="text-gold-300 text-xs font-semibold mt-2">— Metro Roxas Water District Administration</p>
        </div>
      </div>

      {/* ── Right panel (form) ── */}
      <div className="flex-1 flex items-center justify-center px-5 py-10" style={{ background: '#f4f7fb' }}>
        <div className="w-full max-w-md">

          <Link to="/" className="flex lg:hidden items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-navy-800 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-4.97 5.06-7 8.36-7 11a7 7 0 0014 0c0-2.64-2.03-5.94-7-11z"/>
              </svg>
            </div>
            <span className="font-display font-bold text-gray-900 text-sm">Metro Roxas Water District CMS</span>
          </Link>

          {confirmSent ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-5">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </div>
              <h2 className="font-display font-extrabold text-gray-900 text-2xl mb-2">Check your email</h2>
              <p className="text-gray-500 text-base mb-6">
                We sent a confirmation link to finish setting up your account. Once confirmed, you can sign in.
              </p>
              <Link to="/login" className="btn-primary inline-flex px-6 py-3">Back to Sign In</Link>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="font-display font-extrabold text-gray-900 text-2xl sm:text-3xl mb-2">Create your account 💧</h2>
                <p className="text-gray-500 text-base">Sign up to start reporting and tracking issues.</p>
              </div>

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

              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Full name</label>
                  <input type="text" placeholder="Juan dela Cruz" autoComplete="name"
                    {...register('full_name')}
                    className={`input-field ${errors.full_name ? 'input-error' : ''}`}
                  />
                  {errors.full_name && <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.full_name.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Email address</label>
                  <input type="email" placeholder="you@example.com" autoComplete="email"
                    {...register('email')}
                    className={`input-field ${errors.email ? 'input-error' : ''}`}
                  />
                  {errors.email && <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.email.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      placeholder="At least 6 characters"
                      autoComplete="new-password"
                      {...register('password')}
                      className={`input-field pr-11 ${errors.password ? 'input-error' : ''}`}
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                      {showPass
                        ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                        : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      }
                    </button>
                  </div>
                  {errors.password && <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.password.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Confirm password</label>
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    {...register('confirm')}
                    className={`input-field ${errors.confirm ? 'input-error' : ''}`}
                  />
                  {errors.confirm && <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.confirm.message}</p>}
                </div>

                <button type="submit" disabled={loading}
                  className="w-full btn-primary flex items-center justify-center gap-2 py-3 text-base mt-2">
                  {loading
                    ? <><div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin"/>Creating account...</>
                    : 'Create Account'
                  }
                </button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-6">
                Already have an account? <Link to="/login" className="text-brand-600 font-semibold hover:underline">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
