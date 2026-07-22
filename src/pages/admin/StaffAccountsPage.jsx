import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useStaffStore } from '../../store/staffStore'
import { useComplaintStore } from '../../store/complaintStore'
import { PageLoader, EmptyState, ErrorBanner, Spinner } from '../../components/ui/Feedback'

const ROLE_BADGE = {
  admin: 'bg-purple-100 text-purple-800 border-purple-200',
  maintenance_personnel: 'bg-amber-100 text-amber-900 border-amber-200',
}
const ROLE_LABEL = {
  admin: 'Admin',
  maintenance_personnel: 'Maintenance',
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

function createPassword(length = 12) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const numbers = '23456789'
  const symbols = '!@#$%'
  const all = letters + numbers + symbols
  const values = new Uint32Array(length)
  crypto.getRandomValues(values)
  const generated = Array.from(values, value => all[value % all.length])
  generated[0] = letters[values[0] % letters.length]
  generated[1] = numbers[values[1] % numbers.length]
  generated[2] = symbols[values[2] % symbols.length]
  return generated.sort(() => Math.random() - 0.5).join('')
}

const schema = z.object({
  full_name: z.string().min(2, 'Enter a full name'),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['admin', 'maintenance_personnel'], { errorMap: () => ({ message: 'Select a role' }) }),
})

