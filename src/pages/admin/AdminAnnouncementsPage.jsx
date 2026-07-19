import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAnnouncementStore } from '../../store/announcementStore'
import { useAuthStore } from '../../store/authStore'
import { ANNOUNCEMENT_CATEGORIES } from '../../config/staticData'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

const CAT_COLORS = {
  general:      'bg-blue-100 text-blue-800 border-blue-200',
  interruption: 'bg-red-100 text-red-800 border-red-200',
  billing:      'bg-yellow-100 text-yellow-900 border-yellow-200',
  maintenance:  'bg-purple-100 text-purple-800 border-purple-200',
  advisory:     'bg-green-100 text-green-800 border-green-200',
}

const CAT_STRIPE = {
  general:      'bg-blue-500',
  interruption: 'bg-red-500',
  billing:      'bg-amber-400',
  maintenance:  'bg-purple-500',
  advisory:     'bg-green-500',
}

function CategoryBadge({ category }) {
  const cat = ANNOUNCEMENT_CATEGORIES.find(c => c.value === category)
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-black uppercase tracking-wide border ${CAT_COLORS[category] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
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
  const fetchAnnouncements = useAnnouncementStore(s => s.fetchAnnouncements)
  const postAnnouncement   = useAnnouncementStore(s => s.postAnnouncement)
  const deleteAnnouncement = useAnnouncementStore(s => s.deleteAnnouncement)

  useEffect(() => { fetchAnnouncements() }, [fetchAnnouncements])

  const [posting, setPosting]             = useState(false)
  const [toast, setToast]                 = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [showForm, setShowForm]           = useState(false)

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { title: '', content: '', category: '' },
  })

  const watchedCategory = watch('category')

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const onSubmit = async (data) => {
    setPosting(true)
    await postAnnouncement(data, user.full_name)
    setPosting(false)
    reset()
    setShowForm(false)
    showToast('Announcement posted.')
  }

  const handleDelete = (id) => {
    deleteAnnouncement(id)
    setConfirmDelete(null)
    showToast('Announcement deleted.')
  }

  const sorted = [...announcements].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-band rounded-2xl overflow-hidden px-6 py-6 relative">
        <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Admin</p>
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display font-black text-white text-xl sm:text-2xl tracking-tight">Announcements</h1>
          <button onClick={() => setShowForm(v => !v)}
            className={`text-xs font-black px-4 py-2 border transition-colors ${
              showForm ? 'bg-white text-navy border-white' : 'border-white/40 text-white hover:bg-white/10'
            }`}>
            {showForm ? '✕ Cancel' : '+ New Post'}
          </button>
        </div>
        <p className="text-navy-300 text-sm mt-1">{sorted.length} announcement{sorted.length !== 1 ? 's' : ''} posted · visible to all users</p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mb-4 bg-green-50 border-l-4 border-green-500 text-green-800 text-sm px-4 py-3 font-bold flex items-center gap-2">
          ✓ {toast}
        </div>
      )}

      {/* Compose form */}
      {showForm && (
        <div className="bg-white border border-gray-200 mb-5 overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
            <p className="text-xs font-black text-gray-500 uppercase tracking-widest">New Announcement</p>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Title <span className="text-red-500">*</span></label>
                <input type="text" placeholder="e.g. Scheduled Water Interruption – June 20"
                  {...register('title')}
                  className={`input-field ${errors.title ? 'input-error' : ''}`} />
                {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Category <span className="text-red-500">*</span></label>
                <select {...register('category')} className={`input-field ${errors.category ? 'input-error' : ''}`}>
                  <option value="">Select...</option>
                  {ANNOUNCEMENT_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                {errors.category && <p className="mt-1 text-xs text-red-600">{errors.category.message}</p>}
                {watchedCategory && (
                  <div className={`mt-2 h-1 w-full ${CAT_STRIPE[watchedCategory] || 'bg-gray-300'}`} />
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Content <span className="text-red-500">*</span></label>
              <textarea rows={4} placeholder="Write the full announcement here..."
                {...register('content')}
                className={`input-field resize-none ${errors.content ? 'input-error' : ''}`} />
              {errors.content && <p className="mt-1 text-xs text-red-600">{errors.content.message}</p>}
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={posting}
                className="btn-primary flex items-center gap-2">
                {posting
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin"/>Posting...</>
                  : '📢 Publish Announcement'
                }
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {sorted.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 p-12 text-center">
          <p className="text-4xl mb-3">📢</p>
          <p className="font-bold text-gray-500">No announcements yet.</p>
          <p className="text-sm text-gray-400 mt-1">Click "New Post" to publish one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((a, i) => (
            <div key={a.id} className="card rounded-xl overflow-hidden">
              <div className={`h-1 ${CAT_STRIPE[a.category] || 'bg-gray-300'}`} />
              <div className="p-4 sm:p-5">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {i === 0 && <span className="text-xs font-black text-brand-700 bg-brand-100 px-2 py-0.5 uppercase tracking-widest">Latest</span>}
                      <h2 className="font-black text-gray-900 text-sm tracking-tight">{a.title}</h2>
                      <CategoryBadge category={a.category} />
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2 mb-2 leading-relaxed">{a.content}</p>
                    <p className="text-xs text-gray-400">
                      <span className="font-semibold text-gray-500">{a.created_by}</span> · {timeAgo(a.created_at)}
                    </p>
                  </div>

                  {/* Delete control */}
                  <div className="shrink-0">
                    {confirmDelete === a.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500 mr-1">Delete?</span>
                        <button onClick={() => handleDelete(a.id)}
                          className="text-xs bg-red-500 hover:bg-red-600 text-white px-2.5 py-1 font-bold transition-colors">Yes</button>
                        <button onClick={() => setConfirmDelete(null)}
                          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2.5 py-1 font-bold transition-colors">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(a.id)}
                        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
