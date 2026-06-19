import { useAuthStore } from '../../store/authStore'
import { useBillingStore } from '../../store/billingStore'

function StatusBadge({ status }) {
  return status === 'paid'
    ? <span className="inline-flex items-center px-2.5 py-0.5  text-xs font-semibold bg-green-100 text-green-800">✓ Paid</span>
    : <span className="inline-flex items-center px-2.5 py-0.5  text-xs font-semibold bg-red-100 text-red-700">Unpaid</span>
}

function formatPeso(amount) {
  return '₱' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })
}

function isOverdue(due_date, status) {
  return status === 'unpaid' && new Date(due_date) < new Date()
}

export default function BillingPage() {
  const user    = useAuthStore(s => s.user)
  const getMyBills = useBillingStore(s => s.getMyBills)
  const bills   = getMyBills(user.id)

  const unpaidBills   = bills.filter(b => b.status === 'unpaid')
  const totalUnpaid   = unpaidBills.reduce((sum, b) => sum + b.amount_due, 0)
  const latestBill    = bills[0]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Billing Statement</h1>
        <p className="text-gray-500 text-sm mt-0.5">Your water billing history and current dues</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card p-5">
          <p className="text-xs font-medium text-gray-500 mb-1">Current Bill</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{latestBill ? formatPeso(latestBill.amount_due) : '—'}</p>
          <p className="text-xs text-gray-400 mt-0.5">{latestBill?.billing_period}</p>
        </div>
        <div className={`card p-5 ${totalUnpaid > 0 ? 'border-red-200 bg-red-50/30' : ''}`}>
          <p className="text-xs font-medium text-gray-500 mb-1">Total Outstanding</p>
          <p className={`text-xl sm:text-2xl font-bold ${totalUnpaid > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {formatPeso(totalUnpaid)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {unpaidBills.length === 0 ? 'All bills paid ✓' : `${unpaidBills.length} unpaid bill${unpaidBills.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium text-gray-500 mb-1">Last Consumption</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{latestBill?.consumption ?? '—'} <span className="text-sm font-normal text-gray-400">cu.m.</span></p>
          <p className="text-xs text-gray-400 mt-0.5">{latestBill?.billing_period}</p>
        </div>
      </div>

      {/* Unpaid notice */}
      {unpaidBills.length > 0 && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200  px-4 sm:px-5 py-4 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-yellow-800">You have {unpaidBills.length} unpaid bill{unpaidBills.length > 1 ? 's' : ''}.</p>
            <p className="text-xs text-yellow-700 mt-0.5">
              Please settle your balance before the due date to avoid service interruption.
              Visit our office or call <span className="font-medium">(033) 123-4567</span>.
            </p>
          </div>
        </div>
      )}

      {/* Bills table */}
      <div className="card overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Billing History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left">
                <th className="px-3 sm:px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Period</th>
                <th className="px-3 sm:px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Consumption</th>
                <th className="px-3 sm:px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reading</th>
                <th className="px-3 sm:px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                <th className="px-3 sm:px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due Date</th>
                <th className="px-3 sm:px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {bills.map(b => (
                <tr key={b.id} className={`hover:bg-gray-50 transition-colors ${isOverdue(b.due_date, b.status) ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 sm:px-5 py-4 font-medium text-gray-900">{b.billing_period}</td>
                  <td className="px-4 sm:px-5 py-4 text-gray-600">{b.consumption} cu.m.</td>
                  <td className="px-4 sm:px-5 py-4 text-gray-500 text-xs">
                    {b.previous_reading} → {b.current_reading}
                  </td>
                  <td className="px-4 sm:px-5 py-4 font-semibold text-gray-900">{formatPeso(b.amount_due)}</td>
                  <td className="px-4 sm:px-5 py-4">
                    <span className={`text-sm ${isOverdue(b.due_date, b.status) ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      {isOverdue(b.due_date, b.status) && '⚠️ '}
                      {new Date(b.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </td>
                  <td className="px-4 sm:px-5 py-4"><StatusBadge status={b.status}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-4 text-center">
        For billing concerns, visit our office at Water District, Calinog, Iloilo or call (033) 123-4567.
      </p>
    </div>
  )
}
