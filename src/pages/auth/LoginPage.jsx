import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuthStore } from '../../store/authStore'

const ROLE_HOME = {
  customer:    '/customer/submit',
  admin:       '/admin/dashboard',
  maintenance: '/maintenance/tasks',
}

const schema = z.object({
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export default function LoginPage() {
  const navigate    = useNavigate()
  const signIn      = useAuthStore(s => s.signIn)
  const loading     = useAuthStore(s => s.loading)
  const [error, setError] = useState('')

  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  })

  const onSubmit = async ({ email, password }) => {
    setError('')
    try {
      const user = await signIn(email, password)
      navigate(ROLE_HOME[user.role] || '/login', { replace: true })
    } catch (err) {
      setError(err.message)
    }
  }

  const fillDemo = (role) => {
    const creds = {
      customer:    { email: 'customer@demo.com',    password: 'demo1234' },
      admin:       { email: 'admin@demo.com',        password: 'demo1234' },
      maintenance: { email: 'maintenance@demo.com',  password: 'demo1234' },
    }
    setValue('email', creds[role].email)
    setValue('password', creds[role].password)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white/10 rounded-2xl mb-4 backdrop-blur-sm">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Complaint Management</h1>
          <p className="text-blue-200 text-sm mt-1">Water District Services</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Sign in</h2>
          <p className="text-sm text-gray-500 mb-6">Enter your credentials to continue</p>

          {error && (
            <div className="mb-5 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
              <input type="email" placeholder="you@example.com" autoComplete="email"
                {...register('email')}
                className={`input-field ${errors.email ? 'input-error' : ''}`}
              />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input type="password" placeholder="••••••••" autoComplete="current-password"
                {...register('password')}
                className={`input-field ${errors.password ? 'input-error' : ''}`}
              />
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Signing in...</>
              ) : 'Sign in'}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-5">
            Access is role-based. Contact your admin for an account.
          </p>
        </div>

        {/* Demo quick-fill */}
        <div className="mt-4 bg-white/10 backdrop-blur-sm rounded-xl p-4">
          <p className="text-xs text-blue-200 font-semibold text-center mb-3">Quick fill demo accounts</p>
          <div className="grid grid-cols-3 gap-2">
            {['customer', 'admin', 'maintenance'].map(role => (
              <button key={role} onClick={() => fillDemo(role)}
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors capitalize">
                {role}
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
