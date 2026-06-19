import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAnnouncementStore } from '../../store/announcementStore'
import { useAuthStore } from '../../store/authStore'
import { ANNOUNCEMENT_CATEGORIES } from '../../mock/data'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

function CategoryBadge({ category }) {
  const cat = ANNOUNCEMENT_CATEGORIES.find(c => c.value === category)
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5  text-xs font-semibold ${cat?.color || 'bg-gray-100 text-gray-600'}`}>
      {cat?.label || category}
    </span>
  )
}

const schema = z.object({
  title:    z.string().min(5, 'Title must be at least 5 characters'),
  content:  z.string().min(20, 'Content must be at least 20 characters'),
  category: z.string().min(1, 'Select a category'),
})

export default function AdminAnnouncementsPage() {
  const user               = useAuthStore(s => s.user)
  const announcements      = useAnnouncementStore(s => s.announcements)
  const postAnnouncement   = useAnnouncementStore(s => s.postAnnouncement)
  const deleteAnnouncement = useAnnouncementStore(s => s.deleteAnnouncement)

  const [posting, setPosting]         = useState(false)
  const [toast, setToast]             = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [showForm, setShowForm]       = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { title: '', content: '', category: '' },
  })

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const onSubmit = async (data) => {
    setPosting(true)
    await postAnnouncement(data, user.full_name)
    setPosting(false)
    reset()
    setShowForm(false)
    showToast('Announcement posted successfully.')
  }

  const handleDelete = (id) => {
    deleteAnnouncement(id)
    setConfirmDelete(null)
    showToast('Announcement deleted.')
  }

  const sorted = [...announcements].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="text-gray-500 text-sm mt-0.5">Post notices visible to all customers and maintenance personnel</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          New Announcement
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3  flex items-center gap-2">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
          </svg>
          {toast}
        </div>
      )}

      {/* Post form */}
      {showForm && (
        <div className="card p-6 mb-6 border-brand-200 bg-slate-50/30">
          <h2 className="font-semibold text-gray-900 mb-4">New Announcement</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Title <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="e.g. Scheduled Water Interruption – June 20"
                {...register('title')}
                className={`input-field ${errors.title ? 'input-error' : ''}`}
              />
              {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category <span className="text-red-500">*</span></label>
              <select {...register('category')} className={`input-field ${errors.category ? 'input-error' : ''}`}>
                <option value="">Select category</option>
                {ANNOUNCEMENT_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              {errors.category && <p className="mt-1 text-xs text-red-600">{errors.category.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Content <span className="text-red-500">*</span></label>
              <textarea
                rows={5}
                placeholder="Write the full announcement here..."
                {...register('content')}
                className={`input-field resize-none ${errors.content ? 'input-error' : ''}`}
              />
              {errors.content && <p className="mt-1 text-xs text-red-600">{errors.content.message}</p>}
            </div>

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={posting} className="btn-primary flex items-center gap-2">
                {posting
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent  animate-spin"/>Posting...</>
                  : '📢 Post Announcement'
                }
              </button>
              <button type="button" onClick={() => { setShowForm(false); reset() }} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Announcements list */}
      {sorted.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">📢</div>
          <p className="text-gray-500 font-medium">No announcements yet.</p>
          <p className="text-sm text-gray-400 mt-1">Click "New Announcement" to post one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(a => (
            <div key={a.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="font-semibold text-gray-900">{a.title}</h2>
                    <CategoryBadge category={a.category} />
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">{a.content}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>👤 {a.created_by}</span>
                    <span>·</span>
                    <span>🕒 {timeAgo(a.created_at)}</span>
                  </div>
                </div>

                {/* Delete */}
                {confirmDelete === a.id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500">Delete?</span>
                    <button onClick={() => handleDelete(a.id)}
                      className="text-xs bg-red-500 hover:bg-red-600 text-white px-2.5 py-1  transition-colors">
                      Yes
                    </button>
                    <button onClick={() => setConfirmDelete(null)}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2.5 py-1  transition-colors">
                      No
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(a.id)}
                    className="shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50  transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
