import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useComplaintStore } from '../../store/complaintStore'
import { apiFetch } from '../../lib/api'
import { COMPLAINT_TYPES } from '../../config/staticData'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { ErrorBanner, PageLoader, Spinner } from '../../components/ui/Feedback'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import RejectionDialog from '../../components/ui/RejectionDialog'
import InlineMap from '../../components/ui/InlineMap'
import Timeline from '../../components/ui/Timeline'
import FeedbackBox from '../../components/ui/FeedbackBox'
import AppIcon from '../../components/ui/AppIcon'
import PriorityScoreHelp from '../../components/ui/PriorityScoreHelp'
import RefreshNotice from '../../components/ui/RefreshNotice'
import TaskResourcesPanel from '../../components/ui/TaskResourcesPanel'
import { useComplaintDetailRefresh } from '../../hooks/useComplaintRefresh'
import { CAPABILITIES, hasCapability, homeForUser } from '../../lib/accessControl'

const NEXT_TASK_STATUS = {
  assigned: { value: 'in_progress', label: 'Start Work', icon: 'tool' },
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function DetailRow({ label, children }) {
  return <div className="py-3 border-b border-gray-100 last:border-0"><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p><div className="text-sm text-gray-700 break-words">{children}</div></div>
}

function Modal({ open, title, subtitle, onClose, children, maxWidth = 'max-w-lg' }) {
  if (!open) return null
  const titleId = `dialog-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="fixed inset-0 z-50 bg-navy-950/60 backdrop-blur-sm p-4 flex items-center justify-center" onMouseDown={onClose}>
      <section className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[92vh] overflow-y-auto`} onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="page-band wave-header px-6 py-5">
          <h2 id={titleId} className="font-display font-black text-white text-xl">{title}</h2>
          {subtitle ? <p className="text-navy-300 text-xs mt-1">{subtitle}</p> : null}
        </div>
        <div className="p-6">{children}</div>
      </section>
    </div>
  )
}

function ClassifierDetails({ complaint }) {
  const hasStoredAnalysis = Boolean(complaint.classifier_version || complaint.classification_keywords?.length)
  const confidence = complaint.classification_confidence == null ? null : Math.round(Number(complaint.classification_confidence))
  const sentimentStyles = { urgent: 'bg-red-100 text-red-800 border-red-200', negative: 'bg-amber-100 text-amber-800 border-amber-200', neutral: 'bg-green-100 text-green-800 border-green-200' }
  const keywordAdjustment = Math.max(-10, Math.min(50, (complaint.classification_keywords || []).reduce((sum, item) => sum + (Number(item.priority_weight) || 0), 0)))
  const photoAdjustment = complaint.photo_urls?.length ? 10 : 0
  const sentimentAdjustment = Number(complaint.sentiment_score || 0)
  const algorithmScore = Number(complaint.algorithm_priority_score ?? complaint.priority_score ?? 0)
  const finalScore = complaint.priority_is_overridden ? algorithmScore : Number(complaint.priority_score || 0)
  return <div className="card rounded-xl p-5"><div className="flex items-start justify-between gap-3 mb-4"><div><h2 className="font-display font-bold text-navy-900">Automated Classification</h2><p className="text-xs text-gray-400 mt-1">Dataset-backed analysis visible only to administrators</p></div>{complaint.classifier_version && <span className="text-[10px] font-mono bg-gray-100 text-gray-500 px-2 py-1 rounded">{complaint.classifier_version}</span>}</div>{!hasStoredAnalysis ? <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center"><p className="text-sm font-bold text-gray-700">No stored classification analysis</p><p className="text-xs text-gray-400 mt-1">This is an older complaint.</p></div> : <><div className="grid grid-cols-2 gap-3"><div className="rounded-lg border border-gray-100 bg-gray-50 p-3"><p className="text-[10px] font-black text-gray-400 uppercase">Predicted Category</p><p className="text-sm font-bold text-navy-900 mt-1">{complaint.classified_category || complaint.complaint_type}</p></div><div className="rounded-lg border border-gray-100 bg-gray-50 p-3"><p className="text-[10px] font-black text-gray-400 uppercase">Confidence</p><p className="text-2xl font-black text-navy-900">{confidence ?? '—'}{confidence != null && <span className="text-xs font-normal text-gray-400">%</span>}</p></div><div className="rounded-lg border border-gray-100 bg-gray-50 p-3"><p className="text-[10px] font-black text-gray-400 uppercase">Text Sentiment</p><span className={`inline-flex mt-1.5 px-2 py-1 rounded border text-xs font-black uppercase ${sentimentStyles[complaint.classification_sentiment] || sentimentStyles.neutral}`}>{complaint.classification_sentiment || 'neutral'}</span></div><div className="rounded-lg border border-gray-100 bg-gray-50 p-3"><p className="text-[10px] font-black text-gray-400 uppercase">Priority Class</p><div className="mt-1.5"><PriorityBadge priority={complaint.priority} /></div></div></div><div className="mt-4 rounded-xl border border-navy-100 bg-navy-50/60 p-4"><div className="flex items-center justify-between gap-3 mb-3"><div><p className="text-[10px] font-black text-navy-500 uppercase tracking-wider">Hybrid Priority Score</p><p className="text-xs text-gray-500 mt-0.5">Category rules + dataset severity + sentiment + photo evidence</p></div><p className="text-3xl font-black text-navy-900">{finalScore}<span className="text-xs font-normal text-gray-400">/100</span></p></div><div className="grid grid-cols-2 lg:grid-cols-4 gap-2"><div className="rounded-lg bg-white border border-gray-100 p-2.5"><p className="text-[9px] font-black text-gray-400 uppercase">Base Severity</p><p className="font-black text-navy-900 mt-1">+{Number(complaint.rule_score || 0)}</p></div><div className="rounded-lg bg-white border border-gray-100 p-2.5"><p className="text-[9px] font-black text-gray-400 uppercase">Keyword Severity</p><p className={`font-black mt-1 ${keywordAdjustment >= 0 ? 'text-green-700' : 'text-red-600'}`}>{keywordAdjustment >= 0 ? '+' : ''}{keywordAdjustment}</p></div><div className="rounded-lg bg-white border border-gray-100 p-2.5"><p className="text-[9px] font-black text-gray-400 uppercase">Sentiment</p><p className="font-black text-amber-700 mt-1">+{sentimentAdjustment}</p></div><div className="rounded-lg bg-white border border-gray-100 p-2.5"><p className="text-[9px] font-black text-gray-400 uppercase">Photo Evidence</p><p className="font-black text-blue-700 mt-1">+{photoAdjustment}</p></div></div></div>{complaint.classification_mismatch && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"><p className="text-xs font-bold text-amber-900">Category mismatch detected</p><p className="text-xs text-amber-700 mt-0.5">Selected “{complaint.complaint_type},” classified as “{complaint.classified_category}.”</p></div>}<div className="mt-4"><p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Matched Dataset Terms</p>{complaint.classification_keywords?.length ? <div className="flex flex-wrap gap-2">{complaint.classification_keywords.map((item, index) => <span key={`${item.id || item.term}-${index}`} className="inline-flex items-center gap-1 rounded-full border border-navy-100 bg-navy-50 px-2.5 py-1 text-xs font-bold text-navy-700">{item.term}<span className={Number(item.priority_weight) >= 0 ? 'text-green-700' : 'text-red-600'}>{Number(item.priority_weight) >= 0 ? '+' : ''}{item.priority_weight}</span></span>)}</div> : <p className="text-xs text-gray-400">No keyword matched.</p>}</div>{complaint.classification_reasons?.length > 0 && <div className="mt-4 pt-4 border-t border-gray-100"><p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Decision Explanation</p><ul className="space-y-1.5">{complaint.classification_reasons.map((reason, index) => <li key={index} className="text-xs text-gray-600 flex gap-2"><span className="text-gold-500">•</span><span>{reason}</span></li>)}</ul></div>}</>}</div>
}

