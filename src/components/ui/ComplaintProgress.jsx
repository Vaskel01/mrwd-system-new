import AppIcon from './AppIcon'

const STEPS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'review', label: 'Commercial review' },
  { key: 'ecmd', label: 'Sent to ECMD' },
  { key: 'field', label: 'Field work' },
  { key: 'verification', label: 'ECMD verification' },
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
  resolved: 5,
  completed: 5,
}

function actionFor({ status, role, canCommercialReview, canEcmdOperate, hasOpenFollowUp }) {
  if (status === 'rejected') return ['Complaint rejected', 'Review the recorded reason. Commercial Services can restore the complaint if it was rejected by mistake.', 'alert']
  if (status === 'cancelled') return ['Complaint cancelled', 'No further work is planned for this complaint.', 'check']
  if (status === 'merged') return ['Duplicate complaint merged', 'Follow the main complaint for future updates.', 'copy']

  if (role === 'customer') {
    if (hasOpenFollowUp) return ['Your next step', 'Commercial Services needs more information. Reply to the request below so review can continue.', 'alert']
    if (status === 'resolved' || status === 'completed') return ['Your next step', 'Review the resolution. You can leave feedback if the issue has been fixed.', 'check']
    if (status === 'pending') return ['What happens next', 'Commercial Services is reviewing your report. No action is needed unless staff asks for more information.', 'clipboard']
    if (status === 'forwarded') return ['What happens next', 'The complaint is now with ECMD for assignment and field planning.', 'assignment']
    if (['assigned', 'en_route', 'in_progress', 'blocked'].includes(status)) return ['What happens next', 'Maintenance work is being handled by ECMD and assigned field personnel.', 'tool']
    if (status === 'awaiting_verification') return ['What happens next', 'Field work is complete. ECMD is checking the work before the complaint is marked resolved.', 'check']
  }

  if (canCommercialReview) {
    if (status === 'pending') return ['Next action', 'Review the complaint details, confirm the type and priority, then send it to ECMD or record a rejection reason.', 'clipboard']
    return ['Commercial status', 'ECMD owns field operations after handoff. You can monitor progress and record customer communication when needed.', 'assignment']
  }

  if (canEcmdOperate) {
    if (status === 'forwarded') return ['Next action', 'Assign available Maintenance Personnel or a crew so field work can begin.', 'assignment']
    if (['assigned', 'en_route', 'in_progress', 'blocked'].includes(status)) return ['Next action', 'Monitor field progress and respond to any help, reassignment, or access issue reported by Maintenance Personnel.', 'tool']
    if (status === 'awaiting_verification') return ['Next action', 'Review the completion notes. Verify the work to resolve the complaint or return it for more field work.', 'check']
    if (status === 'resolved' || status === 'completed') return ['Work verified', 'ECMD verification is complete and the complaint is resolved.', 'check']
  }

  if (role === 'maintenance_personnel') {
    if (status === 'assigned') return ['Your next step', 'Open the field details and start work when you are ready.', 'tool']
    if (['en_route', 'in_progress'].includes(status)) return ['Your next step', 'Continue the repair, record materials or manpower as needed, then submit completion notes when field work is finished.', 'tool']
    if (status === 'blocked') return ['Waiting for ECMD', 'You reported an issue that needs ECMD review. Update the complaint if the situation changes.', 'alert']
    if (status === 'awaiting_verification') return ['Field work submitted', 'ECMD is reviewing your completion notes. No additional field action is required unless the complaint is returned.', 'check']
  }

  return ['Current status', 'Review the complaint details and activity history below.', 'document']
}

export default function ComplaintProgress({ complaint, role, canCommercialReview = false, canEcmdOperate = false, hasOpenFollowUp = false }) {
  const currentStep = STATUS_STEP[complaint?.status] ?? 0
  const terminal = ['rejected', 'cancelled', 'merged'].includes(complaint?.status)
  const [actionTitle, actionText, actionIcon] = actionFor({ status: complaint?.status, role, canCommercialReview, canEcmdOperate, hasOpenFollowUp })

  return (
    <section className="space-y-3" aria-label="Complaint progress">
      {!terminal ? (
        <div className="card rounded-xl p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-black text-navy-900">Complaint progress</h2>
              <p className="mt-1 text-sm text-gray-500">See where this complaint is in the MRWD workflow.</p>
            </div>
            <span className="text-sm font-bold text-gray-600">Step {Math.min(currentStep + 1, STEPS.length)} of {STEPS.length}</span>
          </div>
          <ol className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">
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
        </div>
      ) : null}

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm" aria-hidden="true">
            <AppIcon name={actionIcon} className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-base font-black text-blue-950">{actionTitle}</h2>
            <p className="mt-1 text-sm leading-6 text-blue-900">{actionText}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