export default function StaffAccountsPage() {
  const navigate = useNavigate()
  const staff = useStaffStore(s => s.staff)
  const loading = useStaffStore(s => s.loading)
  const fetchError = useStaffStore(s => s.error)
  const fetchStaff = useStaffStore(s => s.fetchStaff)
  const createStaff = useStaffStore(s => s.createStaff)
  const complaints = useComplaintStore(s => s.complaints)
  const fetchComplaints = useComplaintStore(s => s.fetchComplaints)

  const [showForm, setShowForm] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [creating, setCreating] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState({ message: '', type: 'success' })
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [createdCredentials, setCreatedCredentials] = useState(null)

  useEffect(() => {
    fetchStaff()
    fetchComplaints()
  }, [fetchStaff, fetchComplaints])

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', email: '', password: '', role: '' },
  })

  const workload = useMemo(() => {
    const result = {}
    for (const account of staff) {
      const assigned = complaints.filter(c => c.assigned_to === account.id)
      const active = assigned.filter(c => ['assigned', 'en_route', 'in_progress'].includes(c.status)).length
      const completed = assigned.filter(c => c.status === 'completed').length
      const rejected = assigned.filter(c => c.status === 'rejected').length
      result[account.id] = {
        total: assigned.length,
        active,
        completed,
        rejected,
        rate: active + completed > 0 ? Math.round(completed / (active + completed) * 100) : 0,
      }
    }
    return result
  }, [staff, complaints])

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase()
    return staff
      .filter(account => roleFilter === 'all' || account.role === roleFilter)
      .filter(account => !query || [account.full_name, account.email, ROLE_LABEL[account.role], account.role]
        .some(value => String(value || '').toLowerCase().includes(query)))
      .sort((a, b) => {
        if (sortBy === 'name') return a.full_name.localeCompare(b.full_name)
        if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at)
        if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
        if (sortBy === 'active') return (workload[b.id]?.active || 0) - (workload[a.id]?.active || 0)
        if (sortBy === 'completed') return (workload[b.id]?.completed || 0) - (workload[a.id]?.completed || 0)
        return 0
      })
  }, [staff, roleFilter, search, sortBy, workload])

  const counts = {
    all: staff.length,
    admins: staff.filter(account => account.role === 'admin').length,
    maintenance: staff.filter(account => account.role === 'maintenance_personnel').length,
    activeTasks: complaints.filter(c => c.assigned_to && ['assigned', 'en_route', 'in_progress'].includes(c.status)).length,
  }

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast({ message: '', type: 'success' }), 3500)
  }

  const onSubmit = async data => {
    setCreating(true)
    setError('')
    try {
      const normalized = { ...data, email: data.email.trim().toLowerCase(), full_name: data.full_name.trim() }
      const result = await createStaff(normalized)
      setCreatedCredentials({ email: normalized.email, password: normalized.password, name: normalized.full_name })
      reset()
      setShowForm(false)
      setShowPassword(false)
      showToast(result.requiresEmailConfirmation
        ? `Account created for ${normalized.full_name}. Email confirmation is required.`
        : `Account created for ${normalized.full_name}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([fetchStaff(), fetchComplaints()])
      showToast('Staff accounts and workloads refreshed.')
    } finally {
      setRefreshing(false)
    }
  }

  const copyText = async (text, successMessage) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(successMessage)
    } catch {
      showToast('Could not copy to the clipboard.', 'error')
    }
  }

  const copyCredentials = () => {
    if (!createdCredentials) return
    copyText(
      `MRWD staff account\nName: ${createdCredentials.name}\nEmail: ${createdCredentials.email}\nTemporary password: ${createdCredentials.password}`,
      'Temporary login details copied.'
    )
  }

  const generatePassword = () => {
    setValue('password', createPassword(), { shouldValidate: true, shouldDirty: true })
    setShowPassword(true)
  }

  const resetFilters = () => {
    setSearch('')
    setRoleFilter('all')
    setSortBy('name')
  }

  const accountActions = account => (
    <div className="flex items-center justify-end gap-2 flex-wrap">
      <button onClick={() => copyText(account.email, 'Email address copied.')}
        className="px-3 py-1.5 rounded-lg text-xs font-bold text-navy-700 border border-navy-200 bg-white">Copy Email</button>
      {account.role === 'maintenance_personnel' && (
        <button onClick={() => navigate(`/admin/assign?staff=${account.id}`)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-navy-800">View Tasks</button>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl overflow-hidden px-6 py-6 relative">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Admin · Access</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl tracking-tight">Staff Accounts</h1>
            <p className="text-navy-300 text-sm mt-1">Search accounts, check technician workload, and create logins faster.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleRefresh} disabled={refreshing}
              className="px-4 py-2 rounded-lg text-xs font-black border border-white/40 text-white hover:bg-white/10 disabled:opacity-50">
              {refreshing ? 'Refreshing…' : '↻ Refresh'}
            </button>
            <button onClick={() => setShowForm(value => !value)}
              className={`px-4 py-2 rounded-lg text-xs font-black border transition-colors ${showForm ? 'bg-white text-navy-900 border-white' : 'bg-gold-400 text-navy-900 border-gold-400 hover:bg-gold-300'}`}>
              {showForm ? '✕ Cancel' : '+ New Account'}
            </button>
          </div>
        </div>
      </div>

      {toast.message && (
        <div className={`p-3 rounded-xl border-l-4 text-sm font-bold ${toast.type === 'error' ? 'bg-red-50 border-red-500 text-red-800' : 'bg-green-50 border-green-500 text-green-800'}`}>
          {toast.message}
        </div>
      )}
      {fetchError && <ErrorBanner message={fetchError} onRetry={handleRefresh} />}

      {createdCredentials && (
        <div className="card rounded-xl p-4 border-green-200 bg-green-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="font-bold text-green-900">Temporary login ready for {createdCredentials.name}</p>
            <p className="text-xs text-green-700 mt-1">Copy it now and send it securely. The temporary password is only shown in this notice.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={copyCredentials} className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-green-700">Copy Login Details</button>
            <button onClick={() => setCreatedCredentials(null)} className="px-3 py-2 rounded-lg text-xs font-bold text-green-800 border border-green-300 bg-white">Dismiss</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button onClick={() => setRoleFilter('all')} className={`card rounded-xl p-4 text-left ${roleFilter === 'all' ? 'ring-2 ring-navy-700 border-navy-300' : ''}`}>
          <p className="font-display font-black text-3xl text-navy-800">{counts.all}</p><p className="text-xs font-bold text-gray-500 mt-1">All Staff</p>
        </button>
        <button onClick={() => setRoleFilter('admin')} className={`card rounded-xl p-4 text-left ${roleFilter === 'admin' ? 'ring-2 ring-purple-600 border-purple-300' : ''}`}>
          <p className="font-display font-black text-3xl text-purple-700">{counts.admins}</p><p className="text-xs font-bold text-gray-500 mt-1">Admins</p>
        </button>
        <button onClick={() => setRoleFilter('maintenance_personnel')} className={`card rounded-xl p-4 text-left ${roleFilter === 'maintenance_personnel' ? 'ring-2 ring-amber-600 border-amber-300' : ''}`}>
          <p className="font-display font-black text-3xl text-amber-600">{counts.maintenance}</p><p className="text-xs font-bold text-gray-500 mt-1">Maintenance</p>
        </button>
        <div className="card rounded-xl p-4 text-left">
          <p className="font-display font-black text-3xl text-brand-600">{counts.activeTasks}</p><p className="text-xs font-bold text-gray-500 mt-1">Active Staff Tasks</p>
        </div>
      </div>

      {showForm && (
        <div className="card rounded-xl overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
            <p className="text-xs font-black text-gray-500 uppercase tracking-widest">New Staff Account</p>
            <button type="button" onClick={generatePassword} className="text-xs font-bold text-brand-700">Generate secure password</button>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
            {error && <ErrorBanner message={error} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Full Name <span className="text-red-500">*</span></label>
                <input type="text" placeholder="e.g. Pedro Reyes" {...register('full_name')}
                  className={`input-field rounded-lg ${errors.full_name ? 'input-error' : ''}`} />
                {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Role <span className="text-red-500">*</span></label>
                <select {...register('role')} className={`input-field rounded-lg ${errors.role ? 'input-error' : ''}`}>
                  <option value="">Select role…</option>
                  <option value="admin">Admin</option>
                  <option value="maintenance_personnel">Maintenance</option>
                </select>
                {errors.role && <p className="mt-1 text-xs text-red-600">{errors.role.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Email <span className="text-red-500">*</span></label>
                <input type="email" placeholder="name@mrwd.gov.ph" {...register('email')}
                  className={`input-field rounded-lg ${errors.email ? 'input-error' : ''}`} />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Temporary Password <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <input type={showPassword ? 'text' : 'password'} placeholder="At least 6 characters" {...register('password')}
                    className={`input-field rounded-lg ${errors.password ? 'input-error' : ''}`} />
                  <button type="button" onClick={() => setShowPassword(value => !value)} className="btn-secondary rounded-lg px-3 shrink-0">
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { reset(); setShowForm(false); setError('') }} className="btn-secondary rounded-lg">Cancel</button>
              <button type="submit" disabled={creating} className="btn-primary rounded-lg disabled:opacity-50">
                {creating ? <><Spinner className="w-4 h-4 border-2 border-white" /> Creating…</> : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {staff.length > 0 && (
        <div className="card rounded-xl p-4 space-y-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search staff name, email, or role..." className="input-field pl-9 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} className="input-field rounded-lg text-sm">
              <option value="all">Any Role</option>
              <option value="admin">Admins</option>
              <option value="maintenance_personnel">Maintenance</option>
            </select>
            <select value={sortBy} onChange={event => setSortBy(event.target.value)} className="input-field rounded-lg text-sm">
              <option value="name">Name A–Z</option>
              <option value="newest">Newest Account</option>
              <option value="oldest">Oldest Account</option>
              <option value="active">Most Active Tasks</option>
              <option value="completed">Most Completed Tasks</option>
            </select>
            <button onClick={resetFilters} className="btn-secondary rounded-lg text-sm col-span-2 lg:col-span-1">Reset Filters</button>
          </div>
        </div>
      )}

      {loading && staff.length === 0 ? (
        <PageLoader label="Loading staff accounts..." />
      ) : staff.length === 0 ? (
        <EmptyState icon="👥" title="No staff accounts yet." description='Click "New Account" to create an admin or maintenance login.' />
      ) : filteredStaff.length === 0 ? (
        <div className="card rounded-xl p-10 text-center text-gray-400">No staff accounts match your search and filters.</div>
      ) : (
        <>
          <div className="hidden md:block card rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-200 text-left">
                  {['Staff Member', 'Role', 'Workload', 'Completion', 'Created', 'Actions'].map(header => (
                    <th key={header} className="px-5 py-3 font-black text-gray-400 uppercase tracking-wider text-xs">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStaff.map(account => {
                  const stats = workload[account.id] || { total: 0, active: 0, completed: 0, rejected: 0, rate: 0 }
                  return (
                    <tr key={account.id} className="hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <p className="font-bold text-gray-900">{account.full_name}</p>
                        <p className="text-xs text-gray-400 mt-1">{account.email}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2 py-1 text-xs font-black uppercase tracking-wide border rounded ${ROLE_BADGE[account.role] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {ROLE_LABEL[account.role] || account.role}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {account.role === 'maintenance_personnel' ? (
                          <div className="flex gap-3 text-xs">
                            <span className="font-bold text-brand-700">{stats.active} active</span>
                            <span className="font-bold text-green-700">{stats.completed} done</span>
                            {stats.rejected > 0 && <span className="font-bold text-red-600">{stats.rejected} rejected</span>}
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-4">
                        {account.role === 'maintenance_personnel' ? (
                          <div className="min-w-[120px]">
                            <div className="flex justify-between text-xs mb-1"><span className="text-gray-400">Rate</span><b className="text-navy-800">{stats.rate}%</b></div>
                            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${stats.rate}%` }} /></div>
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-4 text-gray-400 whitespace-nowrap">{timeAgo(account.created_at)}</td>
                      <td className="px-5 py-4">{accountActions(account)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {filteredStaff.map(account => {
              const stats = workload[account.id] || { active: 0, completed: 0, rejected: 0, rate: 0 }
              return (
                <div key={account.id} className="card rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900">{account.full_name}</p>
                      <p className="text-xs text-gray-400 mt-1 truncate">{account.email}</p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-1 text-[10px] font-black uppercase border rounded ${ROLE_BADGE[account.role] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {ROLE_LABEL[account.role] || account.role}
                    </span>
                  </div>
                  {account.role === 'maintenance_personnel' && (
                    <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                      <div className="rounded-lg bg-brand-50 p-2"><p className="font-black text-brand-700">{stats.active}</p><p className="text-[10px] text-gray-500">Active</p></div>
                      <div className="rounded-lg bg-green-50 p-2"><p className="font-black text-green-700">{stats.completed}</p><p className="text-[10px] text-gray-500">Done</p></div>
                      <div className="rounded-lg bg-slate-50 p-2"><p className="font-black text-navy-800">{stats.rate}%</p><p className="text-[10px] text-gray-500">Rate</p></div>
                    </div>
                  )}
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-400">Created {timeAgo(account.created_at)}</p>
                    {accountActions(account)}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
