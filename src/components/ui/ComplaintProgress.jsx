const STEPS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'review', label: 'Commercial Services review' },
  { key: 'ecmd', label: 'Sent to WDLCD' },
  { key: 'field', label: 'Field work' },
  { key: 'resolved', label: 'Resolved' },
]

const STATUS_STEP = {
  pending: 1,
  forwarded: 2,
  assigned: 3,
  en_route: 3,
  in_progress: 3,
  blocked: 3,
  awaiting_verification: 4,
  resolved: 4,
  completed: 4,
}

export default function ComplaintProgress({ complaint }) {
  const currentStep = STATUS_STEP[complaint?.status] ?? 0
  const terminal = ['rejected', 'cancelled', 'merged'].includes(complaint?.status)

  if (terminal) return null

  return (
    <section className="card rounded-xl p-4 sm:p-5" aria-label="Complaint progress">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-black text-navy-900">Complaint progress</h2>
              <p className="mt-1 text-sm text-gray-500">See where this complaint is in the MRWD workflow.</p>
            </div>
            <span className="text-sm font-bold text-gray-600">Step {Math.min(currentStep + 1, STEPS.length)} of {STEPS.length}</span>
          </div>
          <ol className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 xl:grid-cols-5">
            {STEPS.map((step, index) => {
              const done = index < currentStep || currentStep === STEPS.length - 1
              const active = index === currentStep && currentStep !== STEPS.length - 1
              return (
                <li key={step.key} className="relative min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-black ${done ? 'border-green-600 bg-green-600 text-white' : active ? 'border-navy-700 bg-navy-700 text-white' : 'border-gray-300 bg-white text-gray-500'}`}>
                      {done ? '✓' : index + 1}
                    </span>
                    <span className={`text-sm font-bold leading-5 ${done || active ? 'text-gray-900' : 'text-gray-500'}`}>{step.label}</span>
                  </div>
                </li>
              )
            })}
          </ol>
    </section>
  )
}
