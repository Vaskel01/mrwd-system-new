import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useStaffStore } from '../../store/staffStore'

const ROLE_BADGE = {
  admin:       'bg-purple-100 text-purple-800 border-purple-200',
  maintenance: 'bg-amber-100 text-amber-900 border-amber-200',
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

const schema = z.object({
  full_name: z.string().min(2, 'Enter a full name'),
  email:     z.string().email('Enter a valid email address'),
  password:  z.string().min(6, 'Password must be at least 6 characters'),
  role:      z.enum(['admin', 'maintenance'], { errorMap: () => ({ message: 'Select a role' }) }),
})

export default function StaffAccountsPage() {
  const staff        = useStaffStore(s => s.staff)
  const loading       = useStaffStore(s => s.loading)
  const fetchStaff   = useStaffStore(s => s.fetchStaff)
  const createStaff  = useStaffStore(s => s.createStaff)

  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [toast, setToast]       = useState('')
  const [error, setError]       = useState('')

  useEffect(() => { fetchStaff() }, [fetchStaff])

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', email: '', password: '', role: '' },
  })

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const onSubmit = async (data) => {
    setCreating(true)
    setError('')
    try {
      const result = await createStaff(data)
      reset()
      setShowForm(false)
      showToast(
        result.requiresEmailConfirmation
          ? `Account created for ${data.full_name} — they'll need to confirm their email before signing in.`
          : `Account created for ${data.full_name}.`
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }


  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-band rounded-2xl overflow-hidden px-6 py-6 relative">
        <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Admin</p>
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display font-black text-white text-xl sm:text-2xl tracking-tight">Staff Accounts</h1>
          <button onClick={() => setShowForm(v => !v)}
            className={`text-xs font-black px-4 py-2 border transition-colors ${
              showForm ? 'bg-white text-navy border-white' : 'border-white/40 text-white hover:bg-white/10'
            }`}>
            {showForm ? '✕ Cancel' : '+ New Account'}
          </button>
        </div>
        <p className="text-navy-300 text-sm mt-1">{staff.length} admin/maintenance account{staff.length !== 1 ? 's' : ''}</p>
      </div>

      {toast && (
        <div className="bg-green-50 border-l-4 border-green-500 text-green-800 text-sm px-4 py-3 font-bold flex items-center gap-2">
          ✓ {toast}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="bg-white border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
            <p className="text-xs font-black text-gray-500 uppercase tracking-widest">New Staff Account</p>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 font-medium">{error}</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Full name <span className="text-red-500">*</span></label>
                <input type="text" placeholder="e.g. Pedro Reyes"
                  {...register('full_name')}
                  className={`input-field ${errors.full_name ? 'input-error' : ''}`} />
                {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Role <span className="text-red-500">*</span></label>
                <select {...register('role')} className={`input-field ${errors.role ? 'input-error' : ''}`}>
                  <option value="">Select...</option>
                  <option value="admin">Admin</option>
                  <option value="maintenance">Maintenance</option>
                </select>
                {errors.role && <p className="mt-1 text-xs text-red-600">{errors.role.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Email <span className="text-red-500">*</span></label>
                <input type="email" placeholder="name@mrwd.gov.ph"
                  {...register('email')}
                  className={`input-field ${errors.email ? 'input-error' : ''}`} />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Temporary password <span className="text-red-500">*</span></label>
                <input type="text" placeholder="At least 6 characters"
                  {...register('password')}
                  className={`input-field ${errors.password ? 'input-error' : ''}`} />
                {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={creating} className="btn-primary flex items-center gap-2">
                {creating
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin"/>Creating...</>
                  : '➕ Create Account'
                }
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="bg-white border border-gray-200 p-12 text-center text-gray-400">Loading staff accounts...</div>
      ) : staff.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 p-12 text-center">
          <p className="text-4xl mb-3">👥</p>
          <p className="font-bold text-gray-500">No staff accounts yet.</p>
          <p className="text-sm text-gray-400 mt-1">Click "New Account" to create an admin or maintenance login.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-5 py-3 font-black text-gray-500 uppercase tracking-wider text-xs">Name</th>
                <th className="px-5 py-3 font-black text-gray-500 uppercase tracking-wider text-xs">Email</th>
                <th className="px-5 py-3 font-black text-gray-500 uppercase tracking-wider text-xs">Role</th>
                <th className="px-5 py-3 font-black text-gray-500 uppercase tracking-wider text-xs">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map(s => (
                <tr key={s.id}>
                  <td className="px-5 py-3.5 font-semibold text-gray-800">{s.full_name}</td>
                  <td className="px-5 py-3.5 text-gray-500">{s.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-black uppercase tracking-wide border ${ROLE_BADGE[s.role] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {s.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-400">{timeAgo(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
