import { useState, useEffect } from 'react'
import { useComplaintStore } from '../../store/complaintStore'
import { Spinner } from './Feedback'

function timeAgo(iso) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  return `${days}d ago`
}

// A status-change entry ("Status changed to...") gets a dot icon;
// a free-text crew comment gets a speech-bubble icon, so the two are
// visually distinguishable in the feed at a glance.
function isStatusChange(message) {
  return message.startsWith('Status changed to') || message.startsWith('Assigned to crew') || message.startsWith('Complaint rejected') || message.startsWith('Rejection undone')
}

/**
 * Vertical activity timeline for a complaint's maintenance task.
 * Fetches on mount; pass `refreshKey` (e.g. the complaint's status)
 * to force a re-fetch when something external changes it.
 */
export default function Timeline({ complaintId, refreshKey }) {
  const fetchUpdates = useComplaintStore(s => s.fetchUpdates)
  const [updates, setUpdates] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchUpdates(complaintId)
      .then(u => { if (!cancelled) setUpdates(u) })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complaintId, refreshKey])

  if (error) return <p className="text-xs text-red-500">{error}</p>
  if (updates === null) return <div className="flex items-center gap-2 py-3"><Spinner className="w-4 h-4 border-2 border-gray-300" /><span className="text-xs text-gray-400">Loading timeline...</span></div>
  if (updates.length === 0) return <p className="text-xs text-gray-400 italic py-2">No activity logged yet.</p>

  return (
    <div className="space-y-0">
      {updates.map((u, i) => (
        <div key={u.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${isStatusChange(u.message) ? 'bg-brand-600' : 'bg-amber-400'}`} />
            {i < updates.length - 1 && <div className="w-px flex-1 bg-gray-200 my-0.5" />}
          </div>
          <div className="pb-4 min-w-0">
            <p className="text-sm text-gray-700 leading-snug">{u.message}</p>
            <p className="text-xs text-gray-400 mt-0.5">{u.author_name} · {timeAgo(u.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
