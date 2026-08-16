import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import { ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import AppIcon from '../../components/ui/AppIcon'

function StatCard({ label, value, detail, icon }) {
  return (
    <div className="card rounded-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-3xl font-black text-navy-900">{value}</p>
          <p className="mt-1 text-xs font-black uppercase tracking-wider text-gray-500">{label}</p>
          <p className="mt-2 text-xs leading-5 text-gray-400">{detail}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
          <AppIcon name={icon} className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

export default function SystemDashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setData(await apiFetch('/operations/system-bootstrap'))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const summary = useMemo(() => {
    const staff = data?.staff || []
    const departments = data?.departments || []
    const departmentMap = Object.fromEntries(departments.map(item => [item.id, String(item.code || '').toUpperCase()]))
    const codeFor = account => departmentMap[account.department_id] || ''
    return {
      commercial: staff.filter(account => account.role === 'admin' && codeFor(account) === 'COMMERCIAL').length,
      ecmd: staff.filter(account => account.role === 'admin' && codeFor(account) === 'ECMD').length,
      maintenance: staff.filter(account => account.role === 'maintenance_personnel').length,
      approvals: (data?.approvals || []).filter(item => item.status === 'pending').length,
    }
  }, [data])

  if (loading && !data) return <PageLoader label="Loading system administration..." />

  const tools = [
    { to: '/system/staff-accounts', label: 'Staff Accounts', description: 'Create separate Commercial Services, ECMD, Maintenance Personnel, and System Supervisor login accounts.', icon: 'users' },
    { to: '/system/departments-access', label: 'Departments & Access', description: 'Review department records, assignments, approvals, and access configuration.', icon: 'tool' },
    { to: '/system/audit-log', label: 'Audit Log', description: 'Review important account and system actions for accountability.', icon: 'clipboard' },
  ]

  return (
    <div className="space-y-6">
      <div className="page-band wave-header rounded-2xl px-5 py-6 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gold-400">System Administration</p>
        <div className="mt-1 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-2xl font-black text-white sm:text-3xl">System Supervisor Dashboard</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-navy-300">
              Welcome, {user?.full_name?.split(' ')[0] || 'Supervisor'}. Manage accounts and access without entering the Commercial Services or ECMD workspaces.
            </p>
          </div>
          <button type="button" onClick={load} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-xs font-black text-white hover:bg-white/10">
            <AppIcon name="refresh" className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <section className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4" aria-label="Account overview">
        <StatCard label="Commercial Services Accounts" value={summary.commercial} detail="Separate staff logins assigned only to Commercial Services." icon="billing" />
        <StatCard label="ECMD Accounts" value={summary.ecmd} detail="Separate ECMD office logins for dispatch and field operations." icon="assignment" />
        <StatCard label="Maintenance Personnel" value={summary.maintenance} detail="Field personnel accounts used for assigned maintenance tasks." icon="tool" />
        <StatCard label="Pending Approvals" value={summary.approvals} detail="System-level requests waiting for supervisor action." icon="alert" />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-black text-navy-900">System Administration Tools</h2>
          <p className="text-xs text-gray-500">Department work modules are intentionally not shown in the System Supervisor sidebar.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {tools.map(tool => (
            <button key={tool.to} type="button" onClick={() => navigate(tool.to)} className="card group rounded-xl p-5 text-left transition hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-md">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700 group-hover:bg-navy-800 group-hover:text-white">
                  <AppIcon name={tool.icon} className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-black text-navy-900">{tool.label}</h3>
                  <p className="mt-1 text-xs leading-5 text-gray-500">{tool.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
