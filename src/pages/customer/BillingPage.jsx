import { useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useBillingStore } from '../../store/billingStore'
import { PageLoader, ErrorBanner, EmptyState } from '../../components/ui/Feedback'

function formatPeso(amount) {
  return '₱' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })
}

function isOverdue(due_date, status) {
  return status === 'unpaid' && new Date(due_date) < new Date()
}

function ConsumptionBar({ consumption, max = 30 }) {
  const pct = Math.min((consumption / max) * 100, 100)
  const color = pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-400' : 'bg-gold-500'
  return (
    <div className="w-full h-2 bg-gray-100 mt-1">
      <div className={`h-2 ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function BillingPage() {
  const user = useAuthStore(s => s.user)
  const getMyBills = useBillingStore(s => s.getMyBills)
  const loading = useBillingStore(s => s.loading)
  const error = useBillingStore(s => s.error)
  const fetchBills = useBillingStore(s => s.fetchBills)
  const bills = getMyBills(user.id)

  useEffect(() => { fetchBills() }, [fetchBills])

  const unpaidBills  = bills.filter(b => b.status === 'unpaid')
  const totalUnpaid  = unpaidBills.reduce((sum, b) => sum + b.amount_due, 0)
  const latestBill   = bills[0]
  const overdueBills = bills.filter(b => isOverdue(b.due_date, b.status))

  if (loading && bills.length === 0) {
    return <PageLoader label="Loading your billing history..." />
  }

  if (error && bills.length === 0) {
    return (
      <div className="space-y-6">
        <div className="page-band wave-header rounded-2xl px-6 py-6 relative overflow-hidden">
          <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Customer Portal</p>
          <h1 className="font-display font-black text-white text-2xl sm:text-3xl">Billing Statement</h1>
        </div>
        <ErrorBanner message={error} onRetry={fetchBills} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-band wave-header rounded-2xl px-6 py-6 relative overflow-hidden">
        <svg className="absolute bottom-0 left-0 right-0 w-full opacity-10" viewBox="0 0 1200 60" preserveAspectRatio="none">
          <path d="M0,30 C200,0 400,60 600,30 C800,0 1000,60 1200,30 L1200,60 L0,60 Z" fill="white"/>
        </svg>
        <div className="relative flex items-end justify-between">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Customer Portal</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl">Billing Statement</h1>
            <p className="text-navy-300 text-sm mt-1">Account: <span className="text-white font-semibold">{user?.full_name}</span></p>
          </div>
          <p className="font-display font-black text-4xl leading-none" style={{ color: '#e6b020' }}>{formatPeso(totalUnpaid)}</p>
        </div>
      </div>

      {/* Overdue alert banner */}
      {overdueBills.length > 0 && (
        <div className="rounded-xl border-l-4 border-red-600 bg-red-50 px-4 py-3 flex items-start gap-3">
          <span className="text-red-600 font-black text-lg shrink-0">!</span>
          <div>
            <p className="text-sm font-bold text-red-800">Overdue Balance — {formatPeso(overdueBills.reduce((s,b)=>s+b.amount_due,0))}</p>
            <p className="text-xs text-red-700 mt-0.5">{overdueBills.length} bill{overdueBills.length>1?'s':''} past due. Settle now to avoid service interruption. Call <strong>(033) 123-4567</strong>.</p>
          </div>
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card accent-navy rounded-xl">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Latest Bill</p>
          <p className="font-display font-black text-3xl text-navy-900 leading-none">{latestBill ? formatPeso(latestBill.amount_due) : '—'}</p>
          <p className="text-xs text-gray-400 mt-1.5">{latestBill?.billing_period}</p>
        </div>
        <div className={`stat-card rounded-xl ${totalUnpaid > 0 ? 'accent-red' : 'accent-green'}`}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Outstanding</p>
          <p className={`font-display font-black text-3xl leading-none ${totalUnpaid > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatPeso(totalUnpaid)}</p>
          <p className="text-xs text-gray-400 mt-1.5">{unpaidBills.length === 0 ? 'All clear ✓' : `${unpaidBills.length} unpaid`}</p>
        </div>
        <div className="stat-card accent-amber rounded-xl">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Consumption</p>
          <p className="font-display font-black text-3xl text-navy-900 leading-none">{latestBill?.consumption ?? '—'} <span className="text-xs font-normal text-gray-400">cu.m.</span></p>
          <ConsumptionBar consumption={latestBill?.consumption ?? 0} />
        </div>
      </div>

      {/* Billing history */}
      <div className="card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="font-bold text-gray-900 text-sm uppercase tracking-wide">Billing History</h2>
          <span className="text-xs text-gray-400">{bills.length} records</span>
        </div>

        {bills.length === 0 ? (
          <div className="p-8">
            <EmptyState icon="🧾" title="No bills yet"
              description="Your billing statements will show up here once they're issued." />
          </div>
        ) : (
        <>
        {/* Mobile: card list */}
        <div className="sm:hidden divide-y divide-gray-100">
          {bills.map(b => (
            <div key={b.id} className={`p-4 ${isOverdue(b.due_date, b.status) ? 'bg-red-50' : ''}`}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-bold text-gray-900 text-sm">{b.billing_period}</p>
                  <p className="text-xs text-gray-400">{b.consumption} cu.m.</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-gray-900">{formatPeso(b.amount_due)}</p>
                  {b.status === 'paid'
                    ? <span className="text-xs font-bold text-green-600">✓ PAID</span>
                    : <span className={`text-xs font-bold ${isOverdue(b.due_date, b.status) ? 'text-red-600' : 'text-amber-600'}`}>
                        {isOverdue(b.due_date, b.status) ? '⚠ OVERDUE' : 'UNPAID'}
                      </span>
                  }
                </div>
              </div>
              <p className="text-xs text-gray-400">Due: {new Date(b.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </div>
          ))}
        </div>

        {/* Desktop: table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                {['Period','Consumption','Reading','Amount','Due Date','Status'].map(h => (
                  <th key={h} className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bills.map(b => (
                <tr key={b.id} className={`transition-colors hover:bg-gray-50 ${isOverdue(b.due_date, b.status) ? 'bg-red-50/60' : ''}`}>
                  <td className="px-5 py-3.5 font-semibold text-gray-900">{b.billing_period}</td>
                  <td className="px-5 py-3.5 text-gray-600">{b.consumption} cu.m.</td>
                  <td className="px-5 py-3.5 text-gray-400 text-xs font-mono">{b.previous_reading} → {b.current_reading}</td>
                  <td className="px-5 py-3.5 font-black text-gray-900">{formatPeso(b.amount_due)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-sm ${isOverdue(b.due_date, b.status) ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                      {isOverdue(b.due_date, b.status) && '⚠ '}
                      {new Date(b.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {b.status === 'paid'
                      ? <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-green-100 text-green-800">✓ PAID</span>
                      : <span className={`inline-flex items-center px-2 py-0.5 text-xs font-bold ${isOverdue(b.due_date,b.status) ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {isOverdue(b.due_date,b.status) ? 'OVERDUE' : 'UNPAID'}
                        </span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-4 text-center">
        For billing concerns — Metro Roxas Water District Office · (033) 123-4567
      </p>
    </div>
  )
}