function ClassifierAnalysis({ complaint }) {
  const base = Number(complaint.rule_score || 0)
  const keyword = Math.max(-10, Math.min(50, (complaint.classification_keywords || []).reduce((sum, item) => sum + (Number(item.priority_weight) || 0), 0)))
  const sentiment = Number(complaint.sentiment_score || 0)
  const photo = complaint.photo_urls?.length ? 10 : 0
  const finalScore = Number(complaint.algorithm_priority_score ?? complaint.priority_score ?? 0)
  const components = [
    { label: 'Base', value: base, color: 'bg-navy-700' },
    { label: 'Dataset', value: keyword, color: keyword >= 0 ? 'bg-green-600' : 'bg-red-500' },
    { label: 'Sentiment', value: sentiment, color: 'bg-amber-500' },
    { label: 'Photo', value: photo, color: 'bg-brand-500' },
  ]
  return (
    <div className="space-y-4">
      <section className="card rounded-xl p-5" aria-labelledby="score-composition-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1">
              <h2 id="score-composition-title" className="font-display font-bold text-navy-900">Priority Score Composition</h2>
              <PriorityScoreHelp />
            </div>
            <p className="text-xs text-gray-500 mt-1">Each block shows how the algorithm builds the recommendation.</p>
          </div>
          <p className="font-display font-black text-3xl text-navy-900">{finalScore}<span className="text-xs font-normal text-gray-400">/100</span></p>
        </div>
        <div className="mt-4 flex h-10 w-full overflow-hidden rounded-lg bg-gray-100" aria-label={`Base ${base}, dataset ${keyword}, sentiment ${sentiment}, photo ${photo}, final ${finalScore}`}>
          {components.map(component => {
            const width = Math.max(5, Math.abs(component.value))
            return <div key={component.label} className={`${component.color} min-w-[2.25rem] border-r border-white/60`} style={{ width: `${width}%` }} title={`${component.label}: ${component.value >= 0 ? '+' : ''}${component.value}`} />
          })}
        </div>
        <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {components.map((component, index) => (
            <li key={component.label} className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
              <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">{index + 1}. {component.label}</p>
              <p className="mt-1 font-black text-navy-900">{component.value >= 0 ? '+' : ''}{component.value}</p>
            </li>
          ))}
        </ol>
      </section>
      <ClassifierDetails complaint={complaint} />
    </div>
  )
}

