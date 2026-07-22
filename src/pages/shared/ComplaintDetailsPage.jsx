import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useComplaintStore } from '../../store/complaintStore'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badges'
import { ErrorBanner, PageLoader, Spinner } from '../../components/ui/Feedback'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import InlineMap from '../../components/ui/InlineMap'
import Timeline from '../../components/ui/Timeline'
import FeedbackBox from '../../components/ui/FeedbackBox'

const ROLE_HOME = {
  customer: '/customer/my-complaints',
  admin: '/admin/complaints',
  maintenance_personnel: '/maintenance/tasks',
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function DetailRow({ label, children }) {
  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <div className="text-sm text-gray-700 break-words">{children}</div>
    </div>
  )
}

function ClassifierAnalysis({ complaint }) {
  const hasStoredAnalysis = Boolean(complaint.classifier_version || complaint.classification_keywords?.length)
  const confidence = complaint.classification_confidence == null
    ? null
    : Math.round(Number(complaint.classification_confidence))
  const sentimentStyles = {
    urgent: 'bg-red-100 text-red-800 border-red-200',
    negative: 'bg-amber-100 text-amber-800 border-amber-200',
    neutral: 'bg-green-100 text-green-800 border-green-200',
  }

  return (
    <div className="card rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display font-bold text-navy-900">Automated Classification</h2>
          <p className="text-xs text-gray-400 mt-1">Dataset-backed analysis of the complaint description</p>
        </div>
        {complaint.classifier_version && (
          <span className="text-[10px] font-mono bg-gray-100 text-gray-500 px-2 py-1 rounded">{complaint.classifier_version}</span>
        )}
      </div>

      {!hasStoredAnalysis ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
          <p className="text-sm font-bold text-gray-700">No stored classification analysis</p>
          <p className="text-xs text-gray-400 mt-1">This is an older complaint created before the dataset classifier was added.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Predicted Category</p>
              <p className="text-sm font-bold text-navy-900 mt-1">{complaint.classified_category || complaint.complaint_type}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Confidence</p>
              <p className="text-2xl font-black text-navy-900 mt-0.5">{confidence ?? '—'}{confidence != null && <span className="text-xs font-normal text-gray-400">%</span>}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Text Sentiment</p>
              <span className={`inline-flex mt-1.5 px-2 py-1 rounded border text-xs font-black uppercase ${sentimentStyles[complaint.classification_sentiment] || sentimentStyles.neutral}`}>
                {complaint.classification_sentiment || 'neutral'}
              </span>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Priority Class</p>
              <div className="mt-1.5"><PriorityBadge priority={complaint.priority} /></div>
            </div>
          </div>

          {complaint.classification_mismatch && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-xs font-bold text-amber-900">Category mismatch detected</p>
              <p className="text-xs text-amber-700 mt-0.5">Customer selected “{complaint.complaint_type},” but the description was classified as “{complaint.classified_category}.”</p>
            </div>
          )}

          <div className="mt-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Matched Dataset Terms</p>
            {complaint.classification_keywords?.length ? (
              <div className="flex flex-wrap gap-2">
                {complaint.classification_keywords.map((item, index) => (
                  <span key={`${item.id || item.term}-${index}`} className="inline-flex items-center gap-1 rounded-full border border-navy-100 bg-navy-50 px-2.5 py-1 text-xs font-bold text-navy-700">
                    {item.term}
                    <span className={Number(item.priority_weight) >= 0 ? 'text-green-700' : 'text-red-600'}>
                      {Number(item.priority_weight) >= 0 ? '+' : ''}{item.priority_weight}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No keyword matched; the selected complaint type was used as the fallback category.</p>
            )}
          </div>

          {complaint.classification_reasons?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Decision Explanation</p>
              <ul className="space-y-1.5">
                {complaint.classification_reasons.map((reason, index) => (
                  <li key={index} className="text-xs text-gray-600 flex gap-2"><span className="text-gold-500">•</span><span>{reason}</span></li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ComplaintDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const fetchComplaint = useComplaintStore(s => s.fetchComplaint)
  const restoreComplaint = useComplaintStore(s => s.restoreComplaint)
  const postComment = useComplaintStore(s => s.postComment)

  const [complaint, setComplaint] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [comment, setComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [commentError, setCommentError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [photoError, setPhotoError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchComplaint(id)
      .then(data => { if (!cancelled) setComplaint(data) })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, fetchComplaint])

  const handleRestore = async () => {
    setRestoring(true)
    setError('')
    try {
      const updated = await restoreComplaint(id)
      setComplaint(updated)
      setRefreshKey(k => k + 1)
      setRestoreOpen(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setRestoring(false)
    }
  }

  const handleComment = async () => {
    if (!comment.trim()) return
    setPosting(true)
    setCommentError('')
    try {
      await postComment(id, comment.trim())
      setComment('')
      setRefreshKey(k => k + 1)
    } catch (err) {
      setCommentError(err.message)
    } finally {
      setPosting(false)
    }
  }

  if (loading) return <PageLoader label="Loading complaint details..." />
  if (!complaint) return <ErrorBanner message={error || 'Complaint not found.'} onRetry={() => navigate(ROLE_HOME[user?.role] || '/')} />

  const canComment = ['admin', 'maintenance_personnel'].includes(user?.role) && complaint.assigned_to
  const photo = complaint.photo_url || complaint.photo_urls?.[0]

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(ROLE_HOME[user?.role] || -1)}
        className="text-sm font-bold text-navy-600 hover:text-navy-900 flex items-center gap-2">
        ← Back to {user?.role === 'maintenance_personnel' ? 'My Tasks' : user?.role === 'admin' ? 'All Complaints' : 'My Reports'}
      </button>

      <div className="page-band wave-header rounded-2xl px-6 py-6 relative overflow-hidden">
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Complaint Details</p>
            <h1 className="font-display font-black text-white text-2xl sm:text-3xl">{complaint.complaint_type}</h1>
            <p className="text-navy-300 text-xs font-mono mt-2">Reference: {complaint.id}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PriorityBadge priority={complaint.priority} />
            <StatusBadge status={complaint.status} />
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {complaint.status === 'rejected' && (
        <div className="rounded-xl p-5 bg-red-50 border border-red-200">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <p className="font-display font-bold text-red-900">Complaint rejected</p>
              <p className="text-sm text-red-800 mt-1 leading-relaxed">{complaint.rejection_reason || 'No rejection reason was recorded.'}</p>
              {complaint.rejected_at && <p className="text-xs text-red-500 mt-2">Rejected {formatDate(complaint.rejected_at)}</p>}
            </div>
            {user?.role === 'admin' && (
              <button onClick={() => setRestoreOpen(true)}
                className="shrink-0 px-4 py-2 rounded-lg text-sm font-bold text-white bg-navy-800 hover:bg-navy-900">
                ↶ Undo Rejection
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="card rounded-xl p-5">
            <h2 className="font-display font-bold text-navy-900 mb-3">Report Information</h2>
            <DetailRow label="Description">{complaint.description}</DetailRow>
            <DetailRow label="Address">{complaint.address}</DetailRow>
            <DetailRow label="Customer">{complaint.customer_name}</DetailRow>
            {complaint.task_notes && <DetailRow label="Admin Instructions">{complaint.task_notes}</DetailRow>}
          </div>

          {complaint.gps && (
            <div className="card rounded-xl p-5">
              <h2 className="font-display font-bold text-navy-900 mb-2">Location</h2>
              <p className="text-xs font-mono text-brand-700 mb-3">{complaint.gps.lat.toFixed(5)}, {complaint.gps.lng.toFixed(5)}</p>
              <InlineMap lat={complaint.gps.lat} lng={complaint.gps.lng} accuracy={complaint.gps.accuracy} height={280} />
            </div>
          )}

          <div className="card rounded-xl p-5">
            <h2 className="font-display font-bold text-navy-900 mb-3">Attached Photo</h2>
            {photo && !photoError ? (
              <a href={photo} target="_blank" rel="noreferrer" className="block">
                <img
                  src={photo}
                  alt="Complaint attachment"
                  onError={() => setPhotoError(true)}
                  className="w-full max-h-[480px] object-contain rounded-lg bg-gray-50 border border-gray-100"
                />
                <p className="text-xs text-brand-700 font-bold mt-2">Open full-size photo ↗</p>
              </a>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center">
                <div className="text-3xl mb-2">📷</div>
                <p className="font-bold text-gray-700">No photo attached</p>
                <p className="text-sm text-gray-400 mt-1">
                  {photoError ? 'The attached photo could not be loaded.' : 'The customer submitted this complaint without a photo.'}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="card rounded-xl p-5">
            <h2 className="font-display font-bold text-navy-900 mb-2">Task Summary</h2>
            <DetailRow label="Priority Score"><span className="font-display font-black text-3xl text-navy-900">{complaint.priority_score}</span> / 100</DetailRow>
            <DetailRow label="Assigned Technician">{complaint.assigned_name || 'Not assigned'}</DetailRow>
            <DetailRow label="Filed">{formatDate(complaint.created_at)}</DetailRow>
            <DetailRow label="Last Updated">{formatDate(complaint.updated_at)}</DetailRow>
            <DetailRow label="Task Assigned">{formatDate(complaint.task_created_at)}</DetailRow>
            <DetailRow label="Completed">{formatDate(complaint.completed_at)}</DetailRow>
          </div>

          <ClassifierAnalysis complaint={complaint} />

          <div className="card rounded-xl p-5">
            <h2 className="font-display font-bold text-navy-900 mb-3">Complete Timeline</h2>
            <Timeline complaintId={complaint.id} refreshKey={`${complaint.status}-${refreshKey}`} />

            {canComment && complaint.status !== 'rejected' && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                {commentError && <p className="text-xs text-red-600 mb-2">{commentError}</p>}
                <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
                  placeholder="Add a task update..." className="input-field resize-none text-sm" />
                <button onClick={handleComment} disabled={posting || !comment.trim()}
                  className="btn-primary mt-2 w-full rounded-lg text-sm flex justify-center items-center gap-2 disabled:opacity-50">
                  {posting ? <Spinner className="w-4 h-4 border-2 border-white" /> : 'Post Timeline Update'}
                </button>
              </div>
            )}
          </div>

          {complaint.status === 'completed' && (
            <div className="card rounded-xl p-5">
              <h2 className="font-display font-bold text-navy-900 mb-3">
                {user?.role === 'customer' ? 'Resolution Feedback' : 'Customer Feedback'}
              </h2>
              <FeedbackBox complaintId={complaint.id} />
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={restoreOpen}
        title="Undo this rejection?"
        message="The rejection reason will be cleared. If a technician is already attached, the complaint returns to Assigned; otherwise it returns to Pending."
        confirmLabel="Undo Rejection"
        loading={restoring}
        onConfirm={handleRestore}
        onCancel={() => setRestoreOpen(false)}
      />
    </div>
  )
}
