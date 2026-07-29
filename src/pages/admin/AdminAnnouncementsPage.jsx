import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAnnouncementStore } from '../../store/announcementStore'
import { useAuthStore } from '../../store/authStore'
import { ANNOUNCEMENT_CATEGORIES } from '../../config/staticData'
import { PageLoader, ErrorBanner, EmptyState } from '../../components/ui/Feedback'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import AppIcon from '../../components/ui/AppIcon'

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
  is_important: z.boolean(),
  active_until: z.string().optional(),
})

export default function AdminAnnouncementsPage() {
  const user               = useAuthStore(s => s.user)
  const announcements      = useAnnouncementStore(s => s.announcements)
  const loading            = useAnnouncementStore(s => s.loading)
  const error               = useAnnouncementStore(s => s.error)
  const fetchAnnouncements = useAnnouncementStore(s => s.fetchAnnouncements)
  const postAnnouncement   = useAnnouncementStore(s => s.postAnnouncement)
  const updateAnnouncement = useAnnouncementStore(s => s.updateAnnouncement)
  const setAnnouncementImportance = useAnnouncementStore(s => s.setAnnouncementImportance)
  const deleteAnnouncement = useAnnouncementStore(s => s.deleteAnnouncement)

  useEffect(() => { fetchAnnouncements({ includeExpired: true }) }, [fetchAnnouncements])

  const [posting, setPosting]             = useState(false)
  const [postError, setPostError]         = useState('')
  const [toast, setToast]                 = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting]           = useState(false)
  const [showForm, setShowForm]           = useState(false)
  const [editing, setEditing]             = useState(null)

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { title: '', content: '', category: '', is_important: false, active_until: '' },
  })

  const watchedCategory = watch('category')

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const onSubmit = async (data) => {
    setPosting(true)
    setPostError('')
    try {
      const payload = {
        ...data,
        active_until: data.active_until ? new Date(data.active_until).toISOString() : null,
      }
      if (editing) await updateAnnouncement(editing.id, payload)
      else await postAnnouncement(payload, user.full_name)
      reset()
      setEditing(null)
      setShowForm(false)
      showToast(editing ? 'Announcement updated.' : 'Announcement posted.')
    } catch (err) {
      setPostError(err.message)
    } finally {
      setPosting(false)
    }
  }

  const openNewForm = () => {
    setEditing(null)
    reset({ title: '', content: '', category: '', is_important: false, active_until: '' })
    setShowForm(true)
  }

  const openEditForm = announcement => {
    setEditing(announcement)
    reset({
      title: announcement.title || '',
      content: announcement.content || '',
      category: announcement.category || '',
      is_important: Boolean(announcement.is_important),
      active_until: announcement.active_until
        ? new Date(announcement.active_until).toISOString().slice(0, 16)
        : '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closeForm = () => {
    setEditing(null)
    setShowForm(false)
    reset({ title: '', content: '', category: '', is_important: false, active_until: '' })
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteAnnouncement(confirmDelete.id)
      setConfirmDelete(null)
      showToast('Announcement deleted.')
    } catch (err) {
      showToast(err.message)
    } finally {
      setDeleting(false)
    }
  }

  const handleImportance = async announcement => {
    try {
      await setAnnouncementImportance(announcement.id, !announcement.is_important)
      showToast(announcement.is_important ? 'Announcement unmarked as important.' : 'Announcement marked as important.')
    } catch (err) {
      showToast(err.message)
    }
  }

  const sorted = [...announcements].sort((a, b) =>
    Number(Boolean(b.is_important)) - Number(Boolean(a.is_important)) ||
    new Date(b.created_at) - new Date(a.created_at))

  if (loading && announcements.length === 0) {
    return <PageLoader label="Loading announcements..." />
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-band wave-header rounded-2xl overflow-hidden px-4 sm:px-6 py-5 sm:py-6 relative">
        <p className="text-gold-400 text-[11px] font-bold uppercase tracking-[.15em] mb-1.5">Administrator</p>
        <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-3">
          <h1 className="font-display font-black text-white text-xl sm:text-2xl tracking-tight">Announcements</h1>
          <button onClick={() => showForm ? closeForm() : openNewForm()}
            className={`w-full min-[420px]:w-auto text-xs font-black px-4 py-2 border transition-colors ${
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

      {error && <ErrorBanner message={error} onRetry={fetchAnnouncements} />}

      {/* Compose form */}
      {showForm && (
        <div className="bg-white border border-gray-200 mb-5 overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
            <p className="text-xs font-black text-gray-500 uppercase tracking-widest">{editing ? 'Edit Announcement' : 'New Announcement'}</p>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="p-4 sm:p-5 space-y-4">
            {postError && <ErrorBanner message={postError} />}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Title <span className="text-red-500">*</span></label>
                <input aria-label="Title" type="text" placeholder="e.g. Scheduled Water Interruption – June 20"
                  {...register('title')}
                  className={`input-field ${errors.title ? 'input-error' : ''}`} />
                {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Category <span className="text-red-500">*</span></label>
                <select aria-label="Category" {...register('category')} className={`input-field ${errors.category ? 'input-error' : ''}`}>
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
              <textarea aria-label="Content" rows={4} placeholder="Write the full announcement here..."
                {...register('content')}
                className={`input-field resize-none ${errors.content ? 'input-error' : ''}`} />
              {errors.content && <p className="mt-1 text-xs text-red-600">{errors.content.message}</p>}
            </div>
            <label className="flex items-start gap-3 rounded-lg border border-gold-200 bg-gold-50 p-3 cursor-pointer">
              <input type="checkbox" {...register('is_important')} className="mt-0.5 h-4 w-4 accent-amber-500" />
              <span><span className="block text-sm font-bold text-navy-900">Mark as important</span><span className="block text-xs text-gray-500 mt-0.5">Pins this notice above regular announcements for every user.</span></span>
            </label>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Active Until <span className="normal-case font-medium text-gray-400">(optional)</span></label>
              <input aria-label="Active Until" type="datetime-local" {...register('active_until')} className="input-field" />
              <p className="mt-1.5 text-xs text-gray-500">After this date, customers and Maintenance Personnel will no longer see the notice. Administrators can still review it here.</p>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={posting}
                className="btn-primary flex items-center gap-2">
                {posting
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin"/>Posting...</>
                  : <><AppIcon name="announcement" className="h-4 w-4" />{editing ? 'Save Changes' : 'Publish Announcement'}</>
                }
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {sorted.length === 0 ? (
        <EmptyState icon={<AppIcon name="announcement" className="h-9 w-9" />} title="No announcements yet."
          description='Click "New Post" to publish one.' />
      ) : (
        <div className="space-y-2">
          {sorted.map(a => (
            <div key={a.id} className="card rounded-xl overflow-hidden">
              <div className={`h-1 ${CAT_STRIPE[a.category] || 'bg-gray-300'}`} />
              <div className="p-4 sm:p-5">
                <div className="flex flex-col min-[520px]:flex-row items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {a.is_important && <span className="inline-flex items-center gap-1 text-xs font-black text-navy-800 bg-gold-100 px-2 py-0.5 uppercase tracking-widest"><AppIcon name="alert" className="h-3.5 w-3.5" />Important</span>}
                      {a.is_expired && <span className="inline-flex text-xs font-black text-gray-600 bg-gray-100 px-2 py-0.5 uppercase tracking-widest">Expired</span>}
                      <h2 className="font-black text-gray-900 text-sm tracking-tight">{a.title}</h2>
                      <CategoryBadge category={a.category} />
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2 mb-2 leading-relaxed">{a.content}</p>
                    <p className="text-xs text-gray-400">
                      <span className="font-semibold text-gray-500">{a.created_by_name}</span> · {timeAgo(a.created_at)}
                      {a.active_until && <> · Active until {new Date(a.active_until).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</>}
                    </p>
                  </div>

                  <div className="flex w-full min-[520px]:w-auto shrink-0 flex-wrap items-center justify-end gap-1">
                    <button onClick={() => openEditForm(a)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-bold border border-gray-200 text-navy-700 hover:border-navy-300">
                      Edit
                    </button>
                    <button onClick={() => handleImportance(a)}
                      title={a.is_important ? 'Remove important pin' : 'Mark as important'}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-bold border ${a.is_important ? 'border-gold-300 bg-gold-50 text-navy-800' : 'border-gray-200 text-gray-500 hover:border-gold-300'}`}>
                      {a.is_important ? 'Unpin' : 'Important'}
                    </button>
                    <button onClick={() => setConfirmDelete(a)}
                      className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete this announcement?"
        message={confirmDelete ? `"${confirmDelete.title}" will be removed for everyone. This can't be undone.` : ''}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
