import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useBillingStore } from '../../store/billingStore'
import { PageLoader, ErrorBanner, EmptyState } from '../../components/ui/Feedback'
import AppIcon from '../../components/ui/AppIcon'
import ServiceAccountsPanel from '../../components/ui/ServiceAccountsPanel'
import Dialog from '../../components/ui/Dialog'
import { formatPeso, billDate, isOverdue } from '../../lib/billingDisplay'

function Statement({ bill }) {
  const details = bill.statement_details || {}
  const info = [
    ['Account number', bill.account_number], ['Bill number', details.bill_number],
    ['Registered name', details.registered_name], ['Service address', details.service_address],
    ['Account type', details.account_type], ['Meter number', details.meter_number],
    ['Meter size', details.meter_size], ['Service period', details.service_period],
    ['Reading date', billDate(details.reading_date)], ['Due date', billDate(bill.due_date)],
  ]
  const charges = [['Water bill', details.water_charge], ['Arrears', details.arrears], ['Other charges', details.other_charges], ['Meter maintenance', details.meter_maintenance]]
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-gray-500">Metro Roxas Water District</p><h3 className="mt-1 text-xl font-bold text-navy-900">Statement of account</h3><p className="text-sm text-gray-600">{bill.billing_period}</p></div>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${bill.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{bill.status === 'paid' ? 'Paid · imported status' : isOverdue(bill.due_date, bill.status) ? 'Past due · imported status' : 'Unpaid · imported status'}</span>
    </div>
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {info.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-gray-900">{value || 'Not provided'}</dd></div>)}
    </dl>
    <div className="grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-3 text-center">
      {[['Previous reading', bill.previous_reading], ['Present reading', bill.current_reading], ['Water used (cu.m.)', bill.consumption]].map(([label, value]) => <div key={label}><p className="text-xs text-gray-500">{label}</p><p className="mt-1 font-bold text-navy-900">{value ?? 'Not provided'}</p></div>)}
    </div>
    <div className="grid gap-5 md:grid-cols-2">
      <section aria-label="Charge breakdown">
        <h4 className="mb-2 text-sm font-bold text-navy-900">Charge breakdown</h4>
        <dl className="divide-y divide-gray-100">{charges.map(([label, value]) => <div key={label} className="flex justify-between gap-3 py-2 text-sm"><dt className="text-gray-600">{label}</dt><dd className="text-right font-semibold text-gray-900">{formatPeso(value)}</dd></div>)}</dl>
      </section>
      <section className="rounded-xl border border-gray-200 p-4" aria-label="Statement totals">
        <p className="text-xs font-bold text-gray-500">Amount on or before due date</p>
        <p className="mt-1 text-3xl font-black text-navy-900">{formatPeso(bill.amount_due)}</p>
        <dl className="mt-3 space-y-3 text-sm">
          {[['Pay immediately', details.pay_immediately], ['Late-payment penalty', details.penalty], ['Amount after due date', details.amount_after_due]].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="text-gray-600">{label}</dt><dd className="text-right font-bold text-gray-900">{formatPeso(value)}</dd></div>)}
        </dl>
      </section>
    </div>
    <p className="text-xs leading-relaxed text-gray-500">These are the amounts printed in the imported statement, not a live balance or payment receipt. Arrears and “pay immediately” may already be included in the total; do not add them again. Missing amounts are not assumed to be zero. Confirm any updated balance or penalty with MRWD.</p>
  </div>
}

