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

      <div className="page-band rounded-2xl px-6 py-6 relative overflow-hidden">
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

          {photo && (
            <div className="card rounded-xl p-5">
              <h2 className="font-display font-bold text-navy-900 mb-3">Attached Photo</h2>
              <a href={photo} target="_blank" rel="noreferrer">
                <img src={photo} alt="Complaint attachment" className="w-full max-h-[480px] object-contain rounded-lg bg-gray-50 border border-gray-100" />
              </a>
            </div>
          )}
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

          {user?.role === 'customer' && complaint.status === 'completed' && (
            <div className="card rounded-xl p-5"><FeedbackBox complaintId={complaint.id} /></div>
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