function MaintenanceTaskActions({
  complaint,
  nextTaskStatus,
  busy,
  onAcknowledge,
  onNextStatus,
  onComplete,
  onPlan,
  onIssue,
  onCopyAddress,
  onOpenMap,
}) {
  const isActive = ['assigned', 'en_route', 'in_progress', 'blocked'].includes(complaint.status)
  const needsAcknowledgment = !complaint.acknowledged_at && ['assigned', 'en_route', 'in_progress'].includes(complaint.status)
  const canComplete = ['en_route', 'in_progress'].includes(complaint.status)

  return (
    <section className="card rounded-xl p-5 no-print" aria-labelledby="task-actions-title">
      <h2 id="task-actions-title" className="font-display font-bold text-navy-900">Task Actions</h2>
      <p className="mt-1 text-xs text-gray-500">Complete the highlighted next step, then use the supporting tools as needed.</p>

      <div className="mt-4 space-y-3">
        {needsAcknowledgment ? (
          <button onClick={onAcknowledge} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-black text-white shadow-sm hover:bg-brand-700 disabled:opacity-50">
            <AppIcon name="check" className="h-5 w-5" />
            Acknowledge Assignment
          </button>
        ) : nextTaskStatus ? (
          <button onClick={() => onNextStatus(nextTaskStatus.value)} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 px-4 py-3.5 text-sm font-black text-white shadow-sm hover:bg-navy-900 disabled:opacity-50">
            <AppIcon name={nextTaskStatus.icon} className="h-5 w-5" />
            {nextTaskStatus.label}
          </button>
        ) : canComplete ? (
          <button onClick={onComplete} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3.5 text-sm font-black text-white shadow-sm hover:bg-green-700 disabled:opacity-50">
            <AppIcon name="check" className="h-5 w-5" />
            Complete With Report
          </button>
        ) : complaint.status === 'completed' ? (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800" role="status">
            <AppIcon name="check" className="h-4 w-4" />
            Completion report submitted.
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2" aria-label="Location tools">
          <button onClick={onCopyAddress} className="inline-flex items-center justify-center gap-2 rounded-lg border border-navy-200 bg-white px-3 py-2.5 text-xs font-bold text-navy-700 hover:bg-navy-50">
            <AppIcon name="copy" className="h-4 w-4" />
            Copy Address
          </button>
          <button onClick={onOpenMap} className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-xs font-bold text-brand-700 hover:bg-brand-100">
            <AppIcon name="location" className="h-4 w-4" />
            Open Map
          </button>
        </div>

        {isActive && (
          <details className="rounded-lg border border-gray-200 bg-gray-50">
            <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-navy-800">More actions</summary>
            <div className="space-y-2 border-t border-gray-200 p-3">
              <button onClick={onPlan} className="btn-secondary w-full rounded-lg">Update Work Plan / ETA</button>
              <button onClick={onIssue} className="w-full rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-800">Request Help / Reassignment</button>
            </div>
          </details>
        )}
      </div>
    </section>
  )
}

export default function ComplaintDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const store = useComplaintStore()
  const canCommercialReview = hasCapability(user, CAPABILITIES.COMMERCIAL_COMPLAINTS)
  const canEcmdOperate = hasCapability(user, CAPABILITIES.ECMD_OPERATIONS)

  const [complaint, setComplaint] = useState(null)
  const [loadedComplaintId, setLoadedComplaintId] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [photoError, setPhotoError] = useState(false)
  const [completionPhotoError, setCompletionPhotoError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [comment, setComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [staffList, setStaffList] = useState([])
  const [crewList, setCrewList] = useState([])

  const [restoreOpen, setRestoreOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignStaff, setAssignStaff] = useState('')
  const [assignNotes, setAssignNotes] = useState('')
  const [assignCrew, setAssignCrew] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ complaint_type: '', description: '', address: '' })
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [reopenOpen, setReopenOpen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [planOpen, setPlanOpen] = useState(false)
  const [plan, setPlan] = useState({ estimated_completion_at: '', materials_used: '' })
  const [completeOpen, setCompleteOpen] = useState(false)
  const [completion, setCompletion] = useState({ completion_notes: '', materials_used: '', photo: null })
  const [issueOpen, setIssueOpen] = useState(false)
  const [issue, setIssue] = useState({ kind: 'assistance', reason: '' })
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [priorityForm, setPriorityForm] = useState({ score: 0, reason: '' })
  const [acknowledgmentNote, setAcknowledgmentNote] = useState('')

  useEffect(() => {
    let active = true
    useComplaintStore.getState().fetchComplaint(id)
      .then(result => {
        if (!active) return
        setComplaint(result)
        setError('')
      })
      .catch(err => {
        if (!active) return
        setComplaint(null)
        setError(err.message)
      })
      .finally(() => {
        if (active) setLoadedComplaintId(id)
      })
    return () => { active = false }
  }, [id])
  useEffect(() => {
    if (canEcmdOperate) {
      Promise.all([apiFetch('/users/maintenance-staff'), apiFetch('/operations/crews')])
        .then(([staffResult, crewResult]) => { setStaffList(staffResult.staff || []); setCrewList(crewResult.crews || []) })
        .catch(() => {})
    }
  }, [canEcmdOperate])

  const apply = (updated, success) => { setComplaint(updated); setMessage(success || 'Changes saved.'); setError(''); setRefreshKey(key => key + 1); window.setTimeout(() => setMessage(''), 3500) }
  const run = async (action, success) => { setBusy(true); setError(''); setMessage(''); try { apply(await action(), success); return true } catch (err) { setError(err.message); return false } finally { setBusy(false) } }

  const handleRestore = async () => { if (await run(() => store.restoreComplaint(id), 'Complaint restored.')) setRestoreOpen(false) }
  const handleReject = async reason => { if (await run(() => store.updateStatus(id, 'rejected', reason), 'Complaint rejected and the reason was sent to the customer.')) setRejectOpen(false) }
  const handleAssign = async () => { if (!assignStaff) return; if (await run(async () => { await store.assignComplaint(id, assignStaff, assignNotes, assignCrew); return store.fetchComplaint(id) }, complaint?.assigned_to ? 'Complaint reassigned.' : 'Maintenance Personnel assigned.')) setAssignOpen(false) }
  const openEdit = () => { setEditForm({ complaint_type: complaint.complaint_type, description: complaint.description, address: complaint.address }); setEditOpen(true) }
  const handleEdit = async event => { event.preventDefault(); if (await run(() => store.editComplaint(id, editForm), 'Pending complaint updated.')) setEditOpen(false) }
  const handleCancel = async () => { if (await run(() => store.cancelComplaint(id, cancelReason), 'Complaint cancelled.')) setCancelOpen(false) }
  const handleReopen = async () => { if (await run(() => store.reopenComplaint(id, reopenReason), 'Complaint reopened and returned for admin review.')) setReopenOpen(false) }
  const handleAcknowledge = () => run(() => store.acknowledgeTask(id), 'Assignment acknowledged.')
  const handleTaskStatus = status => run(() => store.updateStatus(id, status), 'Task status updated.')
  const handlePlan = async event => { event.preventDefault(); if (await run(() => store.updateTaskPlan(id, { estimated_completion_at: plan.estimated_completion_at ? new Date(plan.estimated_completion_at).toISOString() : null, materials_used: plan.materials_used }), 'Work plan updated.')) setPlanOpen(false) }
  const handleComplete = async event => { event.preventDefault(); if (await run(() => store.completeTask(id, completion, user.id), 'Completion report submitted.')) setCompleteOpen(false) }
  const handleIssue = async event => { event.preventDefault(); if (await run(() => store.reportTaskIssue(id, issue.kind, issue.reason), 'Request sent to administrators.')) setIssueOpen(false) }
  const handlePriorityOverride = async event => { event.preventDefault(); if (await run(() => store.overridePriority(id, { score: Number(priorityForm.score), reason: priorityForm.reason }), 'Priority score overridden and recorded in the audit log.')) setPriorityOpen(false) }
  const handlePriorityReset = async () => { if (await run(() => store.overridePriority(id, { reason: priorityForm.reason, resetToAlgorithm: true }), 'Priority restored to the classifier recommendation.')) setPriorityOpen(false) }
  const handleCompletionAcknowledgment = () => run(() => store.acknowledgeCompletion(id, acknowledgmentNote), 'Completion acknowledged. Thank you for confirming.')
  const handleComment = async () => { if (!comment.trim()) return; setPosting(true); setError(''); try { await store.postComment(id, comment.trim()); setComment(''); setRefreshKey(key => key + 1); setMessage('Timeline update posted.') } catch (err) { setError(err.message) } finally { setPosting(false) } }

  const copyAddress = async () => { try { await navigator.clipboard.writeText(complaint.address || ''); setMessage('Address copied.') } catch { setError('Could not copy the address.') } }
  const openMap = () => { const target = complaint.gps ? `https://www.openstreetmap.org/?mlat=${complaint.gps.lat}&mlon=${complaint.gps.lng}#map=17/${complaint.gps.lat}/${complaint.gps.lng}` : `https://www.openstreetmap.org/search?query=${encodeURIComponent(complaint.address || '')}`; window.open(target, '_blank', 'noopener,noreferrer') }
  const refreshComplaint = useCallback(async complaintId => {
    const latest = await useComplaintStore.getState().fetchComplaint(complaintId)
    setComplaint(latest)
    setRefreshKey(key => key + 1)
    return latest
  }, [])
  const { updatesAvailable, refreshNow } = useComplaintDetailRefresh(id, complaint, refreshComplaint)

  if (loadedComplaintId !== id) return <PageLoader label="Loading complaint details..." />
  if (!complaint) return <ErrorBanner message={error || 'Complaint not found.'} onRetry={() => navigate(homeForUser(user))} />

  const photo = complaint.photo_url || complaint.photo_urls?.[0]
  const nextTaskStatus = NEXT_TASK_STATUS[complaint.status]
  const canComment = (user?.role === 'maintenance_personnel' || canEcmdOperate) && complaint.assigned_to
  const isCustomer = user?.role === 'customer'
  const isAdmin = user?.role === 'admin'
  const isMaintenance = user?.role === 'maintenance_personnel'

  return <div className="space-y-5 complaint-receipt">
    <RefreshNotice visible={updatesAvailable} onRefresh={refreshNow} label="This complaint has newer information." />
    <div className="flex items-center justify-between gap-3 no-print"><button onClick={() => navigate(homeForUser(user))} className="text-sm font-bold text-navy-600 hover:text-navy-900">← Back to {isMaintenance ? 'My Tasks' : canEcmdOperate && !canCommercialReview ? 'Dispatch Tasks' : isAdmin ? 'Complaint Review' : 'My Complaints'}</button><button onClick={() => window.print()} className="btn-secondary rounded-lg text-xs">Print / Save Receipt</button></div>

    <div className="page-band wave-header rounded-2xl px-6 py-6 relative overflow-hidden"><div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4"><div><p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Complaint Details</p><h1 className="font-display font-black text-white text-2xl sm:text-3xl">{complaint.complaint_type}</h1><p className="text-navy-300 text-xs font-mono font-bold mt-2">Reference: {complaint.reference_number}</p></div><div className="flex items-center gap-2 flex-wrap">{!isCustomer && complaint.priority && <PriorityBadge priority={complaint.priority} />}<StatusBadge status={complaint.status} /></div></div></div>
    {error && <ErrorBanner message={error} />}{message && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800 no-print">{message}</div>}

    {complaint.status === 'rejected' && <div className="rounded-xl p-5 bg-red-50 border border-red-200"><p className="font-display font-bold text-red-900">Complaint rejected</p><p className="text-sm text-red-800 mt-1">{complaint.rejection_reason || 'No rejection reason was recorded.'}</p>{complaint.rejected_at && <p className="text-xs text-red-500 mt-2">Rejected {formatDate(complaint.rejected_at)}</p>}{canCommercialReview && <button onClick={() => setRestoreOpen(true)} className="btn-primary rounded-lg text-xs mt-3 no-print">↶ Undo Rejection</button>}</div>}
    {complaint.status === 'cancelled' && <div className="rounded-xl p-5 bg-gray-50 border border-gray-200"><p className="font-display font-bold text-gray-800">Complaint cancelled</p><p className="text-sm text-gray-600 mt-1">{complaint.cancellation_reason || 'The customer cancelled this complaint before assignment.'}</p></div>}
    {complaint.status === 'blocked' && <div className="rounded-xl p-5 bg-orange-50 border border-orange-200"><p className="font-display font-bold text-orange-900">Administrative attention requested</p><p className="text-sm text-orange-800 mt-1">{complaint.reassignment_reason || complaint.unable_reason || 'Maintenance Personnel reported an issue that needs review.'}</p></div>}
    {complaint.assistance_reason && <div className="rounded-xl p-5 bg-blue-50 border border-blue-200"><p className="font-display font-bold text-blue-900">Additional assistance requested</p><p className="text-sm text-blue-800 mt-1">{complaint.assistance_reason}</p></div>}
    {complaint.reopen_reason && complaint.reopened_at && <div className="rounded-xl p-4 bg-amber-50 border border-amber-200"><p className="text-xs font-black text-amber-700 uppercase">Reopened by customer</p><p className="text-sm text-amber-900 mt-1">{complaint.reopen_reason}</p></div>}
    {canCommercialReview && complaint.priority_is_overridden && <div className="rounded-xl p-4 bg-amber-50 border-2 border-amber-300"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black text-amber-800 uppercase tracking-wider">Manual Priority Override Active</p><p className="text-sm text-amber-950 mt-1">Classifier recommendation: {complaint.algorithm_priority_score}/100. Current operational score: {complaint.priority_score}/100.</p><p className="text-xs text-amber-700 mt-1">Reason: {complaint.priority_override_reason}</p></div><button onClick={() => { setPriorityForm({ score: complaint.priority_score, reason: '' }); setPriorityOpen(true) }} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 no-print">Review Override</button></div></div>}

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5"><div className="lg:col-span-2 space-y-5">
      <div className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-3">Complaint Information</h2><DetailRow label="Description">{complaint.description}</DetailRow><DetailRow label="Address">{complaint.address}</DetailRow><DetailRow label="Customer">{complaint.customer_name}</DetailRow>{complaint.task_notes && <DetailRow label="Administrator Instructions">{complaint.task_notes}</DetailRow>}</div>
      {complaint.gps && <div className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-2">Location</h2><p className="text-xs font-mono text-brand-700 mb-3">{complaint.gps.lat.toFixed(5)}, {complaint.gps.lng.toFixed(5)}</p><InlineMap lat={complaint.gps.lat} lng={complaint.gps.lng} accuracy={complaint.gps.accuracy} height={280} /></div>}
      <div className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-3">Attached Photo</h2>{photo && !photoError ? <a href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="Complaint attachment" onError={() => setPhotoError(true)} className="w-full max-h-[480px] object-contain rounded-lg bg-gray-50 border" /><p className="text-xs text-brand-700 font-bold mt-2">Open full-size photo ↗</p></a> : <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center"><AppIcon name="camera" className="mx-auto mb-2 h-8 w-8 text-gray-400" /><p className="font-bold text-gray-700">No photo attached</p><p className="text-sm text-gray-400 mt-1">{photoError ? 'The attached photo could not be loaded.' : 'This complaint was submitted without a photo.'}</p></div>}</div>
      {(complaint.completion_notes || complaint.completion_photo_url || complaint.materials_used) && <div className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-3">Completion Report</h2><DetailRow label="Resolution Performed">{complaint.completion_notes || 'No resolution notes recorded.'}</DetailRow>{complaint.materials_used && <DetailRow label="Materials Used">{complaint.materials_used}</DetailRow>}<DetailRow label="Completed">{formatDate(complaint.completed_at)}</DetailRow>{complaint.completion_photo_url && !completionPhotoError ? <a href={complaint.completion_photo_url} target="_blank" rel="noreferrer"><img src={complaint.completion_photo_url} alt="Completion proof" onError={() => setCompletionPhotoError(true)} className="w-full max-h-[420px] object-contain rounded-lg border mt-3" /><p className="text-xs text-brand-700 font-bold mt-2">Open proof photo ↗</p></a> : !complaint.completion_photo_url ? <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-sm text-gray-500 mt-3">No completion photo attached.</div> : null}</div>}
    </div><div className="space-y-5">
      <div className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-2">Task Summary</h2>{canCommercialReview && <DetailRow label={complaint.priority_is_overridden ? 'Operational Priority Score (Manual)' : 'Priority Score'}><span className="font-display font-black text-3xl text-navy-900">{complaint.priority_score}</span> / 100</DetailRow>}{(isMaintenance || canEcmdOperate) && <><DetailRow label="Assigned Category">{complaint.classified_category || complaint.complaint_type}</DetailRow><DetailRow label="Assigned Priority"><PriorityBadge priority={complaint.priority} /></DetailRow></>}<DetailRow label="Assigned Maintenance Personnel">{complaint.assigned_name || 'Not assigned'}</DetailRow><DetailRow label="Assigned On">{formatDate(complaint.assigned_at)}</DetailRow><DetailRow label="Acknowledged">{formatDate(complaint.acknowledged_at)}</DetailRow><DetailRow label="Estimated Completion">{formatDate(complaint.estimated_completion_at)}</DetailRow><DetailRow label="Filed">{formatDate(complaint.created_at)}</DetailRow><DetailRow label="Last Updated">{formatDate(complaint.updated_at)}</DetailRow><DetailRow label="Completed">{formatDate(complaint.completed_at)}</DetailRow>{complaint.customer_acknowledged_at && <DetailRow label="Customer Acknowledged">{formatDate(complaint.customer_acknowledged_at)}</DetailRow>}</div>

      {isCustomer && <div className="card rounded-xl p-5 no-print"><h2 className="font-display font-bold text-navy-900">Customer Actions</h2><p className="text-xs text-gray-400 mt-1 mb-4">Changes are limited after dispatch begins.</p><div className="space-y-2">{complaint.status === 'pending' && <><button onClick={openEdit} className="btn-secondary rounded-lg w-full">Edit Pending Complaint</button><button onClick={() => setCancelOpen(true)} className="w-full rounded-lg border border-red-200 bg-red-50 text-red-700 font-bold text-sm px-4 py-2.5">Cancel Complaint</button></>}{complaint.status === 'completed' && <button onClick={() => setReopenOpen(true)} className="w-full rounded-lg border border-amber-200 bg-amber-50 text-amber-800 font-bold text-sm px-4 py-2.5">Issue Not Resolved? Reopen</button>}<button onClick={() => window.print()} className="btn-primary rounded-lg w-full">Print Complaint Receipt</button></div></div>}
      {isCustomer && complaint.status === 'completed' && <div className="card rounded-xl p-5 no-print"><h2 className="font-display font-bold text-navy-900">Completion Confirmation</h2>{complaint.customer_acknowledged_at ? <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-4"><p className="text-sm font-bold text-green-800">✓ Completion acknowledged</p><p className="text-xs text-green-700 mt-1">{formatDate(complaint.customer_acknowledged_at)}</p>{complaint.customer_acknowledgment_note && <p className="text-sm text-green-900 mt-2">{complaint.customer_acknowledgment_note}</p>}</div> : <div className="mt-3 space-y-3"><p className="text-sm text-gray-600">Please confirm that you reviewed the completion report. You can still reopen the complaint if the issue remains unresolved.</p><textarea aria-label="Optional completion acknowledgment note" rows={3} value={acknowledgmentNote} onChange={event => setAcknowledgmentNote(event.target.value)} className="input-field rounded-lg resize-none" placeholder="Optional note" /><button onClick={handleCompletionAcknowledgment} disabled={busy} className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Acknowledge Completion</button></div>}</div>}

      {canCommercialReview && <><ClassifierAnalysis complaint={complaint} /><div className="card rounded-xl p-5 no-print"><h2 className="font-display font-bold text-navy-900">Commercial Review</h2><p className="text-xs text-gray-400 mt-1 mb-4">Review classification, priority, and complaint validity.</p><div className="space-y-2"><button onClick={() => { setPriorityForm({ score: complaint.priority_score, reason: '' }); setPriorityOpen(true) }} className="btn-secondary rounded-lg w-full">{complaint.priority_is_overridden ? 'Edit Manual Priority Override' : 'Override Priority Score'}</button>{!['completed','cancelled','rejected'].includes(complaint.status) && <button onClick={() => setRejectOpen(true)} className="w-full rounded-lg border border-red-200 bg-red-50 text-red-700 font-bold text-sm px-4 py-2.5">Reject Complaint</button>}{complaint.status === 'rejected' && <button onClick={() => setRestoreOpen(true)} className="btn-primary rounded-lg w-full">Undo Rejection</button>}</div></div></>}
      {canEcmdOperate && <div className="card rounded-xl p-5 no-print"><h2 className="font-display font-bold text-navy-900">ECMD Dispatch</h2><p className="text-xs text-gray-400 mt-1 mb-4">Assign the reviewed complaint to Maintenance Personnel and an optional crew.</p>{!['completed','cancelled','rejected'].includes(complaint.status) ? <button onClick={() => { setAssignStaff(complaint.assigned_to || ''); setAssignCrew(complaint.assigned_crew_id || ''); setAssignNotes(complaint.task_notes || ''); setAssignOpen(true) }} className="btn-primary rounded-lg w-full">{complaint.assigned_to ? 'Manage / Reassign Maintenance Personnel' : 'Assign Maintenance Personnel'}</button> : <p className="text-xs text-gray-500">This complaint is no longer available for dispatch.</p>}</div>}

      {isMaintenance && (
        <MaintenanceTaskActions
          complaint={complaint}
          nextTaskStatus={nextTaskStatus}
          busy={busy}
          onAcknowledge={handleAcknowledge}
          onNextStatus={handleTaskStatus}
          onComplete={() => {
            setCompletion({ completion_notes: '', materials_used: complaint.materials_used || '', photo: null })
            setCompleteOpen(true)
          }}
          onPlan={() => {
            setPlan({
              estimated_completion_at: complaint.estimated_completion_at ? new Date(complaint.estimated_completion_at).toISOString().slice(0, 16) : '',
              materials_used: complaint.materials_used || '',
            })
            setPlanOpen(true)
          }}
          onIssue={() => setIssueOpen(true)}
          onCopyAddress={copyAddress}
          onOpenMap={openMap}
        />
      )}

      {(canEcmdOperate || isMaintenance) && complaint.assigned_to && <TaskResourcesPanel complaintId={complaint.id} />}
      <div className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-3">Complete Timeline</h2><Timeline complaintId={complaint.id} refreshKey={`${complaint.status}-${refreshKey}`} />{canComment && !['rejected','cancelled'].includes(complaint.status) && <div className="mt-4 pt-4 border-t no-print"><textarea name="complaintdetailspage-add-a-task-update-1" aria-label="Add a task update..." value={comment} onChange={event => setComment(event.target.value)} rows={3} placeholder="Add a task update..." className="input-field resize-none text-sm" /><button onClick={handleComment} disabled={posting || !comment.trim()} className="btn-primary mt-2 w-full rounded-lg disabled:opacity-50">{posting ? <Spinner className="w-4 h-4 border-2 border-white" /> : 'Post Timeline Update'}</button></div>}</div>
      {complaint.status === 'completed' && <div className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-3">{isCustomer ? 'Resolution Feedback' : 'Customer Feedback'}</h2><FeedbackBox key={complaint.id} complaintId={complaint.id} /></div>}
    </div></div>

    <ConfirmDialog open={restoreOpen} title="Undo this rejection?" message="The rejection reason will be cleared and the complaint will return to the correct queue." confirmLabel="Undo Rejection" loading={busy} onConfirm={handleRestore} onCancel={() => setRestoreOpen(false)} />
    <Modal open={cancelOpen} title="Cancel Complaint" subtitle="This is available only before assignment. The record will remain in your history." onClose={() => !busy && setCancelOpen(false)}><div className="space-y-4"><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Reason (optional)</label><textarea name="complaintdetailspage-duplicate-report-issue-resolved-before-dispatch-entered-by-mistake-2" aria-label="Duplicate report, issue resolved before dispatch, entered by mistake…" rows={4} value={cancelReason} onChange={event => setCancelReason(event.target.value)} className="input-field rounded-lg resize-none" placeholder="Duplicate report, issue resolved before dispatch, entered by mistake…" /></div><div className="flex justify-end gap-2"><button onClick={() => setCancelOpen(false)} className="btn-secondary rounded-lg">Keep Complaint</button><button onClick={handleCancel} disabled={busy} className="rounded-lg px-5 py-2.5 bg-red-600 text-white font-bold text-sm disabled:opacity-50">{busy ? 'Cancelling…' : 'Cancel Complaint'}</button></div></div></Modal>
    <RejectionDialog open={rejectOpen} title="Reject this complaint?" description="Enter a clear reason that will be shown to the customer." loading={busy} onConfirm={handleReject} onCancel={() => setRejectOpen(false)} />

    <Modal open={assignOpen} title={complaint.assigned_to ? 'Reassign Maintenance Personnel' : 'Assign Maintenance Personnel'} subtitle={complaint.complaint_type} onClose={() => !busy && setAssignOpen(false)}><div className="space-y-4"><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Maintenance Personnel</label><select name="complaintdetailspage-assign-staff-3" aria-label="Assign Maintenance Personnel" value={assignStaff} onChange={event => setAssignStaff(event.target.value)} className="input-field rounded-lg"><option value="">Select Maintenance Personnel…</option>{staffList.map(staff => <option key={staff.id} value={staff.id} disabled={!staff.is_active || ['on_leave', 'off_duty'].includes(staff.availability_status)}>{staff.full_name}{!staff.is_active ? ' — Inactive' : staff.availability_status !== 'available' ? ` — ${String(staff.availability_status).replace('_',' ')}` : ''}</option>)}</select></div><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">ECMD Crew (optional)</label><select aria-label="Assign ECMD crew" value={assignCrew} onChange={event => setAssignCrew(event.target.value)} className="input-field rounded-lg"><option value="">No crew assignment</option>{crewList.map(crew => <option key={crew.id} value={crew.id}>{crew.name}</option>)}</select></div><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Instructions</label><textarea name="complaintdetailspage-assign-notes-4" aria-label="Assignment Instructions" rows={4} value={assignNotes} onChange={event => setAssignNotes(event.target.value)} className="input-field rounded-lg resize-none" /></div><div className="flex justify-end gap-2"><button onClick={() => setAssignOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button onClick={handleAssign} disabled={!assignStaff || busy} className="btn-primary rounded-lg disabled:opacity-50">{busy ? 'Saving…' : complaint.assigned_to ? 'Confirm Reassignment' : 'Confirm Assignment'}</button></div></div></Modal>

    <Modal open={priorityOpen} title="Priority Score Override" subtitle="The classifier recommendation is preserved. Every manual change requires a reason and is audited." onClose={() => !busy && setPriorityOpen(false)}><form onSubmit={handlePriorityOverride} className="space-y-4"><div className="rounded-lg border border-navy-100 bg-navy-50 p-3 text-sm text-navy-800"><span className="font-bold">Classifier recommendation:</span> {complaint.algorithm_priority_score ?? complaint.priority_score}/100</div><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Operational Priority Score (0–100)</label><input type="number" min="0" max="100" step="1" required value={priorityForm.score} onChange={event => setPriorityForm(form => ({ ...form, score: event.target.value }))} className="input-field rounded-lg" /></div><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Reason for Change *</label><textarea rows={4} required minLength={5} value={priorityForm.reason} onChange={event => setPriorityForm(form => ({ ...form, reason: event.target.value }))} className="input-field rounded-lg resize-none" placeholder="Explain why operational judgment requires a different priority." /></div><div className="flex flex-col sm:flex-row justify-end gap-2">{complaint.priority_is_overridden && <button type="button" onClick={handlePriorityReset} disabled={busy || priorityForm.reason.trim().length < 5} className="btn-secondary rounded-lg disabled:opacity-50">Restore Classifier Score</button>}<button type="button" onClick={() => setPriorityOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button disabled={busy || priorityForm.reason.trim().length < 5} className="btn-primary rounded-lg disabled:opacity-50">Save Manual Override</button></div></form></Modal>

    <Modal open={editOpen} title="Edit Pending Complaint" onClose={() => !busy && setEditOpen(false)}><form onSubmit={handleEdit} className="space-y-4"><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Type</label><select name="complaintdetailspage-complaint-type-5" aria-label="Complaint type" value={editForm.complaint_type} onChange={event => setEditForm(form => ({...form, complaint_type:event.target.value}))} className="input-field rounded-lg">{COMPLAINT_TYPES.map(type => <option key={type}>{type}</option>)}</select></div><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Description</label><textarea name="complaintdetailspage-description-6" aria-label="Description" rows={5} required value={editForm.description} onChange={event => setEditForm(form => ({...form, description:event.target.value}))} className="input-field rounded-lg resize-none" /></div><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Address</label><input name="complaintdetailspage-address-7" aria-label="Address" required value={editForm.address} onChange={event => setEditForm(form => ({...form, address:event.target.value}))} className="input-field rounded-lg" /></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button disabled={busy} className="btn-primary rounded-lg">Save Changes</button></div></form></Modal>

    <Modal open={reopenOpen} title="Reopen Complaint" subtitle="Explain what remains unresolved." onClose={() => !busy && setReopenOpen(false)}><div className="space-y-4"><textarea name="complaintdetailspage-the-issue-returned-was-not-fully-resolved-because-8" aria-label="The issue returned / was not fully resolved because…" rows={5} value={reopenReason} onChange={event => setReopenReason(event.target.value)} className="input-field rounded-lg resize-none" placeholder="The issue returned / was not fully resolved because…" /><div className="flex justify-end gap-2"><button onClick={() => setReopenOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button onClick={handleReopen} disabled={busy || reopenReason.trim().length < 5} className="btn-primary rounded-lg disabled:opacity-50">Reopen for Review</button></div></div></Modal>

    <Modal open={planOpen} title="Update Work Plan" subtitle="Set an ETA and record expected or used materials." onClose={() => !busy && setPlanOpen(false)}><form onSubmit={handlePlan} className="space-y-4"><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Estimated Completion</label><input name="complaintdetailspage-estimated-completion-at-9" aria-label="Estimated completion at" type="datetime-local" value={plan.estimated_completion_at} onChange={event => setPlan(value => ({...value, estimated_completion_at:event.target.value}))} className="input-field rounded-lg" /></div><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Materials / Equipment</label><textarea name="complaintdetailspage-replacement-valve-pipe-clamp-meter-seal-10" aria-label="Replacement valve, pipe clamp, meter seal…" rows={4} value={plan.materials_used} onChange={event => setPlan(value => ({...value, materials_used:event.target.value}))} className="input-field rounded-lg resize-none" placeholder="Replacement valve, pipe clamp, meter seal…" /></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setPlanOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button disabled={busy} className="btn-primary rounded-lg">Save Work Plan</button></div></form></Modal>

    <Modal open={completeOpen} title="Submit Completion Report" subtitle="Resolution notes and a proof photo are required." onClose={() => !busy && setCompleteOpen(false)}><form onSubmit={handleComplete} className="space-y-4"><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Resolution Performed *</label><textarea name="complaintdetailspage-describe-exactly-what-was-inspected-repaired-replaced-or-restored-11" aria-label="Describe exactly what was inspected, repaired, replaced, or restored." rows={5} required minLength={5} value={completion.completion_notes} onChange={event => setCompletion(value => ({...value, completion_notes:event.target.value}))} className="input-field rounded-lg resize-none" placeholder="Describe exactly what was inspected, repaired, replaced, or restored." /></div><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Materials Used</label><textarea name="complaintdetailspage-materials-used-12" aria-label="Materials used" rows={3} value={completion.materials_used} onChange={event => setCompletion(value => ({...value, materials_used:event.target.value}))} className="input-field rounded-lg resize-none" /></div><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Completion Photo *</label><input name="complaintdetailspage-file-field-13" aria-label="File field" type="file" accept="image/*" required onChange={event => setCompletion(value => ({...value, photo:event.target.files?.[0] || null}))} className="input-field rounded-lg" /><p className="text-xs text-gray-400 mt-1">Required as proof that the field work was completed.</p></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setCompleteOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button disabled={busy || completion.completion_notes.trim().length < 5 || !completion.photo} className="rounded-lg px-5 py-2.5 bg-green-600 text-white font-bold text-sm disabled:opacity-50">{busy ? 'Submitting…' : 'Complete Task'}</button></div></form></Modal>

    <Modal open={issueOpen} title="Request Administrative Help" onClose={() => !busy && setIssueOpen(false)}><form onSubmit={handleIssue} className="space-y-4"><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Request Type</label><select name="complaintdetailspage-kind-14" aria-label="Kind" value={issue.kind} onChange={event => setIssue(value => ({...value, kind:event.target.value}))} className="input-field rounded-lg"><option value="assistance">Additional Assistance / Crew</option><option value="reassignment">Request Reassignment</option><option value="cannot_complete">Cannot Complete Task</option></select></div><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Reason *</label><textarea name="complaintdetailspage-explain-the-access-problem-missing-equipment-safety-issue-or-reason-for-reassignment-15" aria-label="Explain the access problem, missing equipment, safety issue, or reason for reassignment." rows={5} required minLength={5} value={issue.reason} onChange={event => setIssue(value => ({...value, reason:event.target.value}))} className="input-field rounded-lg resize-none" placeholder="Explain the access problem, missing equipment, safety issue, or reason for reassignment." /></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setIssueOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button disabled={busy || issue.reason.trim().length < 5} className="btn-primary rounded-lg disabled:opacity-50">Send Request</button></div></form></Modal>
  </div>
}
