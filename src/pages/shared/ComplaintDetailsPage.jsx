import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useComplaintStore } from '../../store/complaintStore'
import { useOperationalStore } from '../../store/operationalStore'
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
import { useToastStore } from '../../store/toastStore'
import { useProductionStore } from '../../store/productionStore'

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
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = event => { if (event.key === 'Escape') onClose?.() }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])
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

function ClassifierAnalysis({ complaint }) {
  const hasStoredAnalysis = Boolean(complaint.classifier_version || complaint.classification_keywords?.length)
  const confidence = complaint.classification_confidence == null ? null : Math.round(Number(complaint.classification_confidence))
  const sentimentStyles = { urgent: 'bg-red-100 text-red-800 border-red-200', negative: 'bg-amber-100 text-amber-800 border-amber-200', neutral: 'bg-green-100 text-green-800 border-green-200' }
  const base = Number(complaint.rule_score || 0)
  const keyword = Math.max(-10, Math.min(50, (complaint.classification_keywords || []).reduce((sum, item) => sum + (Number(item.priority_weight) || 0), 0)))
  const sentiment = Number(complaint.sentiment_score || 0)
  const photo = complaint.photo_urls?.length ? 10 : 0
  const finalScore = Number(complaint.algorithm_priority_score ?? complaint.priority_score ?? 0)
  const components = [
    { label: 'Base Severity', value: base },
    { label: 'Dataset', value: keyword },
    { label: 'Sentiment', value: sentiment },
    { label: 'Photo', value: photo },
  ]

  return (
    <section className="card rounded-xl p-5" aria-labelledby="classification-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 id="classification-title" className="font-display font-bold text-navy-900">Automated Classification</h2>
            <PriorityScoreHelp />
          </div>
          <p className="mt-1 text-xs text-gray-500">Classifier result and hybrid priority recommendation for Commercial review.</p>
        </div>
        <div className="flex items-center gap-2">
          {complaint.classifier_version && <span className="rounded bg-gray-100 px-2 py-1 font-mono text-[10px] text-gray-500">{complaint.classifier_version}</span>}
          <div className="rounded-lg bg-navy-50 px-3 py-2 text-right">
            <p className="text-[9px] font-black uppercase tracking-wider text-navy-500">Hybrid Score</p>
            <p className="font-display text-2xl font-black text-navy-900">{finalScore}<span className="text-[10px] font-normal text-gray-400">/100</span></p>
          </div>
        </div>
      </div>

      {!hasStoredAnalysis ? (
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
          <p className="text-sm font-bold text-gray-700">No stored classification analysis</p>
          <p className="mt-1 text-xs text-gray-400">This is an older complaint.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Predicted Complaint Type</p><p className="mt-1 text-sm font-black text-navy-900">{complaint.classified_category || complaint.complaint_type}</p></div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Confidence</p><p className="mt-1 text-xl font-black text-navy-900">{confidence ?? '—'}{confidence != null && <span className="text-[10px] font-normal text-gray-400">%</span>}</p></div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Text Sentiment</p><span className={`mt-1.5 inline-flex rounded border px-2 py-1 text-[10px] font-black uppercase ${sentimentStyles[complaint.classification_sentiment] || sentimentStyles.neutral}`}>{complaint.classification_sentiment || 'neutral'}</span></div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Priority Class</p><div className="mt-1.5"><PriorityBadge priority={complaint.priority} /></div></div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {components.map(component => <div key={component.label} className="rounded-lg border border-navy-100 bg-navy-50/50 px-3 py-2"><p className="text-[9px] font-black uppercase text-navy-400">{component.label}</p><p className={`mt-0.5 font-black ${component.value < 0 ? 'text-red-600' : 'text-navy-900'}`}>{component.value >= 0 ? '+' : ''}{component.value}</p></div>)}
          </div>

          {complaint.classification_mismatch && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"><p className="text-xs font-bold text-amber-900">Complaint Type mismatch detected</p><p className="mt-0.5 text-xs text-amber-700">Selected “{complaint.complaint_type},” classified as “{complaint.classified_category}.”</p></div>}

          <details className="mt-4 rounded-lg border border-gray-200 bg-white">
            <summary className="cursor-pointer px-4 py-3 text-xs font-black text-navy-800">View classifier explanation and matched terms</summary>
            <div className="grid gap-5 border-t border-gray-100 p-4 lg:grid-cols-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Matched Dataset Terms</p>
                {complaint.classification_keywords?.length ? <div className="mt-2 flex flex-wrap gap-2">{complaint.classification_keywords.map((item, index) => <span key={`${item.id || item.term}-${index}`} className="inline-flex items-center gap-1 rounded-full border border-navy-100 bg-navy-50 px-2.5 py-1 text-xs font-bold text-navy-700">{item.term}<span className={Number(item.priority_weight) >= 0 ? 'text-green-700' : 'text-red-600'}>{Number(item.priority_weight) >= 0 ? '+' : ''}{item.priority_weight}</span></span>)}</div> : <p className="mt-2 text-xs text-gray-400">No keyword matched.</p>}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Decision Explanation</p>
                {complaint.classification_reasons?.length ? <ul className="mt-2 space-y-1.5">{complaint.classification_reasons.map((reason, index) => <li key={index} className="flex gap-2 text-xs text-gray-600"><span className="text-gold-500">•</span><span>{reason}</span></li>)}</ul> : <p className="mt-2 text-xs text-gray-400">No explanation stored.</p>}
              </div>
            </div>
          </details>
        </>
      )}
    </section>
  )
}

function MaintenanceTaskActions({
  complaint,
  nextTaskStatus,
  busy,
  onNextStatus,
  onComplete,
  onPlan,
  onIssue,
  onCopyAddress,
  onOpenMap,
}) {
  const isActive = ['assigned', 'en_route', 'in_progress', 'blocked'].includes(complaint.status)
  const canComplete = ['en_route', 'in_progress'].includes(complaint.status)

  return (
    <section className="card rounded-xl p-5 no-print" aria-labelledby="task-actions-title">
      <h2 id="task-actions-title" className="font-display font-bold text-navy-900">Task Actions</h2>
      <p className="mt-1 text-xs text-gray-500">Update field progress and record the work performed. Use the task status and completion notes to keep ECMD updated.</p>
      <div className="mt-4 space-y-3">
        {nextTaskStatus ? (
          <button onClick={() => onNextStatus(nextTaskStatus.value)} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 px-4 py-3.5 text-sm font-black text-white shadow-sm hover:bg-navy-900 disabled:opacity-50">
            <AppIcon name={nextTaskStatus.icon} className="h-5 w-5" />{nextTaskStatus.label}
          </button>
        ) : canComplete ? (
          <button onClick={onComplete} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3.5 text-sm font-black text-white shadow-sm hover:bg-green-700 disabled:opacity-50">
            <AppIcon name="check" className="h-5 w-5" />Submit Completion Notes
          </button>
        ) : complaint.status === 'awaiting_verification' ? (
          <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">Field work submitted. Waiting for ECMD verification.</div>
        ) : ['resolved','completed'].includes(complaint.status) ? (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800"><AppIcon name="check" className="h-4 w-4" />Complaint resolved.</div>
        ) : null}

        <div className="grid grid-cols-2 gap-2" aria-label="Location tools">
          <button onClick={onCopyAddress} className="inline-flex items-center justify-center gap-2 rounded-lg border border-navy-200 bg-white px-3 py-2.5 text-xs font-bold text-navy-700 hover:bg-navy-50"><AppIcon name="copy" className="h-4 w-4" />Copy Address</button>
          <button onClick={onOpenMap} className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-xs font-bold text-brand-700 hover:bg-brand-100"><AppIcon name="location" className="h-4 w-4" />Open Map</button>
        </div>

        {isActive && <details className="rounded-lg border border-gray-200 bg-gray-50"><summary className="cursor-pointer px-4 py-3 text-sm font-bold text-navy-800">More actions</summary><div className="space-y-2 border-t border-gray-200 p-3"><button onClick={onPlan} className="btn-secondary w-full rounded-lg">Update Materials / Work Notes</button><button onClick={onIssue} className="w-full rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-800">Request Help / Reassignment</button></div></details>}
      </div>
    </section>
  )
}

export default function ComplaintDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const store = useComplaintStore()
  const operational = useOperationalStore()
  const pushToast = useToastStore(state => state.push)
  const production = useProductionStore()
  const canCommercialReview = hasCapability(user, CAPABILITIES.COMMERCIAL_COMPLAINTS)
  const canEcmdOperate = hasCapability(user, CAPABILITIES.ECMD_OPERATIONS)
  const canOverridePriority = canCommercialReview || canEcmdOperate

  const [complaint, setComplaint] = useState(null)
  const [loadedComplaintId, setLoadedComplaintId] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [photoError, setPhotoError] = useState(false)
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
  const [assignReason, setAssignReason] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ complaint_type: '', description: '', address: '' })
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [reopenOpen, setReopenOpen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [planOpen, setPlanOpen] = useState(false)
  const [plan, setPlan] = useState({ materials_used: '' })
  const [completeOpen, setCompleteOpen] = useState(false)
  const [completion, setCompletion] = useState({ completion_notes: '', materials_used: '' })
  const [issueOpen, setIssueOpen] = useState(false)
  const [issue, setIssue] = useState({ kind: 'assistance', reason: '' })
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [priorityForm, setPriorityForm] = useState({ score: 0, priority: 'medium', reason: '' })
  const [forwardOpen, setForwardOpen] = useState(false)
  const [forwardNote, setForwardNote] = useState('')
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifyForm, setVerifyForm] = useState({ resolution_code: 'resolved', resolution_notes: '', return_to_field: false })
  const [opsContext, setOpsContext] = useState({ notes: [], contacts: [], relations: [], related: [], incidents: [] })
  const [internalNote, setInternalNote] = useState('')
  const [contactForm, setContactForm] = useState({ channel: 'phone', contact_type: 'follow_up', summary: '' })
  const [workspaceTab, setWorkspaceTab] = useState('notes')
  const [watched, setWatched] = useState(false)
  const [followUps, setFollowUps] = useState([])
  const [followPrompt, setFollowPrompt] = useState('')
  const [followResponse, setFollowResponse] = useState('')
  const [followOpen, setFollowOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeForm, setMergeForm] = useState({ primary_complaint_id: '', reason: '' })
  const [assignmentHistory, setAssignmentHistory] = useState([])
  const [templates, setTemplates] = useState([])

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
    production.markRecent(id).catch(() => {})
    production.loadWatched().then(items => setWatched(items.some(item => item.id === id))).catch(() => {})
    production.loadFollowUps(id).then(result => setFollowUps(result.follow_ups || [])).catch(() => {})
    if (canCommercialReview || canEcmdOperate) production.assignmentHistory(id).then(result => setAssignmentHistory(result.assignments || [])).catch(() => {})
    if (user?.role === 'maintenance_personnel' || canEcmdOperate) production.loadTemplates().then(setTemplates).catch(() => {})
  }, [id, canCommercialReview, canEcmdOperate, user?.role])
  useEffect(() => {
    if (canCommercialReview) useComplaintStore.getState().fetchComplaints().catch?.(() => {})
  }, [canCommercialReview])
  useEffect(() => {
    if (canEcmdOperate) {
      Promise.all([apiFetch('/users/maintenance-staff'), apiFetch('/operations/crews')])
        .then(([staffResult, crewResult]) => { setStaffList(staffResult.staff || []); setCrewList(crewResult.crews || []) })
        .catch(() => {})
    }
  }, [canEcmdOperate])
  useEffect(() => {
    if (canCommercialReview || canEcmdOperate) {
      operational.fetchComplaintContext(id).then(setOpsContext).catch(() => {})
      operational.fetchOperationalReference().catch(() => {})
    }
  }, [id, canCommercialReview, canEcmdOperate])

  const apply = (updated, success) => { const text = success || 'Changes saved.'; setComplaint(updated); setMessage(text); pushToast(text, 'success'); setError(''); setRefreshKey(key => key + 1); window.setTimeout(() => setMessage(''), 3500) }
  const run = async (action, success) => { setBusy(true); setError(''); setMessage(''); try { apply(await action(), success); return true } catch (err) { setError(err.message); pushToast(err.message, 'error'); return false } finally { setBusy(false) } }

  const handleRestore = async () => { if (await run(() => store.restoreComplaint(id), 'Complaint restored.')) setRestoreOpen(false) }
  const handleReject = async reason => { if (await run(() => store.updateStatus(id, 'rejected', reason), 'Complaint rejected and the reason was sent to the customer.')) setRejectOpen(false) }
  const handleAssign = async () => { if (!assignStaff) return; const changingPerson = Boolean(complaint?.assigned_to && assignStaff !== complaint.assigned_to); if (changingPerson && !assignReason) { setError('Choose a reassignment reason.'); return } if (await run(async () => { await store.assignComplaint(id, assignStaff, assignNotes, assignCrew, assignReason); return store.fetchComplaint(id) }, changingPerson ? 'Complaint reassigned.' : 'Maintenance Personnel assigned.')) { setAssignOpen(false); setAssignReason('') } }
  const openEdit = () => { setEditForm({ complaint_type: complaint.complaint_type, description: complaint.description, address: complaint.address }); setEditOpen(true) }
  const handleEdit = async event => { event.preventDefault(); if (await run(() => store.editComplaint(id, editForm), 'Pending complaint updated.')) setEditOpen(false) }
  const handleCancel = async () => { if (await run(() => store.cancelComplaint(id, cancelReason), 'Complaint cancelled.')) setCancelOpen(false) }
  const handleReopen = async () => { if (await run(() => store.reopenComplaint(id, reopenReason), 'Complaint reopened and returned for Commercial Services Department review.')) setReopenOpen(false) }
  const handleTaskStatus = status => run(() => store.updateStatus(id, status), 'Task status updated.')
  const handlePlan = async event => { event.preventDefault(); if (await run(() => store.updateTaskPlan(id, { materials_used: plan.materials_used }), 'Work plan updated.')) setPlanOpen(false) }
  const handleComplete = async event => { event.preventDefault(); if (await run(() => store.completeTask(id, completion, user.id), 'Completion notes submitted for ECMD verification.')) setCompleteOpen(false) }
  const handleIssue = async event => { event.preventDefault(); if (await run(() => store.reportTaskIssue(id, issue.kind, issue.reason), 'Request sent to ECMD.')) setIssueOpen(false) }
  const handlePriorityOverride = async event => { event.preventDefault(); const payload = canCommercialReview ? { score: Number(priorityForm.score), reason: priorityForm.reason } : { priority: priorityForm.priority, reason: priorityForm.reason }; if (await run(() => store.overridePriority(id, payload), 'Operational priority changed and recorded in the audit log.')) setPriorityOpen(false) }
  const handlePriorityReset = async () => { if (await run(() => store.overridePriority(id, { reason: priorityForm.reason, resetToAlgorithm: true }), 'Priority restored to the classifier recommendation.')) setPriorityOpen(false) }
  const handleComment = async () => { if (!comment.trim()) return; setPosting(true); setError(''); try { await store.postComment(id, comment.trim()); setComment(''); setRefreshKey(key => key + 1); setMessage('Timeline update posted.') } catch (err) { setError(err.message) } finally { setPosting(false) } }
  const reloadContext = async () => { try { setOpsContext(await operational.fetchComplaintContext(id)) } catch (_) {} }
  const handleForward = async () => { if (await run(async () => { const { complaint: updated } = await apiFetch(`/complaints/${id}/forward-to-ecmd`, { method: 'PATCH', body: JSON.stringify({ note: forwardNote || undefined }) }); return updated }, 'Complaint forwarded to ECMD.')) { setForwardOpen(false); setForwardNote('') } }
  const handleVerify = async event => { event.preventDefault(); if (await run(async () => { const { complaint: updated } = await apiFetch(`/complaints/${id}/verify`, { method: 'PATCH', body: JSON.stringify(verifyForm) }); return updated }, verifyForm.return_to_field ? 'Complaint returned for additional field work.' : 'ECMD verified and resolved the complaint.')) setVerifyOpen(false) }
  const handleInternalNote = async () => { if (!internalNote.trim()) return; setPosting(true); try { await operational.addInternalNote(id, internalNote.trim()); setInternalNote(''); await reloadContext(); setRefreshKey(k => k + 1); setMessage('Internal note saved.') } catch (err) { setError(err.message) } finally { setPosting(false) } }
  const handleContactLog = async event => { event.preventDefault(); if (!contactForm.summary.trim()) return; setPosting(true); try { await operational.logCustomerContact(id, contactForm); setContactForm({ channel: 'phone', contact_type: 'follow_up', summary: '' }); await reloadContext(); setMessage('Customer communication recorded.') } catch (err) { setError(err.message) } finally { setPosting(false) } }
  const linkCandidate = async relatedId => { try { await operational.linkComplaint(id, { related_complaint_id: relatedId, relation_type: 'possible_duplicate', reason: 'Linked from duplicate/nearby complaint detection.' }); await reloadContext(); setMessage('Related complaint linked.') } catch (err) { setError(err.message) } }

  const toggleWatch = async () => {
    try { await production.setWatch(id, !watched); setWatched(!watched); setMessage(!watched ? 'Complaint added to your watchlist.' : 'Complaint removed from your watchlist.') } catch (err) { setError(err.message) }
  }
  const requestCustomerInfo = async () => {
    if (followPrompt.trim().length < 5) return
    setBusy(true); try { await production.requestFollowUp(id, followPrompt.trim()); const result = await production.loadFollowUps(id); setFollowUps(result.follow_ups || []); setFollowPrompt(''); setFollowOpen(false); setMessage('Customer information request sent.') } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const respondToFollowUp = async followUp => {
    if (followResponse.trim().length < 2) return
    setBusy(true); try { await production.respondFollowUp(followUp.id, followResponse.trim()); const result = await production.loadFollowUps(id); setFollowUps(result.follow_ups || []); setFollowResponse(''); setMessage('Response sent to Commercial Services.') } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const mergeThisComplaint = async () => {
    if (!mergeForm.primary_complaint_id || mergeForm.reason.trim().length < 3) return
    setBusy(true); try { await production.mergeComplaint(id, mergeForm.primary_complaint_id, mergeForm.reason.trim()); const updated = await store.fetchComplaint(id); setComplaint(updated); setMergeOpen(false); setMessage('Complaint merged into the selected primary complaint.') } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const copyReference = async () => { try { await navigator.clipboard.writeText(complaint.reference_number || ''); setMessage('Complaint reference copied.'); window.setTimeout(() => setMessage(''), 2500) } catch { setError('Could not copy the complaint reference.') } }
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
    <div className="flex flex-wrap items-center justify-between gap-3 no-print"><button onClick={() => navigate(homeForUser(user))} className="text-sm font-bold text-navy-600 hover:text-navy-900">← Back to {isMaintenance ? 'My Tasks' : canEcmdOperate && !canCommercialReview ? 'Complaint Dispatch' : isAdmin ? 'Complaint Review' : 'My Complaints'}</button><div className="flex flex-wrap gap-2">{!isCustomer && <button onClick={toggleWatch} className={`rounded-lg px-3 py-2 text-xs font-black ${watched ? 'bg-gold-100 text-navy-900 border border-gold-300' : 'btn-secondary'}`}>{watched ? '★ Watching' : '☆ Watch'}</button>}<button onClick={copyReference} className="btn-secondary rounded-lg text-xs"><AppIcon name="copy" className="h-3.5 w-3.5" />Copy Reference</button><button onClick={() => window.print()} className="btn-secondary rounded-lg text-xs">Print / Save Receipt</button></div></div>

    <div className="page-band wave-header rounded-2xl px-6 py-6 relative overflow-hidden"><div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4"><div><p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Complaint Details</p><h1 className="font-display font-black text-white text-2xl sm:text-3xl">{complaint.complaint_type}</h1><p className="text-navy-300 text-xs font-mono font-bold mt-2">Reference: {complaint.reference_number}</p></div><div className="flex items-center gap-2 flex-wrap">{!isCustomer && complaint.priority && <PriorityBadge priority={complaint.priority} />}<StatusBadge status={complaint.status} /></div></div></div>
    {error && <ErrorBanner message={error} />}{message && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800 no-print">{message}</div>}

    {complaint.status === 'merged' && <div className="rounded-xl border border-violet-200 bg-violet-50 p-5"><p className="font-display font-bold text-violet-900">Merged into another complaint</p><p className="mt-1 text-sm text-violet-800">This duplicate record is retained for traceability and no longer drives separate field work.</p><p className="mt-2 text-xs text-violet-700">Reason: {complaint.merge_reason || 'Duplicate complaint.'}</p>{complaint.merged_into_id && <button onClick={() => navigate(`/complaints/${complaint.merged_into_id}`)} className="btn-secondary mt-3 rounded-lg text-xs">Open Primary Complaint</button>}</div>}
    {isCustomer && followUps.some(item => item.status === 'open') && <div className="rounded-xl border border-blue-200 bg-blue-50 p-5"><p className="font-display font-bold text-blue-900">MRWD needs additional information</p>{followUps.filter(item => item.status === 'open').map(item => <div key={item.id} className="mt-3 rounded-lg bg-white p-3"><p className="text-sm font-bold text-blue-900">{item.prompt}</p><p className="mt-1 text-xs text-blue-500">Requested {formatDate(item.created_at)}</p><textarea rows={3} value={followResponse} onChange={e => setFollowResponse(e.target.value)} className="input-field mt-3 resize-none rounded-lg" placeholder="Reply with the requested information…"/><button disabled={busy || followResponse.trim().length < 2} onClick={() => respondToFollowUp(item)} className="btn-primary mt-2 rounded-lg text-xs">Send Response</button></div>)}</div>}
    {complaint.status === 'rejected' && <div className="rounded-xl p-5 bg-red-50 border border-red-200"><p className="font-display font-bold text-red-900">Complaint rejected</p><p className="text-sm text-red-800 mt-1">{complaint.rejection_reason || 'No rejection reason was recorded.'}</p>{complaint.rejected_at && <p className="text-xs text-red-500 mt-2">Rejected {formatDate(complaint.rejected_at)}</p>}{canCommercialReview && <button onClick={() => setRestoreOpen(true)} className="btn-primary rounded-lg text-xs mt-3 no-print">↶ Undo Rejection</button>}</div>}
    {complaint.status === 'cancelled' && <div className="rounded-xl p-5 bg-gray-50 border border-gray-200"><p className="font-display font-bold text-gray-800">Complaint cancelled</p><p className="text-sm text-gray-600 mt-1">{complaint.cancellation_reason || 'The customer cancelled this complaint before assignment.'}</p></div>}
    {complaint.status === 'blocked' && <div className="rounded-xl p-5 bg-orange-50 border border-orange-200"><p className="font-display font-bold text-orange-900">Administrative attention requested</p><p className="text-sm text-orange-800 mt-1">{complaint.reassignment_reason || complaint.unable_reason || 'Maintenance Personnel reported an issue that needs review.'}</p></div>}
    {complaint.assistance_reason && <div className="rounded-xl p-5 bg-blue-50 border border-blue-200"><p className="font-display font-bold text-blue-900">Additional assistance requested</p><p className="text-sm text-blue-800 mt-1">{complaint.assistance_reason}</p></div>}
    {complaint.reopen_reason && complaint.reopened_at && <div className="rounded-xl p-4 bg-amber-50 border border-amber-200"><p className="text-xs font-black text-amber-700 uppercase">Reopened by customer</p><p className="text-sm text-amber-900 mt-1">{complaint.reopen_reason}</p></div>}
    {canOverridePriority && complaint.priority_is_overridden && <div className="rounded-xl p-4 bg-amber-50 border-2 border-amber-300"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black text-amber-800 uppercase tracking-wider">Manual Priority Override Active</p><p className="text-sm text-amber-950 mt-1">{canCommercialReview ? <>Classifier recommendation: {complaint.algorithm_priority_score}/100. </> : null}Current operational priority: {String(complaint.priority || 'medium').toUpperCase()}.</p><p className="text-xs text-amber-700 mt-1">Reason: {complaint.priority_override_reason || 'Operational judgment recorded.'}</p></div><button onClick={() => { setPriorityForm({ score: complaint.priority_score || 0, priority: complaint.priority || 'medium', reason: '' }); setPriorityOpen(true) }} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 no-print">Review Override</button></div></div>}

    <section className="card rounded-xl p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div><p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Status</p><div className="mt-1"><StatusBadge status={complaint.status} /></div></div>
        <div><p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Priority</p><div className="mt-1"><PriorityBadge priority={complaint.priority} /></div></div>
        <div><p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Assigned Maintenance Personnel</p><p className="mt-1 truncate text-xs font-bold text-gray-800">{complaint.assigned_name || 'Not assigned'}</p></div>
        <div><p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Submitted</p><p className="mt-1 text-xs font-semibold text-gray-700">{formatDate(complaint.created_at)}</p></div>
        <div><p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Forwarded to ECMD</p><p className="mt-1 text-xs font-semibold text-gray-700">{formatDate(complaint.forwarded_to_ecmd_at)}</p></div>
        <div><p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Last Updated</p><p className="mt-1 text-xs font-semibold text-gray-700">{formatDate(complaint.updated_at)}</p></div>
      </div>
      {!isCustomer && <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2"><div><p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Current Operational Owner</p><p className="mt-1 text-xs font-black text-navy-900">{complaint.status === 'pending' || complaint.status === 'rejected' ? 'Commercial Services Department' : complaint.status === 'merged' ? 'Merged / historical record' : 'Engineering, Construction and Maintenance Department (ECMD)'}</p></div><div><p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Commercial → ECMD Handoff Note</p><p className="mt-1 text-xs text-gray-700">{complaint.commercial_handoff_note || 'No handoff note recorded.'}</p></div></div>}
    </section>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <div className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-3">Complaint Information</h2><DetailRow label="Description">{complaint.description}</DetailRow><DetailRow label="Address">{complaint.address}</DetailRow><DetailRow label="Customer">{complaint.customer_name}</DetailRow>{complaint.task_notes && <DetailRow label="Dispatch Instructions">{complaint.task_notes}</DetailRow>}</div>

        {canCommercialReview && <ClassifierAnalysis complaint={complaint} />}

        {complaint.gps && <div className="card rounded-xl p-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-display font-bold text-navy-900">Location</h2><p className="mt-1 text-xs font-mono text-brand-700">{complaint.gps.lat.toFixed(5)}, {complaint.gps.lng.toFixed(5)}</p></div><button onClick={openMap} className="btn-secondary rounded-lg text-xs no-print">Open Map ↗</button></div><InlineMap lat={complaint.gps.lat} lng={complaint.gps.lng} accuracy={complaint.gps.accuracy} height={280} /></div>}

        <div className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-3">Attached Photo</h2>{photo && !photoError ? <a href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="Complaint attachment" onError={() => setPhotoError(true)} className="w-full max-h-[480px] object-contain rounded-lg bg-gray-50 border" /><p className="text-xs text-brand-700 font-bold mt-2">Open full-size photo ↗</p></a> : <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center"><AppIcon name="camera" className="mx-auto mb-2 h-8 w-8 text-gray-400" /><p className="font-bold text-gray-700">No photo attached</p><p className="text-sm text-gray-400 mt-1">{photoError ? 'The attached photo could not be loaded.' : 'This complaint was submitted without a photo.'}</p></div>}</div>

        {(complaint.completion_notes || complaint.materials_used || complaint.resolution_notes) && <div className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-3">Resolution Report</h2><DetailRow label="Maintenance Completion Notes">{complaint.completion_notes || 'No resolution notes recorded.'}</DetailRow>{complaint.materials_used && <DetailRow label="Materials Used">{complaint.materials_used}</DetailRow>}<DetailRow label="Field Work Completed">{formatDate(complaint.completed_at)}</DetailRow>{complaint.verified_at && <DetailRow label="ECMD Verified">{formatDate(complaint.verified_at)}</DetailRow>}{complaint.resolution_notes && <DetailRow label="ECMD Verification Notes">{complaint.resolution_notes}</DetailRow>}</div>}

        {(canEcmdOperate || isMaintenance) && complaint.assigned_to && <TaskResourcesPanel complaintId={complaint.id} />}
      </div>

      <aside className="min-w-0 space-y-4 lg:self-start lg:sticky lg:top-5 no-print">
        {canCommercialReview && <section className="card rounded-xl p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-brand-600">Commercial Services</p><h2 className="mt-1 font-display font-bold text-navy-900">Complaint Review</h2><p className="mt-1 text-xs text-gray-500">Review validity and hand the complaint to ECMD when ready.</p></div><StatusBadge status={complaint.status} /></div>
          <div className="mt-4 space-y-2">
            {complaint.status === 'pending' && <button onClick={() => setForwardOpen(true)} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-700">Forward to ECMD</button>}
    {complaint.status === 'rejected' && <button onClick={() => setRestoreOpen(true)} className="btn-primary w-full rounded-lg">Undo Rejection</button>}
            <button onClick={() => { setPriorityForm({ score: complaint.priority_score || 0, priority: complaint.priority || 'medium', reason: '' }); setPriorityOpen(true) }} className="btn-secondary w-full rounded-lg">{complaint.priority_is_overridden ? 'Review Priority Override' : 'Override Priority'}</button>
            {complaint.status === 'pending' && <button onClick={() => setRejectOpen(true)} className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100">Reject Complaint</button>}
            {!['resolved','completed','rejected','cancelled','merged'].includes(complaint.status) && <details className="rounded-lg border border-gray-200 bg-gray-50"><summary className="cursor-pointer px-3 py-2.5 text-xs font-black text-navy-800">More Commercial actions</summary><div className="space-y-2 border-t border-gray-200 p-2"><button type="button" disabled={followUps.some(item => item.status === 'open')} onClick={() => setFollowOpen(true)} className="btn-secondary w-full rounded-lg text-xs disabled:cursor-not-allowed disabled:opacity-50">{followUps.some(item => item.status === 'open') ? 'Customer Information Requested' : 'Request Customer Information'}</button>{['pending','forwarded'].includes(complaint.status) && <button type="button" onClick={() => setMergeOpen(true)} className="btn-secondary w-full rounded-lg text-xs">Merge Duplicate Complaint</button>}</div></details>}
          </div>
          {complaint.priority_is_overridden && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-[10px] font-black uppercase text-amber-700">Manual Priority Active</p><p className="mt-1 text-xs text-amber-900">{complaint.priority_override_reason || 'Operational judgment recorded.'}</p></div>}
        </section>}

        {canEcmdOperate && <section className="card rounded-xl p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-violet-600">ECMD</p><h2 className="mt-1 font-display font-bold text-navy-900">Dispatch Controls</h2><p className="mt-1 text-xs text-gray-500">Assign field work and verify Maintenance completion.</p></div><StatusBadge status={complaint.status} /></div>
          <div className="mt-4 space-y-2">
            {complaint.status === 'awaiting_verification' && <button onClick={() => { setVerifyForm({ resolution_code: 'resolved', resolution_notes: '', return_to_field: false }); setVerifyOpen(true) }} className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-black text-white hover:bg-violet-700">Verify Maintenance Completion</button>}
            {['forwarded','assigned','en_route','in_progress','blocked'].includes(complaint.status) && <button onClick={() => { setAssignStaff(complaint.assigned_to || ''); setAssignCrew(complaint.assigned_crew_id || ''); setAssignNotes(complaint.task_notes || ''); setAssignReason(''); setAssignOpen(true) }} className="btn-primary w-full rounded-lg">{complaint.assigned_to ? 'Manage / Reassign Personnel' : 'Assign Maintenance Personnel'}</button>}
            {['forwarded','assigned','en_route','in_progress','blocked','awaiting_verification'].includes(complaint.status) && <details className="rounded-lg border border-gray-200 bg-gray-50"><summary className="cursor-pointer px-3 py-2.5 text-xs font-black text-navy-800">More ECMD actions</summary><div className="border-t border-gray-200 p-2"><button onClick={() => { setPriorityForm({ score: 0, priority: complaint.priority || 'medium', reason: '' }); setPriorityOpen(true) }} className="btn-secondary w-full rounded-lg text-xs">Change Operational Priority</button></div></details>}
            {!['forwarded','assigned','en_route','in_progress','blocked','awaiting_verification'].includes(complaint.status) && <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">This complaint is not currently available for ECMD dispatch.</p>}
          </div>
          {complaint.assigned_name && <div className="mt-4 border-t border-gray-100 pt-4"><p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Current Assignment</p><p className="mt-1 text-sm font-bold text-gray-800">{complaint.assigned_name}</p><p className="mt-0.5 text-xs text-gray-400">Assigned {formatDate(complaint.assigned_at)}</p></div>}
        </section>}

        {isMaintenance && <MaintenanceTaskActions
          complaint={complaint}
          nextTaskStatus={nextTaskStatus}
          busy={busy}
          onNextStatus={handleTaskStatus}
          onComplete={() => { setCompletion({ completion_notes: '', materials_used: complaint.materials_used || '' }); setCompleteOpen(true) }}
          onPlan={() => { setPlan({ materials_used: complaint.materials_used || '' }); setPlanOpen(true) }}
          onIssue={() => setIssueOpen(true)}
          onCopyAddress={copyAddress}
          onOpenMap={openMap}
        />}

        {isCustomer && <section className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900">Customer Actions</h2><p className="mt-1 text-xs text-gray-400">Changes are limited after dispatch begins.</p><div className="mt-4 space-y-2">{complaint.status === 'pending' && <><button onClick={openEdit} className="btn-secondary w-full rounded-lg">Edit Pending Complaint</button><button onClick={() => setCancelOpen(true)} className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700">Cancel Complaint</button></>}{['resolved','completed'].includes(complaint.status) && <button onClick={() => setReopenOpen(true)} className="w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-800">Issue Not Resolved? Reopen</button>}<button onClick={() => window.print()} className="btn-primary w-full rounded-lg">Print Complaint Receipt</button></div></section>}
      </aside>
    </div>

    {(canCommercialReview || canEcmdOperate) && <section className="card rounded-xl overflow-hidden no-print">
      <div className="border-b border-gray-100 px-5 pt-5">
        <div><h2 className="font-display font-bold text-navy-900">Staff Workspace</h2><p className="mt-1 text-xs text-gray-500">Internal notes, customer communication, and related complaint records stay together here instead of stacking separate action cards.</p></div>
        <div className="mt-4 flex flex-wrap gap-1">
          <button onClick={() => setWorkspaceTab('notes')} className={`shrink-0 border-b-2 px-3 py-2 text-xs font-black ${workspaceTab === 'notes' ? 'border-navy-800 text-navy-900' : 'border-transparent text-gray-400'}`}>Internal Notes <span className="ml-1 text-[10px]">({opsContext.notes.length})</span></button>
          <button onClick={() => setWorkspaceTab('contact')} className={`shrink-0 border-b-2 px-3 py-2 text-xs font-black ${workspaceTab === 'contact' ? 'border-navy-800 text-navy-900' : 'border-transparent text-gray-400'}`}>Customer Contact <span className="ml-1 text-[10px]">({opsContext.contacts.length})</span></button>
          <button onClick={() => setWorkspaceTab('related')} className={`shrink-0 border-b-2 px-3 py-2 text-xs font-black ${workspaceTab === 'related' ? 'border-navy-800 text-navy-900' : 'border-transparent text-gray-400'}`}>Related Complaints <span className="ml-1 text-[10px]">({(complaint.similar_count || 0) + opsContext.related.length})</span></button><button onClick={() => setWorkspaceTab('assignments')} className={`shrink-0 border-b-2 px-3 py-2 text-xs font-black ${workspaceTab === 'assignments' ? 'border-navy-800 text-navy-900' : 'border-transparent text-gray-400'}`}>Assignment History <span className="ml-1 text-[10px]">({assignmentHistory.length})</span></button>
        </div>
      </div>

      <div className="p-5">
        {workspaceTab === 'notes' && <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]"><div><label className="mb-1.5 block text-xs font-black uppercase text-gray-500">Add Internal Note</label><textarea rows={4} value={internalNote} onChange={e => setInternalNote(e.target.value)} className="input-field resize-none rounded-lg" placeholder="Add an internal staff note..."/><button onClick={handleInternalNote} disabled={posting || !internalNote.trim()} className="btn-secondary mt-2 rounded-lg">Save Internal Note</button></div><div><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Recent Notes</p>{opsContext.notes.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{opsContext.notes.slice(0,6).map(note => <div key={note.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3"><p className="text-xs text-gray-700">{note.note}</p><p className="mt-1 text-[10px] text-gray-400">{note.author?.full_name || note.department_code} · {formatDate(note.created_at)}</p></div>)}</div> : <p className="mt-2 text-xs text-gray-400">No internal notes yet.</p>}</div></div>}

        {workspaceTab === 'contact' && <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]"><form onSubmit={handleContactLog}><div className="grid gap-2 sm:grid-cols-2"><select value={contactForm.channel} onChange={e => setContactForm(v => ({...v,channel:e.target.value}))} className="input-field rounded-lg"><option value="phone">Phone</option><option value="sms">SMS</option><option value="email">Email</option><option value="in_system">In-system</option><option value="in_person">In person</option><option value="other">Other</option></select><select value={contactForm.contact_type} onChange={e => setContactForm(v => ({...v,contact_type:e.target.value}))} className="input-field rounded-lg"><option value="follow_up">Follow-up</option><option value="status_update">Status update</option><option value="information_request">Information request</option><option value="outbound">Outbound contact</option><option value="inbound">Inbound contact</option></select></div><textarea rows={4} value={contactForm.summary} onChange={e => setContactForm(v => ({...v,summary:e.target.value}))} className="input-field mt-2 resize-none rounded-lg" placeholder="What was communicated?"/><button disabled={posting || !contactForm.summary.trim()} className="btn-primary mt-2 rounded-lg">Record Communication</button></form><div><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Communication History</p>{opsContext.contacts.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{opsContext.contacts.slice(0,6).map(contact => <div key={contact.id} className="rounded-lg border border-blue-100 bg-blue-50/50 p-3"><p className="text-xs font-bold text-blue-900">{String(contact.channel).replaceAll('_',' ')} · {String(contact.contact_type).replaceAll('_',' ')}</p><p className="mt-1 text-xs text-blue-800">{contact.summary}</p><p className="mt-1 text-[10px] text-blue-500">{contact.staff?.full_name || contact.department_code} · {formatDate(contact.created_at)}</p></div>)}</div> : <p className="mt-2 text-xs text-gray-400">No customer contact recorded yet.</p>}</div></div>}

        {workspaceTab === 'related' && <div><p className="text-xs text-gray-500">Nearby reports are suggestions until staff links them. Linked records remain separate customer complaints.</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(complaint.similar_ids || []).map(relatedId => { const candidate = store.complaints.find(item => item.id === relatedId); return <div key={relatedId} className="rounded-lg border border-amber-100 bg-amber-50 p-3"><p className="text-xs font-bold text-amber-900">{candidate?.reference_number || relatedId}</p><p className="mt-1 truncate text-[11px] text-amber-700">{candidate?.address || 'Nearby complaint candidate'}</p><button onClick={() => linkCandidate(relatedId)} className="mt-2 rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-black text-amber-800 shadow-sm">Link Complaint</button></div>})}{opsContext.related.map(item => <button key={item.id} onClick={() => navigate(`/complaints/${item.id}`)} className="rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50"><p className="text-xs font-bold text-gray-900">{item.reference_number}</p><p className="mt-1 truncate text-[11px] text-gray-500">{item.address_text}</p><p className="mt-2 text-[10px] font-black text-brand-700">Open related complaint →</p></button>)}{!(complaint.similar_ids || []).length && !opsContext.related.length && <p className="text-xs text-gray-400">No related or possible duplicate complaints found.</p>}</div>{opsContext.incidents.length > 0 && <p className="mt-4 text-xs font-bold text-violet-700">Incident: {opsContext.incidents.map(i => i.title).join(', ')}</p>}</div>}
        {workspaceTab === 'assignments' && <div className="space-y-2">{assignmentHistory.length ? assignmentHistory.map((item,index) => <div key={item.id || index} className="rounded-lg border border-gray-200 p-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-black text-navy-900">{item.assigned_name || item.assignee?.full_name || item.assigned_staff?.full_name || 'Maintenance Personnel'}</p><span className="text-[10px] font-black uppercase text-gray-400">{String(item.status || 'assigned').replaceAll('_',' ')}</span></div><p className="mt-1 text-xs text-gray-500">Assigned {formatDate(item.created_at)}{item.reassignment_reason ? ` · ${item.reassignment_reason}` : ''}</p></div>) : <p className="text-xs text-gray-400">No assignment history yet.</p>}</div>}
      </div>
    </section>}

    <section className="card rounded-xl p-5"><div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="font-display font-bold text-navy-900">Complete Timeline</h2><p className="mt-1 text-xs text-gray-500">Complaint handoffs, assignments, status changes, and staff updates.</p></div></div><Timeline complaintId={complaint.id} refreshKey={`${complaint.status}-${refreshKey}`} />{canComment && !['rejected','cancelled'].includes(complaint.status) && <div className="mt-4 border-t pt-4 no-print"><textarea name="complaintdetailspage-add-a-task-update-1" aria-label="Add a task update..." value={comment} onChange={event => setComment(event.target.value)} rows={3} placeholder="Add a task update..." className="input-field resize-none text-sm" /><button onClick={handleComment} disabled={posting || !comment.trim()} className="btn-primary mt-2 rounded-lg disabled:opacity-50">{posting ? <Spinner className="w-4 h-4 border-2 border-white" /> : 'Post Timeline Update'}</button></div>}</section>

    {['resolved','completed'].includes(complaint.status) && <section className="card rounded-xl p-5"><h2 className="font-display font-bold text-navy-900 mb-3">{isCustomer ? 'Resolution Feedback' : 'Customer Feedback'}</h2><FeedbackBox key={complaint.id} complaintId={complaint.id} /></section>}

    <ConfirmDialog open={restoreOpen} title="Undo this rejection?" message="The rejection reason will be cleared and the complaint will return to the correct queue." confirmLabel="Undo Rejection" loading={busy} onConfirm={handleRestore} onCancel={() => setRestoreOpen(false)} />
    <Modal open={cancelOpen} title="Cancel Complaint" subtitle="This is available only before assignment. The record will remain in your history." onClose={() => !busy && setCancelOpen(false)}><div className="space-y-4"><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Reason (optional)</label><textarea name="complaintdetailspage-duplicate-report-issue-resolved-before-dispatch-entered-by-mistake-2" aria-label="Duplicate report, issue resolved before dispatch, entered by mistake…" rows={4} value={cancelReason} onChange={event => setCancelReason(event.target.value)} className="input-field rounded-lg resize-none" placeholder="Duplicate report, issue resolved before dispatch, entered by mistake…" /></div><div className="flex justify-end gap-2"><button onClick={() => setCancelOpen(false)} className="btn-secondary rounded-lg">Keep Complaint</button><button onClick={handleCancel} disabled={busy} className="rounded-lg px-5 py-2.5 bg-red-600 text-white font-bold text-sm disabled:opacity-50">{busy ? 'Cancelling…' : 'Cancel Complaint'}</button></div></div></Modal>
    <RejectionDialog open={rejectOpen} title="Reject this complaint?" description="Choose the standard reason and add customer-visible details if needed." options={operational.reasonCodes.filter(item => item.action_type === 'closure' && (!item.department_code || item.department_code === 'COMMERCIAL')).map(item => ({ value: item.code, label: item.label }))} loading={busy} onConfirm={handleReject} onCancel={() => setRejectOpen(false)} />

    <Modal open={assignOpen} title={complaint.assigned_to ? 'Reassign Maintenance Personnel' : 'Assign Maintenance Personnel'} subtitle={complaint.complaint_type} onClose={() => !busy && setAssignOpen(false)}><div className="space-y-4"><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Maintenance Personnel</label><select name="complaintdetailspage-assign-staff-3" aria-label="Assign Maintenance Personnel" value={assignStaff} onChange={event => setAssignStaff(event.target.value)} className="input-field rounded-lg"><option value="">Select Maintenance Personnel…</option>{staffList.map(staff => <option key={staff.id} value={staff.id} disabled={!staff.is_active || ['on_leave', 'off_duty'].includes(staff.availability_status)}>{staff.full_name}{!staff.is_active ? ' — Inactive' : staff.availability_status !== 'available' ? ` — ${String(staff.availability_status).replace('_',' ')}` : ''}</option>)}</select></div><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">ECMD Crew (optional)</label><select aria-label="Assign ECMD crew" value={assignCrew} onChange={event => setAssignCrew(event.target.value)} className="input-field rounded-lg"><option value="">No crew assignment</option>{crewList.map(crew => <option key={crew.id} value={crew.id}>{crew.name}</option>)}</select></div>{complaint.assigned_to && assignStaff && assignStaff !== complaint.assigned_to && <div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Reassignment Reason *</label><select required value={assignReason} onChange={event => setAssignReason(event.target.value)} className="input-field rounded-lg"><option value="">Choose reason…</option>{operational.reasonCodes.filter(item => item.action_type === 'reassignment').map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></div>}<div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Instructions</label><textarea name="complaintdetailspage-assign-notes-4" aria-label="Assignment Instructions" rows={4} value={assignNotes} onChange={event => setAssignNotes(event.target.value)} className="input-field rounded-lg resize-none" /></div><div className="flex justify-end gap-2"><button onClick={() => setAssignOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button onClick={handleAssign} disabled={!assignStaff || busy || Boolean(complaint.assigned_to && assignStaff !== complaint.assigned_to && !assignReason)} className="btn-primary rounded-lg disabled:opacity-50">{busy ? 'Saving…' : complaint.assigned_to ? 'Confirm Reassignment' : 'Confirm Assignment'}</button></div></div></Modal>

    <Modal open={followOpen} title="Request Customer Information" subtitle="Ask for missing information without rejecting the complaint." onClose={() => !busy && setFollowOpen(false)}><div className="space-y-4"><textarea rows={5} value={followPrompt} onChange={e => setFollowPrompt(e.target.value)} className="input-field resize-none rounded-lg" placeholder="Example: Please provide the nearest landmark to the reported leak."/><div className="flex justify-end gap-2"><button onClick={() => setFollowOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button onClick={requestCustomerInfo} disabled={busy || followPrompt.trim().length < 5} className="btn-primary rounded-lg disabled:opacity-50">Send Request</button></div></div></Modal>

    <Modal open={mergeOpen} title="Merge Duplicate Complaint" subtitle="The current complaint becomes a retained historical record pointing to the primary complaint." onClose={() => !busy && setMergeOpen(false)}><div className="space-y-4"><select value={mergeForm.primary_complaint_id} onChange={e => setMergeForm(v => ({...v,primary_complaint_id:e.target.value}))} className="input-field rounded-lg"><option value="">Select primary complaint…</option>{store.complaints.filter(item => item.id !== id && !['resolved','completed','rejected','cancelled','merged'].includes(item.status)).map(item => <option key={item.id} value={item.id}>{item.reference_number} · {item.complaint_type}</option>)}</select><textarea rows={4} value={mergeForm.reason} onChange={e => setMergeForm(v => ({...v,reason:e.target.value}))} className="input-field resize-none rounded-lg" placeholder="Why are these complaints duplicates?"/><div className="flex justify-end gap-2"><button onClick={() => setMergeOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button onClick={mergeThisComplaint} disabled={busy || !mergeForm.primary_complaint_id || mergeForm.reason.trim().length < 3} className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">Merge Complaint</button></div></div></Modal>

    <Modal open={priorityOpen} title={canCommercialReview ? 'Priority Score Override' : 'Operational Priority Override'} subtitle={canCommercialReview ? 'The classifier recommendation is preserved. Every manual change requires a reason and is audited.' : 'ECMD can adjust the operational priority after field handoff. The classifier evidence remains unchanged.'} onClose={() => !busy && setPriorityOpen(false)}><form onSubmit={handlePriorityOverride} className="space-y-4">{canCommercialReview ? <><div className="rounded-lg border border-navy-100 bg-navy-50 p-3 text-sm text-navy-800"><span className="font-bold">Classifier recommendation:</span> {complaint.algorithm_priority_score ?? complaint.priority_score}/100</div><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Operational Priority Score (0–100)</label><input type="number" min="0" max="100" step="1" required value={priorityForm.score} onChange={event => setPriorityForm(form => ({ ...form, score: event.target.value }))} className="input-field rounded-lg" /></div></> : <div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Operational Priority</label><select required value={priorityForm.priority} onChange={event => setPriorityForm(form => ({ ...form, priority: event.target.value }))} className="input-field rounded-lg"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>}<div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Reason for Change *</label><textarea rows={4} required minLength={5} value={priorityForm.reason} onChange={event => setPriorityForm(form => ({ ...form, reason: event.target.value }))} className="input-field rounded-lg resize-none" placeholder="Explain why operational judgment requires a different priority." /></div><div className="flex flex-col sm:flex-row justify-end gap-2">{canCommercialReview && complaint.priority_is_overridden && <button type="button" onClick={handlePriorityReset} disabled={busy || priorityForm.reason.trim().length < 5} className="btn-secondary rounded-lg disabled:opacity-50">Restore Classifier Score</button>}<button type="button" onClick={() => setPriorityOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button disabled={busy || priorityForm.reason.trim().length < 5} className="btn-primary rounded-lg disabled:opacity-50">Save Manual Override</button></div></form></Modal>

    <Modal open={editOpen} title="Edit Pending Complaint" onClose={() => !busy && setEditOpen(false)}><form onSubmit={handleEdit} className="space-y-4"><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Type</label><select name="complaintdetailspage-complaint-type-5" aria-label="Complaint type" value={editForm.complaint_type} onChange={event => setEditForm(form => ({...form, complaint_type:event.target.value}))} className="input-field rounded-lg">{COMPLAINT_TYPES.map(type => <option key={type}>{type}</option>)}</select></div><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Description</label><textarea name="complaintdetailspage-description-6" aria-label="Description" rows={5} required value={editForm.description} onChange={event => setEditForm(form => ({...form, description:event.target.value}))} className="input-field rounded-lg resize-none" /></div><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Address</label><input name="complaintdetailspage-address-7" aria-label="Address" required value={editForm.address} onChange={event => setEditForm(form => ({...form, address:event.target.value}))} className="input-field rounded-lg" /></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button disabled={busy} className="btn-primary rounded-lg">Save Changes</button></div></form></Modal>

    <Modal open={reopenOpen} title="Reopen Complaint" subtitle="Explain what remains unresolved." onClose={() => !busy && setReopenOpen(false)}><div className="space-y-4"><textarea name="complaintdetailspage-the-issue-returned-was-not-fully-resolved-because-8" aria-label="The issue returned / was not fully resolved because…" rows={5} value={reopenReason} onChange={event => setReopenReason(event.target.value)} className="input-field rounded-lg resize-none" placeholder="The issue returned / was not fully resolved because…" /><div className="flex justify-end gap-2"><button onClick={() => setReopenOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button onClick={handleReopen} disabled={busy || reopenReason.trim().length < 5} className="btn-primary rounded-lg disabled:opacity-50">Reopen for Review</button></div></div></Modal>

    <Modal open={planOpen} title="Update Work Plan" subtitle="Record materials, equipment, or work notes for the assigned repair." onClose={() => !busy && setPlanOpen(false)}><form onSubmit={handlePlan} className="space-y-4"><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Materials / Equipment / Work Notes</label><textarea rows={5} value={plan.materials_used} onChange={event => setPlan(value => ({...value, materials_used:event.target.value}))} className="input-field rounded-lg resize-none" placeholder="Valve, clamp, meter seal, equipment or work details..." /></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setPlanOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button disabled={busy} className="btn-primary rounded-lg">Save Work Plan</button></div></form></Modal>

    <Modal open={completeOpen} title="Submit Completion Notes" subtitle="Describe the work performed. ECMD will verify the resolution before the complaint is closed." onClose={() => !busy && setCompleteOpen(false)}><form onSubmit={handleComplete} className="space-y-4">{templates.length > 0 && <div><p className="mb-2 text-xs font-black uppercase text-gray-500">Quick Note Templates</p><div className="flex flex-wrap gap-2">{templates.map(t => <button key={t.id} type="button" onClick={() => setCompletion(v => ({...v, completion_notes:t.content}))} className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-bold text-gray-700 hover:border-navy-300">{t.label}</button>)}</div></div>}<div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Resolution Performed *</label><textarea rows={5} required minLength={5} value={completion.completion_notes} onChange={event => setCompletion(value => ({...value, completion_notes:event.target.value}))} className="input-field rounded-lg resize-none" placeholder="Describe what was inspected, repaired, replaced, or restored." /></div><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Materials Used</label><textarea rows={3} value={completion.materials_used} onChange={event => setCompletion(value => ({...value, materials_used:event.target.value}))} className="input-field rounded-lg resize-none" /></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setCompleteOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button disabled={busy || completion.completion_notes.trim().length < 5} className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Submitting…' : 'Submit for ECMD Verification'}</button></div></form></Modal>

    <Modal open={forwardOpen} title="Forward Complaint to ECMD" subtitle="Commercial Services has reviewed this complaint. Forwarding places it in the ECMD dispatch queue." onClose={() => !busy && setForwardOpen(false)}><div className="space-y-4"><div><label className="block text-xs font-black uppercase text-gray-500 mb-1.5">Handoff Note</label><textarea rows={4} value={forwardNote} onChange={e => setForwardNote(e.target.value)} className="input-field resize-none rounded-lg" placeholder="Optional note for ECMD..."/></div><div className="flex justify-end gap-2"><button onClick={() => setForwardOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button onClick={handleForward} disabled={busy} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white">{busy ? 'Forwarding…' : 'Forward to ECMD'}</button></div></div></Modal>

    <Modal open={verifyOpen} title="ECMD Resolution Verification" subtitle="Verify the Maintenance completion notes or return the complaint for additional field work." onClose={() => !busy && setVerifyOpen(false)}><form onSubmit={handleVerify} className="space-y-4"><div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><p className="text-xs font-black uppercase text-gray-500">Maintenance Completion</p><p className="mt-1 text-sm text-gray-700">{complaint.completion_notes || 'No completion notes recorded.'}</p></div><label className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-bold text-orange-800"><input type="checkbox" checked={verifyForm.return_to_field} onChange={e => setVerifyForm(v => ({...v,return_to_field:e.target.checked}))}/>Return for additional field work</label>{!verifyForm.return_to_field && <div><label className="block text-xs font-black uppercase text-gray-500 mb-1.5">Resolution Code</label><select value={verifyForm.resolution_code} onChange={e => setVerifyForm(v => ({...v,resolution_code:e.target.value}))} className="input-field rounded-lg">{operational.reasonCodes.filter(r => r.action_type === 'resolution').map(r => <option key={r.code} value={r.code}>{r.label}</option>)}{!operational.reasonCodes.some(r => r.action_type === 'resolution' && r.code === 'resolved') && <option value="resolved">Resolved</option>}</select></div>}<div><label className="block text-xs font-black uppercase text-gray-500 mb-1.5">Verification Notes</label><textarea rows={4} value={verifyForm.resolution_notes} onChange={e => setVerifyForm(v => ({...v,resolution_notes:e.target.value}))} className="input-field resize-none rounded-lg" placeholder={verifyForm.return_to_field ? 'Explain what additional work is needed...' : 'Optional verification / closure note...'}/></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setVerifyOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button disabled={busy} className={`rounded-lg px-5 py-2.5 text-sm font-bold text-white ${verifyForm.return_to_field ? 'bg-orange-600' : 'bg-green-600'}`}>{busy ? 'Saving…' : verifyForm.return_to_field ? 'Return to Field Work' : 'Verify & Resolve'}</button></div></form></Modal>

    <Modal open={issueOpen} title="Request ECMD Help" onClose={() => !busy && setIssueOpen(false)}><form onSubmit={handleIssue} className="space-y-4"><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Request Type</label><select name="complaintdetailspage-kind-14" aria-label="Kind" value={issue.kind} onChange={event => setIssue(value => ({...value, kind:event.target.value}))} className="input-field rounded-lg"><option value="assistance">Additional Assistance / Crew</option><option value="reassignment">Request Reassignment</option><option value="cannot_complete">Cannot Complete Task</option></select></div><div><label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Reason *</label><textarea name="complaintdetailspage-explain-the-access-problem-missing-equipment-safety-issue-or-reason-for-reassignment-15" aria-label="Explain the access problem, missing equipment, safety issue, or reason for reassignment." rows={5} required minLength={5} value={issue.reason} onChange={event => setIssue(value => ({...value, reason:event.target.value}))} className="input-field rounded-lg resize-none" placeholder="Explain the access problem, missing equipment, safety issue, or reason for reassignment." /></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setIssueOpen(false)} className="btn-secondary rounded-lg">Cancel</button><button disabled={busy || issue.reason.trim().length < 5} className="btn-primary rounded-lg disabled:opacity-50">Send Request</button></div></form></Modal>
  </div>
}
