import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useStaffStore } from '../../store/staffStore'
import { useAuthStore } from '../../store/authStore'
import { PageLoader, EmptyState, ErrorBanner, Spinner } from '../../components/ui/Feedback'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Dialog from '../../components/ui/Dialog'
import AppIcon from '../../components/ui/AppIcon'
import SearchField from '../../components/ui/SearchField'
import { apiFetch } from '../../lib/api'
import { staffAccessLabel } from '../../config/terminology'

const ACCOUNT_BADGE = {
  system_supervisor: 'bg-purple-100 text-purple-800 border-purple-200',
  commercial_staff: 'bg-blue-100 text-blue-800 border-blue-200',
  ecmd_staff: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  maintenance_personnel: 'bg-amber-100 text-amber-900 border-amber-200',
}
const ACCOUNT_LABEL = {
  system_supervisor: 'System Supervisor',
  commercial_staff: 'Commercial Services Staff',
  ecmd_staff: 'ECMD Staff',
  maintenance_personnel: 'Maintenance Personnel',
}

function accountTypeKey(account) {
  if (account?.role === 'maintenance_personnel') return 'maintenance_personnel'
  if (account?.role !== 'admin') return account?.role || 'unknown'
  if (['manager', 'supervisor'].includes(String(account.staff_position || '').toLowerCase())) return 'system_supervisor'
  const departmentCode = String(account.department?.code || account.department_code || '').toUpperCase()
  if (departmentCode === 'COMMERCIAL') return 'commercial_staff'
  if (departmentCode === 'ECMD') return 'ecmd_staff'
  return 'system_supervisor'
}

function accessModuleLabel(account) {
  return staffAccessLabel(account)
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
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/[A-Za-z]/, 'Password must include a letter')
    .regex(/\d/, 'Password must include a number'),
  account_type: z.enum(['system_supervisor', 'commercial_staff', 'ecmd_staff', 'maintenance_personnel'], { errorMap: () => ({ message: 'Select an account type' }) }),
})