export default function BillingPage() {
  const user = useAuthStore(s => s.user)
  const allBills = useBillingStore(s => s.bills)
  const billsOwner = useBillingStore(s => s.ownerId)
  const loading = useBillingStore(s => s.loading)
  const error = useBillingStore(s => s.error)
  const fetchBills = useBillingStore(s => s.fetchBills)
  const [selectedAccount, setSelectedAccount] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [openBillId, setOpenBillId] = useState(null)
  const bills = (billsOwner === user?.id ? allBills : [])
    .filter(bill => !accountNumber || bill.account_number === accountNumber)
    .toSorted((a, b) => String(b.due_date).localeCompare(String(a.due_date)) || String(b.issued_at).localeCompare(String(a.issued_at)))
  const latestBill = bills[0]
  const openBill = bills.find(bill => bill.id === openBillId)
  const updatedAt = bills.map(bill => bill.source_updated_at).filter(Boolean).sort().at(-1)

  useEffect(() => { fetchBills() }, [fetchBills])

  if (loading && !bills.length) return <PageLoader label="Loading your billing history…" />

  return <div className="space-y-5">
    <div className="page-band wave-header page-header">
      <p className="text-gold-400 text-xs font-bold uppercase tracking-[.15em] mb-1.5">Customer account</p>
      <h1 className="font-display font-black text-white text-2xl sm:text-3xl">Billing</h1>
      <p className="text-navy-300 text-sm mt-1">View your MRWD statements and water consumption.</p>
    </div>
    <ServiceAccountsPanel selected={selectedAccount} onSelect={(id, account) => { setSelectedAccount(id); setAccountNumber(account?.account_number || ''); setOpenBillId(null) }} />
    {error && <ErrorBanner message={error} onRetry={fetchBills} />}
    <p className="text-xs text-gray-500">{updatedAt ? `Billing data last imported: ${new Date(updatedAt).toLocaleString('en-PH')}. Payments appear after MRWD imports an updated report.` : 'No confirmed billing import time is available. Confirm these records and balances with MRWD.'}</p>
    {latestBill && <section className="card rounded-xl p-4 sm:p-6" aria-labelledby="latest-statement">
      <h2 id="latest-statement" className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500">{accountNumber ? 'Latest statement' : 'Most recent statement across linked accounts'}</h2>
      <Statement bill={latestBill} />
    </section>}
    <section className="card rounded-xl overflow-hidden" aria-labelledby="billing-history">
      <div className="border-b border-gray-200 bg-gray-50 p-4">
        <h2 id="billing-history" className="font-bold text-navy-900">Billing history</h2>
        <p className="mt-1 text-xs text-gray-500">Select a statement to see its details. Historical totals are not added together because newer bills may include arrears.</p>
      </div>
      {!bills.length ? <div className="p-8"><EmptyState icon={<AppIcon name="billing" className="h-10 w-10" />} title="No bills available" description="Bills appear after MRWD imports a report and verifies your service-account link. No records does not mean there is no balance." /></div> :
        <ul className="divide-y divide-gray-100">
          {bills.map(bill => <li key={bill.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0"><p className="font-bold text-gray-900">{bill.billing_period}</p><p className="break-words text-xs text-gray-500">Account {bill.account_number || 'not recorded'} · Due {billDate(bill.due_date)}</p><p className="mt-1 text-xs font-semibold text-gray-600">{bill.status === 'paid' ? 'Paid' : isOverdue(bill.due_date, bill.status) ? 'Past due' : 'Unpaid'} · {bill.consumption} cu.m.</p></div>
            <div className="flex flex-wrap items-center gap-3"><div className="text-right"><p className="font-bold text-navy-900">{formatPeso(bill.amount_due)}</p><p className="text-xs text-gray-500">On or before due date</p></div><button type="button" className="btn-secondary" aria-label={`View statement ${bill.billing_period} for account ${bill.account_number || 'not recorded'}`} onClick={() => setOpenBillId(bill.id)}>View statement</button></div>
          </li>)}
        </ul>}
    </section>
    <section className="card rounded-xl p-4 sm:p-5" aria-labelledby="how-to-pay">
      <h2 id="how-to-pay" className="font-bold text-navy-900">How to pay</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-700">
        <li>Have your MRWD account number or latest official bill ready.</li>
        <li>Pay at the MRWD cashier or a currently authorized payment center.</li>
        <li>Keep your official receipt. Payment status updates after a new billing report is imported.</li>
      </ol>
      <p className="mt-3 text-xs text-gray-500">Confirm payment channels, office hours, and service notices with MRWD. This page does not accept online payments.</p>
    </section>
    <Dialog open={Boolean(openBill)} title="Bill details" onClose={() => setOpenBillId(null)} maxWidth="max-w-3xl">
      {openBill && <div className="p-4 sm:p-6"><Statement bill={openBill} /></div>}
    </Dialog>
  </div>
}
