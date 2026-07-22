import { useState, useEffect } from 'react'
import { useComplaintStore } from '../../store/complaintStore'
import { Spinner, ErrorBanner } from './Feedback'

function Star({ filled, onClick, onMouseEnter, onMouseLeave, size = 'w-7 h-7' }) {
  return (
    <button type="button" onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      className={`${size} transition-colors ${filled ? 'text-gold-500' : 'text-gray-200'}`}>
      <svg fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.447a1 1 0 00-.364 1.118l1.287 3.957c.3.921-.755 1.688-1.54 1.118l-3.366-2.446a1 1 0 00-1.176 0l-3.367 2.446c-.784.57-1.838-.197-1.539-1.118l1.286-3.957a1 1 0 00-.363-1.118L2.02 9.384c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.287-3.957z"/></svg>
    </button>
  )
}

// Shown once a complaint is marked completed. Either lets the
// customer rate/comment, or — if they already have — shows what they
// submitted, read-only.
export default function FeedbackBox({ complaintId }) {
  const fetchFeedback  = useComplaintStore(s => s.fetchFeedback)
  const submitFeedback = useComplaintStore(s => s.submitFeedback)

  const [existing, setExisting] = useState(undefined) // undefined = loading, null = none yet
  const [rating, setRating]     = useState(0)
  const [hover, setHover]       = useState(0)
  const [comment, setComment]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    fetchFeedback(complaintId).then(setExisting).catch(() => setExisting(null))
  }, [complaintId, fetchFeedback])

  const handleSubmit = async () => {
    if (rating === 0) { setError('Pick a star rating first.'); return }
    setSubmitting(true)
    setError('')
    try {
      const fb = await submitFeedback(complaintId, rating, comment.trim())
      setExisting(fb)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (existing === undefined) {
    return <div className="flex items-center gap-2 py-2"><Spinner className="w-4 h-4 border-2 border-gray-300" /><span className="text-xs text-gray-400">Loading...</span></div>
  }

  if (existing) {
    return (
      <div className="bg-green-50 border border-green-200 p-4">
        <p className="text-xs font-black text-green-700 uppercase tracking-wider mb-2">Your Feedback</p>
        <div className="flex gap-0.5 mb-2">
          {[1, 2, 3, 4, 5].map(n => <Star key={n} filled={n <= existing.rating} size="w-5 h-5" />)}
        </div>
        {existing.comment && <p className="text-sm text-gray-600 italic">"{existing.comment}"</p>}
      </div>
    )
  }

  return (
    <div className="bg-gold-50 border border-gold-200 p-4">
      <p className="text-sm font-bold text-gray-800 mb-1">How did we do?</p>
      <p className="text-xs text-gray-500 mb-3">Let us know how the resolution went.</p>

      {error && <div className="mb-3"><ErrorBanner message={error} /></div>}

      <div className="flex gap-1 mb-3">
        {[1, 2, 3, 4, 5].map(n => (
          <Star key={n} filled={n <= (hover || rating)}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)} />
        ))}
      </div>

      <textarea value={comment} onChange={e => setComment(e.target.value)}
        placeholder="Anything else you'd like to share? (optional)"
        rows={2} className="input-field text-sm resize-none mb-3" />

      <button onClick={handleSubmit} disabled={submitting}
        className="btn-primary text-sm px-5 py-2 flex items-center gap-2">
        {submitting ? <><Spinner className="w-4 h-4 border-2 border-white" />Submitting...</> : 'Submit Feedback'}
      </button>
    </div>
  )
}
