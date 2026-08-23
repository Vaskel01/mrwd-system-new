import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import { EmptyState, ErrorBanner, PageLoader } from '../../components/ui/Feedback'
import PageHeader from '../../components/ui/PageHeader'
import MetricCard from '../../components/ui/MetricCard'
import AppIcon from '../../components/ui/AppIcon'

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
    { to: '/system/staff-accounts', label: 'Staff Accounts', description: 'Create staff accounts, reset access, and activate or deactivate logins.', icon: 'users' },
    { to: '/system/departments-access', label: 'Departments & Access', description: 'Manage department assignments, staff access, approvals, and archived records.', icon: 'tool' },
    { to: '/system/audit-log', label: 'Activity & Security Log', description: 'Review important staff, account, security, export, and system activity.', icon: 'clipboard' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System Supervisor"
        title="System Administration"
        description={`Welcome, ${user?.full_name?.split(' ')[0] || 'Supervisor'}. Manage staff access, approvals, security, announcements, and system health.`}
        actions={<button type="button" onClick={load} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-sm font-bold text-white hover:bg-white/10"><AppIcon name="refresh" className="h-4 w-4" />Refresh</button>}
      />

      {error && <ErrorBanner message={error} onRetry={load} />}

      <section className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4" aria-label="Account overview">
        <MetricCard label="Commercial staff" value={summary.commercial} detail="Active staff accounts assigned to Commercial Services." icon="billing" />
        <MetricCard label="ECMD staff" value={summary.ecmd} detail="Active ECMD staff accounts for dispatch and field operations." icon="assignment" />
        <MetricCard label="Maintenance Personnel" value={summary.maintenance} detail="Field accounts used for assigned maintenance work." icon="tool" />
        <MetricCard label="Pending approvals" value={summary.approvals} detail="Requests waiting for System Supervisor review." icon="alert" onClick={() => navigate('/system/departments-access')} />
      </section>

      <section className="card overflow-hidden rounded-xl" aria-labelledby="system-attention-title">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 id="system-attention-title" className="font-display text-lg font-black text-navy-900">Needs attention</h2>
          <p className="mt-1 text-sm text-gray-500">Items that may need a System Supervisor decision.</p>
        </div>
        {summary.approvals > 0 ? (
          <button type="button" onClick={() => navigate('/system/departments-access')} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50">
            <div><p className="font-bold text-gray-900">{summary.approvals} pending approval{summary.approvals === 1 ? '' : 's'}</p><p className="mt-1 text-sm text-gray-500">Review archive or access requests waiting for a decision.</p></div>
            <span className="text-sm font-bold text-navy-700">Review</span>
          </button>
        ) : (
          <div className="p-4"><EmptyState icon={<AppIcon name="check" className="h-9 w-9" />} title="No pending approvals" description="There are no approval requests waiting for System Administration right now." /></div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-black text-navy-900">Administration tools</h2>
          <p className="text-xs text-gray-500">Use these tools to manage access and system records. Commercial and ECMD work remain in their own staff workspaces.</p>
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