export default function SystemStaffAccountsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentUser = useAuthStore(state => state.user)
  const staff = useStaffStore(s => s.staff)
  const loading = useStaffStore(s => s.loading)
  const fetchError = useStaffStore(s => s.error)
  const fetchStaff = useStaffStore(s => s.fetchStaff)
  const createStaff = useStaffStore(s => s.createStaff)
  const setStaffActive = useStaffStore(s => s.setStaffActive)
  const sendPasswordReset = useStaffStore(s => s.sendPasswordReset)

  const [showForm, setShowForm] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [creating, setCreating] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState({ message: '', type: 'success' })
  const [error, setError] = useState('')
  const [search, setSearch] = useState(() => searchParams.get('q') || '')
  const [roleFilter, setRoleFilter] = useState(() => searchParams.get('role') || 'all')
  const [accountFilter, setAccountFilter] = useState(() => searchParams.get('account') || 'all')
  const [sortBy, setSortBy] = useState(() => searchParams.get('sort') || 'name')
  const [createdCredentials, setCreatedCredentials] = useState(null)
  const [showCredentialPassword, setShowCredentialPassword] = useState(false)
  const [actionId, setActionId] = useState(null)
  const [manageAccountId, setManageAccountId] = useState(null)
  const [deactivationAccount, setDeactivationAccount] = useState(null)
  const [departments, setDepartments] = useState([])

  useEffect(() => {
    fetchStaff()
    apiFetch('/operations/system-bootstrap')
      .then(result => setDepartments(result.departments || []))
      .catch(() => setDepartments([]))
  }, [fetchStaff])
  useEffect(() => {
    const next = {}
    if (search.trim()) next.q = search.trim()
    if (roleFilter !== 'all') next.role = roleFilter
    if (accountFilter !== 'all') next.account = accountFilter
    if (sortBy !== 'name') next.sort = sortBy
    setSearchParams(next, { replace: true })
  }, [search, roleFilter, accountFilter, sortBy, setSearchParams])

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', email: '', password: '', account_type: '' },
  })

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase()
    return staff
      .filter(account => roleFilter === 'all' || accountTypeKey(account) === roleFilter)
      .filter(account => accountFilter === 'all' || (accountFilter === 'active' ? account.is_active !== false : account.is_active === false))
      .filter(account => !query || [account.full_name, account.email, ACCOUNT_LABEL[accountTypeKey(account)], accessModuleLabel(account), account.role]
        .some(value => String(value || '').toLowerCase().includes(query)))
      .sort((a, b) => {
        if (sortBy === 'name') return a.full_name.localeCompare(b.full_name)
        if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at)
        if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
        return 0
      })
  }, [staff, roleFilter, accountFilter, search, sortBy])

  const counts = {
    all: staff.length,
    system: staff.filter(account => accountTypeKey(account) === 'system_supervisor').length,
    commercial: staff.filter(account => accountTypeKey(account) === 'commercial_staff').length,
    ecmd: staff.filter(account => accountTypeKey(account) === 'ecmd_staff').length,
    maintenance: staff.filter(account => accountTypeKey(account) === 'maintenance_personnel').length,
  }

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast({ message: '', type: 'success' }), 3500)
  }

  const onSubmit = async data => {
    setCreating(true)
    setError('')
    try {
      const requestedModule = data.account_type === 'commercial_staff' ? 'commercial' : data.account_type === 'system_supervisor' ? 'system' : 'ecmd'
      const department = departments.find(item => item.code === requestedModule.toUpperCase())
      if (requestedModule !== 'system' && !department) throw new Error(`The ${requestedModule.toUpperCase()} department record is missing. Run the department-access migration first.`)
      const normalized = {
        email: data.email.trim().toLowerCase(),
        full_name: data.full_name.trim(),
        password: data.password,
        role: data.account_type === 'maintenance_personnel' ? 'maintenance_personnel' : 'admin',
        department_id: department?.id || null,
        staff_position: data.account_type === 'system_supervisor' ? 'supervisor' : data.account_type === 'maintenance_personnel' ? 'crew_member' : data.account_type === 'commercial_staff' ? 'commercial_staff' : 'department_staff',
      }
      const result = await createStaff(normalized)
      setCreatedCredentials({ email: normalized.email, password: normalized.password, name: normalized.full_name, accountType: data.account_type })
      setShowCredentialPassword(false)
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
      await fetchStaff()
      showToast('Staff accounts refreshed.')
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
      `MRWD staff account\nName: ${createdCredentials.name}\nEmail: ${createdCredentials.email}\nTemporary password: ${createdCredentials.password}\n\nChange this temporary password on first login.${createdCredentials.accountType === 'system_supervisor' ? '\nSystem Supervisors must also set up an authenticator app before opening System Administration.' : ''}`,
      'Temporary login details copied.'
    )
  }

  const generatePassword = () => {
    setValue('password', createPassword(), { shouldValidate: true, shouldDirty: true })
    setShowPassword(true)
  }

  const applyAccountStatus = async account => {
    const nextActive = account.is_active === false
    setActionId(account.id); setError('')
    try {
      await setStaffActive(account.id, nextActive)
      showToast(`${account.full_name} ${nextActive ? 'activated' : 'deactivated'}.`)
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setActionId(null)
    }
  }
  const handleAccountStatus = account => {
    if (account.is_active !== false) {
      setDeactivationAccount(account)
      return
    }
    applyAccountStatus(account)
  }

  const handlePasswordReset = async account => {
    setActionId(account.id); setError('')
    try {
      const result = await sendPasswordReset(account.id)
      showToast(result.message || 'Password reset email sent.')
    } catch (err) { setError(err.message) } finally { setActionId(null) }
  }

  const resetFilters = () => {
    setSearch('')
    setRoleFilter('all')
    setAccountFilter('all')
    setSortBy('name')
  }

  const managedAccount = staff.find(account => account.id === manageAccountId) || null
  const accountActions = account => (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => setManageAccountId(account.id)}
        className="inline-flex max-w-full items-center justify-center whitespace-nowrap px-2.5 py-2 rounded-lg text-xs font-black text-white bg-navy-800 hover:bg-navy-900 transition-colors"
      >
        Manage
      </button>
    </div>
  )


  return (
    <div className="space-y-5">
      <div className="page-band wave-header rounded-2xl overflow-hidden px-4 sm:px-6 py-5 sm:py-6 relative">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">System Administration</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl tracking-tight">Staff accounts</h1>
            <p className="text-navy-300 text-sm mt-1">Create staff accounts, manage access, and send password reset links.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleRefresh} disabled={refreshing}
              className="px-4 py-2 rounded-lg text-xs font-black border border-white/40 text-white hover:bg-white/10 disabled:opacity-50">
              {refreshing ? 'Refreshing…' : '↻ Refresh'}
            </button>
            <button onClick={() => setShowForm(value => !value)}
              className={`px-4 py-2 rounded-lg text-xs font-black border transition-colors ${showForm ? 'bg-white text-navy-900 border-white' : 'bg-gold-400 text-navy-900 border-gold-400 hover:bg-gold-300'}`}>
              {showForm ? 'Cancel' : 'Create account'}
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
        <div className="card rounded-xl p-4 border-green-200 bg-green-50/60 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
            <p className="font-bold text-green-900">Temporary login created for {createdCredentials.name}</p>
              <p className="text-xs text-green-700 mt-1">Copy these login details and send them through an approved secure channel.</p>
            </div>
            <button onClick={() => setCreatedCredentials(null)} className="px-3 py-2 rounded-lg text-xs font-bold text-green-800 border border-green-300 bg-white">Dismiss</button>
          </div>
          <div className="grid gap-2 rounded-lg border border-green-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-gray-500">Email</p>
              <p className="mt-1 break-all text-sm font-bold text-gray-800">{createdCredentials.email}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-gray-500">Temporary password</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 rounded bg-gray-50 px-2 py-1.5 text-sm font-bold text-gray-800">{showCredentialPassword ? createdCredentials.password : '••••••••••••'}</code>
                <button type="button" onClick={() => setShowCredentialPassword(value => !value)} aria-pressed={showCredentialPassword} className="text-xs font-black text-brand-700">
                  {showCredentialPassword ? 'Hide' : 'Reveal'}
                </button>
              </div>
            </div>
            <button onClick={copyCredentials} className="px-4 py-2.5 rounded-lg text-xs font-bold text-white bg-green-700">Copy login details</button>
          </div>
          <div className="rounded-lg border border-green-200 bg-white/70 px-3 py-2 text-[11px] leading-5 text-green-800"><p><b>On first sign-in:</b> the staff member must create a new password before using their workspace.</p>{createdCredentials.accountType === 'system_supervisor' && <p><b>For System Supervisors:</b> an authenticator app must also be set up before System Administration can be opened.</p>}<p>If copying is blocked, reveal the password and copy it manually before closing this message.</p></div>
        </div>
      )}

      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 xl:grid-cols-4 gap-3">
        <button onClick={() => setRoleFilter('commercial_staff')} className={`card rounded-xl p-4 text-left ${roleFilter === 'commercial_staff' ? 'ring-2 ring-blue-600 border-blue-300' : ''}`}>
          <p className="font-display font-black text-3xl text-blue-700">{counts.commercial}</p><p className="text-xs font-bold text-gray-500 mt-1">Commercial Services</p>
        </button>
        <button onClick={() => setRoleFilter('ecmd_staff')} className={`card rounded-xl p-4 text-left ${roleFilter === 'ecmd_staff' ? 'ring-2 ring-cyan-600 border-cyan-300' : ''}`}>
          <p className="font-display font-black text-3xl text-cyan-700">{counts.ecmd}</p><p className="text-xs font-bold text-gray-500 mt-1">ECMD Staff</p>
        </button>
        <button onClick={() => setRoleFilter('maintenance_personnel')} className={`card rounded-xl p-4 text-left ${roleFilter === 'maintenance_personnel' ? 'ring-2 ring-amber-600 border-amber-300' : ''}`}>
          <p className="font-display font-black text-3xl text-amber-600">{counts.maintenance}</p><p className="text-xs font-bold text-gray-500 mt-1">Maintenance Personnel</p>
        </button>
        <button onClick={() => setRoleFilter('system_supervisor')} className={`card rounded-xl p-4 text-left ${roleFilter === 'system_supervisor' ? 'ring-2 ring-purple-600 border-purple-300' : ''}`}>
          <p className="font-display font-black text-3xl text-purple-700">{counts.system}</p><p className="text-xs font-bold text-gray-500 mt-1">System Supervisors</p>
        </button>
      </div>

      {showForm && (
        <div className="card rounded-xl overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
            <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Create staff account</p>
            <button type="button" onClick={generatePassword} className="text-xs font-bold text-brand-700">Generate secure password</button>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
            {error && <ErrorBanner message={error} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Full name <span className="text-red-500">*</span></label>
                <input aria-label="Full name" type="text" placeholder="e.g. Pedro Reyes" {...register('full_name')}
                  className={`input-field rounded-lg ${errors.full_name ? 'input-error' : ''}`} />
                {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Account type <span className="text-red-500">*</span></label>
                <select aria-label="Account type" {...register('account_type')} className={`input-field rounded-lg ${errors.account_type ? 'input-error' : ''}`}>
                  <option value="">Select account type…</option>
                  <option value="commercial_staff">Commercial Services Staff</option>
                  <option value="ecmd_staff">ECMD Staff</option>
                  <option value="maintenance_personnel">Maintenance Personnel</option>
                  <option value="system_supervisor">System Supervisor</option>
                </select>
                {errors.account_type && <p className="mt-1 text-xs text-red-600">{errors.account_type.message}</p>}
                <p className="mt-1 text-[11px] text-gray-500">Choose the account type that matches the staff member’s work. Each account can open only its assigned workspace.</p>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Email <span className="text-red-500">*</span></label>
                <input aria-label="Email" type="email" placeholder="name@mrwd.gov.ph" {...register('email')}
                  className={`input-field rounded-lg ${errors.email ? 'input-error' : ''}`} />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Temporary password <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <input aria-label="Password" type={showPassword ? 'text' : 'password'} placeholder="Use at least 8 characters" {...register('password')}
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
                {creating ? <><Spinner className="w-4 h-4 border-2 border-white" /> Creating…</> : 'Create account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {staff.length > 0 && (
        <div className="qol-filter-bar card rounded-xl p-4 sm:p-5">
          <div><p className="mb-1.5 text-xs font-bold text-gray-600">Search</p><SearchField value={search} onChange={event => setSearch(event.target.value)} onClear={() => setSearch('')} placeholder="Name, email, or account type" /></div>
          <div className="mt-3 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <label className="block text-xs font-bold text-gray-600">Account type<select name="staffaccountspage-role-filter-6" value={roleFilter} onChange={event => setRoleFilter(event.target.value)} className="input-field mt-1.5 rounded-lg text-sm"><option value="all">All account types</option><option value="commercial_staff">Commercial Services Staff</option><option value="ecmd_staff">ECMD Staff</option><option value="maintenance_personnel">Maintenance Personnel</option><option value="system_supervisor">System Supervisor</option></select></label>
            <label className="block text-xs font-bold text-gray-600">Status<select name="staffaccountspage-account-filter-7" value={accountFilter} onChange={event => setAccountFilter(event.target.value)} className="input-field mt-1.5 rounded-lg text-sm"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Deactivated</option></select></label>
            <label className="block text-xs font-bold text-gray-600">Sort<select name="staffaccountspage-sort-by-8" value={sortBy} onChange={event => setSortBy(event.target.value)} className="input-field mt-1.5 rounded-lg text-sm"><option value="name">Name A–Z</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
            <button onClick={resetFilters} className="btn-secondary rounded-lg text-sm min-[420px]:col-span-2 lg:col-span-1">Clear filters</button>
          </div>
        </div>
      )}

      {loading && staff.length === 0 ? (
        <PageLoader label="Loading staff accounts…" />
      ) : staff.length === 0 ? (
        <EmptyState icon={<AppIcon name="users" className="h-9 w-9" />} title="No staff accounts yet" description='Click "New account" to create a Commercial Services, ECMD, Maintenance Personnel, or System Supervisor login.' />
      ) : filteredStaff.length === 0 ? (
        <div className="card rounded-xl p-10 text-center text-gray-500">No staff accounts match the current search or filters.</div>
      ) : (
        <>
          <div className="hidden xl:block card min-w-0 overflow-hidden rounded-xl p-2">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[25%]" />
                <col className="w-[22%]" />
                <col className="w-[16%]" />
                <col className="w-[25%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-200 text-left">
                  {['Staff Member', 'Account type & Access', 'Availability', 'Workspace', 'Action'].map(header => (
                    <th key={header} className="px-5 py-3 font-black text-gray-500 uppercase tracking-wider text-xs">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStaff.map(account => {
                  return (
                    <tr key={account.id} className={`hover:bg-gray-50 ${account.is_active === false ? 'bg-gray-50 opacity-75' : ''}`}>
                      <td className="px-5 py-4 align-top">
                        <p className="font-bold text-gray-900">{account.full_name}</p>
                        <p className="mt-1 break-all text-xs text-gray-500">{account.email}</p>
                        <p className="mt-1.5 text-xs font-medium text-gray-500">Created {timeAgo(account.created_at)}</p>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex flex-col items-start gap-2">
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-black uppercase tracking-wide border rounded ${ACCOUNT_BADGE[accountTypeKey(account)] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                            {ACCOUNT_LABEL[accountTypeKey(account)] || account.role}
                          </span>
                          <span className={`inline-flex px-2 py-1 rounded border text-xs font-black uppercase ${account.is_active === false ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                            {account.is_active === false ? 'Inactive' : 'Active'}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        {account.role === 'maintenance_personnel' ? (
                          <div>
                            <p className="text-xs font-bold capitalize text-gray-700">{String(account.availability_status || 'available').replace('_', ' ')}</p>
                            <p className="mt-1 break-words text-xs text-gray-500">{account.availability_note || 'No availability note'}</p>
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <p className="text-xs leading-5 break-words text-gray-500">
                          {accountTypeKey(account) === 'commercial_staff' && 'Commercial Services workspace only'}
                          {accountTypeKey(account) === 'ecmd_staff' && 'ECMD workspace only'}
                          {accountTypeKey(account) === 'maintenance_personnel' && 'Maintenance task workspace only'}
                          {accountTypeKey(account) === 'system_supervisor' && 'System Administration workspace only'}
                        </p>
                      </td>
                      <td className="px-5 py-4 align-top">{accountActions(account)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="xl:hidden space-y-3">
            {filteredStaff.map(account => {
              return (
                <div key={account.id} className="card rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-gray-900">{account.full_name}</p>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 truncate">{account.email}</p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-black uppercase border rounded ${ACCOUNT_BADGE[accountTypeKey(account)] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {ACCOUNT_LABEL[accountTypeKey(account)] || account.role}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap"><span className={`px-2 py-1 rounded border text-xs font-black uppercase ${account.is_active === false ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>{account.is_active === false ? 'Inactive' : 'Active'}</span>{account.role === 'maintenance_personnel' && <span className="px-2 py-1 rounded border bg-gray-50 text-gray-600 border-gray-200 text-xs font-black uppercase">{String(account.availability_status || 'available').replace('_', ' ')}</span>}</div>
                  <p className="mt-2 text-xs text-gray-500">
                    {accountTypeKey(account) === 'commercial_staff' && 'Commercial Services workspace only'}
                    {accountTypeKey(account) === 'ecmd_staff' && 'ECMD workspace only'}
                    {accountTypeKey(account) === 'maintenance_personnel' && 'Maintenance task workspace only'}
                    {accountTypeKey(account) === 'system_supervisor' && 'System Administration workspace only'}
                  </p>
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-500">Created {timeAgo(account.created_at)}</p>
                    {accountActions(account)}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <Dialog
        open={Boolean(managedAccount)}
        title={managedAccount?.full_name || 'Staff account'}
        description={managedAccount?.email || ''}
        onClose={() => setManageAccountId(null)}
        maxWidth="max-w-lg"
      >
        {managedAccount ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded border px-2.5 py-1 text-xs font-black uppercase tracking-wide ${ACCOUNT_BADGE[accountTypeKey(managedAccount)] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {ACCOUNT_LABEL[accountTypeKey(managedAccount)] || managedAccount.role}
              </span>
              <span className={`inline-flex rounded border px-2.5 py-1 text-xs font-black uppercase ${managedAccount.is_active === false ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                {managedAccount.is_active === false ? 'Inactive' : 'Active'}
              </span>
              {managedAccount.id === currentUser?.id ? <span className="inline-flex rounded border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-black uppercase text-brand-700">Your account</span> : null}
              <span className="inline-flex rounded border border-navy-100 bg-navy-50 px-2.5 py-1 text-xs font-black uppercase text-navy-700">{accessModuleLabel(managedAccount)}</span>
            </div>

            <div className="space-y-2">
              <button type="button" onClick={() => handlePasswordReset(managedAccount)} disabled={actionId === managedAccount.id || managedAccount.is_active === false} className="flex min-h-11 w-full items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45">
                <span><span className="block text-sm font-black text-navy-900">Send password reset</span><span className="mt-0.5 block text-xs text-gray-500">Send a secure password reset link to this staff member’s email.</span></span>
                <span className="font-black text-navy-600" aria-hidden="true">↗</span>
              </button>

              {managedAccount.id !== currentUser?.id ? (
                <button type="button" onClick={() => handleAccountStatus(managedAccount)} disabled={actionId === managedAccount.id} className={`flex min-h-11 w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${managedAccount.is_active === false ? 'border-green-200 bg-green-50 hover:bg-green-100' : 'border-red-200 bg-red-50 hover:bg-red-100'}`}>
                  <span><span className={`block text-sm font-black ${managedAccount.is_active === false ? 'text-green-800' : 'text-red-800'}`}>{managedAccount.is_active === false ? 'Activate account' : 'Deactivate account'}</span><span className="mt-0.5 block text-xs text-gray-500">{managedAccount.is_active === false ? "Restore this staff member's access to the system." : 'Prevent this staff member from signing in.'}</span></span>
                  <span className={managedAccount.is_active === false ? 'text-green-700' : 'text-red-700'} aria-hidden="true"><AppIcon name={managedAccount.is_active === false ? 'check' : 'alert'} className="h-5 w-5" /></span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(deactivationAccount)}
        title="Deactivate staff account?"
        message={deactivationAccount ? `${deactivationAccount.full_name} will no longer be able to sign in. Active assignments must be reassigned before deactivation can succeed.` : ''}
        confirmLabel="Deactivate account"
        danger
        loading={Boolean(deactivationAccount && actionId === deactivationAccount.id)}
        onCancel={() => setDeactivationAccount(null)}
        onConfirm={async () => {
          const account = deactivationAccount
          if (!account) return
           if (await applyAccountStatus(account)) {
             setDeactivationAccount(null)
             setManageAccountId(null)
           }
        }}
      />

    </div>
  )
}
